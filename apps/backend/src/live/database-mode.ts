import { randomUUID } from "node:crypto";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { HttpError } from "../http.js";
import { newKeeperToken } from "./ring-keeper.js";

interface ScheduledPhaseSource {
  id: string;
  stageId: string;
  arenaId: string;
  arenaName: string;
  arenaOrder: number;
  leftColor: string;
  rightColor: string;
  timeSlotId: string;
  timeSlotOrder: number;
  isBreak: number;
  arenaEventId: string;
  scheduleEventId: string;
}

interface MatchSource {
  matchId: string;
  roundId: string;
  roundNumber: number;
  stageId: string;
  stageType: string;
  arenaId: string | null;
  entryAId: string | null;
  entryAUserId: string | null;
  entryAName: string | null;
  entryAKind: string | null;
  entryASeed: number | null;
  entryATournamentId: string | null;
  entryBId: string | null;
  entryBUserId: string | null;
  entryBName: string | null;
  entryBKind: string | null;
  entryBSeed: number | null;
  entryBTournamentId: string | null;
}

interface ProjectedBout extends MatchSource {
  scheduledPhaseId: string;
  arenaId: string;
  timeSlotId: string;
  timeSlotOrder: number;
  arenaName: string;
  arenaOrder: number;
  leftColor: string;
  rightColor: string;
  order: number;
  fighterLeftId: string | null;
  fighterRightId: string | null;
}

export interface DatabaseProjectionResult {
  rings: number;
  bouts: number;
  removedBouts: number;
}

export async function activateDatabaseTournament(
  executor: DbExecutor,
  sourceTournamentId: string,
  userId: string,
  now: string,
): Promise<{ id: string; projection: DatabaseProjectionResult }> {
  const source = await executor
    .selectFrom("Tournament")
    .innerJoin("Event", "Event.id", "Tournament.eventId")
    .select(["Tournament.id", "Tournament.eventId", "Tournament.name"])
    .where("Tournament.id", "=", sourceTournamentId)
    .executeTakeFirst();
  if (!source) throw new HttpError(404, "Tournament not found.");

  const existing = await executor
    .selectFrom("LiveTournament")
    .select("id")
    .where("sourceTournamentId", "=", sourceTournamentId)
    .executeTakeFirst();
  if (existing) throw new HttpError(409, "Database-mode scoring is already active for this tournament.");

  const id = randomUUID();
  await executor.insertInto("LiveTournament").values({
    id,
    name: source.name,
    mode: "DATABASE",
    sourceTournamentId,
    layoutVersion: "v3",
    googleSpreadsheetId: null,
    createdByUserId: userId,
    createdAt: now,
  }).execute();

  const projection = await projectDatabaseTournament(executor, id, now);
  return { id, projection };
}

export async function projectDatabaseTournament(
  executor: DbExecutor,
  liveTournamentId: string,
  now: string,
): Promise<DatabaseProjectionResult> {
  const liveTournament = await executor
    .selectFrom("LiveTournament")
    .select(["id", "mode", "sourceTournamentId"])
    .where("id", "=", liveTournamentId)
    .executeTakeFirst();
  if (!liveTournament) throw new HttpError(404, "Live tournament not found.");
  if (liveTournament.mode !== "DATABASE" || liveTournament.sourceTournamentId === null) {
    throw new HttpError(409, "Only a linked database-mode tournament can be projected.");
  }

  const sourceTournamentId = liveTournament.sourceTournamentId;
  const sourceTournament = await executor
    .selectFrom("Tournament")
    .select(["id", "eventId"])
    .where("id", "=", sourceTournamentId)
    .executeTakeFirst();
  if (!sourceTournament) throw new HttpError(409, "The source tournament no longer exists.");

  const phases = await loadScheduledPhases(executor, sourceTournamentId);
  if (phases.length === 0) throw new HttpError(409, "Schedule at least one tournament phase before activating live scoring.");
  for (const phase of phases) {
    if (phase.arenaEventId !== sourceTournament.eventId || phase.scheduleEventId !== sourceTournament.eventId) {
      throw new HttpError(409, "A scheduled phase references an arena or time slot from another event.");
    }
    if (phase.isBreak !== 0) throw new HttpError(409, "A scheduled phase cannot use a break time slot.");
  }

  const matches = await loadSourceMatches(executor, sourceTournamentId);
  await ensurePoolMatchOrders(executor, sourceTournamentId, matches, phases);
  const scheduledMatches = await executor
    .selectFrom("ScheduledMatch")
    .selectAll()
    .where("matchId", "in", matches.map((match) => match.matchId))
    .execute();
  const scheduledByMatchId = new Map(scheduledMatches.map((row) => [row.matchId, row] as const));
  const phaseById = new Map(phases.map((phase) => [phase.id, phase] as const));

  const desired: ProjectedBout[] = [];
  for (const match of matches) {
    const scheduled = scheduledByMatchId.get(match.matchId);
    if (match.stageType === "POOL" && match.arenaId === null) continue;
    if (match.stageType !== "POOL" && !scheduled) continue;
    if (!scheduled) {
      throw new HttpError(409, `Pool match "${match.matchId}" has no generated ring order.`);
    }
    const phase = phaseById.get(scheduled.scheduledPhaseId);
    if (!phase || phase.stageId !== match.stageId) {
      throw new HttpError(409, `Match "${match.matchId}" references a scheduled phase from another stage.`);
    }
    if (match.stageType === "POOL" && match.arenaId !== phase.arenaId) {
      throw new HttpError(409, `Pool match "${match.matchId}" is scheduled on a different ring than its generated arena.`);
    }
    validateMatchEntries(match, sourceTournamentId);
    desired.push({
      ...match,
      scheduledPhaseId: phase.id,
      arenaId: phase.arenaId,
      timeSlotId: phase.timeSlotId,
      timeSlotOrder: phase.timeSlotOrder,
      arenaName: phase.arenaName,
      arenaOrder: phase.arenaOrder,
      leftColor: phase.leftColor,
      rightColor: phase.rightColor,
      order: scheduled.order,
      fighterLeftId: null,
      fighterRightId: null,
    });
  }

  await populateFighterIdentities(executor, liveTournamentId, desired, now);
  const ringIds = await reconcileRings(executor, liveTournamentId, phases);
  const removedBouts = await reconcileBouts(executor, liveTournamentId, desired, ringIds, now);

  return {
    rings: new Set(phases.map((phase) => phase.arenaId)).size,
    bouts: desired.length,
    removedBouts,
  };
}

async function loadScheduledPhases(executor: DbExecutor, tournamentId: string): Promise<ScheduledPhaseSource[]> {
  return executor
    .selectFrom("ScheduledPhase")
    .innerJoin("Stage", "Stage.id", "ScheduledPhase.stageId")
    .innerJoin("Arena", "Arena.id", "ScheduledPhase.arenaId")
    .innerJoin("ScheduleTimeSlot", "ScheduleTimeSlot.id", "ScheduledPhase.timeSlotId")
    .innerJoin("EventSchedule", "EventSchedule.id", "ScheduleTimeSlot.scheduleId")
    .select([
      "ScheduledPhase.id as id",
      "ScheduledPhase.stageId as stageId",
      "ScheduledPhase.arenaId as arenaId",
      "Arena.name as arenaName",
      "Arena.order as arenaOrder",
      "Arena.leftColor as leftColor",
      "Arena.rightColor as rightColor",
      "ScheduledPhase.timeSlotId as timeSlotId",
      "ScheduleTimeSlot.order as timeSlotOrder",
      "ScheduleTimeSlot.isBreak as isBreak",
      "Arena.eventId as arenaEventId",
      "EventSchedule.eventId as scheduleEventId",
    ])
    .where("Stage.tournamentId", "=", tournamentId)
    .orderBy("ScheduleTimeSlot.order")
    .orderBy("Arena.order")
    .orderBy("ScheduledPhase.id")
    .execute();
}

async function loadSourceMatches(executor: DbExecutor, tournamentId: string): Promise<MatchSource[]> {
  return executor
    .selectFrom("Match")
    .innerJoin("Round", "Round.id", "Match.roundId")
    .innerJoin("Stage", "Stage.id", "Round.stageId")
    .leftJoin("Entry as EntryA", "EntryA.id", "Match.entryAId")
    .leftJoin("User as UserA", "UserA.id", "EntryA.userId")
    .leftJoin("Entry as EntryB", "EntryB.id", "Match.entryBId")
    .leftJoin("User as UserB", "UserB.id", "EntryB.userId")
    .select([
      "Match.id as matchId",
      "Match.roundId as roundId",
      "Round.roundNumber as roundNumber",
      "Stage.id as stageId",
      "Stage.type as stageType",
      "Match.arenaId as arenaId",
      "EntryA.id as entryAId",
      "EntryA.userId as entryAUserId",
      "UserA.name as entryAName",
      "EntryA.kind as entryAKind",
      "EntryA.seed as entryASeed",
      "EntryA.tournamentId as entryATournamentId",
      "EntryB.id as entryBId",
      "EntryB.userId as entryBUserId",
      "UserB.name as entryBName",
      "EntryB.kind as entryBKind",
      "EntryB.seed as entryBSeed",
      "EntryB.tournamentId as entryBTournamentId",
    ])
    .where("Stage.tournamentId", "=", tournamentId)
    .execute();
}

async function ensurePoolMatchOrders(
  executor: DbExecutor,
  sourceTournamentId: string,
  matches: MatchSource[],
  phases: ScheduledPhaseSource[],
): Promise<void> {
  const phaseByPoolRound = new Map<string, ScheduledPhaseSource>();
  for (const phase of phases) {
    const key = `${phase.stageId}\0${phase.arenaId}\0${phase.timeSlotOrder}`;
    if (phaseByPoolRound.has(key)) {
      throw new HttpError(409, "A pool round has more than one matching phase on the same ring and time slot.");
    }
    phaseByPoolRound.set(key, phase);
  }

  const matchIds = matches.map((match) => match.matchId);
  const existingRows = matchIds.length === 0
    ? []
    : await executor.selectFrom("ScheduledMatch").selectAll().where("matchId", "in", matchIds).execute();
  const existingByMatchId = new Map(existingRows.map((row) => [row.matchId, row] as const));
  const pendingByGroup = new Map<string, Array<{ phase: ScheduledPhaseSource; match: MatchSource }>>();

  for (const match of matches) {
    if (match.stageType !== "POOL") {
      const scheduled = existingByMatchId.get(match.matchId);
      if (!scheduled) continue;
      const phase = phases.find((candidate) => candidate.id === scheduled.scheduledPhaseId);
      if (!phase || phase.stageId !== match.stageId) {
        throw new HttpError(409, `Bracket match "${match.matchId}" references a phase from another stage.`);
      }
      continue;
    }

    const existing = existingByMatchId.get(match.matchId);
    if (match.arenaId === null) {
      if (existing) {
        await executor.deleteFrom("ScheduledMatch").where("matchId", "=", match.matchId).execute();
        existingByMatchId.delete(match.matchId);
      }
      continue;
    }
    validateMatchEntries(match, sourceTournamentId);
    const phase = phaseByPoolRound.get(`${match.stageId}\0${match.arenaId}\0${match.roundNumber}`);
    if (!phase) {
      throw new HttpError(409, `Pool match "${match.matchId}" has an arena but no phase for its generated round.`);
    }
    if (existing && existing.scheduledPhaseId !== phase.id) {
      await executor.deleteFrom("ScheduledMatch").where("matchId", "=", match.matchId).execute();
      existingByMatchId.delete(match.matchId);
    }
    const key = `${phase.arenaId}\0${phase.timeSlotId}`;
    const bucket = pendingByGroup.get(key) ?? [];
    bucket.push({ phase, match });
    pendingByGroup.set(key, bucket);
  }

  const phaseById = new Map(phases.map((phase) => [phase.id, phase] as const));
  const allScheduled = await executor.selectFrom("ScheduledMatch").selectAll().execute();
  const occupiedByGroup = new Map<string, Set<number>>();
  const duplicateGroups = new Set<string>();
  for (const scheduled of allScheduled) {
    const phase = phaseById.get(scheduled.scheduledPhaseId);
    if (!phase) continue;
    const key = `${phase.arenaId}\0${phase.timeSlotId}`;
    const orders = occupiedByGroup.get(key) ?? new Set<number>();
    if (orders.has(scheduled.order)) duplicateGroups.add(key);
    orders.add(scheduled.order);
    occupiedByGroup.set(key, orders);
  }
  if (duplicateGroups.size > 0) {
    throw new HttpError(409, "The event schedule contains duplicate bout orders on the same ring and time slot.");
  }

  for (const [groupKey, bucket] of pendingByGroup) {
    const used = occupiedByGroup.get(groupKey) ?? new Set<number>();
    bucket.sort((left, right) => compareGeneratedPoolMatches(left.match, right.match)
      || left.phase.stageId.localeCompare(right.phase.stageId));
    for (const { phase, match } of bucket) {
      if (existingByMatchId.has(match.matchId)) continue;
      let order = 1;
      while (used.has(order)) order += 1;
      await executor.insertInto("ScheduledMatch").values({
        matchId: match.matchId,
        scheduledPhaseId: phase.id,
        order,
      }).execute();
      used.add(order);
      existingByMatchId.set(match.matchId, { matchId: match.matchId, scheduledPhaseId: phase.id, order });
    }
    occupiedByGroup.set(groupKey, used);
  }
}

function compareGeneratedPoolMatches(left: MatchSource, right: MatchSource): number {
  const leftEntries = [
    { id: left.entryAId ?? "", seed: left.entryASeed },
    { id: left.entryBId ?? "", seed: left.entryBSeed },
  ].sort(compareSeededEntries);
  const rightEntries = [
    { id: right.entryAId ?? "", seed: right.entryASeed },
    { id: right.entryBId ?? "", seed: right.entryBSeed },
  ].sort(compareSeededEntries);
  return compareSeededEntries(leftEntries[0]!, rightEntries[0]!)
    || compareSeededEntries(leftEntries[1]!, rightEntries[1]!);
}

function compareSeededEntries(left: { id: string; seed: number | null }, right: { id: string; seed: number | null }): number {
  return (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}

function validateMatchEntries(match: MatchSource, tournamentId: string): void {
  for (const [side, entryId, entryUserId, entryName, kind, entryTournamentId] of [
    ["left", match.entryAId, match.entryAUserId, match.entryAName, match.entryAKind, match.entryATournamentId],
    ["right", match.entryBId, match.entryBUserId, match.entryBName, match.entryBKind, match.entryBTournamentId],
  ] as const) {
    if (entryId === null) continue;
    if (entryTournamentId !== tournamentId || entryUserId === null || entryName === null) {
      throw new HttpError(409, `Match "${match.matchId}" has an invalid ${side} fighter reference.`);
    }
    if (kind !== "FIGHTER" && kind !== "BOTH") {
      throw new HttpError(409, `Match "${match.matchId}" references a non-fighter entry.`);
    }
  }
}

async function populateFighterIdentities(
  executor: DbExecutor,
  liveTournamentId: string,
  bouts: ProjectedBout[],
  now: string,
): Promise<void> {
  const fighterEntries = new Map<string, { name: string }>();
  for (const bout of bouts) {
    if (bout.entryAUserId && bout.entryAName !== null) fighterEntries.set(bout.entryAUserId, { name: bout.entryAName });
    if (bout.entryBUserId && bout.entryBName !== null) fighterEntries.set(bout.entryBUserId, { name: bout.entryBName });
  }
  if (fighterEntries.size === 0) return;

  const existing = await executor.selectFrom("LiveTournamentFighter")
    .select(["id", "userId", "name"])
    .where("tournamentId", "=", liveTournamentId)
    .where("userId", "in", [...fighterEntries.keys()])
    .execute();
  const identityByUserId = new Map(existing.filter((row) => row.userId !== null).map((row) => [row.userId!, row.id] as const));
  for (const [userId, fighter] of fighterEntries) {
    const identityId = identityByUserId.get(userId);
    if (identityId) {
      await executor.updateTable("LiveTournamentFighter")
        .set({ name: fighter.name, nameKey: fighterNameKey(fighter.name), updatedAt: now })
        .where("id", "=", identityId)
        .execute();
      continue;
    }
    const id = randomUUID();
    await executor.insertInto("LiveTournamentFighter").values({
      id,
      tournamentId: liveTournamentId,
      name: fighter.name,
      nameKey: fighterNameKey(fighter.name),
      userId,
      active: 1,
      ambiguous: 0,
      createdAt: now,
      updatedAt: now,
    }).execute();
    identityByUserId.set(userId, id);
  }

  const identityByEntryUserId = identityByUserId;
  for (const bout of bouts) {
    bout.fighterLeftId = bout.entryAUserId ? identityByEntryUserId.get(bout.entryAUserId) ?? null : null;
    bout.fighterRightId = bout.entryBUserId ? identityByEntryUserId.get(bout.entryBUserId) ?? null : null;
  }
}

async function reconcileRings(
  executor: DbExecutor,
  liveTournamentId: string,
  phases: ScheduledPhaseSource[],
): Promise<Map<string, string>> {
  const arenas = new Map<string, ScheduledPhaseSource>();
  for (const phase of phases) {
    if (!arenas.has(phase.arenaId)) arenas.set(phase.arenaId, phase);
  }
  const existing = await executor.selectFrom("LiveRing")
    .selectAll()
    .where("tournamentId", "=", liveTournamentId)
    .execute();
  const ringByArenaId = new Map(existing
    .filter((ring) => ring.sourceArenaId !== null)
    .map((ring) => [ring.sourceArenaId!, ring] as const));
  const ringIds = new Map<string, string>();

  for (const [arenaId, phase] of arenas) {
    const ring = ringByArenaId.get(arenaId);
    if (ring) {
      await executor.updateTable("LiveRing")
        .set({
          name: phase.arenaName,
          order: phase.arenaOrder,
          leftColor: phase.leftColor,
          rightColor: phase.rightColor,
        })
        .where("id", "=", ring.id)
        .execute();
      ringIds.set(arenaId, ring.id);
      continue;
    }
    const id = randomUUID();
    await executor.insertInto("LiveRing").values({
      id,
      tournamentId: liveTournamentId,
      sourceArenaId: arenaId,
      name: phase.arenaName,
      order: phase.arenaOrder,
      keeperToken: newKeeperToken(),
      activeDeviceId: null,
      activeUserId: null,
      activeSince: null,
      scoreboardToken: newKeeperToken(),
      leftColor: phase.leftColor,
      rightColor: phase.rightColor,
    }).execute();
    ringIds.set(arenaId, id);
  }

  return ringIds;
}

async function reconcileBouts(
  executor: DbExecutor,
  liveTournamentId: string,
  desired: ProjectedBout[],
  ringIds: Map<string, string>,
  now: string,
): Promise<number> {
  const existing = await executor.selectFrom("LiveBout")
    .selectAll()
    .where("tournamentId", "=", liveTournamentId)
    .where("sourceMatchId", "is not", null)
    .execute();
  const existingByMatchId = new Map(existing
    .filter((bout) => bout.sourceMatchId !== null)
    .map((bout) => [bout.sourceMatchId!, bout] as const));
  const desiredIds = new Set(desired.map((bout) => bout.matchId));
  let removed = 0;

  for (const bout of existing) {
    if (!bout.sourceMatchId || desiredIds.has(bout.sourceMatchId)) continue;
    await requireUnscored(executor, bout.id, bout.status, "A scheduled match was removed from live scoring.");
    await executor.deleteFrom("LiveBout").where("id", "=", bout.id).execute();
    removed += 1;
  }

  for (const source of desired) {
    const ringId = ringIds.get(source.arenaId);
    if (!ringId) throw new HttpError(409, `No live ring exists for source arena "${source.arenaId}".`);
    const signature = sourceSignature(source);
    const current = existingByMatchId.get(source.matchId);
    if (current) {
      if (current.sourceScheduleSignature !== signature) {
        await requireUnscored(executor, current.id, current.status, `Schedule changes conflict with scored match "${source.matchId}".`);
      }
      await executor.updateTable("LiveBout").set({
        scheduledPhaseId: source.scheduledPhaseId,
        ringId,
        order: source.order,
        label: `Bout ${source.order}`,
        fighterLeft: source.entryAName ?? "",
        fighterRight: source.entryBName ?? "",
        fighterLeftId: source.fighterLeftId,
        fighterRightId: source.fighterRightId,
        sourceScheduleSignature: signature,
      }).where("id", "=", current.id).execute();
      continue;
    }
    await executor.insertInto("LiveBout").values({
      id: randomUUID(),
      tournamentId: liveTournamentId,
      sourceMatchId: source.matchId,
      scheduledPhaseId: source.scheduledPhaseId,
      ringId,
      order: source.order,
      label: `Bout ${source.order}`,
      sheetName: "DATABASE",
      headerCell: source.matchId,
      fighterLeft: source.entryAName ?? "",
      fighterRight: source.entryBName ?? "",
      fighterLeftId: source.fighterLeftId,
      fighterRightId: source.fighterRightId,
      status: "PENDING",
      startedAt: null,
      finishedAt: null,
      clockUpdatedAt: null,
      periodStartedAt: null,
      warningsLeft: 0,
      warningsRight: 0,
      sourceScheduleSignature: signature,
    }).execute();
  }

  const desiredArenaIds = new Set(ringIds.keys());
  const rings = await executor.selectFrom("LiveRing").select(["id", "sourceArenaId"])
    .where("tournamentId", "=", liveTournamentId)
    .where("sourceArenaId", "is not", null)
    .execute();
  for (const ring of rings) {
    if (!ring.sourceArenaId || desiredArenaIds.has(ring.sourceArenaId)) continue;
    const ringBouts = await executor.selectFrom("LiveBout")
      .select(["id", "status"])
      .where("ringId", "=", ring.id)
      .execute();
    for (const bout of ringBouts) {
      await requireUnscored(executor, bout.id, bout.status, "A ring was removed while it still contains a scored bout.");
    }
    await executor.deleteFrom("LiveRing").where("id", "=", ring.id).execute();
  }
  return removed;
}

async function requireUnscored(
  executor: DbExecutor,
  boutId: string,
  status: "PENDING" | "RUNNING" | "DONE",
  message: string,
): Promise<void> {
  if (status !== "PENDING") throw new HttpError(409, message);
  const exchange = await executor.selectFrom("LiveExchange").select("id").where("boutId", "=", boutId).executeTakeFirst();
  if (exchange) throw new HttpError(409, message);
}

function sourceSignature(source: ProjectedBout): string {
  return JSON.stringify({
    stageId: source.stageId,
    arenaId: source.arenaId,
    timeSlotId: source.timeSlotId,
    timeSlotOrder: source.timeSlotOrder,
    scheduledPhaseId: source.scheduledPhaseId,
    order: source.order,
    entryAId: source.entryAId,
    entryAUserId: source.entryAUserId,
    entryAName: source.entryAName,
    entryBId: source.entryBId,
    entryBUserId: source.entryBUserId,
    entryBName: source.entryBName,
  });
}

function fighterNameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

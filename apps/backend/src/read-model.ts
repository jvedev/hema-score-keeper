import { randomUUID } from "node:crypto";
import { type Selectable } from "kysely";
import type {
  ApiArena,
  ApiEntry,
  ApiEvent,
  ApiEventMutationResult,
  ApiEventSchedule,
  ApiEventScheduleResponse,
  ApiMatch,
  ApiRuleset,
  ApiRulesetDefinition,
  ApiRulesetDetail,
  ApiRound,
  ApiScheduleTimeSlot,
  ApiScheduledAssignment,
  ApiScheduledPhase,
  ApiSkill,
  ApiStage,
  ApiStageArena,
  ApiStageOfficial,
  ApiTournament,
  ApiUser,
  EntryKind,
  ScheduleRole,
  StageType,
} from "./api-types.js";
import { type BackendDatabase, type DbExecutor, fromSqliteBoolean } from "./db.js";
import { HttpError, type JsonValue, parseJsonValue, stringifyJsonValue } from "./http.js";

type UserRow = Selectable<BackendDatabase["User"]>;
type SkillRow = Selectable<BackendDatabase["Skill"]>;
type EventRow = Selectable<BackendDatabase["Event"]>;
type EventScheduleRow = Selectable<BackendDatabase["EventSchedule"]>;
type ScheduleTimeSlotRow = Selectable<BackendDatabase["ScheduleTimeSlot"]>;
type TournamentRow = Selectable<BackendDatabase["Tournament"]>;
type EntryRow = Selectable<BackendDatabase["Entry"]>;
type ArenaRow = Selectable<BackendDatabase["Arena"]>;
type StageRow = Selectable<BackendDatabase["Stage"]>;
type ScheduledPhaseRow = Selectable<BackendDatabase["ScheduledPhase"]>;
type ScheduledAssignmentRow = Selectable<BackendDatabase["ScheduledAssignment"]>;
type StageArenaRow = Selectable<BackendDatabase["StageArena"]>;
type StageOfficialRow = Selectable<BackendDatabase["StageOfficial"]>;
type RoundRow = Selectable<BackendDatabase["Round"]>;
type MatchRow = Selectable<BackendDatabase["Match"]>;
type RulesetRow = Selectable<BackendDatabase["Ruleset"]>;
type ExchangeRow = Selectable<BackendDatabase["Exchange"]>;

const stageTypeOrder: Record<StageType, number> = {
  POOL: 0,
  ELIMINATION: 1,
  SEMI_FINAL: 2,
  FINAL: 3,
};

export function generateId(): string {
  return randomUUID();
}

export function defaultRulesetDefinition(): ApiRulesetDefinition {
  return {
    weaponClass: "",
    matchParameters: {
      maxDurationSeconds: 180,
      stopOnTimeOut: true,
      maxPointsCap: 10,
      pointSpreadVictory: 5,
      scores: [1, 2, 3, 4],
      maxDoubles: 3,
      allowAfterBlow: true,
      countDoubles: true,
      useNetScore: true,
      penalties: [],
    },
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function groupBy<T, K>(values: readonly T[], key: (value: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const itemKey = key(value);
    const bucket = grouped.get(itemKey);
    if (bucket) {
      bucket.push(value);
    } else {
      grouped.set(itemKey, [value]);
    }
  }
  return grouped;
}

function compareStageRows(left: StageRow, right: StageRow): number {
  return stageTypeOrder[left.type] - stageTypeOrder[right.type]
    || (left.name ?? "").localeCompare(right.name ?? "")
    || left.id.localeCompare(right.id);
}

function toApiSkill(row: SkillRow): ApiSkill {
  return {
    id: row.id,
    userId: row.userId,
    skillName: row.skillName,
    skillLevel: row.skillLevel,
  };
}

function toApiUser(row: UserRow, skills: ApiSkill[]): ApiUser {
  return {
    id: row.id,
    username: row.username,
    judgeVolunteer: fromSqliteBoolean(row.judgeVolunteer),
    juryVolunteer: fromSqliteBoolean(row.juryVolunteer),
    tableVolunteer: fromSqliteBoolean(row.tableVolunteer),
    otherVolunteer: fromSqliteBoolean(row.otherVolunteer),
    skills,
  };
}

function toApiArena(row: ArenaRow): ApiArena {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    order: row.order,
    leftColor: row.leftColor,
    rightColor: row.rightColor,
  };
}

function toApiRuleset(row: RulesetRow): ApiRuleset {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    version: row.version,
    definition: parseJsonValue<ApiRulesetDefinition>(row.definition),
  };
}

function toApiRulesetDetail(row: RulesetRow, matchCount: number): ApiRulesetDetail {
  return {
    ...toApiRuleset(row),
    matchCount,
    locked: matchCount > 0,
  };
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new HttpError(500, message);
  }
  return value;
}

export async function loadUsers(executor: DbExecutor, userIds?: readonly string[]): Promise<ApiUser[]> {
  const ids = userIds ? unique(userIds) : undefined;
  if (ids && ids.length === 0) {
    return [];
  }

  let usersQuery = executor.selectFrom("User").selectAll().orderBy("username");
  if (ids) {
    usersQuery = usersQuery.where("id", "in", ids);
  }
  const userRows = await usersQuery.execute();
  if (userRows.length === 0) {
    return [];
  }

  const skillRows = await executor
    .selectFrom("Skill")
    .selectAll()
    .where("userId", "in", userRows.map((row) => row.id))
    .orderBy("skillName")
    .orderBy("skillLevel")
    .execute();
  const skillsByUserId = groupBy(skillRows.map(toApiSkill), (skill) => skill.userId);

  return userRows.map((row) => toApiUser(row, skillsByUserId.get(row.id) ?? []));
}

export async function requireUserRow(executor: DbExecutor, id: string): Promise<UserRow> {
  const user = await executor.selectFrom("User").selectAll().where("id", "=", id).executeTakeFirst();
  if (!user) {
    throw new HttpError(404, `User "${id}" not found.`);
  }
  return user;
}

export async function requireUserApi(executor: DbExecutor, id: string): Promise<ApiUser> {
  const users = await loadUsers(executor, [id]);
  const user = users[0];
  if (!user) {
    throw new HttpError(404, `User "${id}" not found.`);
  }
  return user;
}

export async function requireSkillRow(executor: DbExecutor, id: string): Promise<SkillRow> {
  const skill = await executor.selectFrom("Skill").selectAll().where("id", "=", id).executeTakeFirst();
  if (!skill) {
    throw new HttpError(404, `Skill "${id}" not found.`);
  }
  return skill;
}

export async function requireSkillApi(executor: DbExecutor, id: string): Promise<ApiSkill> {
  return toApiSkill(await requireSkillRow(executor, id));
}

export async function requireEventRow(executor: DbExecutor, id: string): Promise<EventRow> {
  const event = await executor.selectFrom("Event").selectAll().where("id", "=", id).executeTakeFirst();
  if (!event) {
    throw new HttpError(404, `Event "${id}" not found.`);
  }
  return event;
}

export async function requireTournamentRow(executor: DbExecutor, id: string): Promise<TournamentRow> {
  const tournament = await executor.selectFrom("Tournament").selectAll().where("id", "=", id).executeTakeFirst();
  if (!tournament) {
    throw new HttpError(404, `Tournament "${id}" not found.`);
  }
  return tournament;
}

export async function requireArenaRow(executor: DbExecutor, id: string): Promise<ArenaRow> {
  const arena = await executor.selectFrom("Arena").selectAll().where("id", "=", id).executeTakeFirst();
  if (!arena) {
    throw new HttpError(404, `Arena "${id}" not found.`);
  }
  return arena;
}

export async function requireEntryRow(executor: DbExecutor, id: string): Promise<EntryRow> {
  const entry = await executor.selectFrom("Entry").selectAll().where("id", "=", id).executeTakeFirst();
  if (!entry) {
    throw new HttpError(404, `Entry "${id}" not found.`);
  }
  return entry;
}

export async function requireStageRow(executor: DbExecutor, id: string): Promise<StageRow> {
  const stage = await executor.selectFrom("Stage").selectAll().where("id", "=", id).executeTakeFirst();
  if (!stage) {
    throw new HttpError(404, `Stage "${id}" not found.`);
  }
  return stage;
}

export async function requireRulesetRow(executor: DbExecutor, id: string): Promise<RulesetRow> {
  const ruleset = await executor.selectFrom("Ruleset").selectAll().where("id", "=", id).executeTakeFirst();
  if (!ruleset) {
    throw new HttpError(404, `Ruleset "${id}" not found.`);
  }
  return ruleset;
}

export async function requireRulesetForEvent(
  executor: DbExecutor,
  id: string,
  eventId: string,
  label: string,
): Promise<RulesetRow> {
  const ruleset = await requireRulesetRow(executor, id);
  if (ruleset.eventId !== eventId) {
    throw new HttpError(400, `${label} must belong to the same event.`);
  }
  return ruleset;
}

export async function requireScheduleTimeSlotRow(executor: DbExecutor, id: string): Promise<ScheduleTimeSlotRow> {
  const timeSlot = await executor.selectFrom("ScheduleTimeSlot").selectAll().where("id", "=", id).executeTakeFirst();
  if (!timeSlot) {
    throw new HttpError(404, `Schedule time slot "${id}" not found.`);
  }
  return timeSlot;
}

export async function requireScheduledPhaseRow(executor: DbExecutor, id: string): Promise<ScheduledPhaseRow> {
  const scheduledPhase = await executor.selectFrom("ScheduledPhase").selectAll().where("id", "=", id).executeTakeFirst();
  if (!scheduledPhase) {
    throw new HttpError(404, `Scheduled phase "${id}" not found.`);
  }
  return scheduledPhase;
}

export async function requireScheduledAssignmentRow(executor: DbExecutor, id: string): Promise<ScheduledAssignmentRow> {
  const assignment = await executor.selectFrom("ScheduledAssignment").selectAll().where("id", "=", id).executeTakeFirst();
  if (!assignment) {
    throw new HttpError(404, `Scheduled assignment "${id}" not found.`);
  }
  return assignment;
}

export async function requireStageOfficialRow(executor: DbExecutor, id: string): Promise<StageOfficialRow> {
  const official = await executor.selectFrom("StageOfficial").selectAll().where("id", "=", id).executeTakeFirst();
  if (!official) {
    throw new HttpError(404, `Stage official "${id}" not found.`);
  }
  return official;
}

export async function requireEntryInTournament(
  executor: DbExecutor,
  id: string,
  tournamentId: string,
  label: string,
): Promise<EntryRow> {
  const entry = await requireEntryRow(executor, id);
  if (entry.tournamentId !== tournamentId) {
    throw new HttpError(400, `${label} must belong to the same tournament as the stage.`);
  }
  return entry;
}

export async function ensureSchedule(executor: DbExecutor, eventId: string): Promise<EventScheduleRow> {
  await requireEventRow(executor, eventId);
  const existing = await executor.selectFrom("EventSchedule").selectAll().where("eventId", "=", eventId).executeTakeFirst();
  if (existing) {
    return existing;
  }

  const id = generateId();
  await executor.insertInto("EventSchedule").values({
    id,
    eventId,
    startTimeMinutes: 540,
    currentTimeSlotId: null,
  }).execute();
  return requireValue(
    await executor.selectFrom("EventSchedule").selectAll().where("id", "=", id).executeTakeFirst(),
    "Created event schedule is missing.",
  );
}

async function loadRulesetsForEvents(executor: DbExecutor, eventIds: readonly string[]): Promise<RulesetRow[]> {
  if (eventIds.length === 0) {
    return [];
  }

  return executor
    .selectFrom("Ruleset")
    .selectAll()
    .where("eventId", "in", eventIds)
    .orderBy("eventId")
    .orderBy("name")
    .orderBy("version desc")
    .execute();
}

export async function loadEvents(executor: DbExecutor, eventIds?: readonly string[]): Promise<ApiEvent[]> {
  const ids = eventIds ? unique(eventIds) : undefined;
  if (ids && ids.length === 0) {
    return [];
  }

  let eventQuery = executor.selectFrom("Event").selectAll().orderBy("eventName");
  if (ids) {
    eventQuery = eventQuery.where("id", "in", ids);
  }
  const eventRows = await eventQuery.execute();
  if (eventRows.length === 0) {
    return [];
  }

  const resolvedEventIds = eventRows.map((row) => row.id);
  const rulesetRows = await loadRulesetsForEvents(executor, resolvedEventIds);
  const rulesetById = new Map(rulesetRows.map((row) => [row.id, toApiRuleset(row)] as const));
  const rulesetsByEventId = groupBy(rulesetRows, (row) => row.eventId);

  const arenaRows = await executor
    .selectFrom("Arena")
    .selectAll()
    .where("eventId", "in", resolvedEventIds)
    .orderBy("eventId")
    .orderBy("order")
    .orderBy("name")
    .execute();
  const arenaById = new Map(arenaRows.map((row) => [row.id, toApiArena(row)] as const));
  const arenasByEventId = groupBy(arenaRows, (row) => row.eventId);

  const tournamentRows = await executor
    .selectFrom("Tournament")
    .selectAll()
    .where("eventId", "in", resolvedEventIds)
    .orderBy("eventId")
    .orderBy("order")
    .orderBy("name")
    .execute();
  const tournamentIds = tournamentRows.map((row) => row.id);

  const stageRows = tournamentIds.length === 0
    ? []
    : await executor
      .selectFrom("Stage")
      .selectAll()
      .where("tournamentId", "in", tournamentIds)
      .execute();
  stageRows.sort(compareStageRows);
  const stageIds = stageRows.map((row) => row.id);

  const roundRows = stageIds.length === 0
    ? []
    : await executor
      .selectFrom("Round")
      .selectAll()
      .where("stageId", "in", stageIds)
      .orderBy("stageId")
      .orderBy("roundNumber")
      .execute();
  const roundIds = roundRows.map((row) => row.id);

  const matchRows = roundIds.length === 0
    ? []
    : await executor
      .selectFrom("Match")
      .selectAll()
      .where("roundId", "in", roundIds)
      .orderBy("roundId")
      .orderBy("id")
      .execute();

  const entryRows = tournamentIds.length === 0
    ? []
    : await executor
      .selectFrom("Entry")
      .selectAll()
      .where("tournamentId", "in", tournamentIds)
      .orderBy("tournamentId")
      .orderBy("seed")
      .orderBy("id")
      .execute();

  const stageArenaRows = stageIds.length === 0
    ? []
    : await executor
      .selectFrom("StageArena")
      .selectAll()
      .where("stageId", "in", stageIds)
      .orderBy("stageId")
      .orderBy("id")
      .execute();

  const stageOfficialRows = stageIds.length === 0
    ? []
    : await executor
      .selectFrom("StageOfficial")
      .selectAll()
      .where("stageId", "in", stageIds)
      .orderBy("stageId")
      .orderBy("role")
      .orderBy("id")
      .execute();

  const scheduleRows = await executor
    .selectFrom("EventSchedule")
    .selectAll()
    .where("eventId", "in", resolvedEventIds)
    .execute();
  const scheduleIds = scheduleRows.map((row) => row.id);

  const timeSlotRows = scheduleIds.length === 0
    ? []
    : await executor
      .selectFrom("ScheduleTimeSlot")
      .selectAll()
      .where("scheduleId", "in", scheduleIds)
      .orderBy("scheduleId")
      .orderBy("order")
      .execute();
  const timeSlotIds = timeSlotRows.map((row) => row.id);

  const scheduledPhaseRows = timeSlotIds.length === 0
    ? []
    : await executor
      .selectFrom("ScheduledPhase")
      .selectAll()
      .where("timeSlotId", "in", timeSlotIds)
      .execute();
  const scheduledPhaseIds = scheduledPhaseRows.map((row) => row.id);

  const assignmentRows = scheduledPhaseIds.length === 0
    ? []
    : await executor
      .selectFrom("ScheduledAssignment")
      .selectAll()
      .where("scheduledPhaseId", "in", scheduledPhaseIds)
      .orderBy("scheduledPhaseId")
      .orderBy("role")
      .orderBy("id")
      .execute();

  const userIds = unique([
    ...entryRows.map((row) => row.userId),
    ...assignmentRows.map((row) => row.userId),
  ]);
  const users = await loadUsers(executor, userIds);
  const userById = new Map(users.map((user) => [user.id, user] as const));

  const entriesById = new Map<string, ApiEntry>();
  const entriesByTournamentId = new Map<string, ApiEntry[]>();
  for (const row of entryRows) {
    const user = userById.get(row.userId);
    if (!user) {
      throw new HttpError(500, `Entry "${row.id}" references an unknown user.`);
    }

    const entry: ApiEntry = {
      id: row.id,
      tournamentId: row.tournamentId,
      userId: row.userId,
      kind: row.kind,
      seed: row.seed,
      user,
    };
    entriesById.set(entry.id, entry);
    const bucket = entriesByTournamentId.get(row.tournamentId);
    if (bucket) {
      bucket.push(entry);
    } else {
      entriesByTournamentId.set(row.tournamentId, [entry]);
    }
  }

  const matchesByRoundId = new Map<string, ApiMatch[]>();
  for (const row of matchRows) {
    const match: ApiMatch = {
      id: row.id,
      roundId: row.roundId,
      arenaId: row.arenaId,
      entryAId: row.entryAId,
      entryBId: row.entryBId,
      winnerEntryId: row.winnerEntryId,
      scoreA: row.scoreA,
      scoreB: row.scoreB,
      ruleset: row.rulesetId ? rulesetById.get(row.rulesetId) ?? null : null,
    };
    const bucket = matchesByRoundId.get(row.roundId);
    if (bucket) {
      bucket.push(match);
    } else {
      matchesByRoundId.set(row.roundId, [match]);
    }
  }

  const roundsByStageId = new Map<string, ApiRound[]>();
  for (const row of roundRows) {
    const round: ApiRound = {
      id: row.id,
      stageId: row.stageId,
      roundNumber: row.roundNumber,
      matches: matchesByRoundId.get(row.id) ?? [],
    };
    const bucket = roundsByStageId.get(row.stageId);
    if (bucket) {
      bucket.push(round);
    } else {
      roundsByStageId.set(row.stageId, [round]);
    }
  }

  const stageArenasByStageId = new Map<string, ApiStageArena[]>();
  for (const row of stageArenaRows) {
    const arena = arenaById.get(row.arenaId);
    if (!arena) {
      throw new HttpError(500, `Stage arena "${row.id}" references an unknown arena.`);
    }
    const stageArena: ApiStageArena = {
      id: row.id,
      stageId: row.stageId,
      arenaId: row.arenaId,
      arena,
    };
    const bucket = stageArenasByStageId.get(row.stageId);
    if (bucket) {
      bucket.push(stageArena);
    } else {
      stageArenasByStageId.set(row.stageId, [stageArena]);
    }
  }

  const stageOfficialsByStageId = new Map<string, ApiStageOfficial[]>();
  for (const row of stageOfficialRows) {
    if (!entriesById.has(row.entryId)) {
      throw new HttpError(500, `Stage official "${row.id}" references an unknown entry.`);
    }
    const official: ApiStageOfficial = {
      id: row.id,
      stageId: row.stageId,
      entryId: row.entryId,
      role: row.role,
    };
    const bucket = stageOfficialsByStageId.get(row.stageId);
    if (bucket) {
      bucket.push(official);
    } else {
      stageOfficialsByStageId.set(row.stageId, [official]);
    }
  }

  const stagesByTournamentId = new Map<string, ApiStage[]>();
  const stageById = new Map<string, ApiStage>();
  for (const row of stageRows) {
    const stage: ApiStage = {
      id: row.id,
      tournamentId: row.tournamentId,
      type: row.type,
      name: row.name,
      ruleset: row.rulesetId ? rulesetById.get(row.rulesetId) ?? null : null,
      minPoolSize: row.minPoolSize,
      maxPoolSize: row.maxPoolSize,
      preferredPoolSize: row.preferredPoolSize,
      eliminationParticipantCount: row.eliminationParticipantCount,
      timeBetweenMatchesMinutes: row.timeBetweenMatchesMinutes,
      rounds: roundsByStageId.get(row.id) ?? [],
      arenas: stageArenasByStageId.get(row.id) ?? [],
      officials: stageOfficialsByStageId.get(row.id) ?? [],
    };
    stageById.set(stage.id, stage);
    const bucket = stagesByTournamentId.get(row.tournamentId);
    if (bucket) {
      bucket.push(stage);
    } else {
      stagesByTournamentId.set(row.tournamentId, [stage]);
    }
  }

  const tournamentsByEventId = new Map<string, ApiTournament[]>();
  const tournamentById = new Map<string, ApiTournament>();
  for (const row of tournamentRows) {
    const tournament: ApiTournament = {
      id: row.id,
      eventId: row.eventId,
      name: row.name,
      ruleset: row.rulesetId ? rulesetById.get(row.rulesetId) ?? null : null,
      currentStageId: row.currentStageId,
      order: row.order,
      color: row.color,
      entries: entriesByTournamentId.get(row.id) ?? [],
      stages: stagesByTournamentId.get(row.id) ?? [],
    };
    tournamentById.set(tournament.id, tournament);
    const bucket = tournamentsByEventId.get(row.eventId);
    if (bucket) {
      bucket.push(tournament);
    } else {
      tournamentsByEventId.set(row.eventId, [tournament]);
    }
  }

  const assignmentsByPhaseId = new Map<string, ApiScheduledAssignment[]>();
  for (const row of assignmentRows) {
    const user = userById.get(row.userId);
    if (!user) {
      throw new HttpError(500, `Scheduled assignment "${row.id}" references an unknown user.`);
    }
    const assignment: ApiScheduledAssignment = {
      id: row.id,
      scheduledPhaseId: row.scheduledPhaseId,
      userId: row.userId,
      role: row.role,
      user,
    };
    const bucket = assignmentsByPhaseId.get(row.scheduledPhaseId);
    if (bucket) {
      bucket.push(assignment);
    } else {
      assignmentsByPhaseId.set(row.scheduledPhaseId, [assignment]);
    }
  }

  const timeSlotById = new Map(timeSlotRows.map((row) => [row.id, row] as const));
  const scheduledPhasesByTimeSlotId = new Map<string, ApiScheduledPhase[]>();
  const sortedScheduledPhases = [...scheduledPhaseRows].sort((left, right) => {
    const leftArena = requireValue(arenaById.get(left.arenaId), `Scheduled phase "${left.id}" references an unknown arena.`);
    const rightArena = requireValue(arenaById.get(right.arenaId), `Scheduled phase "${right.id}" references an unknown arena.`);
    const leftStage = requireValue(stageById.get(left.stageId), `Scheduled phase "${left.id}" references an unknown stage.`);
    const rightStage = requireValue(stageById.get(right.stageId), `Scheduled phase "${right.id}" references an unknown stage.`);
    return leftArena.order - rightArena.order
      || stageTypeOrder[leftStage.type] - stageTypeOrder[rightStage.type]
      || left.id.localeCompare(right.id);
  });

  for (const row of sortedScheduledPhases) {
    const stage = stageById.get(row.stageId);
    if (!stage) {
      throw new HttpError(500, `Scheduled phase "${row.id}" references an unknown stage.`);
    }
    const tournament = tournamentById.get(stage.tournamentId);
    if (!tournament) {
      throw new HttpError(500, `Stage "${stage.id}" references an unknown tournament.`);
    }
    const arena = arenaById.get(row.arenaId);
    if (!arena) {
      throw new HttpError(500, `Scheduled phase "${row.id}" references an unknown arena.`);
    }

    const phase: ApiScheduledPhase = {
      id: row.id,
      stageId: row.stageId,
      arenaId: row.arenaId,
      timeSlotId: row.timeSlotId,
      stage: {
        ...stage,
        tournament: {
          id: tournament.id,
          eventId: tournament.eventId,
          name: tournament.name,
          color: tournament.color,
        },
      },
      arena,
      assignments: assignmentsByPhaseId.get(row.id) ?? [],
    };

    const bucket = scheduledPhasesByTimeSlotId.get(row.timeSlotId);
    if (bucket) {
      bucket.push(phase);
    } else {
      scheduledPhasesByTimeSlotId.set(row.timeSlotId, [phase]);
    }
  }

  const schedulesByEventId = new Map<string, ApiEventSchedule>();
  for (const scheduleRow of scheduleRows) {
    const slots = timeSlotRows
      .filter((slot) => slot.scheduleId === scheduleRow.id)
      .map((slot): ApiScheduleTimeSlot => ({
        id: slot.id,
        scheduleId: slot.scheduleId,
        order: slot.order,
        durationMinutes: slot.durationMinutes,
        label: slot.label,
        color: slot.color,
        isBreak: fromSqliteBoolean(slot.isBreak),
        scheduledPhases: scheduledPhasesByTimeSlotId.get(slot.id) ?? [],
      }));
    schedulesByEventId.set(scheduleRow.eventId, {
      id: scheduleRow.id,
      eventId: scheduleRow.eventId,
      startTimeMinutes: scheduleRow.startTimeMinutes,
      currentTimeSlotId: scheduleRow.currentTimeSlotId,
      timeSlots: slots,
    });
  }

  return eventRows.map((row) => ({
    id: row.id,
    eventName: row.eventName,
    ruleset: row.rulesetId ? rulesetById.get(row.rulesetId) ?? null : null,
    allFightersAreVolunteers: fromSqliteBoolean(row.allFightersAreVolunteers),
    schedule: schedulesByEventId.get(row.id) ?? null,
    tournaments: tournamentsByEventId.get(row.id) ?? [],
    arenas: (arenasByEventId.get(row.id) ?? []).map(toApiArena),
    rulesets: (rulesetsByEventId.get(row.id) ?? []).map(toApiRuleset),
  }));
}

export async function requireEventApi(executor: DbExecutor, id: string): Promise<ApiEvent> {
  const event = (await loadEvents(executor, [id]))[0];
  if (!event) {
    throw new HttpError(404, `Event "${id}" not found.`);
  }
  return event;
}

export async function requireTournamentApi(executor: DbExecutor, id: string): Promise<ApiTournament> {
  const tournament = await requireTournamentRow(executor, id);
  const event = await requireEventApi(executor, tournament.eventId);
  const result = event.tournaments.find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Tournament "${id}" not found.`);
  }
  return result;
}

export async function requireArenaApi(executor: DbExecutor, id: string): Promise<ApiArena> {
  const arena = await requireArenaRow(executor, id);
  const event = await requireEventApi(executor, arena.eventId);
  const result = event.arenas.find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Arena "${id}" not found.`);
  }
  return result;
}

export async function requireEntryApi(executor: DbExecutor, id: string): Promise<ApiEntry> {
  const entry = await requireEntryRow(executor, id);
  const tournament = await requireTournamentRow(executor, entry.tournamentId);
  const event = await requireEventApi(executor, tournament.eventId);
  const result = event.tournaments.flatMap((item) => item.entries).find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Entry "${id}" not found.`);
  }
  return result;
}

export async function requireStageApi(executor: DbExecutor, id: string): Promise<ApiStage> {
  const stage = await requireStageRow(executor, id);
  const tournament = await requireTournamentRow(executor, stage.tournamentId);
  const event = await requireEventApi(executor, tournament.eventId);
  const result = event.tournaments.flatMap((item) => item.stages).find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Stage "${id}" not found.`);
  }
  return result;
}

export async function requireEventScheduleResponse(executor: DbExecutor, eventId: string): Promise<ApiEventScheduleResponse> {
  await ensureSchedule(executor, eventId);
  const event = await requireEventApi(executor, eventId);
  if (!event.schedule) {
    throw new HttpError(500, `Event "${eventId}" is missing a schedule.`);
  }
  return {
    event,
    schedule: event.schedule,
  };
}

export async function requireScheduleTimeSlotApi(executor: DbExecutor, id: string): Promise<ApiScheduleTimeSlot> {
  const slot = await requireScheduleTimeSlotRow(executor, id);
  const schedule = requireValue(
    await executor.selectFrom("EventSchedule").selectAll().where("id", "=", slot.scheduleId).executeTakeFirst(),
    `Schedule "${slot.scheduleId}" not found.`,
  );
  const response = await requireEventScheduleResponse(executor, schedule.eventId);
  const result = response.schedule.timeSlots.find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Schedule time slot "${id}" not found.`);
  }
  return result;
}

export async function requireScheduledPhaseApi(executor: DbExecutor, id: string): Promise<ApiScheduledPhase> {
  const phase = await requireScheduledPhaseRow(executor, id);
  const timeSlot = await requireScheduleTimeSlotRow(executor, phase.timeSlotId);
  const schedule = requireValue(
    await executor.selectFrom("EventSchedule").selectAll().where("id", "=", timeSlot.scheduleId).executeTakeFirst(),
    `Schedule "${timeSlot.scheduleId}" not found.`,
  );
  const response = await requireEventScheduleResponse(executor, schedule.eventId);
  const result = response.schedule.timeSlots.flatMap((item) => item.scheduledPhases).find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Scheduled phase "${id}" not found.`);
  }
  return result;
}

export async function requireScheduledAssignmentApi(executor: DbExecutor, id: string): Promise<ApiScheduledAssignment> {
  const assignment = await requireScheduledAssignmentRow(executor, id);
  const user = await requireUserApi(executor, assignment.userId);
  return {
    id: assignment.id,
    scheduledPhaseId: assignment.scheduledPhaseId,
    userId: assignment.userId,
    role: assignment.role,
    user,
  };
}

async function requireMatchContext(executor: DbExecutor, id: string): Promise<{
  match: MatchRow;
  round: RoundRow;
  stage: StageRow;
  tournament: TournamentRow;
}> {
  const match = await executor.selectFrom("Match").selectAll().where("id", "=", id).executeTakeFirst();
  if (!match) {
    throw new HttpError(404, `Match "${id}" not found.`);
  }
  const round = requireValue(
    await executor.selectFrom("Round").selectAll().where("id", "=", match.roundId).executeTakeFirst(),
    `Round "${match.roundId}" not found.`,
  );
  const stage = requireValue(
    await executor.selectFrom("Stage").selectAll().where("id", "=", round.stageId).executeTakeFirst(),
    `Stage "${round.stageId}" not found.`,
  );
  const tournament = requireValue(
    await executor.selectFrom("Tournament").selectAll().where("id", "=", stage.tournamentId).executeTakeFirst(),
    `Tournament "${stage.tournamentId}" not found.`,
  );
  return { match, round, stage, tournament };
}

export async function requireMatchApi(executor: DbExecutor, id: string): Promise<ApiMatch> {
  const { tournament } = await requireMatchContext(executor, id);
  const event = await requireEventApi(executor, tournament.eventId);
  const result = event.tournaments
    .flatMap((item) => item.stages)
    .flatMap((item) => item.rounds)
    .flatMap((item) => item.matches)
    .find((item) => item.id === id);
  if (!result) {
    throw new HttpError(404, `Match "${id}" not found.`);
  }
  return result;
}

export async function listRounds(executor: DbExecutor): Promise<ApiRound[]> {
  const roundRows = await executor.selectFrom("Round").selectAll().orderBy("stageId").orderBy("roundNumber").execute();
  const matchRows = await executor.selectFrom("Match").selectAll().orderBy("roundId").orderBy("id").execute();
  const matchesByRoundId = new Map<string, ApiMatch[]>();

  for (const row of matchRows) {
    const match = await requireMatchApi(executor, row.id);
    const bucket = matchesByRoundId.get(row.roundId);
    if (bucket) {
      bucket.push(match);
    } else {
      matchesByRoundId.set(row.roundId, [match]);
    }
  }

  return roundRows.map((row) => ({
    id: row.id,
    stageId: row.stageId,
    roundNumber: row.roundNumber,
    matches: matchesByRoundId.get(row.id) ?? [],
  }));
}

export async function listMatches(executor: DbExecutor): Promise<ApiMatch[]> {
  const matchRows = await executor.selectFrom("Match").selectAll().orderBy("roundId").orderBy("id").execute();
  const matches: ApiMatch[] = [];
  for (const row of matchRows) {
    matches.push(await requireMatchApi(executor, row.id));
  }
  return matches;
}

export async function listRulesetDetails(executor: DbExecutor, eventId: string): Promise<ApiRulesetDetail[]> {
  await requireEventRow(executor, eventId);
  const rulesets = await executor
    .selectFrom("Ruleset")
    .selectAll()
    .where("eventId", "=", eventId)
    .orderBy("name")
    .orderBy("version desc")
    .execute();
  if (rulesets.length === 0) {
    return [];
  }

  const counts = await executor
    .selectFrom("Match")
    .select(["rulesetId"])
    .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("matchCount"))
    .where("rulesetId", "in", rulesets.map((row) => row.id))
    .groupBy("rulesetId")
    .execute();
  const countByRulesetId = new Map(counts.map((row) => [row.rulesetId, row.matchCount] as const));

  return rulesets.map((row) => toApiRulesetDetail(row, countByRulesetId.get(row.id) ?? 0));
}

export async function requireRulesetDetail(executor: DbExecutor, id: string): Promise<ApiRulesetDetail> {
  const ruleset = await requireRulesetRow(executor, id);
  const countRow = await executor
    .selectFrom("Match")
    .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("matchCount"))
    .where("rulesetId", "=", id)
    .executeTakeFirst();
  return toApiRulesetDetail(ruleset, countRow?.matchCount ?? 0);
}

export function toEventMutationResult(event: ApiEvent): ApiEventMutationResult {
  return {
    id: event.id,
    eventName: event.eventName,
    ruleset: event.ruleset,
    allFightersAreVolunteers: event.allFightersAreVolunteers,
  };
}

export async function nextRulesetVersion(executor: DbExecutor, eventId: string, name: string): Promise<number> {
  const result = await executor
    .selectFrom("Ruleset")
    .select((expressionBuilder) => expressionBuilder.fn.max<number>("version").as("version"))
    .where("eventId", "=", eventId)
    .where("name", "=", name)
    .executeTakeFirst();
  return (result?.version ?? 0) + 1;
}

export async function syncAllPlannerArtifacts(executor: DbExecutor): Promise<void> {
  const stageRows = await executor.selectFrom("Stage").select(["id"]).execute();
  await syncStageArtifacts(executor, stageRows.map((row) => row.id));
}

export async function syncEventArtifacts(executor: DbExecutor, eventId: string): Promise<void> {
  const stageRows = await executor
    .selectFrom("Stage")
    .innerJoin("Tournament", "Tournament.id", "Stage.tournamentId")
    .select(["Stage.id as id"])
    .where("Tournament.eventId", "=", eventId)
    .execute();
  await syncStageArtifacts(executor, stageRows.map((row) => row.id));
}

export async function syncStageArtifacts(executor: DbExecutor, stageIds: readonly string[]): Promise<void> {
  for (const stageId of unique(stageIds)) {
    await syncStageArtifactsForStage(executor, stageId);
  }
}

async function syncStageArtifactsForStage(executor: DbExecutor, stageId: string): Promise<void> {
  const stage = await executor.selectFrom("Stage").selectAll().where("id", "=", stageId).executeTakeFirst();
  if (!stage) {
    return;
  }

  const tournament = requireValue(
    await executor.selectFrom("Tournament").selectAll().where("id", "=", stage.tournamentId).executeTakeFirst(),
    `Tournament "${stage.tournamentId}" not found.`,
  );
  const event = requireValue(
    await executor.selectFrom("Event").selectAll().where("id", "=", tournament.eventId).executeTakeFirst(),
    `Event "${tournament.eventId}" not found.`,
  );
  const scheduledPhases = await executor
    .selectFrom("ScheduledPhase")
    .selectAll()
    .where("stageId", "=", stage.id)
    .execute();
  const desiredArenaIds = unique(scheduledPhases.map((phase) => phase.arenaId));
  await syncStageArenas(executor, stage.id, desiredArenaIds);

  if (stage.type !== "POOL") {
    return;
  }

  const desiredMatches = await buildDesiredPoolMatches(executor, stage, tournament, event, scheduledPhases);
  const rounds = await executor.selectFrom("Round").selectAll().where("stageId", "=", stage.id).execute();
  await syncStageMatches(executor, stage.id, rounds, desiredMatches);
}

async function syncStageArenas(executor: DbExecutor, stageId: string, desiredArenaIds: readonly string[]): Promise<void> {
  let deleteQuery = executor.deleteFrom("StageArena").where("stageId", "=", stageId);
  if (desiredArenaIds.length > 0) {
    deleteQuery = deleteQuery.where("arenaId", "not in", [...desiredArenaIds]);
  }
  await deleteQuery.execute();

  const existing = await executor
    .selectFrom("StageArena")
    .select(["arenaId"])
    .where("stageId", "=", stageId)
    .execute();
  const existingArenaIds = new Set(existing.map((row) => row.arenaId));
  for (const arenaId of desiredArenaIds) {
    if (existingArenaIds.has(arenaId)) {
      continue;
    }
    await executor.insertInto("StageArena").values({
      id: generateId(),
      stageId,
      arenaId,
    }).execute();
  }
}

interface GeneratedPoolMatch {
  key: string;
  roundNumber: number;
  arenaId: string;
  entryAId: string;
  entryBId: string;
  rulesetId: string | null;
}

async function buildDesiredPoolMatches(
  executor: DbExecutor,
  stage: StageRow,
  tournament: TournamentRow,
  event: EventRow,
  phases: ScheduledPhaseRow[],
): Promise<GeneratedPoolMatch[]> {
  if (phases.length === 0) {
    return [];
  }

  const phaseIds = phases.map((phase) => phase.id);
  const assignmentRows = await executor
    .selectFrom("ScheduledAssignment")
    .selectAll()
    .where("scheduledPhaseId", "in", phaseIds)
    .where("role", "=", "FIGHTER")
    .execute();
  const fighterUserIds = unique(assignmentRows.map((row) => row.userId));
  if (fighterUserIds.length === 0) {
    return [];
  }

  const entries = await executor
    .selectFrom("Entry")
    .selectAll()
    .where("tournamentId", "=", stage.tournamentId)
    .where("userId", "in", fighterUserIds)
    .orderBy("seed")
    .orderBy("id")
    .execute();
  const entriesByUserId = new Map(entries.map((row) => [row.userId, row] as const));

  const slotRows = await executor
    .selectFrom("ScheduleTimeSlot")
    .selectAll()
    .where("id", "in", unique(phases.map((phase) => phase.timeSlotId)))
    .execute();
  const slotById = new Map(slotRows.map((row) => [row.id, row] as const));

  const arenaRows = await executor
    .selectFrom("Arena")
    .selectAll()
    .where("id", "in", unique(phases.map((phase) => phase.arenaId)))
    .execute();
  const arenaById = new Map(arenaRows.map((row) => [row.id, row] as const));

  const assignmentsByPhaseId = groupBy(assignmentRows, (row) => row.scheduledPhaseId);
  const rulesetId = stage.rulesetId ?? tournament.rulesetId ?? event.rulesetId ?? null;
  const sortedPhases = [...phases].sort((left, right) => {
    const leftSlot = requireValue(slotById.get(left.timeSlotId), `Time slot "${left.timeSlotId}" not found.`);
    const rightSlot = requireValue(slotById.get(right.timeSlotId), `Time slot "${right.timeSlotId}" not found.`);
    const leftArena = requireValue(arenaById.get(left.arenaId), `Arena "${left.arenaId}" not found.`);
    const rightArena = requireValue(arenaById.get(right.arenaId), `Arena "${right.arenaId}" not found.`);
    return leftSlot.order - rightSlot.order
      || leftArena.order - rightArena.order
      || left.arenaId.localeCompare(right.arenaId);
  });

  const matches: GeneratedPoolMatch[] = [];
  for (const phase of sortedPhases) {
    const fighters = (assignmentsByPhaseId.get(phase.id) ?? [])
      .map((assignment) => entriesByUserId.get(assignment.userId))
      .filter((entry): entry is EntryRow => Boolean(entry))
      .sort((left, right) =>
        (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER)
        || left.id.localeCompare(right.id),
      );
    const slot = requireValue(slotById.get(phase.timeSlotId), `Time slot "${phase.timeSlotId}" not found.`);

    for (let index = 0; index < fighters.length; index += 1) {
      for (let opponentIndex = index + 1; opponentIndex < fighters.length; opponentIndex += 1) {
        const entryA = fighters[index]!;
        const entryB = fighters[opponentIndex]!;
        matches.push({
          key: matchKey(phase.arenaId, entryA.id, entryB.id),
          roundNumber: slot.order,
          arenaId: phase.arenaId,
          entryAId: entryA.id,
          entryBId: entryB.id,
          rulesetId,
        });
      }
    }
  }

  return matches;
}

async function syncStageMatches(
  executor: DbExecutor,
  stageId: string,
  rounds: RoundRow[],
  desiredMatches: GeneratedPoolMatch[],
): Promise<void> {
  const desiredRounds = new Map<number, GeneratedPoolMatch[]>();
  for (const match of desiredMatches) {
    const bucket = desiredRounds.get(match.roundNumber);
    if (bucket) {
      bucket.push(match);
    } else {
      desiredRounds.set(match.roundNumber, [match]);
    }
  }

  const existingRoundsByNumber = new Map(rounds.map((row) => [row.roundNumber, row] as const));
  const desiredRoundNumbers = [...desiredRounds.keys()].sort((left, right) => left - right);

  for (const roundNumber of desiredRoundNumbers) {
    let round = existingRoundsByNumber.get(roundNumber);
    if (!round) {
      const id = generateId();
      await executor.insertInto("Round").values({
        id,
        stageId,
        roundNumber,
      }).execute();
      round = requireValue(
        await executor.selectFrom("Round").selectAll().where("id", "=", id).executeTakeFirst(),
        `Round "${id}" not found after creation.`,
      );
      existingRoundsByNumber.set(roundNumber, round);
    }
    await syncRoundMatches(executor, round, desiredRounds.get(roundNumber) ?? []);
  }
}

async function syncRoundMatches(executor: DbExecutor, round: RoundRow, desiredMatches: GeneratedPoolMatch[]): Promise<void> {
  const existingMatches = await executor.selectFrom("Match").selectAll().where("roundId", "=", round.id).execute();
  const existingByKey = new Map(existingMatches.map((row) => [matchKey(row.arenaId, row.entryAId, row.entryBId), row] as const));
  const desiredByKey = new Map(desiredMatches.map((row) => [row.key, row] as const));

  for (const desired of desiredMatches) {
    const existing = existingByKey.get(desired.key);
    if (existing) {
      await executor.updateTable("Match").set({
        arenaId: desired.arenaId,
        entryAId: desired.entryAId,
        entryBId: desired.entryBId,
        rulesetId: desired.rulesetId,
      }).where("id", "=", existing.id).execute();
      continue;
    }

    await executor.insertInto("Match").values({
      id: generateId(),
      roundId: round.id,
      arenaId: desired.arenaId,
      entryAId: desired.entryAId,
      entryBId: desired.entryBId,
      winnerEntryId: null,
      scoreA: null,
      scoreB: null,
      rulesetId: desired.rulesetId,
    }).execute();
  }

  for (const existing of existingMatches) {
    if (!desiredByKey.has(matchKey(existing.arenaId, existing.entryAId, existing.entryBId))) {
      await executor.deleteFrom("Match").where("id", "=", existing.id).execute();
    }
  }
}

function matchKey(arenaId: string | null, entryAId: string | null, entryBId: string | null): string {
  const [first, second] = [entryAId ?? "", entryBId ?? ""].sort();
  return `${arenaId ?? ""}:${first}:${second}`;
}

export async function validateScheduledPhase(
  executor: DbExecutor,
  stageId: string,
  arenaId: string,
  timeSlotId: string,
  existingId?: string,
): Promise<void> {
  const [stage, arena, timeSlot] = await Promise.all([
    executor.selectFrom("Stage").selectAll().where("id", "=", stageId).executeTakeFirst(),
    executor.selectFrom("Arena").selectAll().where("id", "=", arenaId).executeTakeFirst(),
    executor.selectFrom("ScheduleTimeSlot").selectAll().where("id", "=", timeSlotId).executeTakeFirst(),
  ]);

  if (!stage) {
    throw new HttpError(404, `Stage "${stageId}" not found.`);
  }
  if (!arena) {
    throw new HttpError(404, `Arena "${arenaId}" not found.`);
  }
  if (!timeSlot) {
    throw new HttpError(404, `Schedule time slot "${timeSlotId}" not found.`);
  }

  const tournament = requireValue(
    await executor.selectFrom("Tournament").selectAll().where("id", "=", stage.tournamentId).executeTakeFirst(),
    `Tournament "${stage.tournamentId}" not found.`,
  );
  const schedule = requireValue(
    await executor.selectFrom("EventSchedule").selectAll().where("id", "=", timeSlot.scheduleId).executeTakeFirst(),
    `Schedule "${timeSlot.scheduleId}" not found.`,
  );

  if (tournament.eventId !== arena.eventId || arena.eventId !== schedule.eventId) {
    throw new HttpError(400, "Stage, arena, and time slot must belong to the same event.");
  }
  if (fromSqliteBoolean(timeSlot.isBreak)) {
    throw new HttpError(409, "A phase cannot be placed in a break time slot.");
  }

  const occupiedPlacement = await executor
    .selectFrom("ScheduledPhase")
    .select(["id"])
    .where("arenaId", "=", arenaId)
    .where("timeSlotId", "=", timeSlotId)
    .executeTakeFirst();
  if (occupiedPlacement && occupiedPlacement.id !== existingId) {
    throw new HttpError(409, "This arena already has a phase in the selected time slot.");
  }
}

export async function requireMatchRow(executor: DbExecutor, id: string): Promise<MatchRow> {
  const match = await executor.selectFrom("Match").selectAll().where("id", "=", id).executeTakeFirst();
  if (!match) {
    throw new HttpError(404, `Match "${id}" not found.`);
  }
  return match;
}

export async function listExchangesForMatch(executor: DbExecutor, matchId: string): Promise<ExchangeRow[]> {
  return executor.selectFrom("Exchange").selectAll().where("matchId", "=", matchId).orderBy("id").execute();
}

export async function insertExchange(
  executor: DbExecutor,
  matchId: string,
  scoreA: number,
  scoreB: number,
  details: JsonValue,
): Promise<void> {
  await executor.insertInto("Exchange").values({
    id: generateId(),
    matchId,
    scoreA,
    scoreB,
    details: stringifyJsonValue(details),
  }).execute();
}

export function parseRulesetDefinition(value: JsonValue | null): string | null {
  return stringifyJsonValue(value);
}

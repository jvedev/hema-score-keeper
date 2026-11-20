import type { ApiEvent, ApiMatch, ApiRound, ApiStage, ApiTournament } from "@hema/event-admin-api";

/** A match is played once both scores are in; a pool draw has scores but no winner. */
export function matchPlayed(match: Pick<ApiMatch, "scoreA" | "scoreB">): boolean {
  return match.scoreA !== null && match.scoreB !== null;
}

export type RoundStatus = "empty" | "not-started" | "in-progress" | "done";

export function roundStatus(round: Pick<ApiRound, "matches">): RoundStatus {
  const matches = round.matches ?? [];
  if (matches.length === 0) return "empty";
  const played = matches.filter(matchPlayed).length;
  if (played === 0) return "not-started";
  return played === matches.length ? "done" : "in-progress";
}

export interface StageMatchRow {
  id: string;
  /** Counted from 1, as people say it. */
  roundNumber: number;
  left: string | null;
  right: string | null;
  arena: string | null;
  /** "5–3", or null while not played. */
  score: string | null;
  winner: string | null;
  draw: boolean;
  played: boolean;
  /** The time slot the match is scheduled in, and its order on that ring within the slot. */
  slot: string | null;
  order: number | null;
}

/**
 * The stage's matches as people read them: names instead of ids, in the order they are fought (round, then
 * time slot, then order on the ring).
 */
export function stageMatchRows(event: ApiEvent, tournament: ApiTournament, stage: ApiStage): StageMatchRow[] {
  const names = new Map((tournament.entries ?? []).map((entry) => [entry.id, entry.user?.username ?? null] as const));
  const arenas = new Map((event.arenas ?? []).map((arena) => [arena.id, arena.name] as const));
  const arenaOrder = new Map((event.arenas ?? []).map((arena) => [arena.id, arena.order] as const));
  const phases = new Map<string, { slot: string; slotOrder: number; arena: string }>();
  for (const timeSlot of event.schedule?.timeSlots ?? []) {
    for (const phase of timeSlot.scheduledPhases ?? []) {
      phases.set(phase.id, { slot: timeSlot.label, slotOrder: timeSlot.order, arena: phase.arena?.name ?? arenas.get(phase.arenaId) ?? "" });
    }
  }
  const name = (entryId: string | null) => (entryId ? (names.get(entryId) ?? null) : null);

  const rows = (stage.rounds ?? []).flatMap((round) =>
    (round.matches ?? []).map((match) => {
      const phase = match.scheduledMatch ? phases.get(match.scheduledMatch.scheduledPhaseId) : undefined;
      const played = matchPlayed(match);
      return {
        // Round, then time slot and order on the ring; matches not scheduled yet stay together per arena (= per pool).
        sort: [
          round.roundNumber,
          phase?.slotOrder ?? Number.MAX_SAFE_INTEGER,
          match.scheduledMatch?.order ?? Number.MAX_SAFE_INTEGER,
          (match.arenaId ? arenaOrder.get(match.arenaId) : undefined) ?? Number.MAX_SAFE_INTEGER,
        ] as const,
        row: {
          id: match.id,
          roundNumber: round.roundNumber + 1,
          left: name(match.entryAId),
          right: name(match.entryBId),
          arena: phase?.arena || (match.arenaId ? (arenas.get(match.arenaId) ?? null) : null),
          score: played ? `${match.scoreA}–${match.scoreB}` : null,
          winner: name(match.winnerEntryId),
          draw: played && match.winnerEntryId === null,
          played,
          slot: phase?.slot ?? null,
          order: match.scheduledMatch?.order ?? null,
        } satisfies StageMatchRow,
      };
    }),
  );
  rows.sort((left, right) => {
    for (let index = 0; index < left.sort.length; index += 1) {
      const difference = left.sort[index]! - right.sort[index]!;
      if (difference !== 0) return difference;
    }
    return left.row.id.localeCompare(right.row.id);
  });
  return rows.map((item) => item.row);
}

export interface PhaseOption {
  phaseId: string;
  /** "09:00 · Arena Red" */
  label: string;
  arenaId: string;
  timeSlotId: string;
}

/** The scheduled phases (time slot + arena) of a stage, in time-slot order then arena order. */
export function stagePhaseOptions(event: ApiEvent, stageId: string): PhaseOption[] {
  const arenaOrder = new Map((event.arenas ?? []).map((arena) => [arena.id, arena.order] as const));
  const slots = [...(event.schedule?.timeSlots ?? [])].sort((left, right) => left.order - right.order);
  return slots.flatMap((slot) =>
    (slot.scheduledPhases ?? [])
      .filter((phase) => phase.stageId === stageId)
      .sort((left, right) => (arenaOrder.get(left.arenaId) ?? 0) - (arenaOrder.get(right.arenaId) ?? 0))
      .map((phase) => ({
        phaseId: phase.id,
        label: `${slot.label} · ${phase.arena?.name ?? ""}`,
        arenaId: phase.arenaId,
        timeSlotId: slot.id,
      })),
  );
}

/**
 * The phase a pool match belongs to: its stage, its arena and the time slot whose order equals the round
 * number. This mirrors the backend (`validateScheduledMatch`); null while the pools are not scheduled.
 */
export function poolPhaseFor(event: ApiEvent, stage: Pick<ApiStage, "id">, match: Pick<ApiMatch, "arenaId">, round: Pick<ApiRound, "roundNumber">): PhaseOption | null {
  if (!match.arenaId) return null;
  const slot = (event.schedule?.timeSlots ?? []).find((item) => item.order === round.roundNumber);
  const phase = slot?.scheduledPhases?.find((item) => item.stageId === stage.id && item.arenaId === match.arenaId);
  return slot && phase ? { phaseId: phase.id, label: `${slot.label} · ${phase.arena?.name ?? ""}`, arenaId: phase.arenaId, timeSlotId: slot.id } : null;
}

/**
 * The first free order on a ring within a time slot. Matches of every tournament on that ring and slot share
 * one order, so all of them count, except `matchId` itself (it is being moved).
 */
export function nextFreeOrder(event: ApiEvent, phaseId: string, matchId: string | null = null): number {
  const phases = (event.schedule?.timeSlots ?? []).flatMap((slot) => (slot.scheduledPhases ?? []).map((phase) => ({ ...phase, timeSlotId: slot.id })));
  const target = phases.find((phase) => phase.id === phaseId);
  if (!target) return 1;
  const sameRingAndSlot = new Set(phases.filter((phase) => phase.arenaId === target.arenaId && phase.timeSlotId === target.timeSlotId).map((phase) => phase.id));
  const orders = event.tournaments
    .flatMap((tournament) => tournament.stages ?? [])
    .flatMap((stage) => stage.rounds ?? [])
    .flatMap((round) => round.matches ?? [])
    .filter((match) => match.id !== matchId && match.scheduledMatch && sameRingAndSlot.has(match.scheduledMatch.scheduledPhaseId))
    .map((match) => match.scheduledMatch!.order);
  return Math.max(0, ...orders) + 1;
}

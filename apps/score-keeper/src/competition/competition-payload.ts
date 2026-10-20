import type { BoutOutcome } from "@hema/match-engine";
import type { BoutSetupResult } from "@hema/ui";

export interface RecordBoutPayload extends BoutOutcome {
  fighterAUserId: string;
  fighterBUserId: string;
  refereeUserId: string;
  juryUserIds: string[];
  tableUserIds: string[];
  ring: string | null;
  startedAt: string;
  startedInCompetitionId: string;
  alsoCountIn: string[];
}

export function buildRecordBoutPayload(setup: BoutSetupResult, outcome: BoutOutcome, startedAt: string): RecordBoutPayload {
  return {
    fighterAUserId: setup.fighterAUserId,
    fighterBUserId: setup.fighterBUserId,
    refereeUserId: setup.refereeUserId,
    juryUserIds: setup.juryUserIds,
    tableUserIds: setup.tableUserIds,
    ring: setup.ring,
    startedAt,
    startedInCompetitionId: setup.competitionId,
    alsoCountIn: setup.alsoCountIn,
    ...outcome,
  };
}

/** Keeps only the ticked competitions that the pair can still also count in. */
export function reconcileAlsoCountIn(ticked: readonly string[], available: ReadonlyArray<{ id: string; name: string }>): string[] {
  const allowed = new Set(available.map((competition) => competition.id));
  return ticked.filter((id) => allowed.has(id));
}

export function ringLabel(competitionName: string, ring: string | null): string {
  return ring ? `${competitionName} · ${ring}` : competitionName;
}

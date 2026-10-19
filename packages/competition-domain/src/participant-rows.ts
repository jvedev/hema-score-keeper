import { DEFAULT_ELO_RATING } from "@hema/ranking";
import { sortChronologically, type RatedBout, type RatingReplay } from "./rating-replay.js";

/** A rating is "provisional" until a fighter has this many counted bouts in the competition. */
export const PROVISIONAL_BOUT_THRESHOLD = 10;

export interface StatsBout extends RatedBout {
  warningsA: number;
  warningsB: number;
}

export interface ParticipantRow {
  participantId: string;
  position: number;
  rating: number;
  lastChange: number | null;
  bouts: number;
  wins: number;
  draws: number;
  losses: number;
  warnings: number;
  provisional: boolean;
}

export function buildParticipantRows(
  participantIds: readonly string[],
  bouts: readonly StatsBout[],
  replay: RatingReplay,
): ParticipantRow[] {
  const rows = new Map<string, Omit<ParticipantRow, "position" | "provisional">>();
  for (const participantId of participantIds) {
    rows.set(participantId, {
      participantId,
      rating: replay.ratings.get(participantId) ?? DEFAULT_ELO_RATING,
      lastChange: null,
      bouts: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      warnings: 0,
    });
  }

  // Chronological order means the last bout visited sets lastChange.
  for (const bout of sortChronologically(bouts.filter((candidate) => candidate.counts))) {
    const change = replay.changes.get(bout.id);
    for (const side of ["A", "B"] as const) {
      const ownId = side === "A" ? bout.fighterAId : bout.fighterBId;
      const row = rows.get(ownId);
      if (!row) {
        continue;
      }
      row.bouts += 1;
      row.warnings += side === "A" ? bout.warningsA : bout.warningsB;
      if (bout.winnerId === null) {
        row.draws += 1;
      } else if (bout.winnerId === ownId) {
        row.wins += 1;
      } else {
        row.losses += 1;
      }
      if (change) {
        row.lastChange = side === "A" ? change.afterA - change.beforeA : change.afterB - change.beforeB;
      }
    }
  }

  return [...rows.values()]
    .sort((a, b) => b.rating - a.rating || (a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0))
    .map((row, index) => ({ ...row, position: index + 1, provisional: row.bouts < PROVISIONAL_BOUT_THRESHOLD }));
}

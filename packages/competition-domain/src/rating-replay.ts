import { applyEloBout, DEFAULT_ELO_RATING } from "@hema/ranking";
import { SameFighterError } from "./bout-competitions.js";

export interface RatedBout {
  id: string;
  fighterAId: string;
  fighterBId: string;
  winnerId: string | null;
  foughtAt: string;
  counts: boolean;
}

export class InvalidWinnerError extends Error {
  constructor(boutId: string) {
    super(`Bout ${boutId} has a winner who isn't one of its fighters.`);
    this.name = "InvalidWinnerError";
  }
}

export interface RatingChange {
  boutId: string;
  beforeA: number;
  afterA: number;
  beforeB: number;
  afterB: number;
}

export interface RatingReplay {
  ratings: Map<string, number>;
  changes: Map<string, RatingChange>;
}

/** Elo depends on bout order, so ratings are always rebuilt from the full history of counting bouts. */
export function replayRatings(bouts: readonly RatedBout[]): RatingReplay {
  let ratings = new Map<string, number>();
  const changes = new Map<string, RatingChange>();

  for (const bout of sortChronologically(bouts.filter((candidate) => candidate.counts))) {
    assertValidBout(bout);
    const beforeA = ratings.get(bout.fighterAId) ?? DEFAULT_ELO_RATING;
    const beforeB = ratings.get(bout.fighterBId) ?? DEFAULT_ELO_RATING;
    ratings = applyEloBout(ratings, {
      fighterAId: bout.fighterAId,
      fighterBId: bout.fighterBId,
      winnerParticipantId: bout.winnerId,
    });
    changes.set(bout.id, {
      boutId: bout.id,
      beforeA,
      afterA: ratings.get(bout.fighterAId)!,
      beforeB,
      afterB: ratings.get(bout.fighterBId)!,
    });
  }

  return { ratings, changes };
}

function assertValidBout(bout: RatedBout): void {
  if (bout.fighterAId === bout.fighterBId) {
    throw new SameFighterError();
  }
  if (bout.winnerId !== null && bout.winnerId !== bout.fighterAId && bout.winnerId !== bout.fighterBId) {
    throw new InvalidWinnerError(bout.id);
  }
}

export function sortChronologically<T extends Pick<RatedBout, "id" | "foughtAt">>(bouts: readonly T[]): T[] {
  return [...bouts].sort(
    (a, b) => Date.parse(a.foughtAt) - Date.parse(b.foughtAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

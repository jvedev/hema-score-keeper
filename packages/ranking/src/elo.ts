export const DEFAULT_ELO_RATING = 1000;
const K_FACTOR = 32;

export interface EloBoutResult {
  fighterAId: string;
  fighterBId: string;
  winnerParticipantId: string | null;
}

export function applyEloBout(ratings: ReadonlyMap<string, number>, bout: EloBoutResult): Map<string, number> {
  const ratingA = ratings.get(bout.fighterAId) ?? DEFAULT_ELO_RATING;
  const ratingB = ratings.get(bout.fighterBId) ?? DEFAULT_ELO_RATING;

  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const scoreA =
    bout.winnerParticipantId === null ? 0.5 : bout.winnerParticipantId === bout.fighterAId ? 1 : 0;

  const next = new Map(ratings);
  next.set(bout.fighterAId, Math.round(ratingA + K_FACTOR * (scoreA - expectedA)));
  next.set(bout.fighterBId, Math.round(ratingB + K_FACTOR * (1 - scoreA - (1 - expectedA))));
  return next;
}

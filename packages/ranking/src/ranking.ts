import { applyEloBout, DEFAULT_ELO_RATING, type EloBoutResult } from "./elo.js";

export interface RankingParticipant {
  id: string;
  name: string;
}

export interface RankingEntry {
  participantId: string;
  position: number;
  name: string;
  rating: number;
}

export function buildRanking(
  participants: readonly RankingParticipant[],
  ratings: ReadonlyMap<string, number>,
): RankingEntry[] {
  // Defends against duplicate participant rows (e.g. an accidental double-submit that
  // created the same participant twice) surfacing as the same person listed twice.
  const uniqueParticipants = new Map(participants.map((participant) => [participant.id, participant]));

  return [...uniqueParticipants.values()]
    .map((participant) => ({
      participantId: participant.id,
      name: participant.name,
      rating: ratings.get(participant.id) ?? DEFAULT_ELO_RATING,
      position: 0,
    }))
    .sort((a, b) => b.rating - a.rating)
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

export function publishBoutRanking(
  participants: readonly RankingParticipant[],
  currentRatings: ReadonlyMap<string, number>,
  bout: EloBoutResult,
): RankingEntry[] {
  return buildRanking(participants, applyEloBout(currentRatings, bout));
}

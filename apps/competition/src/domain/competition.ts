export interface Competition {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface Participant {
  id: string;
  competitionId: string;
  name: string;
  linkedUserEmail: string | null;
}

export interface RankingEntry {
  participantId: string;
  position: number;
  name: string;
  rating: number;
}

export type BoutResult = "win" | "loss" | "draw";

export interface Bout {
  id: string;
  competitionId: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  published: boolean;
}

export interface NewBoutInput {
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  details: unknown;
}

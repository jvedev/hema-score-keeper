import type { RuleSet } from "@hema/match-engine";

export type CompetitionStatus = "ACTIVE" | "ARCHIVED" | "PUBLIC";

export interface Competition {
  id: string;
  name: string;
  slug: string;
  status: CompetitionStatus;
  date: string;
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
  name: string;
  position: number;
  rating: number;
}

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
  details: unknown;
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

export interface RepositoryGetOptions {
  forceRefresh?: boolean;
}

export interface CompetitionRepository {
  listCompetitions(): Promise<Competition[]>;
  getCompetition(competitionId: string): Promise<Competition>;
  getRuleSet(competitionId: string): Promise<RuleSet>;
  getRanking(competitionId: string, options?: RepositoryGetOptions): Promise<RankingEntry[]>;
  getParticipants(competitionId: string, options?: RepositoryGetOptions): Promise<Participant[]>;
  getParticipant(competitionId: string, participantId: string): Promise<Participant>;
  getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]>;
  getBout(competitionId: string, boutId: string): Promise<Bout>;
  getBouts(competitionId: string): Promise<Bout[]>;
  addParticipant(competitionId: string, name: string): Promise<Participant>;
  registerSelf(competitionId: string, name: string): Promise<Participant>;
  createBout(competitionId: string, input: NewBoutInput): Promise<Bout>;
  publishBout(competitionId: string, boutId: string, input: NewBoutInput): Promise<Bout>;
  declineBout(competitionId: string, boutId: string): Promise<Bout>;
}

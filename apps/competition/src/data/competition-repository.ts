import type { RuleSet } from "@hema/match-engine";
import type { Bout, Competition, NewBoutInput, Participant, RankingEntry } from "../domain/competition";

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
  addParticipant(competitionId: string, name: string): Promise<Participant>;
  registerSelf(competitionId: string, name: string): Promise<Participant>;
  getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]>;
  getBout(competitionId: string, boutId: string): Promise<Bout>;
  publishBout(competitionId: string, input: NewBoutInput): Promise<Bout>;
}

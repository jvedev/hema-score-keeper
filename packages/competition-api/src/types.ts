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
  visibility?: "PUBLIC" | "CLUB_ONLY";
  clubId?: string | null;
}

export interface Participant {
  id: string;
  competitionId: string;
  name: string;
  linkedUserEmail: string | null;
  clubId?: string | null;
  userId?: string | null;
  kind?: "MEMBER" | "GUEST";
}

export interface RankingEntry {
  participantId: string;
  name: string;
  position: number;
  rating: number;
}

export type MatchFighter = "A" | "B";
export type MatchOutcome = "score" | "low-quality" | "no-score";

export interface MatchExchangeDetails {
  fighterA: {
    outcome: MatchOutcome;
  };
  fighterB: {
    outcome: MatchOutcome;
  };
}

export interface MatchScoreEventBase {
  elapsedTimeSeconds: number;
  fighterAScore: number;
  fighterBScore: number;
  details: MatchExchangeDetails;
}

export type MatchScoreEvent =
  | (MatchScoreEventBase & {
      type: "afterblow";
      firstFighter: MatchFighter;
    })
  | (MatchScoreEventBase & {
      type: "no-score" | "hit" | "double";
      firstFighter?: never;
    });

export interface MatchScoreAdjustmentEvent {
  elapsedTimeSeconds: number;
  type: "score-adjustment";
  fighter: MatchFighter;
  score: number;
}

export interface MatchWarningEvent {
  elapsedTimeSeconds: number;
  type: "warning";
  fighter: MatchFighter;
  description: string;
  pointsDeducted: number;
}

export interface MatchDisqualificationEvent {
  elapsedTimeSeconds: number;
  type: "disqualification";
  fighter: MatchFighter;
  description: string;
}

export interface MatchTimeoutEvent {
  elapsedTimeSeconds: number;
  type: "timeout";
  fighter: MatchFighter;
  description?: string;
}

export type MatchEvent =
  | MatchScoreEvent
  | MatchScoreAdjustmentEvent
  | MatchWarningEvent
  | MatchDisqualificationEvent
  | MatchTimeoutEvent;

export interface MatchDetails {
  events?: readonly MatchEvent[];
  [key: string]: unknown;
}

export interface Match {
  id: string;
  competitionId: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  published: boolean;
  details: MatchDetails;
}

export type Bout = Match;

export interface MatchInput {
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  details: MatchDetails;
}

export type NewBoutInput = MatchInput;

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
  getMatchesForParticipant(competitionId: string, participantId: string): Promise<Match[]>;
  getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]>;
  getMatch(competitionId: string, matchId: string): Promise<Match>;
  getBout(competitionId: string, boutId: string): Promise<Bout>;
  getMatches(competitionId: string): Promise<Match[]>;
  getBouts(competitionId: string): Promise<Bout[]>;
  addParticipant(competitionId: string, name: string): Promise<Participant>;
  registerSelf(competitionId: string, name: string): Promise<Participant>;
  createMatch(competitionId: string, input: MatchInput): Promise<Match>;
  createBout(competitionId: string, input: NewBoutInput): Promise<Bout>;
  publishMatch(competitionId: string, matchId: string, input: MatchInput): Promise<Match>;
  publishBout(competitionId: string, boutId: string, input: NewBoutInput): Promise<Bout>;
  declineMatch(competitionId: string, matchId: string): Promise<Match>;
  declineBout(competitionId: string, boutId: string): Promise<Bout>;
}

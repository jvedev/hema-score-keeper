export interface CompetitionIndexEntry {
  name: string;
  startDate: string;
  endDate: string;
  spreadsheetId: string;
}

export interface RulesetEntry {
  name: string;
  definition: unknown;
}

export interface CompetitionSettings {
  name: string;
  startDate: string;
  endDate: string;
  rulesetJson: unknown;
}

export interface RankingRow {
  participantId: string;
  position: number;
  name: string;
  rating: number;
}

export interface ParticipantRow {
  id: string;
  name: string;
  linkedUserEmail: string | null;
}

export interface BoutRow {
  id: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  details: unknown;
}

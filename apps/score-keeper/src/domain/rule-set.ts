export interface RuleSet {
  id: string;
  name: string;
  version: string;
  weaponClass: string;
  matchParameters: MatchParameters;
}

export interface MatchParameters {
  maxDurationSeconds: number;
  stopOnTimeOut: boolean;
  maxPointsCap: number;
  pointSpreadVictory: number;
  scores: number[];
  maxDoubles: number;
  allowAfterBlow: boolean;
  countDoubles: boolean;
  useNetScore: boolean;
  penalties: PenaltyRule[];
}

export interface PenaltyRule {
  description: string;
  penalties: number[];
  disqualify: boolean;
}

export type FighterIdentifier = "A" | "B";
export type FighterOutcome = "score" | "low-quality" | "no-score";

export interface FighterMatchOutcome {
  outcome: FighterOutcome;
}

export interface ScoreMatchEventDetail {
  elapsedTimeSeconds: number;
  fighterAScore: number;
  fighterBScore: number;
  fighterOutcomes: {
    fighterA: FighterMatchOutcome;
    fighterB: FighterMatchOutcome;
  };
  type: "no-score" | "hit" | "afterblow" | "double";
  details?: FighterIdentifier;
}

export interface WarningMatchEventDetail {
  elapsedTimeSeconds: number;
  type: "warning";
  fighter: FighterIdentifier;
  description: string;
  pointsDeducted: number;
}

export interface DisqualificationMatchEventDetail {
  elapsedTimeSeconds: number;
  type: "disqualification";
  fighter: FighterIdentifier;
  description: string;
}

export type MatchEventDetail =
  | ScoreMatchEventDetail
  | WarningMatchEventDetail
  | DisqualificationMatchEventDetail;

export function dispatchMatchEvent(detail: MatchEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<MatchEventDetail>("match-event", { detail }),
  );
}

declare global {
  interface WindowEventMap {
    "match-event": CustomEvent<MatchEventDetail>;
  }
}

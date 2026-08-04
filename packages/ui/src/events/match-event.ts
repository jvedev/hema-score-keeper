export type FighterIdentifier = "A" | "B";
export type FighterOutcome = "score" | "low-quality" | "no-score";

export interface FighterMatchOutcome {
  outcome: FighterOutcome;
}

interface ScoreMatchEventBase {
  elapsedTimeSeconds: number;
  fighterAScore: number;
  fighterBScore: number;
  details: {
    fighterA: FighterMatchOutcome;
    fighterB: FighterMatchOutcome;
  };
}

export type ScoreMatchEventDetail =
  | (ScoreMatchEventBase & {
      type: "afterblow";
      firstFighter: FighterIdentifier;
    })
  | (ScoreMatchEventBase & {
      type: "no-score" | "hit" | "double";
      firstFighter?: never;
    });

export interface ScoreAdjustmentMatchEventDetail {
  elapsedTimeSeconds: number;
  type: "score-adjustment";
  fighter: FighterIdentifier;
  score: number;
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
  | ScoreAdjustmentMatchEventDetail
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

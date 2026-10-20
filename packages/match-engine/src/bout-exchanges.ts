import type { FighterIdentifier, MatchEventDetail } from "@hema/ui";
import { reduceMatchEvent } from "./match-reducer";
import { createInitialMatchState } from "./match-state";
import type { MatchParameters } from "./rule-set";

export type BoutExchangeKind = "SCORE" | "DOUBLE" | "WARNING" | "TIME" | "ADJUSTMENT" | "DISQUALIFICATION";

/** One line of a recorded competition bout, as the backend's `/api/v1/bouts` expects it. */
export interface BoutExchange {
  atSeconds: number;
  kind: BoutExchangeKind;
  side: FighterIdentifier | null;
  /** Points scored; points deducted for WARNING; signed change for ADJUSTMENT. */
  points: number;
  reason: string | null;
}

export interface BoutOutcome {
  scoreA: number;
  scoreB: number;
  winnerSide: FighterIdentifier | null;
  warningsA: number;
  warningsB: number;
  exchanges: BoutExchange[];
}

/**
 * Replays the score-keeper's match events with the ruleset and describes the bout as exchanges:
 * a score per fighter who gained points, doubles that scored nothing, warnings, manual
 * corrections, a disqualification, and the time the bout ended.
 */
export function toBoutOutcome(events: readonly MatchEventDetail[], rules: MatchParameters, endedAtSeconds: number): BoutOutcome {
  let state = createInitialMatchState();
  const exchanges: BoutExchange[] = [];

  for (const event of events) {
    const before = state;
    state = reduceMatchEvent(state, event, rules);
    const atSeconds = Math.floor(event.elapsedTimeSeconds);
    const exchange = (kind: BoutExchangeKind, side: FighterIdentifier | null, points: number, reason: string | null = null) =>
      exchanges.push({ atSeconds, kind, side, points, reason });

    switch (event.type) {
      case "warning":
        exchange("WARNING", event.fighter, event.pointsDeducted, event.description);
        break;
      case "score-adjustment": {
        const change = event.fighter === "A" ? state.fighterAScore - before.fighterAScore : state.fighterBScore - before.fighterBScore;
        exchange("ADJUSTMENT", event.fighter, change);
        break;
      }
      case "disqualification":
        exchange("DISQUALIFICATION", event.fighter, 0, event.description);
        break;
      default: {
        const gainedA = state.fighterAScore - before.fighterAScore;
        const gainedB = state.fighterBScore - before.fighterBScore;
        if (gainedA > 0) {
          exchange("SCORE", "A", gainedA);
        }
        if (gainedB > 0) {
          exchange("SCORE", "B", gainedB);
        }
        if (gainedA <= 0 && gainedB <= 0 && event.type === "double") {
          exchange("DOUBLE", null, 0);
        }
      }
    }
  }

  exchanges.push({ atSeconds: Math.floor(endedAtSeconds), kind: "TIME", side: null, points: 0, reason: null });

  return {
    scoreA: state.fighterAScore,
    scoreB: state.fighterBScore,
    winnerSide: winner(state.disqualifiedFighter, state.fighterAScore, state.fighterBScore),
    warningsA: state.warnings.A,
    warningsB: state.warnings.B,
    exchanges,
  };
}

function winner(disqualified: FighterIdentifier | undefined, scoreA: number, scoreB: number): FighterIdentifier | null {
  if (disqualified) {
    return disqualified === "A" ? "B" : "A";
  }
  if (scoreA === scoreB) {
    return null;
  }
  return scoreA > scoreB ? "A" : "B";
}

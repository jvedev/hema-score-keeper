import type { MatchEventDetail } from "@hema/ui";

/** What the backend's `POST /live-bouts/:id/exchanges` takes, without the `clientExchangeId` (the outbox adds it). */
export interface LiveExchangeInput {
  kind: "EXCHANGE" | "DEDUCTION";
  /** Fighter A. Negative for a deduction. */
  leftPoints: number;
  /** Fighter B. Negative for a deduction. */
  rightPoints: number;
  /** Both fighters scored. The backend derives this from the points and refuses a mismatch. */
  isDouble: boolean;
  firstScorer: "LEFT" | "RIGHT" | null;
}

/**
 * The live exchange for a score-keeper match event, or null when there is nothing to send.
 * Fighter A is the ring's left fighter and fighter B the right one.
 *
 * - `hit`, `double`, `afterblow`: the points the operator picked for each fighter, as they are. Which rule applies
 *   (is a double worth anything, is the afterblow counted) is left to the sheet, which counts a both-score exchange as a
 *   double. An afterblow also carries who hit first.
 * - 0/0 (`no-score`, or any exchange where nobody got points) is not registered.
 * - `warning` with points deducted: a `DEDUCTION`, negative points for that fighter. A warning without a deduction stays local.
 * - `score-adjustment` and `disqualification` have no live exchange (the backend only knows exchanges and deductions).
 */
export function exchangeFromMatchEvent(event: MatchEventDetail): LiveExchangeInput | null {
  switch (event.type) {
    case "hit":
    case "double":
    case "afterblow": {
      const leftPoints = event.fighterAScore;
      const rightPoints = event.fighterBScore;
      if (leftPoints === 0 && rightPoints === 0) {
        return null;
      }
      return {
        kind: "EXCHANGE",
        leftPoints,
        rightPoints,
        isDouble: leftPoints > 0 && rightPoints > 0,
        firstScorer: event.type === "afterblow" ? (event.firstFighter === "A" ? "LEFT" : "RIGHT") : null,
      };
    }
    case "warning": {
      if (!(event.pointsDeducted > 0)) {
        return null;
      }
      return {
        kind: "DEDUCTION",
        leftPoints: event.fighter === "A" ? -event.pointsDeducted : 0,
        rightPoints: event.fighter === "B" ? -event.pointsDeducted : 0,
        isDouble: false,
        firstScorer: null,
      };
    }
    default:
      return null;
  }
}

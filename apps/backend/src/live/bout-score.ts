export interface ScoredExchange {
  kind: "EXCHANGE" | "DEDUCTION";
  leftPoints: number;
  rightPoints: number;
}

export interface BoutScore {
  left: number;
  right: number;
  doubles: number;
}

/**
 * The sheet's rule: an exchange where both fighters score is a double and counts 0 for both.
 * A deduction stores negative points for the penalised fighter and simply adds them.
 */
export function scoreOf(exchanges: readonly ScoredExchange[]): BoutScore {
  const score: BoutScore = { left: 0, right: 0, doubles: 0 };
  for (const exchange of exchanges) {
    if (exchange.kind === "EXCHANGE" && exchange.leftPoints > 0 && exchange.rightPoints > 0) {
      score.doubles += 1;
      continue;
    }
    score.left += exchange.leftPoints;
    score.right += exchange.rightPoints;
  }
  return score;
}

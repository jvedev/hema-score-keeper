import type { BoutExchange } from "./bout-exchanges";

export const CORRECTION_REASON = "Corrected after objection";

/**
 * When an admin corrects a bout's final score, these exchanges are appended to the original ones
 * so the exchange list still adds up to the corrected score: one adjustment per changed fighter.
 */
export function correctionExchanges(
  original: { scoreA: number; scoreB: number },
  corrected: { scoreA: number; scoreB: number },
  atSeconds: number,
): BoutExchange[] {
  const exchanges: BoutExchange[] = [];
  for (const side of ["A", "B"] as const) {
    const change = corrected[`score${side}`] - original[`score${side}`];
    if (change !== 0) {
      exchanges.push({ atSeconds, kind: "ADJUSTMENT", side, points: change, reason: CORRECTION_REASON });
    }
  }
  return exchanges;
}

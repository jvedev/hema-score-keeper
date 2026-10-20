import { correctionExchanges } from "@hema/match-engine";
import type { BoutDetailView } from "@hema/ui";
import type { BoutResponse, ObjectionResolution } from "../api-types";

export function toBoutDetailView(bout: BoutResponse, rulesetLabel: string | null = null): BoutDetailView {
  const person = ({ userId, name }: { userId: string; name: string }) => ({ userId, name });
  return {
    boutId: bout.id,
    status: bout.status,
    approvals: { referee: bout.windowEndsAt !== null, A: bout.fighterApproved.A, B: bout.fighterApproved.B },
    fighterA: person(bout.fighterA),
    fighterB: person(bout.fighterB),
    scoreA: bout.scoreA,
    scoreB: bout.scoreB,
    startedAt: bout.startedAt,
    location: bout.ring,
    rulesetLabel,
    officials: { referee: person(bout.referee), jury: bout.jury.map(person), table: bout.table.map(person) },
    exchanges: bout.exchanges,
    windowEndsAt: bout.windowEndsAt,
    objection: bout.objection ? { by: bout.objection.by, reason: bout.objection.reason } : null,
    voidReason: bout.voidReason,
  };
}

/**
 * The resolution request for a corrected final score: the original exchanges stay, with an
 * adjustment per changed fighter appended so they still add up to the new score.
 */
export function buildCorrection(
  bout: BoutResponse,
  corrected: { scoreA: number; scoreB: number; winnerSide: "A" | "B" | null },
): ObjectionResolution {
  const lastSecond = bout.exchanges.reduce((latest, exchange) => Math.max(latest, exchange.atSeconds), 0);
  return {
    kind: "correct",
    result: {
      scoreA: corrected.scoreA,
      scoreB: corrected.scoreB,
      winnerSide: corrected.winnerSide,
      warningsA: bout.warningsA,
      warningsB: bout.warningsB,
      exchanges: [...bout.exchanges, ...correctionExchanges(bout, corrected, lastSecond)],
    },
  };
}

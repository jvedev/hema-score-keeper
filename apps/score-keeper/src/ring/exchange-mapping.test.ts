import type { MatchEventDetail } from "@hema/ui";
import { describe, expect, it } from "vitest";
import { exchangeFromMatchEvent } from "./exchange-mapping";

const outcomes = { fighterA: { outcome: "score" as const }, fighterB: { outcome: "score" as const } };

function score(type: "hit" | "double" | "no-score", a: number, b: number): MatchEventDetail {
  return { type, elapsedTimeSeconds: 10, fighterAScore: a, fighterBScore: b, details: outcomes };
}

describe("exchangeFromMatchEvent", () => {
  it("mapping: hit, double, deduction, 0/0 is null", () => {
    expect(exchangeFromMatchEvent(score("hit", 2, 0))).toEqual({ kind: "EXCHANGE", leftPoints: 2, rightPoints: 0, isDouble: false, firstScorer: null });
    expect(exchangeFromMatchEvent(score("hit", 0, 3))).toEqual({ kind: "EXCHANGE", leftPoints: 0, rightPoints: 3, isDouble: false, firstScorer: null });
    expect(exchangeFromMatchEvent(score("double", 1, 1))).toEqual({ kind: "EXCHANGE", leftPoints: 1, rightPoints: 1, isDouble: true, firstScorer: null });
    expect(exchangeFromMatchEvent({ type: "afterblow", firstFighter: "B", elapsedTimeSeconds: 5, fighterAScore: 1, fighterBScore: 2, details: outcomes })).toEqual({
      kind: "EXCHANGE",
      leftPoints: 1,
      rightPoints: 2,
      isDouble: true,
      firstScorer: "RIGHT",
    });
    expect(exchangeFromMatchEvent({ type: "warning", fighter: "A", description: "Off target", pointsDeducted: 1, elapsedTimeSeconds: 8 })).toEqual({
      kind: "DEDUCTION",
      leftPoints: -1,
      rightPoints: 0,
      isDouble: false,
      firstScorer: null,
    });
    expect(exchangeFromMatchEvent({ type: "warning", fighter: "B", description: "Off target", pointsDeducted: 2, elapsedTimeSeconds: 8 })).toMatchObject({
      kind: "DEDUCTION",
      leftPoints: 0,
      rightPoints: -2,
    });
    expect(exchangeFromMatchEvent(score("no-score", 0, 0))).toBeNull();
    expect(exchangeFromMatchEvent(score("hit", 0, 0))).toBeNull();
    expect(exchangeFromMatchEvent(score("double", 0, 0))).toBeNull();
  });

  it("a warning without a deduction stays local", () => {
    expect(exchangeFromMatchEvent({ type: "warning", fighter: "A", description: "Caution", pointsDeducted: 0, elapsedTimeSeconds: 8 })).toBeNull();
  });

  it("events with no exchange to send map to null", () => {
    expect(exchangeFromMatchEvent({ type: "score-adjustment", fighter: "A", score: 4, elapsedTimeSeconds: 8 })).toBeNull();
    expect(exchangeFromMatchEvent({ type: "disqualification", fighter: "B", description: "x", elapsedTimeSeconds: 8 })).toBeNull();
  });
});

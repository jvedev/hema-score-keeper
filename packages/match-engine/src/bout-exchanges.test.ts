import type { MatchEventDetail } from "@hema/ui";
import { describe, expect, it } from "vitest";
import { toBoutOutcome } from "./bout-exchanges";
import type { MatchParameters } from "./rule-set";

const rules: MatchParameters = {
  maxDurationSeconds: 180,
  stopOnTimeOut: true,
  maxPointsCap: 7,
  pointSpreadVictory: 0,
  scores: [1, 2, 3],
  maxDoubles: 3,
  allowAfterBlow: true,
  countDoubles: false,
  useNetScore: false,
  penalties: [],
};

const outcome = (a: "score" | "low-quality" | "no-score", b: "score" | "low-quality" | "no-score") => ({
  fighterA: { outcome: a },
  fighterB: { outcome: b },
});

function hit(at: number, scoreA: number, scoreB: number): MatchEventDetail {
  return { type: "hit", elapsedTimeSeconds: at, fighterAScore: scoreA, fighterBScore: scoreB, details: outcome(scoreA > 0 ? "score" : "no-score", scoreB > 0 ? "score" : "no-score") };
}

describe("toBoutOutcome", () => {
  it("turns a clean hit into one score", () => {
    const result = toBoutOutcome([hit(12, 2, 0)], rules, 180);
    expect(result.exchanges).toEqual([
      { atSeconds: 12, kind: "SCORE", side: "A", points: 2, reason: null },
      { atSeconds: 180, kind: "TIME", side: null, points: 0, reason: null },
    ]);
    expect(result).toMatchObject({ scoreA: 2, scoreB: 0, winnerSide: "A", warningsA: 0, warningsB: 0 });
  });

  it("after-blow scores both", () => {
    const afterblow: MatchEventDetail = {
      type: "afterblow",
      elapsedTimeSeconds: 30,
      fighterAScore: 2,
      fighterBScore: 1,
      firstFighter: "A",
      details: outcome("score", "score"),
    };
    const result = toBoutOutcome([afterblow], rules, 180);
    expect(result.exchanges.slice(0, 2)).toEqual([
      { atSeconds: 30, kind: "SCORE", side: "A", points: 2, reason: null },
      { atSeconds: 30, kind: "SCORE", side: "B", points: 1, reason: null },
    ]);
    expect(result).toMatchObject({ scoreA: 2, scoreB: 1 });
  });

  it("records a double that scores nothing", () => {
    const double: MatchEventDetail = { type: "double", elapsedTimeSeconds: 31, fighterAScore: 1, fighterBScore: 1, details: outcome("score", "score") };
    expect(toBoutOutcome([double], rules, 180).exchanges[0]).toEqual({ atSeconds: 31, kind: "DOUBLE", side: null, points: 0, reason: null });
  });

  it("skips exchanges where nobody scored", () => {
    const noScore: MatchEventDetail = { type: "no-score", elapsedTimeSeconds: 5, fighterAScore: 0, fighterBScore: 0, details: outcome("no-score", "no-score") };
    expect(toBoutOutcome([noScore], rules, 60).exchanges.map((exchange) => exchange.kind)).toEqual(["TIME"]);
  });

  it("keeps a warning with its reason and deduction", () => {
    const events: MatchEventDetail[] = [
      hit(10, 3, 0),
      { type: "warning", elapsedTimeSeconds: 82, fighter: "A", description: "grappling after halt", pointsDeducted: 1 },
    ];
    const result = toBoutOutcome(events, rules, 180);
    expect(result.exchanges[1]).toEqual({ atSeconds: 82, kind: "WARNING", side: "A", points: 1, reason: "grappling after halt" });
    expect(result).toMatchObject({ scoreA: 2, warningsA: 1 });
  });

  it("turns a manual correction into an adjustment", () => {
    const events: MatchEventDetail[] = [hit(10, 0, 3), { type: "score-adjustment", elapsedTimeSeconds: 40, fighter: "B", score: 2 }];
    const result = toBoutOutcome(events, rules, 180);
    expect(result.exchanges[1]).toEqual({ atSeconds: 40, kind: "ADJUSTMENT", side: "B", points: -1, reason: null });
    expect(result.scoreB).toBe(2);
  });

  it("disqualification", () => {
    const events: MatchEventDetail[] = [hit(10, 5, 0), { type: "disqualification", elapsedTimeSeconds: 90, fighter: "A", description: "Unsafe conduct" }];
    const result = toBoutOutcome(events, rules, 90);
    expect(result.exchanges[1]).toEqual({ atSeconds: 90, kind: "DISQUALIFICATION", side: "A", points: 0, reason: "Unsafe conduct" });
    expect(result.winnerSide).toBe("B");
  });

  it("calls an equal score a draw", () => {
    expect(toBoutOutcome([hit(10, 1, 1)], { ...rules, useNetScore: false }, 180).winnerSide).toBeNull();
  });

  it("floors fractional seconds", () => {
    expect(toBoutOutcome([hit(75.9, 1, 0)], rules, 179.6).exchanges.map((exchange) => exchange.atSeconds)).toEqual([75, 179]);
  });
});

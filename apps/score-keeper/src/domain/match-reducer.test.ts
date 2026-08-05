import type {
  FighterIdentifier,
  ScoreMatchEventDetail,
  WarningMatchEventDetail,
} from "@hema/ui";
import { describe, expect, it } from "vitest";
import { ruleSets } from "../data/mock/fixtures/rule-sets";
import { createInitialMatchState } from "./match-state";
import { reduceMatchEvent } from "./match-reducer";

const ruleSet = ruleSets["rule-set-1"];
if (!ruleSet) throw new Error('Rule set "rule-set-1" is required by tests.');
const baseRules = ruleSet.matchParameters;

describe("match reducer", () => {
  it("adds both scores when net scoring is disabled", () => {
    const state = reduceMatchEvent(
      createInitialMatchState(),
      scoreEvent({ fighterAScore: 3, fighterBScore: 1 }),
      { ...baseRules, useNetScore: false },
    );

    expect(state.fighterAScore).toBe(3);
    expect(state.fighterBScore).toBe(1);
  });

  it("adds both scores when net scoring is enabled", () => {
    const state = reduceMatchEvent(
      createInitialMatchState(),
      scoreEvent({ fighterAScore: 3, fighterBScore: 1 }),
      { ...baseRules, useNetScore: true },
    );

    expect(state.fighterAScore).toBe(3);
    expect(state.fighterBScore).toBe(1);
  });

  it("does not count doubles when disabled by the ruleset", () => {
    const state = reduceMatchEvent(
      createInitialMatchState(),
      scoreEvent({
        fighterAScore: 2,
        fighterBScore: 2,
        type: "double",
      }),
      { ...baseRules, countDoubles: false, useNetScore: false },
    );

    expect(state.fighterAScore).toBe(0);
    expect(state.fighterBScore).toBe(0);
  });

  it("only counts the first fighter when afterblows are disabled", () => {
    const state = reduceMatchEvent(
      createInitialMatchState(),
      scoreEvent({
        fighterAScore: 2,
        fighterBScore: 1,
        type: "afterblow",
        firstFighter: "A",
      }),
      { ...baseRules, allowAfterBlow: false, useNetScore: false },
    );

    expect(state.fighterAScore).toBe(2);
    expect(state.fighterBScore).toBe(0);
  });

  it("allows penalties to drive the score below zero", () => {
    const scored = reduceMatchEvent(
      createInitialMatchState(),
      scoreEvent({ fighterAScore: 3 }),
      { ...baseRules, useNetScore: false },
    );
    const warning: WarningMatchEventDetail = {
      elapsedTimeSeconds: 30,
      type: "warning",
      fighter: "A",
      description: "Illegal target",
      pointsDeducted: 5,
    };

    const state = reduceMatchEvent(scored, warning, baseRules);

    expect(state.fighterAScore).toBe(-2);
    expect(state.warnings.A).toBe(1);
  });

  it("applies an absolute manual score correction", () => {
    const scored = reduceMatchEvent(
      createInitialMatchState(),
      scoreEvent({ fighterAScore: 3 }),
      { ...baseRules, useNetScore: false },
    );

    const state = reduceMatchEvent(
      scored,
      {
        elapsedTimeSeconds: 40,
        type: "score-adjustment",
        fighter: "A",
        score: 1,
      },
      baseRules,
    );

    expect(state.fighterAScore).toBe(1);
  });

  it("accepts negative manual score corrections", () => {
    const state = reduceMatchEvent(
      createInitialMatchState(),
      {
        elapsedTimeSeconds: 40,
        type: "score-adjustment",
        fighter: "A",
        score: -1,
      },
      baseRules,
    );

    expect(state.fighterAScore).toBe(-1);
  });

  it("rejects events after a disqualification", () => {
    const disqualified = reduceMatchEvent(
      createInitialMatchState(),
      {
        elapsedTimeSeconds: 20,
        type: "disqualification",
        fighter: "B",
        description: "Illegal technique",
      },
      baseRules,
    );

    expect(() =>
      reduceMatchEvent(disqualified, scoreEvent({ fighterAScore: 1 }), baseRules),
    ).toThrow("No match events can be applied after disqualification.");
  });
});

function scoreEvent(
  overrides: {
    elapsedTimeSeconds?: number;
    fighterAScore?: number;
    fighterBScore?: number;
    type?: ScoreMatchEventDetail["type"];
    firstFighter?: FighterIdentifier;
  } = {},
): ScoreMatchEventDetail {
  const base = {
    elapsedTimeSeconds: overrides.elapsedTimeSeconds ?? 10,
    fighterAScore: overrides.fighterAScore ?? 0,
    fighterBScore: overrides.fighterBScore ?? 0,
    details: {
      fighterA: { outcome: "score" },
      fighterB: { outcome: "no-score" },
    } satisfies ScoreMatchEventDetail["details"],
  };
  const type = overrides.type ?? "hit";
  return type === "afterblow"
    ? { ...base, type, firstFighter: overrides.firstFighter ?? "A" }
    : { ...base, type };
}

import { describe, expect, it } from "vitest";
import { parseRuleSet } from "./ruleset-parser";

const validMatchParameters = {
  maxDurationSeconds: 180,
  stopOnTimeOut: true,
  maxPointsCap: 10,
  pointSpreadVictory: 5,
  scores: [1, 2, 3, 4],
  maxDoubles: 3,
  allowAfterBlow: true,
  countDoubles: true,
  useNetScore: true,
  penalties: [{ description: "Ring out", penalties: [1], disqualify: false }],
};

describe("parseRuleSet", () => {
  it("synthesizes id, name, and version when the sheet JSON doesn't include them", () => {
    const ruleSet = parseRuleSet(
      { id: "competition-1", name: "Autumn Longsword Open" },
      { weaponClass: "Longsword", matchParameters: validMatchParameters },
    );

    expect(ruleSet.id).toBe("competition-1");
    expect(ruleSet.name).toBe("Autumn Longsword Open ruleset");
    expect(ruleSet.version).toBe("1.0");
    expect(ruleSet.weaponClass).toBe("Longsword");
    expect(ruleSet.matchParameters.scores).toEqual([1, 2, 3, 4]);
  });

  it("honors explicit id, name, and version when the sheet JSON provides them", () => {
    const ruleSet = parseRuleSet(
      { id: "competition-1", name: "Autumn Longsword Open" },
      {
        id: "ruleset-42",
        name: "Federation Longsword 2026",
        version: "2.3",
        weaponClass: "Longsword",
        matchParameters: validMatchParameters,
      },
    );

    expect(ruleSet.id).toBe("ruleset-42");
    expect(ruleSet.name).toBe("Federation Longsword 2026");
    expect(ruleSet.version).toBe("2.3");
  });

  it("throws a clear error when the ruleset is missing", () => {
    expect(() => parseRuleSet({ id: "c1", name: "C1" }, null)).toThrow(/missing or malformed/);
  });

  it("throws a clear error when weaponClass is missing", () => {
    expect(() =>
      parseRuleSet({ id: "c1", name: "C1" }, { matchParameters: validMatchParameters }),
    ).toThrow(/weaponClass/);
  });

  it("throws a clear error when matchParameters is missing", () => {
    expect(() => parseRuleSet({ id: "c1", name: "C1" }, { weaponClass: "Longsword" })).toThrow(
      /matchParameters/,
    );
  });

  it("throws a clear error when a matchParameters field has the wrong type", () => {
    expect(() =>
      parseRuleSet(
        { id: "c1", name: "C1" },
        { weaponClass: "Longsword", matchParameters: { ...validMatchParameters, maxDurationSeconds: "180" } },
      ),
    ).toThrow(/maxDurationSeconds/);
  });

  it("throws a clear error when a penalty entry is malformed", () => {
    expect(() =>
      parseRuleSet(
        { id: "c1", name: "C1" },
        {
          weaponClass: "Longsword",
          matchParameters: { ...validMatchParameters, penalties: [{ description: "Ring out" }] },
        },
      ),
    ).toThrow(/penalties\[0\]/);
  });
});

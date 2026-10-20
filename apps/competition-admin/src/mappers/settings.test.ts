import { describe, expect, it } from "vitest";
import { adminCapabilities, allowedActions, formToParameters, parametersToForm, parseScopeValues, rulesetEditable } from "./settings";

describe("lifecycle actions", () => {
  it.each([
    ["DRAFT", ["OPEN_REGISTRATION"]],
    ["REGISTRATION_OPEN", ["START"]],
    ["RUNNING", ["CLOSE"]],
    ["CLOSED", ["REOPEN", "ARCHIVE"]],
    ["ARCHIVED", []],
  ] as const)("%s allows %j", (status, actions) => {
    expect(allowedActions(status)).toEqual(actions);
  });
});

describe("ruleset locked once running", () => {
  it.each([
    ["DRAFT", true],
    ["REGISTRATION_OPEN", true],
    ["RUNNING", false],
    ["CLOSED", false],
    ["ARCHIVED", false],
  ] as const)("%s editable: %s", (status, editable) => {
    expect(rulesetEditable(status)).toBe(editable);
  });
});

describe("match parameters form", () => {
  const ruleset = {
    weaponClass: "longsword",
    matchParameters: {
      maxDurationSeconds: 180,
      stopOnTimeOut: true,
      maxPointsCap: 10,
      pointSpreadVictory: 5,
      scores: [1, 2, 3],
      maxDoubles: 3,
      allowAfterBlow: true,
      countDoubles: false,
      useNetScore: true,
      penalties: [{ description: "Late hit", penalties: [0, 1], disqualify: false }],
    },
  };

  it("round-trips through the form and keeps fields the form doesn't show", () => {
    const form = parametersToForm(ruleset);
    expect(form).toEqual({ minutes: 3, maxPointsCap: 10, pointSpreadVictory: 5, scores: "1, 2, 3", maxDoubles: 3, allowAfterBlow: true, countDoubles: false, useNetScore: true });
    expect(formToParameters(ruleset, { ...form, minutes: 2, scores: "1, 2" })).toEqual({
      ...ruleset,
      matchParameters: { ...ruleset.matchParameters, maxDurationSeconds: 120, scores: [1, 2] },
    });
  });

  it("never passes non-numbers from a stored ruleset through to the form", () => {
    const hostile = { matchParameters: { maxPointsCap: "<img src=x onerror=alert(1)>", scores: ["<b>", 2], allowAfterBlow: "yes" } };
    const form = parametersToForm(hostile);
    expect(form.maxPointsCap).toBe(10);
    expect(form.scores).toBe("2");
    expect(form.allowAfterBlow).toBe(true);
  });

  it("fills sensible values when the ruleset is missing", () => {
    expect(parametersToForm(null).minutes).toBe(3);
  });
});

describe("co-admin can't manage admins", () => {
  it.each([
    ["OWNER", { manage: true, leave: false }],
    ["SYSTEM_ADMIN", { manage: true, leave: false }],
    ["CO_ADMIN", { manage: false, leave: true }],
  ] as const)("%s", (role, capabilities) => {
    expect(adminCapabilities(role)).toEqual(capabilities);
  });
});

describe("scope values", () => {
  it("splits a comma list", () => {
    expect(parseScopeValues(" NL, BE ,, ")).toEqual(["NL", "BE"]);
  });
});

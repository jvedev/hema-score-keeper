import { describe, expect, it } from "vitest";
import { adminCapabilities, allowedActions, formToParameters, inviteLink, parametersToForm, parsePlaceLimit, parseScopeValues, rulesetEditable } from "./settings";

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

describe("place limit", () => {
  it("treats an empty box as no limit", () => {
    expect(parsePlaceLimit("")).toEqual({ ok: true, value: null });
    expect(parsePlaceLimit("  ")).toEqual({ ok: true, value: null });
  });

  it("accepts a whole number of one or more", () => {
    expect(parsePlaceLimit(" 24 ")).toEqual({ ok: true, value: 24 });
    expect(parsePlaceLimit("1")).toEqual({ ok: true, value: 1 });
  });

  it.each(["0", "-3", "2.5", "many", "1e3", "12abc"])("refuses %j", (text) => {
    expect(parsePlaceLimit(text)).toEqual({ ok: false });
  });
});

describe("invite link", () => {
  it("points at the participant app invite page", () => {
    expect(inviteLink("https://example.org/hema-score-keeper/competition", "abc123")).toBe("https://example.org/hema-score-keeper/competition/join/abc123");
  });

  it("copes with a trailing slash and escapes the code", () => {
    expect(inviteLink("http://localhost:5173/hema-score-keeper/competition/", "a b/c")).toBe("http://localhost:5173/hema-score-keeper/competition/join/a%20b%2Fc");
  });
});

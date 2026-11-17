import type { ApiRingRules } from "@hema/event-admin-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRingRulesForm, readRingRulesForm, renderRingRulesForm, ringRuleErrorMessage, ringRulesFormValues } from "./ring-rules-form";

function rules(): ApiRingRules {
  return {
    maxDurationSeconds: 180,
    scores: [1, 2, 3],
    maxDoubles: 0,
    maxPointsCap: 0,
    penalties: [{ description: "Warning", penalties: [0, 1], disqualify: false }],
    format: { rounds: 1, breakSeconds: 60, lastExchangeSeconds: 0, overtimeAfter: "LAST_ROUND", extensions: 0, extensionSeconds: 60, suddenDeath: false },
  };
}

describe("ring rules form", () => {
  const originalLang = document.documentElement.lang;

  beforeEach(() => {
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    document.documentElement.lang = originalLang;
  });

  it("round-trips the current rules unchanged", () => {
    const current = rules();
    expect(parseRingRulesForm(ringRulesFormValues(current), current)).toEqual({ ok: true, rules: current });
  });

  it("reads edited values and keeps the penalties", () => {
    const current = rules();
    const result = parseRingRulesForm(
      { ...ringRulesFormValues(current), maxDurationSeconds: " 90 ", scores: "1, 3,", rounds: "3", overtimeAfter: "EVERY_ROUND", suddenDeath: true },
      current,
    );
    expect(result).toEqual({
      ok: true,
      rules: { ...current, maxDurationSeconds: 90, scores: [1, 3], format: { ...current.format, rounds: 3, overtimeAfter: "EVERY_ROUND", suddenDeath: true } },
    });
  });

  it("lists every invalid field instead of silently using defaults", () => {
    const current = rules();
    const result = parseRingRulesForm(
      { ...ringRulesFormValues(current), maxDurationSeconds: "0", scores: "1, 11", maxDoubles: "", rounds: "1.5", extensionSeconds: "-1", overtimeAfter: "SOMETIMES" },
      current,
    );
    expect(result).toEqual({ ok: false, invalidFields: ["maxDurationSeconds", "scores", "maxDoubles", "rounds", "overtimeAfter", "extensionSeconds"] });
  });

  it("explains each invalid field with its range", () => {
    expect(ringRuleErrorMessage("rounds")).toBe("Rounds (best of; 1 = no rounds): enter a whole number from 1 to 9.");
    expect(ringRuleErrorMessage("scores")).toContain("from 1 to 10");
  });

  it("reads the rendered form back into the same values", () => {
    const values = { ...ringRulesFormValues(rules()), overtimeAfter: "EVERY_ROUND", suddenDeath: true };
    const host = document.createElement("div");
    host.innerHTML = renderRingRulesForm(values, { kind: "invalid", fields: ["maxDoubles"] }, false);
    const form = host.querySelector("form")!;
    expect(readRingRulesForm(new FormData(form))).toEqual(values);
    expect(form.querySelector('[name="maxDoubles"]')?.getAttribute("aria-invalid")).toBe("true");
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("Max doubles");
  });
});

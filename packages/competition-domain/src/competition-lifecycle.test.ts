import { describe, expect, it } from "vitest";
import {
  CompetitionTransitionError,
  readinessChecklist,
  transitionCompetition,
  type CompetitionAction,
  type CompetitionStatus,
} from "./competition-lifecycle";

const ready = readinessChecklist({ rulesetVersionId: "r1", hasScope: true, startDate: "2027-04-12" });
const notReady = readinessChecklist({ rulesetVersionId: null, hasScope: true, startDate: "2027-04-12" });

function expectTransitionError(
  status: CompetitionStatus,
  action: CompetitionAction,
  code: CompetitionTransitionError["code"],
  checklist = ready,
): void {
  try {
    transitionCompetition(status, action, checklist);
  } catch (error) {
    expect(error).toBeInstanceOf(CompetitionTransitionError);
    expect((error as CompetitionTransitionError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${status} + ${action} to throw ${code}`);
}

describe("readinessChecklist", () => {
  it("is ready when a ruleset, scope and start date are set", () => {
    expect(ready).toEqual({ rulesetChosen: true, scopeAndDatesSet: true, ready: true });
  });

  it("is not ready without a ruleset", () => {
    expect(notReady).toEqual({ rulesetChosen: false, scopeAndDatesSet: true, ready: false });
  });

  it("is not ready without a start date", () => {
    expect(readinessChecklist({ rulesetVersionId: "r1", hasScope: true, startDate: null })).toEqual({
      rulesetChosen: true,
      scopeAndDatesSet: false,
      ready: false,
    });
  });

  it("is not ready without a scope", () => {
    expect(readinessChecklist({ rulesetVersionId: "r1", hasScope: false, startDate: "2027-04-12" }).ready).toBe(false);
  });
});

describe("transitionCompetition", () => {
  it("opens registration for a ready draft", () => {
    expect(transitionCompetition("DRAFT", "OPEN_REGISTRATION", ready)).toBe("REGISTRATION_OPEN");
  });

  it("refuses to open registration for a draft that isn't ready", () => {
    expectTransitionError("DRAFT", "OPEN_REGISTRATION", "NOT_READY", notReady);
  });

  it.each([
    ["REGISTRATION_OPEN", "START", "RUNNING"],
    ["RUNNING", "CLOSE", "CLOSED"],
    ["CLOSED", "REOPEN", "RUNNING"],
    ["CLOSED", "ARCHIVE", "ARCHIVED"],
  ] as const)("%s + %s → %s", (status, action, next) => {
    expect(transitionCompetition(status, action, ready)).toBe(next);
  });

  it.each([
    ["RUNNING", "ARCHIVE"],
    ["ARCHIVED", "REOPEN"],
    ["DRAFT", "START"],
  ] as const)("refuses %s + %s", (status, action) => {
    expectTransitionError(status, action, "NOT_ALLOWED");
  });
});

import { describe, expect, it } from "vitest";
import { competitionsForBout, SameFighterError, type CompetitionEnrolment } from "./bout-competitions";

function enrolment(competitionId: string, status: CompetitionEnrolment["status"], users: string[]): CompetitionEnrolment {
  return { competitionId, status, enrolledUserIds: new Set(users) };
}

describe("competitionsForBout", () => {
  it("returns every running competition both fighters are in", () => {
    const competitions = [
      enrolment("club", "RUNNING", ["u1", "u2"]),
      enrolment("country", "RUNNING", ["u1", "u2", "u3"]),
    ];

    expect(competitionsForBout("u1", "u2", competitions)).toEqual(["club", "country"]);
  });

  it("skips competitions where only one fighter is enrolled", () => {
    expect(competitionsForBout("u1", "u2", [enrolment("solo", "RUNNING", ["u1", "u3"])])).toEqual([]);
  });

  it.each(["DRAFT", "REGISTRATION_OPEN", "CLOSED", "ARCHIVED"] as const)("skips %s competitions", (status) => {
    expect(competitionsForBout("u1", "u2", [enrolment("c", status, ["u1", "u2"])])).toEqual([]);
  });

  it("returns nothing when the fighters share no competition", () => {
    expect(competitionsForBout("u1", "u2", [])).toEqual([]);
  });

  it("rejects the same user on both sides", () => {
    expect(() => competitionsForBout("u1", "u1", [enrolment("club", "RUNNING", ["u1"])])).toThrow(SameFighterError);
  });
});

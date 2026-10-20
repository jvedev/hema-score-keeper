import { describe, expect, it } from "vitest";
import type { BoutResponse, CompetitionSummary, NeedsYouResponse } from "../api-types";
import { buildCorrection, toBoutDetailView } from "./bout";
import { toCompetitionListItems } from "./competitions";
import { needsYouCount, startRoute, toNeedsYouItems } from "./needs-you";

/** Stand-in for t(): "key{a=1,b=2}" so tests see which text and values were asked for. */
const translate = (key: string, params: Record<string, string | number> = {}) =>
  `${key}${Object.keys(params).length ? `{${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}}` : ""}`;

const needs: NeedsYouResponse = {
  objections: [
    { boutId: "b1", competitionId: "X", competitionName: "Ladder", fighterA: "Daan", fighterB: "Tomas", scoreA: 4, scoreB: 6, objectedBy: "A", reason: "double", objectedAt: "2026-10-16T12:00:00.000Z" },
  ],
  awaitingReferee: [
    { boutId: "b2", competitionId: "X", competitionName: "Ladder", fighterA: "Joris", fighterB: "Sanne", scoreA: 2, scoreB: 2, refereeName: "Lotte", recordedAt: "2026-10-18T12:00:00.000Z" },
  ],
};

describe("needs you", () => {
  it("counts what needs the admin", () => {
    expect(needsYouCount(needs)).toBe(2);
  });

  it("opens on competitions when nothing needs you", () => {
    expect(startRoute({ objections: [], awaitingReferee: [] })).toEqual({ name: "competitions" });
    expect(startRoute(needs)).toEqual({ name: "needs-you" });
  });

  it("describes each item", () => {
    expect(toNeedsYouItems(needs, translate)).toEqual([
      { kind: "objection", boutId: "b1", competitionName: "Ladder", fighterA: "Daan", fighterB: "Tomas", scoreA: 4, scoreB: 6, detail: "admin.objectedBy{name=Daan,reason=double}", since: "2026-10-16T12:00:00.000Z" },
      { kind: "awaiting-referee", boutId: "b2", competitionName: "Ladder", fighterA: "Joris", fighterB: "Sanne", scoreA: 2, scoreB: 2, detail: "admin.waitingFor{name=Lotte}", since: "2026-10-18T12:00:00.000Z" },
    ]);
  });

  it("describes an objection without a reason", () => {
    const withoutReason = { ...needs, objections: [{ ...needs.objections[0]!, reason: null }] };
    expect(toNeedsYouItems(withoutReason, translate)[0]!.detail).toBe("admin.objectedNoReason{name=Daan}");
  });
});

describe("competitions", () => {
  const summary: CompetitionSummary = {
    id: "X",
    name: "Ladder",
    slug: "ladder",
    status: "RUNNING",
    date: "2026-12-13",
    visibility: "PUBLIC",
    clubId: null,
    scope: { kind: "COUNTRY", values: ["NL"] },
    acceptsOtherBouts: true,
  };

  it("maps summaries with scope, date and open bouts", () => {
    expect(toCompetitionListItems([summary], needs, translate, (iso) => `date(${iso})`)).toEqual([
      { id: "X", name: "Ladder", status: "RUNNING", scopeLabel: "scope.COUNTRY", meta: "date(2026-12-13)", openBouts: 2 },
    ]);
  });
});

describe("bouts", () => {
  const bout: BoutResponse = {
    id: "b1",
    status: "OBJECTED",
    revision: 1,
    startedAt: "2026-10-15T19:00:00.000Z",
    ring: "Ring 1",
    fighterA: { userId: "daan", name: "Daan" },
    fighterB: { userId: "tomas", name: "Tomas" },
    referee: { userId: "joris", name: "Joris" },
    jury: [{ seat: 1, userId: "sanne", name: "Sanne" }],
    table: [{ seat: 1, userId: "lotte", name: "Lotte" }],
    scoreA: 4,
    scoreB: 6,
    winnerSide: "B",
    warningsA: 1,
    warningsB: 0,
    exchanges: [{ atSeconds: 175, kind: "TIME", side: null, points: 0, reason: null }],
    windowEndsAt: "2026-10-18T19:00:00.000Z",
    fighterApproved: { A: false, B: true },
    objection: { by: "A", at: "2026-10-16T12:00:00.000Z", reason: "double" },
    voidReason: null,
    startedInCompetitionId: "X",
    competitionIds: ["X"],
  };

  it("maps a backend bout onto the bout details view", () => {
    expect(toBoutDetailView(bout)).toEqual({
      boutId: "b1",
      status: "OBJECTED",
      approvals: { referee: true, A: false, B: true },
      fighterA: { userId: "daan", name: "Daan" },
      fighterB: { userId: "tomas", name: "Tomas" },
      scoreA: 4,
      scoreB: 6,
      startedAt: "2026-10-15T19:00:00.000Z",
      location: "Ring 1",
      rulesetLabel: null,
      officials: { referee: { userId: "joris", name: "Joris" }, jury: [{ userId: "sanne", name: "Sanne" }], table: [{ userId: "lotte", name: "Lotte" }] },
      exchanges: bout.exchanges,
      windowEndsAt: "2026-10-18T19:00:00.000Z",
      objection: { by: "A", reason: "double" },
      voidReason: null,
    });
  });

  it("correction becomes adjustments in the request", () => {
    expect(buildCorrection(bout, { scoreA: 4, scoreB: 4, winnerSide: null })).toEqual({
      kind: "correct",
      result: {
        scoreA: 4,
        scoreB: 4,
        winnerSide: null,
        warningsA: 1,
        warningsB: 0,
        exchanges: [
          { atSeconds: 175, kind: "TIME", side: null, points: 0, reason: null },
          { atSeconds: 175, kind: "ADJUSTMENT", side: "B", points: -2, reason: "Corrected after objection" },
        ],
      },
    });
  });
});

import { describe, expect, it } from "vitest";
import type { BoutView, Club, HistoryBout, StandingRow } from "../api-types";
import {
  drillState,
  isOwnBout,
  seesBoutWarnings,
  legacyBoutDetail,
  ownRow,
  ratingHistory,
  toBoutDetailView,
  toFighterBouts,
  toFighterSummary,
  toStandingRows,
} from "./competition";

const clubs: Club[] = [{ id: "club-1", name: "HEMA Utrecht", slug: "hema-utrecht", area: null, countryCode: null }];

function row(overrides: Partial<StandingRow>): StandingRow {
  return {
    participantId: "p1",
    position: 1,
    name: "Eva",
    clubId: "club-1",
    userId: "u1",
    rating: 1012,
    lastChange: 12,
    bouts: 2,
    wins: 1,
    draws: 0,
    losses: 1,
    warnings: 1,
    provisional: true,
    left: false,
    ...overrides,
  };
}

function history(overrides: Partial<HistoryBout>): HistoryBout {
  return {
    id: "b1",
    source: "BOUT",
    foughtAt: "2026-10-20T12:00:00.000Z",
    fighterAParticipantId: "p1",
    fighterBParticipantId: "p2",
    scoreA: 5,
    scoreB: 3,
    winnerSide: "A",
    status: "COUNTED",
    ratingChange: { boutId: "b1", beforeA: 1000, afterA: 1012, beforeB: 1000, afterB: 988 },
    approvals: { referee: true, A: true, B: false },
    ring: "Ring 1",
    startedInCompetitionId: "X",
    ...overrides,
  };
}

const eva = { userId: "u1", name: "Eva" };
const kees = { userId: "u2", name: "Kees" };
const ref = { userId: "u3", name: "Ref" };

function view(overrides: Partial<BoutView>): BoutView {
  return {
    id: "b1",
    status: "COUNTED",
    startedAt: "2026-10-20T12:00:00.000Z",
    ring: "Ring 1",
    fighterA: eva,
    fighterB: kees,
    referee: ref,
    jury: [{ ...ref, userId: "u4", name: "Jury", seat: 1 }],
    table: [],
    scoreA: 5,
    scoreB: 3,
    winnerSide: "A",
    warningsA: 1,
    warningsB: 0,
    exchanges: [{ atSeconds: 10, kind: "SCORE", side: "A", points: 2, reason: null }],
    windowEndsAt: "2026-10-23T12:00:00.000Z",
    fighterApproved: { A: false, B: true },
    objection: null,
    voidReason: null,
    competitionIds: ["X"],
    ...overrides,
  };
}

describe("standings", () => {
  it("maps rows with club names and the left mark, numbers coerced", () => {
    const rows = toStandingRows([row({ rating: "1012" as unknown as number, lastChange: "12" as unknown as number, left: true })], clubs);
    expect(rows).toEqual([
      {
        participantId: "p1",
        position: 1,
        name: "Eva",
        clubName: "HEMA Utrecht",
        rating: 1012,
        lastChange: 12,
        bouts: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        warnings: 1,
        provisional: true,
        left: true,
      },
    ]);
  });

  it("puts 0 where the server holds back another fighter's warnings", () => {
    expect(toStandingRows([row({ warnings: null, clubId: null })], clubs)[0]).toMatchObject({ warnings: 0, clubName: null });
  });

  it("finds the fighter's own row", () => {
    const rows = [row({ participantId: "p2", userId: "u2" }), row({ participantId: "p1", userId: "u1" })];
    expect(ownRow(rows, "u1")?.participantId).toBe("p1");
    expect(ownRow(rows, "u9")).toBeUndefined();
  });
});

describe("fighter page", () => {
  const names = new Map([
    ["p1", "Eva"],
    ["p2", "Kees"],
  ]);

  it("shows each bout from the fighter's side, numbers coerced", () => {
    const bouts = toFighterBouts([history({ scoreA: "5" as unknown as number }), history({ id: "b0", fighterAParticipantId: "p3", fighterBParticipantId: "p4" })], "p2", names);
    expect(bouts).toEqual([
      {
        boutId: "b1",
        foughtAt: "2026-10-20T12:00:00.000Z",
        location: "Ring 1",
        opponentName: "Eva",
        ownScore: 3,
        opponentScore: 5,
        result: "LOSS",
        ratingChange: -12,
        status: "COUNTED",
        approvals: { referee: true, own: false, opponent: true },
        voidReason: null,
      },
    ]);
  });

  it("draws the rating line oldest first", () => {
    const older = history({ id: "b0", ratingChange: { boutId: "b0", beforeA: 990, afterA: 1000, beforeB: 1000, afterB: 990 } });
    expect(ratingHistory([history({}), older], "p1")).toEqual([990, 1000, 1012]);
  });

  it("sums the fighter up, with 0 for warnings held back", () => {
    expect(toFighterSummary(row({ warnings: null }), "HEMA Utrecht", [history({})])).toEqual({
      name: "Eva",
      clubName: "HEMA Utrecht",
      since: null,
      rating: 1012,
      ratingHistory: [1000, 1012],
      bouts: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      warnings: 0,
    });
  });
});

describe("bout page", () => {
  it("maps the fighter-safe bout view", () => {
    const detail = toBoutDetailView(view({ scoreA: "5" as unknown as number, objection: { by: "B", at: "2026-10-21T12:00:00.000Z", reason: null }, status: "OBJECTED" }));
    expect(detail).toEqual({
      boutId: "b1",
      status: "OBJECTED",
      approvals: { referee: true, A: false, B: true },
      fighterA: eva,
      fighterB: kees,
      scoreA: 5,
      scoreB: 3,
      startedAt: "2026-10-20T12:00:00.000Z",
      location: "Ring 1",
      rulesetLabel: null,
      officials: { referee: ref, jury: [{ userId: "u4", name: "Jury" }], table: [] },
      exchanges: [{ atSeconds: 10, kind: "SCORE", side: "A", points: 2, reason: null }],
      windowEndsAt: "2026-10-23T12:00:00.000Z",
      objection: { by: "B", reason: null },
      voidReason: null,
    });
  });

  it("knows the referee hasn't approved while there is no window", () => {
    expect(toBoutDetailView(view({ status: "SCORED", windowEndsAt: null })).approvals.referee).toBe(false);
  });

  it("shows what there is of a bout from before referee approval", () => {
    const names = new Map([
      ["p1", "Eva"],
      ["p2", "Kees"],
    ]);
    expect(legacyBoutDetail(history({ source: "LEGACY" }), names)).toMatchObject({
      boutId: "b1",
      fighterA: { userId: "p1", name: "Eva" },
      fighterB: { userId: "p2", name: "Kees" },
      exchanges: [],
      objection: null,
    });
  });

  it("is the fighter's own bout only when they fought in it", () => {
    expect(isOwnBout(view({}), "u1")).toBe(true);
    expect(isOwnBout(view({}), "u2")).toBe(true);
    // Refereeing doesn't make it their own: warnings are only shown on bouts they fought.
    expect(isOwnBout(view({}), "u3")).toBe(false);
  });
});

describe("warnings on a bout", () => {
  it("show to the fighters, the referee and the jury", () => {
    expect(seesBoutWarnings(view({}), "u1")).toBe(true);
    expect(seesBoutWarnings(view({}), "u2")).toBe(true);
    expect(seesBoutWarnings(view({}), "u3")).toBe(true);
    expect(seesBoutWarnings(view({}), "u4")).toBe(true);
  });

  it("don't show to table officials or anyone else", () => {
    const withTable = view({ table: [{ userId: "u5", name: "Table", seat: 1 }] });
    expect(seesBoutWarnings(withTable, "u5")).toBe(false);
    expect(seesBoutWarnings(withTable, "u9")).toBe(false);
  });
});

describe("drill-down", () => {
  const bouts = [history({ id: "b1", fighterAParticipantId: "p1", fighterBParticipantId: "p2" }), history({ id: "b2", fighterAParticipantId: "p3", fighterBParticipantId: "p4" })];

  it("opens on the fighter's own bouts when they are in the competition", () => {
    expect(drillState({ name: "competition", competitionId: "X" }, bouts, "p2", undefined)).toEqual({ participantId: "p2", step: "fighter" });
    expect(drillState({ name: "competition", competitionId: "X" }, bouts, undefined, undefined)).toEqual({ participantId: undefined, step: "standings" });
  });

  it("shows the standings with the last fighter (or their own) beside it", () => {
    expect(drillState({ name: "standings", competitionId: "X" }, bouts, "p2", "p3")).toEqual({ participantId: "p3", step: "standings" });
    expect(drillState({ name: "standings", competitionId: "X" }, bouts, "p2", undefined)).toEqual({ participantId: "p2", step: "standings" });
  });

  it("opens the chosen fighter", () => {
    expect(drillState({ name: "fighter", competitionId: "X", participantId: "p4" }, bouts, "p2", undefined)).toEqual({ participantId: "p4", step: "fighter" });
  });

  it("keeps a fighter beside a bout: the one opened before, else their own, else fighter A", () => {
    const bout = { name: "bout", competitionId: "X", boutId: "b1" } as const;
    expect(drillState(bout, bouts, "p1", "p2")).toEqual({ participantId: "p2", step: "bout" });
    expect(drillState(bout, bouts, "p2", "p4")).toEqual({ participantId: "p2", step: "bout" });
    expect(drillState({ ...bout, boutId: "b2" }, bouts, "p2", undefined)).toEqual({ participantId: "p3", step: "bout" });
    expect(drillState({ ...bout, boutId: "gone" }, bouts, "p2", undefined)).toEqual({ participantId: undefined, step: "bout" });
  });
});

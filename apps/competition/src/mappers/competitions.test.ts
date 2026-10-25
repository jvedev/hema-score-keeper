import { describe, expect, it } from "vitest";
import type { Club, CompetitionDetail, CompetitionParticipant, JoinableCompetition, MyCompetition } from "../api-types";
import { leaveQuestion, leftMessage, myStatusIn, scopeLabel, toCompetitionJoinCard, toJoinableCards } from "./competitions";

const translate = (key: string, params: Record<string, string | number> = {}) =>
  `${key}${Object.keys(params).length ? `{${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}}` : ""}`;

const clubs: Club[] = [
  { id: "club-1", name: "HEMA Utrecht", slug: "hema-utrecht", area: "Utrecht", countryCode: "NL" },
  { id: "club-2", name: "Zwaard & Steen", slug: "zwaard-steen", area: "Gelderland", countryCode: "NL" },
];

const joinable: JoinableCompetition = {
  id: "X",
  name: "Ladder",
  status: "RUNNING",
  date: "2026-09-01",
  scope: { kind: "OPEN", values: [] },
  signupsNeedApproval: false,
  placeLimit: null,
  placesLeft: null,
};

const detail: CompetitionDetail = {
  id: "X",
  name: "Ladder",
  status: "RUNNING",
  date: "2026-09-01",
  scope: { kind: "OPEN", values: [] },
  signupsNeedApproval: true,
  placeLimit: 10,
};

function participant(overrides: Partial<CompetitionParticipant>): CompetitionParticipant {
  return { id: "p", name: "Someone", clubId: null, userId: null, status: "ACTIVE", ...overrides };
}

function mine(overrides: Partial<MyCompetition>): MyCompetition {
  return { id: "X", name: "Ladder", status: "RUNNING", date: "2026-09-01", myStatus: "ACTIVE", rank: null, rating: null, lastChange: null, bouts: 0, ...overrides };
}

describe("scope label", () => {
  it("names open competitions", () => {
    expect(scopeLabel({ kind: "OPEN", values: [] }, clubs, translate)).toBe("scope.OPEN");
  });

  it("names the clubs, found by id or slug", () => {
    expect(scopeLabel({ kind: "CLUBS", values: ["club-1", "zwaard-steen", "gone"] }, clubs, translate)).toBe("HEMA Utrecht, Zwaard & Steen, gone");
    expect(scopeLabel({ kind: "CLUB", values: [] }, clubs, translate)).toBe("scope.CLUB");
  });

  it("names areas and countries with their kind", () => {
    expect(scopeLabel({ kind: "AREA", values: ["Utrecht", "Gelderland"] }, clubs, translate)).toBe("scope.AREA: Utrecht, Gelderland");
    expect(scopeLabel({ kind: "COUNTRY", values: ["NL"] }, clubs, translate)).toBe("scope.COUNTRY: NL");
  });
});

describe("joinable cards", () => {
  it("maps each joinable competition onto a join card", () => {
    const cards = toJoinableCards([{ ...joinable, placeLimit: 8, placesLeft: "3" as unknown as number, signupsNeedApproval: true }], [], clubs, translate);
    expect(cards).toEqual([
      { id: "X", name: "Ladder", status: "RUNNING", scopeLabel: "scope.OPEN", placesLeft: 3, signupsNeedApproval: true, myStatus: null, joinable: true },
    ]);
  });

  it("shows a competition the fighter left as one to join again", () => {
    const [card] = toJoinableCards([joinable], [mine({ myStatus: "LEFT" })], clubs, translate);
    expect(card).toMatchObject({ myStatus: "LEFT", joinable: true, placesLeft: null });
  });
});

describe("my status in a competition", () => {
  it("is null when the fighter never joined", () => {
    expect(myStatusIn([participant({ userId: "u2" })], "u1")).toBeNull();
  });

  it("prefers a current row over an old one they left", () => {
    expect(myStatusIn([participant({ userId: "u1", status: "LEFT" }), participant({ userId: "u1", status: "PENDING" })], "u1")).toBe("PENDING");
    expect(myStatusIn([participant({ userId: "u1", status: "ACTIVE" }), participant({ userId: "u1", status: "LEFT" })], "u1")).toBe("ACTIVE");
    expect(myStatusIn([participant({ userId: "u1", status: "LEFT" })], "u1")).toBe("LEFT");
  });
});

describe("join card on the competition page", () => {
  const participants = [
    participant({ id: "p1", userId: "u1", status: "ACTIVE" }),
    participant({ id: "p2", userId: "u2", status: "PENDING" }),
    participant({ id: "p3", userId: "u3", status: "LEFT" }),
  ];

  it("shows the fighter's own status and counts the places held by active and pending fighters", () => {
    const card = toCompetitionJoinCard({ competition: detail, participants, userId: "u1", joinable: undefined, clubs, translate });
    expect(card).toEqual({
      id: "X",
      name: "Ladder",
      status: "RUNNING",
      scopeLabel: "scope.OPEN",
      placesLeft: 8,
      signupsNeedApproval: true,
      myStatus: "ACTIVE",
      joinable: false,
    });
  });

  it("can be joined only when the server lists it as joinable", () => {
    const outsider = toCompetitionJoinCard({ competition: detail, participants, userId: "u9", joinable: { ...joinable, placesLeft: 7 }, clubs, translate });
    expect(outsider).toMatchObject({ myStatus: null, joinable: true, placesLeft: 7 });
    const closed = toCompetitionJoinCard({ competition: detail, participants, userId: "u3", joinable: undefined, clubs, translate });
    expect(closed).toMatchObject({ myStatus: "LEFT", joinable: false });
  });

  it("has no place count without a limit, and never goes below zero", () => {
    expect(toCompetitionJoinCard({ competition: { ...detail, placeLimit: null }, participants, userId: "u1", joinable: undefined, clubs, translate }).placesLeft).toBeNull();
    expect(toCompetitionJoinCard({ competition: { ...detail, placeLimit: "1" as unknown as number }, participants, userId: "u1", joinable: undefined, clubs, translate }).placesLeft).toBe(0);
  });
});

describe("leaving", () => {
  it("asks before leaving, and before withdrawing a sign-up", () => {
    expect(leaveQuestion("ACTIVE", "Ladder", translate)).toEqual({ message: "app.leaveConfirm{name=Ladder}", confirmLabel: "join.leave" });
    expect(leaveQuestion("PENDING", "Ladder", translate)).toEqual({ message: "app.withdrawConfirm{name=Ladder}", confirmLabel: "join.withdraw" });
  });

  it("says what happened", () => {
    expect(leftMessage("ACTIVE", "Ladder", translate)).toBe("app.leftCompetition{name=Ladder}");
    expect(leftMessage("PENDING", "Ladder", translate)).toBe("app.signupWithdrawn{name=Ladder}");
  });
});

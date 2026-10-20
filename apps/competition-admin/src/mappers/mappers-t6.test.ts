import { describe, expect, it } from "vitest";
import type { HistoryBout, StandingRow } from "../api-types";
import { fighterForBout, legacyBoutDetail, ratingHistory, toFighterBouts, toFighterSummary } from "./fighter";
import { toStandingRows } from "./standings";

const rows: StandingRow[] = [
  { participantId: "p1", position: 1, name: "Ilse", clubId: "leiden", userId: "u1", rating: 1641, lastChange: -14, bouts: 3, wins: 2, draws: 0, losses: 1, warnings: 1, provisional: true },
  { participantId: "p2", position: 2, name: "Tomas", clubId: null, userId: "u2", rating: 1500, lastChange: null, bouts: 0, wins: 0, draws: 0, losses: 0, warnings: 0, provisional: true },
];

const approvals = { referee: true, A: true, B: true };
// Newest first, as the backend sends it.
const history: HistoryBout[] = [
  { id: "b3", source: "BOUT", foughtAt: "2026-10-15T18:40:00.000Z", fighterAParticipantId: "p1", fighterBParticipantId: "p3", scoreA: 3, scoreB: 5, winnerSide: "B", status: "FINAL", ratingChange: { boutId: "b3", beforeA: 1655, afterA: 1641, beforeB: 1674, afterB: 1688 }, approvals, ring: "Ring 2", startedInCompetitionId: "X" },
  { id: "b2", source: "BOUT", foughtAt: "2026-10-08T18:30:00.000Z", fighterAParticipantId: "p4", fighterBParticipantId: "p1", scoreA: 0, scoreB: 1, winnerSide: "B", status: "VOIDED", ratingChange: null, approvals, ring: null, startedInCompetitionId: "X" },
  { id: "b1", source: "LEGACY", foughtAt: "2026-10-01", fighterAParticipantId: "p1", fighterBParticipantId: "p5", scoreA: 5, scoreB: 1, winnerSide: "A", status: "FINAL", ratingChange: { boutId: "b1", beforeA: 1600, afterA: 1655, beforeB: 1600, afterB: 1545 }, approvals, ring: null, startedInCompetitionId: "X" },
  { id: "b0", source: "BOUT", foughtAt: "2026-09-01T18:00:00.000Z", fighterAParticipantId: "p3", fighterBParticipantId: "p5", scoreA: 1, scoreB: 0, winnerSide: "A", status: "FINAL", ratingChange: null, approvals, ring: null, startedInCompetitionId: "X" },
];
const names = new Map([
  ["p1", "Ilse"],
  ["p3", "Tomas"],
  ["p4", "Sanne"],
  ["p5", "Lotte"],
]);

describe("standings", () => {
  it("adds club names", () => {
    expect(toStandingRows(rows, [{ id: "leiden", name: "Zwaardkring Leiden", slug: "leiden", area: null, countryCode: null }])).toEqual([
      { participantId: "p1", position: 1, name: "Ilse", clubName: "Zwaardkring Leiden", rating: 1641, lastChange: -14, bouts: 3, wins: 2, draws: 0, losses: 1, warnings: 1, provisional: true },
      { participantId: "p2", position: 2, name: "Tomas", clubName: null, rating: 1500, lastChange: null, bouts: 0, wins: 0, draws: 0, losses: 0, warnings: 0, provisional: true },
    ]);
  });
});

describe("fighter", () => {
  it("lists only this fighter's bouts from their own side", () => {
    const bouts = toFighterBouts(history, "p1", names);
    expect(bouts.map((bout) => [bout.boutId, bout.opponentName, `${bout.ownScore}–${bout.opponentScore}`, bout.result, bout.ratingChange])).toEqual([
      ["b3", "Tomas", "3–5", "LOSS", -14],
      ["b2", "Sanne", "1–0", "WIN", null],
      ["b1", "Lotte", "5–1", "WIN", 55],
    ]);
    expect(bouts[0]).toMatchObject({ location: "Ring 2", status: "FINAL", approvals: { referee: true, own: true, opponent: true } });
  });

  it("builds the rating history oldest first", () => {
    expect(ratingHistory(history, "p1")).toEqual([1600, 1655, 1641]);
    expect(ratingHistory(history, "p2")).toEqual([]);
  });

  it("summarises the fighter from their standings row", () => {
    expect(toFighterSummary(rows[0]!, "Zwaardkring Leiden", history)).toEqual({
      name: "Ilse",
      clubName: "Zwaardkring Leiden",
      since: null,
      rating: 1641,
      ratingHistory: [1600, 1655, 1641],
      bouts: 3,
      wins: 2,
      draws: 0,
      losses: 1,
      warnings: 1,
    });
  });

  it("shows an old bout without officials or exchanges", () => {
    expect(legacyBoutDetail(history[2]!, names)).toMatchObject({
      boutId: "b1",
      status: "FINAL",
      fighterA: { name: "Ilse" },
      fighterB: { name: "Lotte" },
      scoreA: 5,
      scoreB: 1,
      exchanges: [],
      officials: { jury: [], table: [] },
    });
  });
});

describe("fighter beside a bout", () => {
  it("keeps the fighter opened before when they fought in the bout", () => {
    expect(fighterForBout(history, "b3", "p3")).toBe("p3");
  });

  it("falls back to fighter A when the bout is opened directly", () => {
    expect(fighterForBout(history, "b3", undefined)).toBe("p1");
    expect(fighterForBout(history, "b3", "p4")).toBe("p1");
  });

  it("has no fighter for an unknown bout", () => {
    expect(fighterForBout(history, "nope", "p1")).toBeUndefined();
  });
});

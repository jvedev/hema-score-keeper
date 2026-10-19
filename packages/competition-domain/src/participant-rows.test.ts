import { describe, expect, it } from "vitest";
import { buildParticipantRows, PROVISIONAL_BOUT_THRESHOLD, type StatsBout } from "./participant-rows";
import { replayRatings } from "./rating-replay";

function bout(
  id: string,
  fighterAId: string,
  fighterBId: string,
  winnerId: string | null,
  day: number,
  extra: Partial<StatsBout> = {},
): StatsBout {
  const foughtAt = new Date(Date.UTC(2026, 9, day, 19)).toISOString();
  return { id, fighterAId, fighterBId, winnerId, foughtAt, counts: true, warningsA: 0, warningsB: 0, ...extra };
}

function rows(participantIds: string[], bouts: StatsBout[]) {
  return buildParticipantRows(participantIds, bouts, replayRatings(bouts));
}

describe("buildParticipantRows", () => {
  it("summarises a single win", () => {
    const [a, b] = rows(["a", "b"], [bout("b1", "a", "b", "a", 1, { warningsA: 1, warningsB: 2 })]);

    expect(a).toEqual({
      participantId: "a",
      position: 1,
      rating: 1016,
      lastChange: 16,
      bouts: 1,
      wins: 1,
      draws: 0,
      losses: 0,
      warnings: 1,
      provisional: true,
    });
    expect(b).toMatchObject({ participantId: "b", position: 2, lastChange: -16, losses: 1, warnings: 2 });
  });

  it("counts a draw for both fighters", () => {
    const result = rows(["a", "b"], [bout("b1", "a", "b", null, 1)]);
    expect(result.map((row) => row.draws)).toEqual([1, 1]);
  });

  it("ignores bouts that don't count", () => {
    const result = rows(["a", "b"], [bout("b1", "a", "b", "a", 1, { counts: false, warningsA: 3 })]);
    expect(result.find((row) => row.participantId === "a")).toMatchObject({ bouts: 0, wins: 0, warnings: 0 });
  });

  it("takes the last change from the latest bout", () => {
    const result = rows(["a", "b"], [bout("b2", "a", "b", "b", 2), bout("b1", "a", "b", "a", 1)]);
    const a = result.find((row) => row.participantId === "a")!;
    expect(a.lastChange).toBeLessThan(0);
  });

  it("stops being provisional at the threshold", () => {
    expect(PROVISIONAL_BOUT_THRESHOLD).toBe(10);
    const nine = Array.from({ length: 9 }, (_, i) => bout(`b${i}`, "a", "b", null, i + 1));
    const ten = [...nine, bout("b9", "a", "b", null, 10)];

    expect(rows(["a", "b"], nine)[0]!.provisional).toBe(true);
    expect(rows(["a", "b"], ten)[0]!.provisional).toBe(false);
  });

  it("participant without bouts", () => {
    expect(rows(["z"], [])).toEqual([
      {
        participantId: "z",
        position: 1,
        rating: 1000,
        lastChange: null,
        bouts: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        warnings: 0,
        provisional: true,
      },
    ]);
  });

  it("orders equal ratings by participant id and collapses duplicates", () => {
    const result = rows(["c", "a", "c", "b"], []);
    expect(result.map((row) => [row.participantId, row.position])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });
});

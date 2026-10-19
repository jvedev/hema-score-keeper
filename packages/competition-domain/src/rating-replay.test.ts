import { applyEloBout } from "@hema/ranking";
import { describe, expect, it } from "vitest";
import { SameFighterError } from "./bout-competitions";
import { InvalidWinnerError, replayRatings, type RatedBout } from "./rating-replay";

function bout(id: string, fighterAId: string, fighterBId: string, winnerId: string | null, foughtAt: string, counts = true): RatedBout {
  return { id, fighterAId, fighterBId, winnerId, foughtAt, counts };
}

describe("replayRatings", () => {
  it("applies one bout and records the change", () => {
    const replay = replayRatings([bout("b1", "a", "b", "a", "2026-10-01T19:00:00Z")]);

    expect(replay.ratings.get("a")).toBe(1016);
    expect(replay.ratings.get("b")).toBe(984);
    expect(replay.changes.get("b1")).toEqual({ boutId: "b1", beforeA: 1000, afterA: 1016, beforeB: 1000, afterB: 984 });
  });

  it("replays in chronological order regardless of input order", () => {
    const bouts = [
      bout("b1", "a", "b", "a", "2026-10-01T19:00:00Z"),
      bout("b2", "b", "c", "b", "2026-10-02T19:00:00Z"),
      bout("b3", "c", "a", "c", "2026-10-03T19:00:00Z"),
    ];

    expect(replayRatings([...bouts].reverse())).toEqual(replayRatings(bouts));
  });

  it("orders equal timestamps by id", () => {
    const same = "2026-10-01T19:00:00Z";
    const replay = replayRatings([bout("x2", "a", "c", "c", same), bout("x1", "a", "b", "a", same)]);

    const afterX1 = applyEloBout(new Map(), { fighterAId: "a", fighterBId: "b", winnerParticipantId: "a" });
    const expected = applyEloBout(afterX1, { fighterAId: "a", fighterBId: "c", winnerParticipantId: "c" });
    expect(replay.ratings).toEqual(expected);
  });

  it("leaves out bouts that don't count", () => {
    const counted = bout("b1", "a", "b", "a", "2026-10-01T19:00:00Z");
    const objected = bout("b2", "a", "b", "b", "2026-10-02T19:00:00Z", false);

    const replay = replayRatings([counted, objected]);

    expect(replay.changes.has("b2")).toBe(false);
    expect(replay.ratings).toEqual(replayRatings([counted]).ratings);
  });

  it("recalculates later bouts when an earlier one stops counting", () => {
    const first = bout("first", "a", "b", "a", "2026-10-01T19:00:00Z");
    const middle = bout("middle", "b", "c", "b", "2026-10-02T19:00:00Z");
    const third = bout("third", "a", "c", "a", "2026-10-03T19:00:00Z");

    const withMiddle = replayRatings([first, middle, third]).changes.get("third")!;
    const withoutMiddle = replayRatings([first, { ...middle, counts: false }, third]).changes.get("third")!;

    expect(withoutMiddle.beforeA).toBe(withMiddle.beforeA);
    expect(withoutMiddle.beforeB).toBe(1000);
    const afterFirst = applyEloBout(new Map(), { fighterAId: "a", fighterBId: "b", winnerParticipantId: "a" });
    const afterMiddle = applyEloBout(afterFirst, { fighterAId: "b", fighterBId: "c", winnerParticipantId: "b" });
    expect(withMiddle.beforeB).toBe(afterMiddle.get("c"));
    expect(withMiddle.beforeB).not.toBe(1000);
  });

  it("returns empty results for no bouts", () => {
    const replay = replayRatings([]);
    expect(replay.ratings.size).toBe(0);
    expect(replay.changes.size).toBe(0);
  });
});

describe("replayRatings validation", () => {
  it("rejects a counted bout with the same fighter on both sides", () => {
    expect(() => replayRatings([bout("self", "a", "a", "a", "2026-10-01T19:00:00Z")])).toThrow(SameFighterError);
  });

  it("rejects a counted bout whose winner isn't one of the fighters", () => {
    expect(() => replayRatings([bout("odd", "a", "b", "z", "2026-10-01T19:00:00Z")])).toThrow(InvalidWinnerError);
  });

  it("ignores invalid bouts that don't count", () => {
    expect(replayRatings([bout("self", "a", "a", "a", "2026-10-01T19:00:00Z", false)]).ratings.size).toBe(0);
  });
});

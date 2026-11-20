import { describe, expect, it } from "vitest";
import { groupPools, poolMatchFinished, poolStandings, type PoolMatchInput } from "./pool-standings.js";

let nextId = 0;
const match = (entryAId: string, entryBId: string, scoreA: number | null, scoreB: number | null, winnerEntryId: string | null = null): PoolMatchInput => ({
  id: `m${++nextId}`,
  entryAId,
  entryBId,
  scoreA,
  scoreB,
  winnerEntryId,
});
const fighters = (...ids: string[]) => ids.map((entryId, index) => ({ entryId, seed: index + 1 }));

describe("pool standings", () => {
  it("counts a match once it has a winner or both scores", () => {
    expect(poolMatchFinished({ winnerEntryId: null, scoreA: 2, scoreB: 2 })).toBe(true);
    expect(poolMatchFinished({ winnerEntryId: "a", scoreA: null, scoreB: null })).toBe(true);
    expect(poolMatchFinished({ winnerEntryId: null, scoreA: 2, scoreB: null })).toBe(false);
  });

  it("gives 3 points for a win, 1 for a draw and 0 for a loss", () => {
    const rows = poolStandings(fighters("a", "b", "c"), [match("a", "b", 5, 3), match("a", "c", 2, 2)]);
    expect(rows.map((row) => [row.entryId, row.matchPoints, row.wins, row.ties, row.losses])).toEqual([
      ["a", 4, 1, 1, 0],
      ["c", 1, 0, 1, 0],
      ["b", 0, 0, 0, 1],
    ]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("breaks a tie on match points by the result between the two fighters", () => {
    // a and b both have 3 points; b has the better net score, but a beat b.
    const matches = [match("a", "b", 1, 0), match("d", "a", 1, 0), match("b", "c", 10, 0), match("d", "b", 1, 0), match("d", "c", 1, 0), match("a", "c", 0, 0)];
    const rows = poolStandings(fighters("b", "a", "c", "d"), matches.slice(0, 5));
    expect(rows.map((row) => [row.entryId, row.matchPoints])).toEqual([
      ["d", 9],
      ["a", 3],
      ["b", 3],
      ["c", 0],
    ]);
    expect(rows.find((row) => row.entryId === "b")!.netPoints).toBeGreaterThan(rows.find((row) => row.entryId === "a")!.netPoints);
  });

  it("then by net score, then by most points given", () => {
    // a and b: one win each, no match between them; c and d drew.
    const byNet = poolStandings(fighters("b", "a", "c", "d"), [match("a", "c", 5, 1), match("b", "d", 5, 3), match("c", "d", 0, 0)]);
    expect(byNet.slice(0, 2).map((row) => row.entryId)).toEqual(["a", "b"]);
    const byGiven = poolStandings(fighters("b", "a", "c", "d"), [match("a", "c", 6, 3), match("b", "d", 4, 1), match("c", "d", 0, 0)]);
    expect(byGiven.slice(0, 2).map((row) => [row.entryId, row.netPoints, row.pointsScored])).toEqual([
      ["a", 3, 6],
      ["b", 3, 4],
    ]);
  });

  it("falls back to the seed and then the id, so the order never changes between calls", () => {
    const rows = poolStandings([{ entryId: "z", seed: 2 }, { entryId: "y", seed: 1 }, { entryId: "x", seed: null }], []);
    expect(rows.map((row) => row.entryId)).toEqual(["y", "z", "x"]);
  });

  it("uses the winner when one is recorded, also against the scores", () => {
    const rows = poolStandings(fighters("a", "b"), [match("a", "b", 2, 3, "a")]);
    expect(rows[0]).toMatchObject({ entryId: "a", wins: 1, pointsScored: 2, pointsConceded: 3, netPoints: -1 });
  });

  it("ignores unfinished matches but still lists their fighters", () => {
    const rows = poolStandings([], [match("a", "b", null, null)]);
    expect(rows.map((row) => [row.entryId, row.matchesPlayed])).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
  });
});

describe("pool groups", () => {
  it("makes one pool per arena, numbered in arena order", () => {
    const withArena = (arenaId: string | null) => ({ ...match("a", "b", null, null), arenaId });
    const groups = groupPools([withArena("blue"), withArena("red"), withArena(null), withArena("blue")], new Map([["red", 1], ["blue", 2]]));
    expect(groups.map((group) => [group.arenaId, group.number, group.matches.length])).toEqual([
      ["red", 1, 1],
      ["blue", 2, 2],
      [null, 3, 1],
    ]);
  });
});

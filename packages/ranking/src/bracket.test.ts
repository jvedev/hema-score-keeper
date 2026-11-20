import { describe, expect, it } from "vitest";
import {
  bracketSettings,
  bracketSize,
  DEFAULT_BRACKET_SETTINGS,
  nextBracketSlot,
  PAIRING_RULES,
  planBracket,
  SEEDING_RULES,
  standardSeedOrder,
  type PoolResult,
  type Seed,
} from "./bracket.js";
import type { PoolStanding } from "./pool-standings.js";

const row = (entryId: string, rank: number, matchPoints: number, netPoints = 0, pointsScored = 0): PoolStanding => ({
  rank,
  entryId,
  seed: null,
  matchesPlayed: 3,
  wins: 0,
  losses: 0,
  ties: 0,
  pointsScored,
  pointsConceded: pointsScored - netPoints,
  netPoints,
  matchPoints,
});

const seeds = (...pools: number[]): Seed[] => pools.map((poolNumber, index) => ({ seed: index + 1, entryId: `s${index + 1}`, poolNumber, place: 1 }));

describe("seeding by pool place", () => {
  it("puts all pool winners first, then all seconds, each place ordered by their pool record", () => {
    const pools: PoolResult[] = [
      { number: 1, standings: [row("a1", 1, 6, 5), row("a2", 2, 3, 1), row("a3", 3, 0)] },
      { number: 2, standings: [row("b1", 1, 9, 2), row("b2", 2, 3, 4)] },
    ];
    const result = SEEDING_RULES["by-pool-place"]!(pools);
    expect(result.map((seed) => [seed.seed, seed.entryId, seed.poolNumber, seed.place])).toEqual([
      [1, "b1", 2, 1],
      [2, "a1", 1, 1],
      [3, "b2", 2, 2],
      [4, "a2", 1, 2],
      [5, "a3", 1, 3],
    ]);
  });
});

describe("standard pairing", () => {
  it("uses brackets of a power of two", () => {
    expect([1, 2, 3, 4, 5, 8, 9].map(bracketSize)).toEqual([2, 2, 4, 4, 8, 8, 16]);
  });

  it("places seeds so that 1 and 2 can only meet in the final", () => {
    expect(standardSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("pairs 1–8, 4–5, 2–7, 3–6 for eight fighters", () => {
    const round = PAIRING_RULES.standard!(seeds(1, 2, 3, 4, 5, 6, 7, 8));
    expect(round.pairs.map(([a, b]) => [a?.seed, b?.seed])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it("gives the byes to the top seeds", () => {
    const round = PAIRING_RULES.standard!(seeds(1, 2, 3, 4, 5, 6));
    expect(round.size).toBe(8);
    expect(round.pairs.map(([a, b]) => [a?.seed ?? null, b?.seed ?? null])).toEqual([
      [1, null],
      [4, 5],
      [2, null],
      [3, 6],
    ]);
  });
});

describe("standard pairing with pools kept apart", () => {
  it("swaps a first-round pair from the same pool with the nearest seed that solves it", () => {
    // Seeds 4 and 5 are both from pool 1; seed 6 (pool 3) is the nearest that fixes it without a new clash.
    const round = PAIRING_RULES["standard-pools-apart"]!(seeds(1, 2, 3, 1, 1, 3, 4, 2));
    const pairs = round.pairs.map(([a, b]) => [a?.seed, b?.seed]);
    expect(pairs).toEqual([
      [1, 8],
      [4, 6],
      [2, 7],
      [3, 5],
    ]);
    for (const [a, b] of round.pairs) expect(a!.poolNumber).not.toBe(b!.poolNumber);
  });

  it("leaves the standard pairing alone when no pair shares a pool", () => {
    const input = seeds(1, 2, 3, 4, 1, 2, 3, 4);
    expect(PAIRING_RULES["standard-pools-apart"]!(input)).toEqual(PAIRING_RULES.standard!(input));
  });

  it("keeps a clash it cannot solve rather than making another one", () => {
    const round = PAIRING_RULES["standard-pools-apart"]!(seeds(1, 1));
    expect(round.pairs.map(([a, b]) => [a?.seed, b?.seed])).toEqual([[1, 2]]);
  });
});

describe("bracket plan", () => {
  it("lays out every round, with the bronze match beside the final", () => {
    const plan = planBracket(PAIRING_RULES.standard!(seeds(1, 2, 3, 4)), true);
    expect(plan.map((match) => [match.round, match.position, match.kind, match.entryAId, match.entryBId])).toEqual([
      [0, 0, "MAIN", "s1", "s4"],
      [0, 1, "MAIN", "s2", "s3"],
      [1, 0, "MAIN", null, null],
      [1, 0, "BRONZE", null, null],
    ]);
  });

  it("sends a fighter with a bye straight into the second round", () => {
    const plan = planBracket(PAIRING_RULES.standard!(seeds(1, 2, 3)), false);
    expect(plan.map((match) => [match.round, match.position, match.entryAId, match.entryBId])).toEqual([
      [0, 1, "s2", "s3"],
      [1, 0, "s1", null],
    ]);
  });

  it("has no bronze match without semi-finals", () => {
    expect(planBracket(PAIRING_RULES.standard!(seeds(1, 2)), true).map((match) => match.kind)).toEqual(["MAIN"]);
  });

  it("knows where a winner plays next", () => {
    expect(nextBracketSlot(8, 0, 3)).toEqual({ round: 1, position: 1, side: "B" });
    expect(nextBracketSlot(8, 1, 0)).toEqual({ round: 2, position: 0, side: "A" });
    expect(nextBracketSlot(8, 2, 0)).toBeNull();
  });
});

describe("bracket settings", () => {
  it("uses the defaults for a ruleset without bracket settings", () => {
    expect(bracketSettings(null)).toEqual(DEFAULT_BRACKET_SETTINGS);
    expect(bracketSettings({ weaponClass: "Longsword" })).toEqual(DEFAULT_BRACKET_SETTINGS);
  });

  it("reads the ruleset's choices and refuses unknown rules", () => {
    expect(bracketSettings({ bracket: { pairing: "standard", bronzeMatch: false, separateFinalStages: true } })).toEqual({
      seeding: "by-pool-place",
      pairing: "standard",
      bronzeMatch: false,
      separateFinalStages: true,
    });
    expect(() => bracketSettings({ bracket: { seeding: "random" } })).toThrow('Unknown seeding rule "random".');
  });
});

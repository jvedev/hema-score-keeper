/**
 * Elimination bracket rules: seeding from pool results and pairing the first round. Pure functions behind a
 * small registry of named rules, so a ruleset can pick a rule by name and new rules can be added without
 * touching the code that fills a bracket.
 */
import type { PoolStanding } from "./pool-standings.js";

export interface PoolResult {
  /** 1-based pool number (arena order). */
  number: number;
  /** The pool's standings, rank 1 first. */
  standings: readonly PoolStanding[];
}

export interface Seed {
  /** 1 is the best seed. */
  seed: number;
  entryId: string;
  poolNumber: number;
  /** Place in its own pool, 1-based. */
  place: number;
}

/** Orders the fighters coming out of the pools into one seed list. */
export type SeedingRule = (pools: readonly PoolResult[]) => Seed[];

/**
 * The first round: `pairs[i]` is the match at bracket position i (top to bottom); a null side is a bye, which
 * sends the other fighter straight into the second round.
 */
export interface FirstRound {
  /** Bracket size: a power of two, at least 2. */
  size: number;
  pairs: Array<[Seed | null, Seed | null]>;
}

export type PairingRule = (seeds: readonly Seed[]) => FirstRound;

/** Gold, silver, bronze sorted: all pool winners first, then all seconds, …; within a place by their pool record. */
const byPoolPlace: SeedingRule = (pools) => {
  const deepest = Math.max(0, ...pools.map((pool) => pool.standings.length));
  const ordered: Array<Omit<Seed, "seed">> = [];
  for (let place = 1; place <= deepest; place += 1) {
    const atPlace = pools
      .map((pool) => ({ pool, row: pool.standings[place - 1] }))
      .filter((item): item is { pool: PoolResult; row: PoolStanding } => item.row !== undefined)
      .sort(
        (left, right) =>
          right.row.matchPoints - left.row.matchPoints ||
          right.row.netPoints - left.row.netPoints ||
          right.row.pointsScored - left.row.pointsScored ||
          left.row.pointsConceded - right.row.pointsConceded ||
          (left.row.seed ?? Number.MAX_SAFE_INTEGER) - (right.row.seed ?? Number.MAX_SAFE_INTEGER) ||
          left.pool.number - right.pool.number,
      );
    for (const { pool, row } of atPlace) ordered.push({ entryId: row.entryId, poolNumber: pool.number, place });
  }
  return ordered.map((item, index) => ({ ...item, seed: index + 1 }));
};

/** The smallest power of two that holds `count` fighters (at least 2). */
export function bracketSize(count: number): number {
  let size = 2;
  while (size < count) size *= 2;
  return size;
}

/** Seed numbers by bracket position for a bracket of `size`: 1 and 2 can only meet in the final. */
export function standardSeedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

const standard: PairingRule = (seeds) => {
  const size = bracketSize(seeds.length);
  const bySeed = new Map(seeds.map((seed) => [seed.seed, seed] as const));
  const order = standardSeedOrder(size);
  const pairs: FirstRound["pairs"] = [];
  for (let index = 0; index < order.length; index += 2) {
    pairs.push([bySeed.get(order[index]!) ?? null, bySeed.get(order[index + 1]!) ?? null]);
  }
  return { size, pairs };
};

/**
 * Standard pairing, but two fighters from the same pool do not meet in the first round: the weaker of the two
 * swaps with the nearest seed (by seed number) whose swap removes the clash without creating a new one.
 */
const standardPoolsApart: PairingRule = (seeds) => {
  const round = standard(seeds);
  const pairs = round.pairs.map((pair) => [...pair] as [Seed | null, Seed | null]);
  const clash = (a: Seed | null, b: Seed | null) => a !== null && b !== null && a.poolNumber === b.poolNumber;
  for (let index = 0; index < pairs.length; index += 1) {
    const [top, bottom] = pairs[index]!;
    if (!clash(top, bottom)) continue;
    // The side holding the higher seed number (the weaker fighter) moves.
    const weaker = top!.seed > bottom!.seed ? 0 : 1;
    const keeper = pairs[index]![1 - weaker]!;
    const mover = pairs[index]![weaker]!;
    const candidates = pairs
      .flatMap((pair, pairIndex) => pair.map((seed, side) => ({ seed, pairIndex, side })))
      .filter((item) => item.pairIndex !== index && item.seed !== null)
      .sort((left, right) => Math.abs(left.seed!.seed - mover.seed) - Math.abs(right.seed!.seed - mover.seed) || left.seed!.seed - right.seed!.seed);
    for (const candidate of candidates) {
      const otherSide = pairs[candidate.pairIndex]![1 - candidate.side];
      if (candidate.seed!.poolNumber === keeper.poolNumber) continue;
      if (otherSide && otherSide.poolNumber === mover.poolNumber) continue;
      pairs[index]![weaker] = candidate.seed;
      pairs[candidate.pairIndex]![candidate.side] = mover;
      break;
    }
  }
  return { size: round.size, pairs };
};

export const SEEDING_RULES: Readonly<Record<string, SeedingRule>> = { "by-pool-place": byPoolPlace };
export const PAIRING_RULES: Readonly<Record<string, PairingRule>> = { standard, "standard-pools-apart": standardPoolsApart };

export interface BracketSettings {
  seeding: string;
  pairing: string;
  bronzeMatch: boolean;
  separateFinalStages: boolean;
}

export const DEFAULT_BRACKET_SETTINGS: Readonly<BracketSettings> = {
  seeding: "by-pool-place",
  pairing: "standard-pools-apart",
  bronzeMatch: true,
  separateFinalStages: false,
};

/** The bracket settings of a ruleset definition (its optional `bracket` object), with defaults for what is missing. */
export function bracketSettings(definition: unknown): BracketSettings {
  const bracket = definition && typeof definition === "object" ? (definition as { bracket?: unknown }).bracket : undefined;
  const value = bracket && typeof bracket === "object" ? (bracket as Partial<Record<keyof BracketSettings, unknown>>) : {};
  const settings: BracketSettings = {
    seeding: typeof value.seeding === "string" ? value.seeding : DEFAULT_BRACKET_SETTINGS.seeding,
    pairing: typeof value.pairing === "string" ? value.pairing : DEFAULT_BRACKET_SETTINGS.pairing,
    bronzeMatch: typeof value.bronzeMatch === "boolean" ? value.bronzeMatch : DEFAULT_BRACKET_SETTINGS.bronzeMatch,
    separateFinalStages: typeof value.separateFinalStages === "boolean" ? value.separateFinalStages : DEFAULT_BRACKET_SETTINGS.separateFinalStages,
  };
  if (!SEEDING_RULES[settings.seeding]) throw new Error(`Unknown seeding rule "${settings.seeding}".`);
  if (!PAIRING_RULES[settings.pairing]) throw new Error(`Unknown pairing rule "${settings.pairing}".`);
  return settings;
}

export interface BracketMatchPlan {
  /** 0 = first round; the last round holds the final (and the bronze match). */
  round: number;
  /** Position within its round, top to bottom. */
  position: number;
  kind: "MAIN" | "BRONZE";
  entryAId: string | null;
  entryBId: string | null;
}

/** Where the winner of a main-bracket match plays next, or null after the final. */
export function nextBracketSlot(size: number, round: number, position: number): { round: number; position: number; side: "A" | "B" } | null {
  const rounds = Math.log2(size);
  if (round >= rounds - 1) return null;
  return { round: round + 1, position: Math.floor(position / 2), side: position % 2 === 0 ? "A" : "B" };
}

/**
 * Every match of the bracket. First-round matches with a bye are left out: that fighter is placed directly in
 * the second round. The bronze match (two semi-final losers) is in the final's round, when wanted and the
 * bracket has semi-finals.
 */
export function planBracket(firstRound: FirstRound, bronzeMatch: boolean): BracketMatchPlan[] {
  const rounds = Math.log2(firstRound.size);
  const matches = new Map<string, BracketMatchPlan>();
  const key = (round: number, position: number) => `${round}:${position}`;
  for (let round = 0; round < rounds; round += 1) {
    const count = firstRound.size / 2 ** (round + 1);
    for (let position = 0; position < count; position += 1) {
      matches.set(key(round, position), { round, position, kind: "MAIN", entryAId: null, entryBId: null });
    }
  }
  firstRound.pairs.forEach(([top, bottom], position) => {
    const match = matches.get(key(0, position))!;
    if (top && bottom) {
      match.entryAId = top.entryId;
      match.entryBId = bottom.entryId;
      return;
    }
    matches.delete(key(0, position));
    const through = top ?? bottom;
    const next = nextBracketSlot(firstRound.size, 0, position);
    if (through && next) {
      const target = matches.get(key(next.round, next.position))!;
      if (next.side === "A") target.entryAId = through.entryId;
      else target.entryBId = through.entryId;
    }
  });
  const result = [...matches.values()];
  if (bronzeMatch && rounds >= 2) {
    result.push({ round: rounds - 1, position: 0, kind: "BRONZE", entryAId: null, entryBId: null });
  }
  return result.sort((left, right) => left.round - right.round || (left.kind === right.kind ? 0 : left.kind === "MAIN" ? -1 : 1) || left.position - right.position);
}

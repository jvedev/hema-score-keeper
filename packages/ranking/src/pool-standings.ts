/**
 * Pool standings: the one ranking used by the pool results screen and by bracket seeding, so both always
 * agree. A pool is the set of matches fought on one arena in a pool stage.
 *
 * Ranking rules, in order:
 *   1. match points (win 3, draw 1, loss 0);
 *   2. the result between the two tied fighters;
 *   3. net score (points given minus points received);
 *   4. most points given;
 *   5. fewest points received (kept from the screen's list; with equal net score and points given it is
 *      always equal too, so it never decides);
 *   6. seed (lower first), then entry id, so the order is always the same.
 */

export interface PoolMatchInput {
  id: string;
  entryAId: string | null;
  entryBId: string | null;
  winnerEntryId: string | null;
  scoreA: number | null;
  scoreB: number | null;
}

export interface PoolFighterInput {
  entryId: string;
  seed: number | null;
}

export interface PoolStanding {
  /** 1 for the pool winner. */
  rank: number;
  entryId: string;
  seed: number | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  pointsConceded: number;
  netPoints: number;
  matchPoints: number;
}

type Outcome = "win" | "loss" | "draw";

/** A match counts once it has a winner or both scores. */
export function poolMatchFinished(match: Pick<PoolMatchInput, "winnerEntryId" | "scoreA" | "scoreB">): boolean {
  return match.winnerEntryId !== null || (match.scoreA !== null && match.scoreB !== null);
}

function outcomeFor(match: PoolMatchInput, entryId: string, scoreA: number, scoreB: number): Outcome {
  if (match.winnerEntryId === entryId) return "win";
  if (match.winnerEntryId !== null) return "loss";
  if (scoreA === scoreB) return "draw";
  const isA = entryId === match.entryAId;
  return isA ? (scoreA > scoreB ? "win" : "loss") : scoreB > scoreA ? "win" : "loss";
}

const MATCH_POINTS: Record<Outcome, number> = { win: 3, draw: 1, loss: 0 };

/**
 * The standings of one pool. Every fighter listed is ranked, also without a finished match; fighters that only
 * appear in the matches are added too.
 */
export function poolStandings(fighters: readonly PoolFighterInput[], matches: readonly PoolMatchInput[]): PoolStanding[] {
  const stats = new Map<string, Omit<PoolStanding, "rank"> & { direct: Map<string, Outcome> }>();
  const ensure = (entryId: string, seed: number | null) => {
    let row = stats.get(entryId);
    if (!row) {
      row = { entryId, seed, matchesPlayed: 0, wins: 0, losses: 0, ties: 0, pointsScored: 0, pointsConceded: 0, netPoints: 0, matchPoints: 0, direct: new Map() };
      stats.set(entryId, row);
    }
    return row;
  };
  for (const fighter of fighters) ensure(fighter.entryId, fighter.seed);
  for (const match of matches) {
    if (match.entryAId) ensure(match.entryAId, null);
    if (match.entryBId) ensure(match.entryBId, null);
  }

  for (const match of matches) {
    if (!poolMatchFinished(match)) continue;
    const scoreA = match.scoreA ?? 0;
    const scoreB = match.scoreB ?? 0;
    for (const [entryId, opponentId, given, received] of [
      [match.entryAId, match.entryBId, scoreA, scoreB],
      [match.entryBId, match.entryAId, scoreB, scoreA],
    ] as const) {
      if (!entryId) continue;
      const row = stats.get(entryId)!;
      const outcome = outcomeFor(match, entryId, scoreA, scoreB);
      row.matchesPlayed += 1;
      row.pointsScored += given;
      row.pointsConceded += received;
      row.netPoints = row.pointsScored - row.pointsConceded;
      row.matchPoints += MATCH_POINTS[outcome];
      if (outcome === "win") row.wins += 1;
      else if (outcome === "loss") row.losses += 1;
      else row.ties += 1;
      if (opponentId) row.direct.set(opponentId, outcome);
    }
  }

  const rows = [...stats.values()];
  rows.sort((a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
    const aAgainstB = a.direct.get(b.entryId);
    const bAgainstA = b.direct.get(a.entryId);
    if (aAgainstB === "win" && bAgainstA === "loss") return -1;
    if (aAgainstB === "loss" && bAgainstA === "win") return 1;
    if (a.netPoints !== b.netPoints) return b.netPoints - a.netPoints;
    if (a.pointsScored !== b.pointsScored) return b.pointsScored - a.pointsScored;
    if (a.pointsConceded !== b.pointsConceded) return a.pointsConceded - b.pointsConceded;
    const seedDifference = (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER);
    return seedDifference !== 0 ? seedDifference : a.entryId.localeCompare(b.entryId);
  });
  return rows.map(({ direct: _direct, ...row }, index) => ({ ...row, rank: index + 1 }));
}

export interface PoolGroup<M extends PoolMatchInput & { arenaId: string | null }> {
  /** The arena the pool is fought on, or null for matches without an arena. */
  arenaId: string | null;
  /** 1-based, in arena order. */
  number: number;
  matches: M[];
}

/**
 * Splits a pool stage's matches into pools, one per arena, numbered in arena order (`arenaOrder` gives each
 * arena's position; unknown arenas and matches without an arena come last).
 */
export function groupPools<M extends PoolMatchInput & { arenaId: string | null }>(
  matches: readonly M[],
  arenaOrder: ReadonlyMap<string, number>,
): PoolGroup<M>[] {
  const groups = new Map<string | null, M[]>();
  for (const match of matches) {
    const list = groups.get(match.arenaId) ?? [];
    list.push(match);
    groups.set(match.arenaId, list);
  }
  const rank = (arenaId: string | null) => (arenaId === null ? Number.MAX_SAFE_INTEGER : (arenaOrder.get(arenaId) ?? Number.MAX_SAFE_INTEGER - 1));
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right) || String(left).localeCompare(String(right)))
    .map(([arenaId, list], index) => ({ arenaId, number: index + 1, matches: list }));
}

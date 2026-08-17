import css from "./pool-results.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import type { ApiEvent, ApiStage, ApiTournament, ApiMatch, ApiEntry } from "@hema/event-admin-api";

export interface PoolStandingRow {
  rank: number;
  entryId: string;
  username: string;
  seed: number | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  pointsConceded: number;
  netPoints: number;
}

export interface PoolMatchResult {
  id: string;
  entryAId: string | null;
  entryBId: string | null;
  entryAName: string;
  entryBName: string;
  scoreA: number | null;
  scoreB: number | null;
  winnerEntryId: string | null;
  isFinished: boolean;
}

export interface PoolData {
  id: string;
  name: string;
  arenaName: string;
  timeSlotLabel: string;
  fighters: ApiEntry[];
  matches: PoolMatchResult[];
  standings: PoolStandingRow[];
  totalMatches: number;
  completedMatches: number;
  isFinished: boolean;
}

interface PoolStandingStats {
  entry: ApiEntry;
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsScored: number;
  pointsConceded: number;
  matchPoints: number;
  directResults: Map<string, "win" | "loss" | "draw">;
}

interface PoolStandingRowWithMeta extends PoolStandingRow {
  matchPoints: number;
  directResults: Map<string, "win" | "loss" | "draw">;
}

const poolWinnerRules = [
  {
    title: "Primary ranking",
    description: "Match points (Win = 3, Draw = 1, Loss = 0)",
  },
  {
    title: "Tie breaker 1",
    description: "Head-to-head result between tied fighters",
  },
  {
    title: "Tie breaker 2",
    description: "Net score (Hits given - Hits received)",
  },
  {
    title: "Tie breaker 3",
    description: "Total hits given (Most points scored)",
  },
  {
    title: "Tie breaker 4",
    description: "Total hits received (Fewest points conceded)",
  },
  {
    title: "Tie breaker 5",
    description: "Deciding tie-breaker exchange or coin toss if all metrics remain equal",
  },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export class PoolResults extends BaseComponent {
  #event: ApiEvent | undefined;
  #stage: ApiStage | undefined;
  #tournament: ApiTournament | undefined;
  #selectedPoolId = "ALL";

  get event(): ApiEvent | undefined {
    return this.#event;
  }

  set event(value: ApiEvent | undefined) {
    this.#event = value;
    this.#update();
  }

  get stage(): ApiStage | undefined {
    return this.#stage;
  }

  set stage(value: ApiStage | undefined) {
    this.#stage = value;
    this.#update();
  }

  get tournament(): ApiTournament | undefined {
    return this.#tournament;
  }

  set tournament(value: ApiTournament | undefined) {
    this.#tournament = value;
    this.#update();
  }

  setData(event: ApiEvent, stage: ApiStage, tournament?: ApiTournament): void {
    this.#event = event;
    this.#stage = stage;
    this.#tournament = tournament;
    this.#update();
  }

  connectedCallback(): void {
    this.registerEvent(this.root, "change", (event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.classList.contains("pool-filter-select")) {
        this.#selectedPoolId = target.value;
        this.#update();
      }
    });
    this.#update();
  }

  #update(): void {
    const pools = this.#calculatePools();
    const html = this.#renderHtml(pools);
    this.render(css, html);
  }

  #calculatePools(): PoolData[] {
    if (!this.#stage) return [];

    const tournament =
      this.#tournament ??
      this.#event?.tournaments.find((t) => t.id === this.#stage?.tournamentId);
    const allEntries = tournament?.entries ?? [];
    const entryById = new Map(allEntries.map((e) => [e.id, e]));

    const stageMatches: ApiMatch[] = this.#stage.rounds.flatMap((round) => round.matches);
    const poolDefinitions = this.#buildPoolDefinitions();

    return poolDefinitions.map((poolDefinition) => {
      const matches = stageMatches.filter((match) => {
        if (poolDefinition.arenaId === null) {
          return match.arenaId === null;
        }
        return match.arenaId === poolDefinition.arenaId;
      });

      const fighterSet = new Set<string>();
      for (const match of matches) {
        if (match.entryAId) fighterSet.add(match.entryAId);
        if (match.entryBId) fighterSet.add(match.entryBId);
      }

      const fighters = [...fighterSet]
        .map((entryId) => entryById.get(entryId))
        .filter((entry): entry is ApiEntry => Boolean(entry));

      return this.#buildPoolData(
        poolDefinition.id,
        poolDefinition.name,
        poolDefinition.arenaName,
        poolDefinition.timeSlotLabel,
        fighters,
        matches,
        entryById,
      );
    });
  }

  #buildPoolDefinitions(): Array<{
    id: string;
    name: string;
    arenaName: string;
    timeSlotLabel: string;
    arenaId: string | null;
  }> {
    const stageArenaAssignments = this.#stage?.arenas ?? [];

    if (stageArenaAssignments.length > 0) {
      const definitions: Array<{
        id: string;
        name: string;
        arenaName: string;
        timeSlotLabel: string;
        arenaId: string | null;
      }> = [];
      const seenArenaIds = new Set<string>();

      for (const assignment of stageArenaAssignments) {
        const arenaId = assignment.arenaId ?? null;
        if (!arenaId || seenArenaIds.has(arenaId)) {
          continue;
        }

        seenArenaIds.add(arenaId);
        const arena = assignment.arena ?? this.#event?.arenas.find((candidate) => candidate.id === arenaId);
        definitions.push({
          id: `arena-${arenaId}`,
          name: `Pool ${definitions.length + 1}${arena?.name ? ` · ${arena.name}` : ""}`,
          arenaName: arena?.name ?? "Onbekende arena",
          timeSlotLabel: "-",
          arenaId,
        });
      }

      if (definitions.length > 0) {
        return definitions;
      }
    }

    const stageMatches = this.#stage?.rounds.flatMap((round) => round.matches) ?? [];
    const matchesByArena = new Map<string, ApiMatch[]>();

    for (const match of stageMatches) {
      const key = match.arenaId ?? "default";
      const list = matchesByArena.get(key) ?? [];
      list.push(match);
      matchesByArena.set(key, list);
    }

    return [...matchesByArena.entries()].map(([arenaId, matches], index) => {
      const arena = this.#event?.arenas.find((candidate) => candidate.id === arenaId);
      const arenaName = arena?.name ?? (arenaId === "default" ? "Standaard arena" : `Arena ${index + 1}`);
      return {
        id: `arena-${arenaId}`,
        name: `Pool ${index + 1}${arenaName ? ` · ${arenaName}` : ""}`,
        arenaName,
        timeSlotLabel: "-",
        arenaId: arenaId === "default" ? null : arenaId,
      };
    });
  }

  #buildPoolData(
    id: string,
    name: string,
    arenaName: string,
    timeSlotLabel: string,
    fighters: ApiEntry[],
    matches: ApiMatch[],
    entryById: Map<string, ApiEntry>,
  ): PoolData {
    const statsMap = new Map<string, PoolStandingStats>();

    for (const fighter of fighters) {
      statsMap.set(fighter.id, {
        entry: fighter,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsScored: 0,
        pointsConceded: 0,
        matchPoints: 0,
        directResults: new Map<string, "win" | "loss" | "draw">(),
      });
    }

    const formattedMatches: PoolMatchResult[] = [];
    let completedMatches = 0;

    for (const m of matches) {
      const entryA = m.entryAId ? entryById.get(m.entryAId) : undefined;
      const entryB = m.entryBId ? entryById.get(m.entryBId) : undefined;
      const entryAName = entryA?.user.username ?? "Onbekend";
      const entryBName = entryB?.user.username ?? "Onbekend";

      const isFinished =
        m.winnerEntryId !== null || (m.scoreA !== null && m.scoreB !== null);

      if (isFinished) {
        completedMatches += 1;
        const scoreA = m.scoreA ?? 0;
        const scoreB = m.scoreB ?? 0;

        if (m.entryAId && statsMap.has(m.entryAId)) {
          const statsA = statsMap.get(m.entryAId)!;
          statsA.matchesPlayed += 1;
          statsA.pointsScored += scoreA;
          statsA.pointsConceded += scoreB;
          const outcomeA = this.#getOutcomeForEntry(m, m.entryAId, scoreA, scoreB);
          statsA.matchPoints += this.#pointsForOutcome(outcomeA);
          statsA.directResults.set(m.entryBId ?? "", outcomeA);
          if (outcomeA === "win") {
            statsA.wins += 1;
          } else if (outcomeA === "loss") {
            statsA.losses += 1;
          } else {
            statsA.ties += 1;
          }
        }

        if (m.entryBId && statsMap.has(m.entryBId)) {
          const statsB = statsMap.get(m.entryBId)!;
          statsB.matchesPlayed += 1;
          statsB.pointsScored += scoreB;
          statsB.pointsConceded += scoreA;
          const outcomeB = this.#getOutcomeForEntry(m, m.entryBId, scoreA, scoreB);
          statsB.matchPoints += this.#pointsForOutcome(outcomeB);
          statsB.directResults.set(m.entryAId ?? "", outcomeB);
          if (outcomeB === "win") {
            statsB.wins += 1;
          } else if (outcomeB === "loss") {
            statsB.losses += 1;
          } else {
            statsB.ties += 1;
          }
        }
      }

      formattedMatches.push({
        id: m.id,
        entryAId: m.entryAId,
        entryBId: m.entryBId,
        entryAName,
        entryBName,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        winnerEntryId: m.winnerEntryId,
        isFinished,
      });
    }

    const totalMatches = matches.length;
    const isFinished = completedMatches === totalMatches && totalMatches > 0;

    const sortableStandings: PoolStandingRowWithMeta[] = [...statsMap.values()].map((s) => ({
      rank: 0,
      entryId: s.entry.id,
      username: s.entry.user.username,
      seed: s.entry.seed,
      matchesPlayed: s.matchesPlayed,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pointsScored: s.pointsScored,
      pointsConceded: s.pointsConceded,
      netPoints: s.pointsScored - s.pointsConceded,
      matchPoints: s.matchPoints,
      directResults: s.directResults,
    }));

    const standings: PoolStandingRow[] = sortableStandings
      .sort((a, b) => this.#compareStandings(a, b))
      .map((row, idx) => ({
        ...row,
        rank: idx + 1,
      }))
      .map((row) => {
        const { matchPoints: _matchPoints, directResults: _directResults, ...standingsRow } = row;
        return standingsRow;
      });

    return {
      id,
      name,
      arenaName,
      timeSlotLabel,
      fighters,
      matches: formattedMatches,
      standings,
      totalMatches,
      completedMatches,
      isFinished,
    };
  }

  #getOutcomeForEntry(match: ApiMatch, entryId: string, scoreA: number, scoreB: number): "win" | "loss" | "draw" {
    if (match.winnerEntryId === entryId) {
      return "win";
    }

    if (match.winnerEntryId !== null) {
      return "loss";
    }

    if (scoreA === scoreB) {
      return "draw";
    }

    const isEntryA = entryId === match.entryAId;
    return isEntryA ? (scoreA > scoreB ? "win" : "loss") : (scoreB > scoreA ? "win" : "loss");
  }

  #pointsForOutcome(outcome: "win" | "loss" | "draw"): number {
    switch (outcome) {
      case "win":
        return 3;
      case "draw":
        return 1;
      default:
        return 0;
    }
  }

  #compareStandings(a: PoolStandingRowWithMeta, b: PoolStandingRowWithMeta): number {
    if (a.matchPoints !== b.matchPoints) {
      return b.matchPoints - a.matchPoints;
    }

    const headToHead = this.#compareHeadToHead(a, b);
    if (headToHead !== 0) {
      return headToHead;
    }

    if (a.netPoints !== b.netPoints) {
      return b.netPoints - a.netPoints;
    }

    if (a.pointsScored !== b.pointsScored) {
      return b.pointsScored - a.pointsScored;
    }

    if (a.pointsConceded !== b.pointsConceded) {
      return a.pointsConceded - b.pointsConceded;
    }

    return (a.seed ?? 999) - (b.seed ?? 999);
  }

  #compareHeadToHead(a: PoolStandingRowWithMeta, b: PoolStandingRowWithMeta): number {
    const resultA = a.directResults.get(b.entryId);
    const resultB = b.directResults.get(a.entryId);

    if (!resultA || !resultB) {
      return 0;
    }

    if (resultA === "win" && resultB === "loss") {
      return -1;
    }

    if (resultA === "loss" && resultB === "win") {
      return 1;
    }

    return 0;
  }

  #renderHtml(pools: PoolData[]): string {
    if (!this.#stage) {
      return `<div class="empty-state">Geen stage geselecteerd.</div>`;
    }

    if (pools.length === 0) {
      return `<div class="empty-state">Nog geen pools aanwezig in deze stage.</div>`;
    }

    const visiblePools =
      this.#selectedPoolId === "ALL"
        ? pools
        : pools.filter((p) => p.id === this.#selectedPoolId);

    return `
      <div class="pool-results-container">
        <header class="pool-results-header">
          <h3 class="pool-results-title">Pool Uitslagen & Standen</h3>
          ${
            pools.length > 1
              ? `<select class="pool-filter-select">
                  <option value="ALL"${this.#selectedPoolId === "ALL" ? " selected" : ""}>Alle pools (${pools.length})</option>
                  ${pools
                    .map(
                      (p) =>
                        `<option value="${escapeHtml(p.id)}"${p.id === this.#selectedPoolId ? " selected" : ""}>${escapeHtml(p.name)} (${p.isFinished ? "Afgerond" : `${p.completedMatches}/${p.totalMatches}`})</option>`,
                    )
                    .join("")}
                </select>`
              : ""
          }
        </header>

        ${visiblePools.map((pool) => this.#renderPoolCard(pool)).join("")}
      </div>
    `;
  }

  #renderPoolCard(pool: PoolData): string {
    const statusBadge = pool.isFinished
      ? `<span class="status-badge status-success">✓ Pool Completed (${pool.completedMatches}/${pool.totalMatches})</span>`
      : pool.completedMatches > 0
        ? `<span class="status-badge status-warning">⏳ In Progress (${pool.completedMatches}/${pool.totalMatches})</span>`
        : `<span class="status-badge status-muted">⚪ Not Started (0/${pool.totalMatches})</span>`;

    return `
      <article class="pool-card">
        <div class="pool-card-header">
          <div>
            <h4 class="pool-card-title">${escapeHtml(pool.name)}</h4>
            <div class="pool-card-subtitle">Arena: ${escapeHtml(pool.arenaName)} ${pool.timeSlotLabel !== "-" ? `· Timeslot: ${escapeHtml(pool.timeSlotLabel)}` : ""}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="pool-ranking-rules">
          <div class="pool-ranking-title">Winner Determination</div>
          <ol class="pool-ranking-list">
            ${poolWinnerRules.map((rule) => `<li><strong>${escapeHtml(rule.title)}:</strong> ${escapeHtml(rule.description)}</li>`).join("")}
          </ol>
        </div>

        <div class="table-wrapper">
          <table class="standings-table">
            <thead>
              <tr>
                <th class="rank-cell">#</th>
                <th>Fighter</th>
                <th title="Matches Played">Matches Played</th>
                <th title="Wins">Wins</th>
                <th title="Losses">Losses</th>
                <th title="Draws">Draws</th>
                <th title="Points For (Hits Scored)">Points For</th>
                <th title="Points Against (Hits Conceded)">Points Against</th>
                <th title="Net Score">Net Score</th>
              </tr>
            </thead>
            <tbody>
              ${pool.standings.map((row) => this.#renderStandingRow(row, pool.isFinished)).join("")}
            </tbody>
          </table>
        </div>

        ${
          pool.matches.length > 0
            ? `<div class="matches-section">
                <div class="matches-title">Matches</div>
                <div class="matches-grid">
                  ${pool.matches.map((m) => this.#renderMatchItem(m)).join("")}
                </div>
              </div>`
            : ""
        }
      </article>
    `;
  }

  #renderStandingRow(row: PoolStandingRow, poolIsFinished: boolean): string {
    const isWinner = poolIsFinished && row.rank === 1;
    const diffClass =
      row.netPoints > 0 ? "net-positive" : row.netPoints < 0 ? "net-negative" : "";
    const diffText = row.netPoints > 0 ? `+${row.netPoints}` : `${row.netPoints}`;

    return `
      <tr class="${isWinner ? "winner-row" : ""}">
        <td class="rank-cell rank-${row.rank}">${row.rank}</td>
        <td><strong>${escapeHtml(row.username)}</strong> ${isWinner ? "👑" : ""}</td>
        <td>${row.matchesPlayed}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.ties}</td>
        <td>${row.pointsScored}</td>
        <td>${row.pointsConceded}</td>
        <td class="${diffClass}">${diffText}</td>
      </tr>
    `;
  }

  #renderMatchItem(match: PoolMatchResult): string {
    const winnerA = match.winnerEntryId === match.entryAId || (match.scoreA !== null && match.scoreB !== null && match.scoreA > match.scoreB);
    const winnerB = match.winnerEntryId === match.entryBId || (match.scoreA !== null && match.scoreB !== null && match.scoreB > match.scoreA);

    const scoreDisplay = match.isFinished
      ? `${match.scoreA ?? 0} - ${match.scoreB ?? 0}`
      : "v.s.";

    return `
      <div class="match-item ${match.isFinished ? "finished" : ""}">
        <div class="match-fighters">
          <span class="match-fighter ${winnerA ? "winner" : ""}">${escapeHtml(match.entryAName)}</span>
          <span class="match-fighter ${winnerB ? "winner" : ""}">${escapeHtml(match.entryBName)}</span>
        </div>
        <div class="match-score">${scoreDisplay}</div>
      </div>
    `;
  }
}

if (!customElements.get("pool-results")) {
  customElements.define("pool-results", PoolResults);
}

declare global {
  interface HTMLElementTagNameMap {
    "pool-results": PoolResults;
  }
}


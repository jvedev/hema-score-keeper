import css from "./pool-results.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import { LOCALE_CHANGE_EVENT, t, type MessageKey } from "../../i18n/i18n.js";
import type { ApiEvent, ApiStage, ApiTournament, ApiMatch, ApiEntry } from "@hema/event-admin-api";
import { poolMatchFinished, poolStandings } from "@hema/ranking";

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



/** The ranking rules, in order; each is a title and a description message. */
const poolWinnerRules: ReadonlyArray<{ title: MessageKey; description: MessageKey }> = [
  { title: "poolResults.rulePrimary", description: "poolResults.rulePrimaryText" },
  { title: "poolResults.ruleTie1", description: "poolResults.ruleTie1Text" },
  { title: "poolResults.ruleTie2", description: "poolResults.ruleTie2Text" },
  { title: "poolResults.ruleTie3", description: "poolResults.ruleTie3Text" },
  { title: "poolResults.ruleTie4", description: "poolResults.ruleTie4Text" },
  { title: "poolResults.ruleTie5", description: "poolResults.ruleTie5Text" },
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
    this.registerEvent(window, LOCALE_CHANGE_EVENT, () => this.#update());
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
    const arenaOrder = new Map((this.#event?.arenas ?? []).map((arena) => [arena.id, arena.order] as const));
    // Pools are numbered in arena order, the same order bracket seeding uses.
    const stageArenaAssignments = [...(this.#stage?.arenas ?? [])].sort(
      (left, right) => (arenaOrder.get(left.arenaId) ?? left.arena?.order ?? 0) - (arenaOrder.get(right.arenaId) ?? right.arena?.order ?? 0),
    );

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
          name: `${t("poolResults.poolNumber", { number: definitions.length + 1 })}${arena?.name ? ` · ${arena.name}` : ""}`,
          arenaName: arena?.name ?? t("poolResults.unknownArena"),
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

    const rank = (arenaId: string) => (arenaId === "default" ? Number.MAX_SAFE_INTEGER : (arenaOrder.get(arenaId) ?? Number.MAX_SAFE_INTEGER - 1));
    return [...matchesByArena.entries()].sort(([left], [right]) => rank(left) - rank(right)).map(([arenaId, matches], index) => {
      const arena = this.#event?.arenas.find((candidate) => candidate.id === arenaId);
      const arenaName = arena?.name ?? (arenaId === "default" ? t("poolResults.defaultArena") : t("poolResults.arenaNumber", { number: index + 1 }));
      return {
        id: `arena-${arenaId}`,
        name: `${t("poolResults.poolNumber", { number: index + 1 })}${arenaName ? ` · ${arenaName}` : ""}`,
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
    const formattedMatches: PoolMatchResult[] = matches.map((m) => ({
      id: m.id,
      entryAId: m.entryAId,
      entryBId: m.entryBId,
      entryAName: (m.entryAId ? entryById.get(m.entryAId)?.user.username : undefined) ?? t("poolResults.unknownFighter"),
      entryBName: (m.entryBId ? entryById.get(m.entryBId)?.user.username : undefined) ?? t("poolResults.unknownFighter"),
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      winnerEntryId: m.winnerEntryId,
      isFinished: poolMatchFinished(m),
    }));
    const completedMatches = formattedMatches.filter((m) => m.isFinished).length;
    const totalMatches = matches.length;
    const isFinished = completedMatches === totalMatches && totalMatches > 0;

    // The shared ranking (@hema/ranking) is the one bracket seeding uses on the server.
    const standings: PoolStandingRow[] = poolStandings(
      fighters.map((fighter) => ({ entryId: fighter.id, seed: fighter.seed })),
      matches,
    ).map((row) => ({
      rank: row.rank,
      entryId: row.entryId,
      username: entryById.get(row.entryId)?.user.username ?? t("poolResults.unknownFighter"),
      seed: row.seed,
      matchesPlayed: row.matchesPlayed,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      pointsScored: row.pointsScored,
      pointsConceded: row.pointsConceded,
      netPoints: row.netPoints,
    }));

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

  #renderHtml(pools: PoolData[]): string {
    if (!this.#stage) {
      return `<div class="empty-state">${t("poolResults.noStage")}</div>`;
    }

    if (pools.length === 0) {
      return `<div class="empty-state">${t("poolResults.noPools")}</div>`;
    }

    const visiblePools =
      this.#selectedPoolId === "ALL"
        ? pools
        : pools.filter((p) => p.id === this.#selectedPoolId);

    return `
      <div class="pool-results-container">
        <header class="pool-results-header">
          <h3 class="pool-results-title">${t("poolResults.title")}</h3>
          ${
            pools.length > 1
              ? `<select class="pool-filter-select">
                  <option value="ALL"${this.#selectedPoolId === "ALL" ? " selected" : ""}>${t("poolResults.allPools", { count: pools.length })}</option>
                  ${pools
                    .map(
                      (p) =>
                        `<option value="${escapeHtml(p.id)}"${p.id === this.#selectedPoolId ? " selected" : ""}>${escapeHtml(p.name)} (${p.isFinished ? t("poolResults.finished") : `${p.completedMatches}/${p.totalMatches}`})</option>`,
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
      ? `<span class="status-badge status-success">${t("poolResults.statusDone", { played: pool.completedMatches, total: pool.totalMatches })}</span>`
      : pool.completedMatches > 0
        ? `<span class="status-badge status-warning">${t("poolResults.statusInProgress", { played: pool.completedMatches, total: pool.totalMatches })}</span>`
        : `<span class="status-badge status-muted">${t("poolResults.statusNotStarted", { total: pool.totalMatches })}</span>`;

    return `
      <article class="pool-card">
        <div class="pool-card-header">
          <div>
            <h4 class="pool-card-title">${escapeHtml(pool.name)}</h4>
            <div class="pool-card-subtitle">${t("poolResults.arenaLabel", { arena: escapeHtml(pool.arenaName) })} ${pool.timeSlotLabel !== "-" ? `· ${t("poolResults.timeSlotLabel", { slot: escapeHtml(pool.timeSlotLabel) })}` : ""}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="pool-ranking-rules">
          <div class="pool-ranking-title">${t("poolResults.rankingTitle")}</div>
          <ol class="pool-ranking-list">
            ${poolWinnerRules.map((rule) => `<li><strong>${escapeHtml(t(rule.title))}:</strong> ${escapeHtml(t(rule.description))}</li>`).join("")}
          </ol>
        </div>

        <div class="table-wrapper">
          <table class="standings-table">
            <thead>
              <tr>
                <th class="rank-cell">#</th>
                <th>${t("poolResults.fighter")}</th>
                <th title="${t("poolResults.playedHint")}">${t("poolResults.played")}</th>
                <th>${t("poolResults.wins")}</th>
                <th>${t("poolResults.losses")}</th>
                <th>${t("poolResults.draws")}</th>
                <th title="${t("poolResults.pointsForHint")}">${t("poolResults.pointsFor")}</th>
                <th title="${t("poolResults.pointsAgainstHint")}">${t("poolResults.pointsAgainst")}</th>
                <th>${t("poolResults.net")}</th>
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
                <div class="matches-title">${t("poolResults.matches")}</div>
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
      : t("poolResults.versus");

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


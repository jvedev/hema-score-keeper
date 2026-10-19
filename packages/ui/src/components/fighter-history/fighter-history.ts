import css from "./fighter-history.css?raw";
import { formatDateTime, formatSigned, t, type MessageKey } from "../../i18n/i18n.js";
import type { FighterBoutView, FighterSummaryView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";
import "../bout-seal/bout-seal.js";
import "../search-field/search-field.js";

export interface BoutSelectedDetail {
  boutId: string;
}

const RESULT_KEYS: Record<FighterBoutView["result"], MessageKey> = {
  WIN: "result.win",
  DRAW: "result.draw",
  LOSS: "result.loss",
};

/**
 * One fighter in one competition: rating, a sparkline, totals and their bouts (newest first, as
 * given). Options: `show-warnings`, `searchable`, `selected` (bout id). Fires `bout-selected`.
 *
 * The frame and its listeners are built once per connection; new data only replaces the summary
 * or the bout list, so the search text, the selection and keyboard focus survive refreshes.
 */
export class FighterHistory extends BaseComponent {
  static readonly observedAttributes = ["show-warnings", "searchable", "selected"];

  #summary: FighterSummaryView | null = null;
  #bouts: FighterBoutView[] = [];
  #query = "";
  #summarySlot: HTMLElement | null = null;
  #searchSlot: HTMLElement | null = null;
  #list: HTMLElement | null = null;

  set summary(summary: FighterSummaryView | null) {
    this.#summary = summary;
    this.#drawSummary();
  }

  get summary(): FighterSummaryView | null {
    return this.#summary;
  }

  set bouts(bouts: FighterBoutView[]) {
    this.#bouts = bouts;
    this.#drawList();
  }

  get bouts(): FighterBoutView[] {
    return this.#bouts;
  }

  connectedCallback(): void {
    this.render(
      css,
      `<div class="summary"></div>
      <p class="eyebrow section"></p>
      <div class="search-slot"></div>
      <div class="list"></div>`,
    );
    this.#summarySlot = this.queryRoot<HTMLElement>(".summary");
    this.#searchSlot = this.queryRoot<HTMLElement>(".search-slot");
    this.#list = this.queryRoot<HTMLElement>(".list");

    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const row = (event.target as Element | null)?.closest<HTMLElement>("[data-bout-id]");
      if (row) {
        this.#select(row.dataset.boutId!);
      }
    });
    this.registerEvent<CustomEvent<{ query: string }>>(this.root, "search-changed", (event) => {
      // Our own search; don't let it look like the app's.
      event.stopPropagation();
      this.#query = event.detail.query;
      this.#applyFilter();
    });
    this.onLocaleChange(() => {
      this.#drawSummary();
      this.#drawList();
    });

    this.#syncSearch();
    this.#drawSummary();
    this.#drawList();
  }

  attributeChangedCallback(name: string): void {
    if (!this.#list) {
      return;
    }
    if (name === "selected") {
      this.#applySelection();
    } else if (name === "searchable") {
      this.#syncSearch();
      this.#applyFilter();
    } else {
      this.#drawSummary();
    }
  }

  #syncSearch(): void {
    if (!this.#searchSlot) {
      return;
    }
    const wanted = this.hasAttribute("searchable");
    const existing = this.#searchSlot.querySelector("search-field");
    if (wanted && !existing) {
      this.#searchSlot.innerHTML = `<search-field placeholder-key="history.searchPlaceholder"></search-field>`;
    } else if (!wanted && existing) {
      this.#searchSlot.innerHTML = "";
      this.#query = "";
    }
  }

  #drawSummary(): void {
    const summary = this.#summary;
    if (!this.#summarySlot || !summary || !this.isConnected) {
      return;
    }
    const subtitle = [
      summary.clubName ? escapeHtml(summary.clubName) : null,
      summary.since ? t("history.since", { date: formatDateTime(summary.since, "date") }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const stats: Array<[MessageKey, number]> = [
      ["history.stats.bouts", summary.bouts],
      ["history.stats.won", summary.wins],
      ["history.stats.drawn", summary.draws],
      ["history.stats.lost", summary.losses],
    ];
    if (this.hasAttribute("show-warnings")) {
      stats.push(["history.stats.warn", summary.warnings]);
    }
    this.#summarySlot.innerHTML = `<header>
        <div>
          <p class="eyebrow">${subtitle}</p>
          <h2 class="fighter-name">${escapeHtml(summary.name)}</h2>
        </div>
        <div class="big-rating"><span class="eyebrow">${t("history.rating")}</span><b>${summary.rating}</b></div>
      </header>
      ${this.#sparkline(summary.ratingHistory)}
      <div class="stats">${stats.map(([key, value]) => `<div class="stat"><b>${value}</b><span>${t(key)}</span></div>`).join("")}</div>`;
    this.queryRoot<HTMLElement>(".section").textContent = t("history.boutsTitle");
  }

  #drawList(): void {
    if (!this.#list || !this.isConnected) {
      return;
    }
    const focusedId = (this.root.activeElement?.closest("[data-bout-id]") as HTMLElement | null)?.dataset.boutId;
    this.#list.innerHTML =
      this.#bouts.length === 0
        ? `<p class="empty">${t("history.empty")}</p>`
        : `<div class="bouts">${this.#bouts.map((bout) => this.#row(bout)).join("")}</div><p class="no-results" hidden></p>`;
    this.#searchSlot?.toggleAttribute("hidden", this.#bouts.length === 0);
    this.#applySelection();
    this.#applyFilter();
    if (focusedId !== undefined) {
      this.#rowById(focusedId)?.focus();
    }
  }

  #row(bout: FighterBoutView): string {
    const voided = bout.status === "VOIDED";
    const when = voided
      ? t("history.voided", { reason: escapeHtml(bout.voidReason ?? "") })
      : [formatDateTime(bout.foughtAt), bout.location ? escapeHtml(bout.location) : null].filter(Boolean).join(" · ");
    const resultKey: MessageKey = voided ? "result.void" : RESULT_KEYS[bout.result];
    const resultClass = voided ? "void" : bout.result.toLowerCase();
    const delta = voided
      ? `<span class="delta">—</span>`
      : bout.ratingChange === null
        ? `<span class="delta waiting">${t("history.waiting")}</span>`
        : `<span class="delta ${bout.ratingChange > 0 ? "up" : bout.ratingChange < 0 ? "down" : ""}">${formatSigned(bout.ratingChange)}</span>`;
    const approvals = [
      bout.approvals.referee ? "referee-approved" : "",
      bout.approvals.own ? "fighter-a-approved" : "",
      bout.approvals.opponent ? "fighter-b-approved" : "",
    ].join(" ");

    return `<button type="button" class="bout" data-bout-id="${escapeHtml(bout.boutId)}">
      <bout-seal status="${bout.status}" ${approvals}></bout-seal>
      <span class="what">
        <span class="opponent">${t("history.vs", { name: escapeHtml(bout.opponentName) })}</span>
        <span class="when">${when}</span>
      </span>
      <span class="score">${bout.ownScore}–${bout.opponentScore}</span>
      <span class="outcome"><span class="result ${resultClass}">${t(resultKey)}</span>${delta}</span>
    </button>`;
  }

  #sparkline(history: number[]): string {
    if (history.length === 0) {
      return "";
    }
    const width = 300;
    const height = 44;
    const min = Math.min(...history);
    const max = Math.max(...history);
    const span = Math.max(1, max - min);
    const step = width / Math.max(1, history.length - 1);
    const points = history
      .map((rating, index) => `${(index * step).toFixed(1)},${(height - 4 - ((rating - min) / span) * (height - 8)).toFixed(1)}`)
      .join(" ");
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"></polyline></svg>`;
  }

  #rowById(boutId: string): HTMLElement | undefined {
    return [...this.queryRootAll<HTMLElement>("[data-bout-id]")].find((row) => row.dataset.boutId === boutId);
  }

  #applySelection(): void {
    const selected = this.getAttribute("selected");
    this.queryRootAll<HTMLElement>("[data-bout-id]").forEach((row) => {
      if (row.dataset.boutId === selected) {
        row.setAttribute("aria-current", "true");
      } else {
        row.removeAttribute("aria-current");
      }
    });
  }

  #applyFilter(): void {
    const rows = [...this.queryRootAll<HTMLElement>("[data-bout-id]")];
    let shown = 0;
    for (const row of rows) {
      const bout = this.#bouts.find((candidate) => candidate.boutId === row.dataset.boutId);
      const haystack = bout ? this.#searchText(bout) : "";
      row.hidden = this.#query !== "" && !haystack.includes(this.#query);
      if (!row.hidden) {
        shown++;
      }
    }
    const field = this.root.querySelector("search-field");
    field?.setAttribute("count", String(shown));
    field?.setAttribute("total", String(rows.length));
    const noResults = this.root.querySelector<HTMLElement>(".no-results");
    if (noResults) {
      noResults.hidden = shown > 0 || rows.length === 0;
      noResults.textContent = noResults.hidden ? "" : t("common.noResults", { query: this.#query });
    }
  }

  #searchText(bout: FighterBoutView): string {
    const result = bout.status === "VOIDED" ? t("result.void") : t(RESULT_KEYS[bout.result]);
    return [bout.opponentName, bout.location ?? "", formatDateTime(bout.foughtAt), result, bout.voidReason ?? ""].join(" ").toLowerCase();
  }

  #select(boutId: string): void {
    this.dispatchEvent(new CustomEvent<BoutSelectedDetail>("bout-selected", { bubbles: true, composed: true, detail: { boutId } }));
  }
}

if (!customElements.get("fighter-history")) {
  customElements.define("fighter-history", FighterHistory);
}

declare global {
  interface HTMLElementTagNameMap {
    "fighter-history": FighterHistory;
  }
  interface HTMLElementEventMap {
    "bout-selected": CustomEvent<BoutSelectedDetail>;
  }
}

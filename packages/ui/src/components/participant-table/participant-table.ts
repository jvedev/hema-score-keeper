import css from "./participant-table.css?raw";
import { formatSigned, t } from "../../i18n/i18n.js";
import type { StandingRowView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";
import "../search-field/search-field.js";

export interface ParticipantSelectedDetail {
  participantId: string;
}

const NUMBER_COLUMNS = [
  { col: "bouts", key: "table.bouts", value: (row: StandingRowView) => row.bouts },
  { col: "wins", key: "table.wins", value: (row: StandingRowView) => row.wins },
  { col: "draws", key: "table.draws", value: (row: StandingRowView) => row.draws },
  { col: "losses", key: "table.losses", value: (row: StandingRowView) => row.losses },
] as const;

/**
 * A competition's participants with rating, last change and W/D/L. Options: `show-warnings`,
 * `searchable` (name or club), `selected` (participant id). Fires `participant-selected`.
 *
 * The frame and its listeners are built once per connection; new rows only replace the table,
 * so the search text, the selection and keyboard focus survive refreshes.
 */
export class ParticipantTable extends BaseComponent {
  static readonly observedAttributes = ["show-warnings", "searchable", "selected"];

  #rows: StandingRowView[] = [];
  #query = "";
  #body: HTMLElement | null = null;
  #searchSlot: HTMLElement | null = null;

  get rows(): StandingRowView[] {
    return this.#rows;
  }

  set rows(rows: StandingRowView[]) {
    this.#rows = rows;
    this.#drawBody();
  }

  connectedCallback(): void {
    this.render(css, `<div class="search-slot"></div><div class="body"></div>`);
    this.#searchSlot = this.queryRoot<HTMLElement>(".search-slot");
    this.#body = this.queryRoot<HTMLElement>(".body");

    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const row = (event.target as Element | null)?.closest<HTMLElement>("[data-participant-id]");
      if (row) {
        this.#select(row.dataset.participantId!);
      }
    });
    this.registerEvent<CustomEvent<{ query: string }>>(this.root, "search-changed", (event) => {
      // Our own search; don't let it look like the app's.
      event.stopPropagation();
      this.#query = event.detail.query;
      this.#applyFilter();
    });
    this.onLocaleChange(() => this.#drawBody());

    this.#syncSearch();
    this.#drawBody();
  }

  attributeChangedCallback(name: string): void {
    if (!this.#body) {
      return;
    }
    if (name === "selected") {
      this.#applySelection();
    } else if (name === "searchable") {
      this.#syncSearch();
      this.#applyFilter();
    } else {
      this.#drawBody();
    }
  }

  #syncSearch(): void {
    if (!this.#searchSlot) {
      return;
    }
    const wanted = this.hasAttribute("searchable");
    const existing = this.#searchSlot.querySelector("search-field");
    if (wanted && !existing) {
      this.#searchSlot.innerHTML = "<search-field></search-field>";
    } else if (!wanted && existing) {
      this.#searchSlot.innerHTML = "";
      this.#query = "";
    }
  }

  #drawBody(): void {
    if (!this.#body || !this.isConnected) {
      return;
    }
    const focusedId = (this.root.activeElement?.closest("[data-participant-id]") as HTMLElement | null)?.dataset.participantId;
    const showWarnings = this.hasAttribute("show-warnings");

    this.#body.innerHTML =
      this.#rows.length === 0
        ? `<p class="empty">${t("table.empty")}</p>`
        : `<table>
            <thead><tr>
              <th data-col="position">${t("table.position")}</th>
              <th data-col="fighter">${t("table.fighter")}</th>
              <th data-col="rating">${t("table.rating")}</th>
              ${NUMBER_COLUMNS.map((column) => `<th data-col="${column.col}">${t(column.key)}</th>`).join("")}
              ${showWarnings ? `<th data-col="warnings">${t("table.warnings")}</th>` : ""}
            </tr></thead>
            <tbody>${this.#rows.map((row) => this.#row(row, showWarnings)).join("")}</tbody>
          </table>
          <p class="no-results" hidden></p>`;

    this.#searchSlot?.toggleAttribute("hidden", this.#rows.length === 0);
    this.#applySelection();
    this.#applyFilter();
    if (focusedId !== undefined) {
      this.#rowById(focusedId)?.querySelector("button")?.focus();
    }
  }

  #row(row: StandingRowView, showWarnings: boolean): string {
    const change =
      row.lastChange === null
        ? ""
        : `<span class="change ${row.lastChange > 0 ? "up" : row.lastChange < 0 ? "down" : ""}">${formatSigned(row.lastChange)}</span>`;
    const record = t("table.record", { bouts: row.bouts, wins: row.wins, draws: row.draws, losses: row.losses });
    const warnings = showWarnings && row.warnings > 0 ? ` · ${t("table.warningCount", { count: row.warnings })}` : "";
    return `<tr data-participant-id="${escapeHtml(row.participantId)}">
      <td class="position" data-col="position">${row.position}</td>
      <td data-col="fighter">
        <button type="button" class="select"><span class="name">${escapeHtml(row.name)}</span></button>${row.provisional ? `<span class="provisional">${t("table.provisional")}</span>` : ""}
        ${row.clubName ? `<span class="club">${escapeHtml(row.clubName)}</span>` : ""}
        <span class="record">${record}${warnings}</span>
      </td>
      <td class="rating" data-col="rating">${row.rating}${change}</td>
      ${NUMBER_COLUMNS.map((column) => `<td data-col="${column.col}">${column.value(row)}</td>`).join("")}
      ${showWarnings ? `<td data-col="warnings"><span class="warn${row.warnings === 0 ? " zero" : ""}">${row.warnings}</span></td>` : ""}
    </tr>`;
  }

  #rowById(participantId: string): HTMLElement | undefined {
    return [...this.queryRootAll<HTMLElement>("[data-participant-id]")].find((row) => row.dataset.participantId === participantId);
  }

  #applySelection(): void {
    const selected = this.getAttribute("selected");
    this.queryRootAll<HTMLElement>("[data-participant-id]").forEach((row) => {
      if (row.dataset.participantId === selected) {
        row.setAttribute("aria-current", "true");
      } else {
        row.removeAttribute("aria-current");
      }
    });
  }

  #applyFilter(): void {
    const rows = [...this.queryRootAll<HTMLTableRowElement>("tbody tr")];
    let shown = 0;
    for (const tr of rows) {
      const data = this.#rows.find((row) => row.participantId === tr.dataset.participantId);
      const haystack = `${data?.name ?? ""} ${data?.clubName ?? ""}`.toLowerCase();
      tr.hidden = this.#query !== "" && !haystack.includes(this.#query);
      if (!tr.hidden) {
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

  #select(participantId: string): void {
    this.dispatchEvent(
      new CustomEvent<ParticipantSelectedDetail>("participant-selected", {
        bubbles: true,
        composed: true,
        detail: { participantId },
      }),
    );
  }
}

if (!customElements.get("participant-table")) {
  customElements.define("participant-table", ParticipantTable);
}

declare global {
  interface HTMLElementTagNameMap {
    "participant-table": ParticipantTable;
  }
  interface HTMLElementEventMap {
    "participant-selected": CustomEvent<ParticipantSelectedDetail>;
  }
}

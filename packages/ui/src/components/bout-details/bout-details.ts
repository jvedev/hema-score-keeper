import css from "./bout-details.css?raw";
import { formatDateTime, t, type MessageKey } from "../../i18n/i18n.js";
import type { BoutDetailView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";
import type { BoutExchanges } from "../bout-exchanges/bout-exchanges.js";
import "../bout-exchanges/bout-exchanges.js";
import "../bout-seal/bout-seal.js";
import type { OfficialsGrid } from "../officials-grid/officials-grid.js";
import "../officials-grid/officials-grid.js";

const STATUS_KEYS: Record<BoutDetailView["status"], MessageKey> = {
  SCORED: "seal.scored",
  COUNTED: "seal.counted",
  OBJECTED: "seal.objected",
  FINAL: "seal.final",
  VOIDED: "seal.voided",
};

/**
 * One bout: status, fighters and score, when/where/ruleset/table, referee and jury, any objection
 * or void, and every exchange. Options `show-warnings` and `show-lead-graph` are passed down.
 */
export class BoutDetailsPanel extends BaseComponent {
  static readonly observedAttributes = ["show-warnings", "show-lead-graph"];

  #bout: BoutDetailView | null = null;

  set bout(bout: BoutDetailView | null) {
    this.#bout = bout;
    this.#draw();
  }

  get bout(): BoutDetailView | null {
    return this.#bout;
  }

  connectedCallback(): void {
    this.#draw();
    this.onLocaleChange(() => this.#draw());
  }

  attributeChangedCallback(): void {
    this.#draw();
  }

  #draw(): void {
    const bout = this.#bout;
    if (!this.isConnected || !bout) {
      return;
    }
    const approvals = [
      bout.approvals.referee ? "referee-approved" : "",
      bout.approvals.A ? "fighter-a-approved" : "",
      bout.approvals.B ? "fighter-b-approved" : "",
    ].join(" ");
    const meta: Array<[MessageKey, string | null]> = [
      ["details.when", formatDateTime(bout.startedAt)],
      ["details.where", bout.location ? escapeHtml(bout.location) : null],
      ["details.ruleset", bout.rulesetLabel ? escapeHtml(bout.rulesetLabel) : null],
      ["details.table", bout.officials.table.length > 0 ? bout.officials.table.map((person) => escapeHtml(person.name)).join(", ") : null],
    ];

    this.render(
      css,
      `<p class="status"><bout-seal status="${bout.status}" ${approvals}></bout-seal><span>${t(STATUS_KEYS[bout.status])}</span></p>
      <div class="versus">
        <span class="name">${escapeHtml(bout.fighterA.name)}</span>
        <span class="score">${bout.scoreA}–${bout.scoreB}</span>
        <span class="name">${escapeHtml(bout.fighterB.name)}</span>
      </div>
      ${this.#notice(bout)}
      <dl class="meta">${meta
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `<dt>${t(key)}</dt><dd>${value}</dd>`)
        .join("")}</dl>
      <officials-grid></officials-grid>
      <bout-exchanges ${this.hasAttribute("show-warnings") ? "show-warnings" : ""} ${this.hasAttribute("show-lead-graph") ? "show-lead-graph" : ""}></bout-exchanges>`,
    );

    this.queryRoot<OfficialsGrid>("officials-grid").officials = bout.officials;
    const exchanges = this.queryRoot<BoutExchanges>("bout-exchanges");
    exchanges.fighterNames = { A: bout.fighterA.name, B: bout.fighterB.name };
    exchanges.exchanges = bout.exchanges;
  }

  #notice(bout: BoutDetailView): string {
    let text: string | null = null;
    if (bout.status === "OBJECTED" && bout.objection) {
      const name = escapeHtml((bout.objection.by === "A" ? bout.fighterA : bout.fighterB).name);
      text = bout.objection.reason
        ? t("details.objected", { name, reason: escapeHtml(bout.objection.reason) })
        : t("details.objectedNoReason", { name });
    } else if (bout.status === "VOIDED") {
      text = t("details.voided", { reason: escapeHtml(bout.voidReason ?? "") });
    } else if (bout.status === "COUNTED" && bout.windowEndsAt) {
      text = t("details.windowEnds", { date: formatDateTime(bout.windowEndsAt) });
    }
    return text === null ? "" : `<p class="notice ${bout.status.toLowerCase()}">${text}</p>`;
  }
}

if (!customElements.get("bout-details")) {
  customElements.define("bout-details", BoutDetailsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "bout-details": BoutDetailsPanel;
  }
}

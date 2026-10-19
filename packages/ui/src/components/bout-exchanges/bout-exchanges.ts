import css from "./bout-exchanges.css?raw";
import { t } from "../../i18n/i18n.js";
import type { ExchangeView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";

export interface FighterNames {
  A: string;
  B: string;
}

/**
 * Every exchange of a bout with its clock time and the running score (A–B). Options:
 * `show-warnings` (warning rows with their reason), `show-lead-graph` (who was ahead over time).
 */
export class BoutExchanges extends BaseComponent {
  static readonly observedAttributes = ["show-warnings", "show-lead-graph"];

  #exchanges: ExchangeView[] = [];
  #names: FighterNames = { A: "A", B: "B" };

  set exchanges(exchanges: ExchangeView[]) {
    this.#exchanges = exchanges;
    this.#draw();
  }

  get exchanges(): ExchangeView[] {
    return this.#exchanges;
  }

  set fighterNames(names: FighterNames) {
    this.#names = names;
    this.#draw();
  }

  connectedCallback(): void {
    this.#draw();
    this.onLocaleChange(() => this.#draw());
  }

  attributeChangedCallback(): void {
    this.#draw();
  }

  #draw(): void {
    if (!this.isConnected) {
      return;
    }
    const showWarnings = this.hasAttribute("show-warnings");
    let scoreA = 0;
    let scoreB = 0;
    const lead: number[] = [0];
    const rows: string[] = [];

    for (const exchange of this.#exchanges) {
      if (exchange.kind === "SCORE") {
        if (exchange.side === "A") {
          scoreA += exchange.points;
        } else if (exchange.side === "B") {
          scoreB += exchange.points;
        }
      }
      lead.push(scoreB - scoreA);
      if (exchange.kind === "WARNING" && !showWarnings) {
        continue;
      }
      rows.push(
        `<div class="exchange ${exchange.kind.toLowerCase()}${exchange.side ? ` side-${exchange.side.toLowerCase()}` : ""}">
          <span class="time">${clock(exchange.atSeconds)}</span>
          <span class="text">${this.#text(exchange)}</span>
          <span class="running">${scoreA}–${scoreB}</span>
        </div>`,
      );
    }

    const graph = this.hasAttribute("show-lead-graph") && this.#exchanges.length > 0 ? this.#graph(lead) : "";
    const list = rows.length > 0 ? `<div class="list">${rows.join("")}</div>` : `<p class="empty">${t("exchange.empty")}</p>`;
    this.render(css, `${graph}${list}`);
  }

  #text(exchange: ExchangeView): string {
    const name = exchange.side ? escapeHtml(this.#names[exchange.side]) : "";
    switch (exchange.kind) {
      case "SCORE":
        return t("exchange.score", { name, points: exchange.points });
      case "DOUBLE":
        return t("exchange.double");
      case "WARNING": {
        const text = exchange.reason
          ? t("exchange.warning", { name, reason: escapeHtml(exchange.reason) })
          : t("exchange.warningNoReason", { name });
        return `${text}<span class="tag">${t("exchange.warningTag")}</span>`;
      }
      case "TIME":
        return t("exchange.time");
    }
  }

  /** A line of (B − A) per exchange: up means fighter B ahead. */
  #graph(lead: number[]): string {
    const width = 300;
    const height = 56;
    const middle = height / 2;
    const span = Math.max(1, ...lead.map(Math.abs));
    const step = width / Math.max(1, lead.length - 1);
    const points = lead.map((value, index) => `${(index * step).toFixed(1)},${(middle - (value / span) * (middle - 8)).toFixed(1)}`).join(" ");
    return `<svg class="lead" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-hidden="true">
      <line x1="0" y1="${middle}" x2="${width}" y2="${middle}"></line>
      <text x="2" y="9">${t("exchange.ahead", { name: escapeHtml(this.#names.B) })}</text>
      <text x="2" y="${height - 2}">${t("exchange.ahead", { name: escapeHtml(this.#names.A) })}</text>
      <polyline points="${points}"></polyline>
    </svg>`;
  }
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

if (!customElements.get("bout-exchanges")) {
  customElements.define("bout-exchanges", BoutExchanges);
}

declare global {
  interface HTMLElementTagNameMap {
    "bout-exchanges": BoutExchanges;
  }
}

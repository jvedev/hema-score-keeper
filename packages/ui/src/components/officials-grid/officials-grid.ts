import css from "./officials-grid.css?raw";
import { t } from "../../i18n/i18n.js";
import type { OfficialsView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";

/**
 * Referee and jury in two columns, only as many rows as needed. A dashed blank squares off an
 * odd last row, except that a referee alone or with one jury member never gets one.
 */
export class OfficialsGrid extends BaseComponent {
  #officials: OfficialsView | null = null;

  get officials(): OfficialsView | null {
    return this.#officials;
  }

  set officials(officials: OfficialsView | null) {
    this.#officials = officials;
    this.#draw();
  }

  connectedCallback(): void {
    this.#draw();
    this.onLocaleChange(() => this.#draw());
  }

  #draw(): void {
    if (!this.isConnected || !this.#officials) {
      return;
    }
    const { referee, jury } = this.#officials;
    const cell = (role: string, name: string, extraClass = "") =>
      `<div class="official${extraClass}"><span class="role">${role}</span><span class="name">${escapeHtml(name)}</span></div>`;
    const cells = [
      cell(t("officials.referee"), referee.name, " referee"),
      ...jury.map((member, index) =>
        cell(jury.length === 1 ? t("officials.jury") : t("officials.juryN", { n: index + 1 }), member.name),
      ),
    ];
    const filler = cells.length > 1 && cells.length % 2 === 1 ? `<div class="filler" aria-hidden="true"></div>` : "";
    this.render(css, `<div class="grid">${cells.join("")}${filler}</div>`);
  }
}

if (!customElements.get("officials-grid")) {
  customElements.define("officials-grid", OfficialsGrid);
}

declare global {
  interface HTMLElementTagNameMap {
    "officials-grid": OfficialsGrid;
  }
}

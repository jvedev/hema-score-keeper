import css from "./needs-you-list.css?raw";
import { formatAge, t, type MessageKey } from "../../i18n/i18n.js";
import type { NeedsYouItemView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";
import "../bout-seal/bout-seal.js";

const GROUPS: ReadonlyArray<{ kind: NeedsYouItemView["kind"]; heading: MessageKey; seal: string }> = [
  { kind: "objection", heading: "needsYou.objections", seal: 'status="OBJECTED" referee-approved' },
  { kind: "awaiting-referee", heading: "needsYou.awaitingReferee", seal: 'status="SCORED"' },
];

/** What needs the admin, grouped and oldest first. Fires `needs-you-selected`. Renders nothing when empty. */
export class NeedsYouList extends BaseComponent {
  #items: NeedsYouItemView[] = [];
  /** Clock used for ages; tests set it. */
  now: Date | null = null;

  set items(items: NeedsYouItemView[]) {
    this.#items = items;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-bout-id]");
      if (row) {
        this.dispatchEvent(
          new CustomEvent("needs-you-selected", {
            bubbles: true,
            composed: true,
            detail: { boutId: row.dataset.boutId!, kind: row.dataset.kind as NeedsYouItemView["kind"] },
          }),
        );
      }
    });
    this.onLocaleChange(() => this.#draw());
    this.#draw();
  }

  #draw(): void {
    if (!this.isConnected) {
      return;
    }
    const now = this.now ?? new Date();
    const html = GROUPS.map(({ kind, heading, seal }) => {
      const items = this.#items.filter((item) => item.kind === kind);
      if (items.length === 0) {
        return "";
      }
      return `<section class="group">
        <h3>${t(heading, { count: items.length })}</h3>
        ${items
          .map(
            (item) => `<button type="button" class="item" data-bout-id="${escapeHtml(item.boutId)}" data-kind="${kind}">
              <bout-seal ${seal}></bout-seal>
              <span class="score">${item.scoreA}–${item.scoreB}</span>
              <span class="what">
                <span class="names">${escapeHtml(item.fighterA)} – ${escapeHtml(item.fighterB)}</span>
                <span class="detail">${escapeHtml(item.detail)} · ${escapeHtml(item.competitionName)}</span>
              </span>
              <span class="age">${formatAge(item.since, now)}</span>
            </button>`,
          )
          .join("")}
      </section>`;
    }).join("");
    this.render(css, html);
  }
}

if (!customElements.get("needs-you-list")) {
  customElements.define("needs-you-list", NeedsYouList);
}

declare global {
  interface HTMLElementTagNameMap {
    "needs-you-list": NeedsYouList;
  }
  interface HTMLElementEventMap {
    "needs-you-selected": CustomEvent<{ boutId: string; kind: NeedsYouItemView["kind"] }>;
  }
}

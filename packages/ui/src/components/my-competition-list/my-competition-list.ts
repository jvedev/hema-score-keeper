import css from "./my-competition-list.css?raw";
import { formatSigned, t, type MessageKey } from "../../i18n/i18n.js";
import type { MyCompetitionView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { toNumber } from "../../utils/to-number.js";
import { BaseComponent } from "../base-component/base-component.js";

export interface MyCompetitionSelectedDetail {
  competitionId: string;
}

const STATUS_ATTRIBUTES = ["ACTIVE", "PENDING", "LEFT"];

/**
 * The competitions a fighter takes part in: my rank, rating and last change, or a chip while the
 * sign-up is pending or after leaving. Fires `competition-selected` with `{ competitionId }`.
 */
export class MyCompetitionList extends BaseComponent {
  #items: MyCompetitionView[] = [];

  set items(items: MyCompetitionView[]) {
    this.#items = items;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>("[data-competition-id]");
      if (card) {
        this.dispatchEvent(
          new CustomEvent<MyCompetitionSelectedDetail>("competition-selected", {
            bubbles: true,
            composed: true,
            detail: { competitionId: card.dataset.competitionId! },
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
    const body =
      this.#items.length === 0
        ? `<p class="empty">${t("myCompetitions.empty")}</p>`
        : `<div class="cards">${this.#items.map((item) => this.#card(item)).join("")}</div>`;
    this.render(css, body);
  }

  #card(item: MyCompetitionView): string {
    const status = STATUS_ATTRIBUTES.includes(item.myStatus) ? item.myStatus : "ACTIVE";
    const chip =
      status === "PENDING"
        ? `<span class="chip pending">${t("myCompetitions.pending")}</span>`
        : status === "LEFT"
          ? `<span class="chip left">${t("myCompetitions.left")}</span>`
          : "";
    const standing = status === "PENDING" ? "" : this.#standing(item);
    return `<button type="button" class="card ${status.toLowerCase()}" data-competition-id="${escapeHtml(item.id)}">
      <span class="text">
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="meta">${escapeHtml(t(`lifecycle.${item.status}` as MessageKey))}${chip ? ` ${chip}` : ""}</span>
      </span>
      ${standing}
    </button>`;
  }

  #standing(item: MyCompetitionView): string {
    if (item.rank === null && item.rating === null) {
      return "";
    }
    const rank = item.rank === null ? "" : `<span class="rank">${t("myCompetitions.rank", { rank: toNumber(item.rank) })}</span>`;
    const change =
      item.lastChange === null
        ? ""
        : (() => {
            const value = toNumber(item.lastChange);
            return `<span class="change ${value > 0 ? "up" : value < 0 ? "down" : ""}">${formatSigned(value)}</span>`;
          })();
    const rating = item.rating === null ? "" : `<span class="rating">${toNumber(item.rating)}${change}</span>`;
    return `<span class="standing">${rank}${rating}</span>`;
  }
}

if (!customElements.get("my-competition-list")) {
  customElements.define("my-competition-list", MyCompetitionList);
}

declare global {
  interface HTMLElementTagNameMap {
    "my-competition-list": MyCompetitionList;
  }
  interface HTMLElementEventMap {
    "competition-selected": CustomEvent<MyCompetitionSelectedDetail>;
  }
}

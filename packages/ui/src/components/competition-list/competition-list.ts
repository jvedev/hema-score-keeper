import css from "./competition-list.css?raw";
import { t, type MessageKey } from "../../i18n/i18n.js";
import type { CompetitionListItemView, LifecycleStatusView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";

const ORDER: readonly LifecycleStatusView[] = ["DRAFT", "REGISTRATION_OPEN", "RUNNING", "CLOSED", "ARCHIVED"];

/**
 * The admin's competitions grouped by lifecycle (Draft first, Archived folded away).
 * Fires `competition-selected` and `competition-create-requested`.
 */
export class CompetitionList extends BaseComponent {
  static readonly observedAttributes = ["selected"];

  #items: CompetitionListItemView[] = [];
  #showArchived = false;

  set items(items: CompetitionListItemView[]) {
    this.#items = items;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const target = event.target as HTMLElement;
      const card = target.closest<HTMLElement>("[data-competition-id]");
      if (card) {
        this.#emit("competition-selected", { competitionId: card.dataset.competitionId! });
      } else if (target.closest("button.show-archived")) {
        this.#showArchived = !this.#showArchived;
        this.#draw();
      } else if (target.closest("button.create")) {
        this.#emit("competition-create-requested", undefined);
      }
    });
    this.onLocaleChange(() => this.#draw());
    this.#draw();
  }

  attributeChangedCallback(): void {
    const selected = this.getAttribute("selected");
    this.queryRootAll<HTMLElement>("[data-competition-id]").forEach((card) => {
      if (card.dataset.competitionId === selected) {
        card.setAttribute("aria-current", "true");
      } else {
        card.removeAttribute("aria-current");
      }
    });
  }

  #draw(): void {
    if (!this.isConnected) {
      return;
    }
    const groups = ORDER.map((status) => ({ status, items: this.#items.filter((item) => item.status === status) })).filter(
      (group) => group.items.length > 0,
    );
    const body =
      groups.length === 0
        ? `<p class="empty">${t("competitions.empty")}</p>`
        : groups
            .map((group) => {
              const archived = group.status === "ARCHIVED";
              const heading = t("competitions.group", { label: t(`lifecycle.${group.status}` as MessageKey), count: group.items.length });
              const toggle = archived
                ? `<button type="button" class="show-archived">${this.#showArchived ? t("competitions.hideArchived") : t("competitions.showArchived", { count: group.items.length })}</button>`
                : "";
              return `<section class="group ${group.status.toLowerCase()}">
                <h3><span class="dot" aria-hidden="true"></span>${heading}</h3>
                ${toggle}
                <div class="cards" ${archived && !this.#showArchived ? "hidden" : ""}>${group.items.map((item) => this.#card(item)).join("")}</div>
              </section>`;
            })
            .join("");
    this.render(css, `${body}<button type="button" class="create">${t("competitions.create")}</button>`);
    this.attributeChangedCallback();
  }

  #card(item: CompetitionListItemView): string {
    const open = item.status === "RUNNING" && item.openBouts > 0 ? `<span class="open">${t("competitions.open", { count: item.openBouts })}</span>` : "";
    return `<button type="button" class="card" data-competition-id="${escapeHtml(item.id)}">
      <span class="text">
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="meta"><span class="scope">${escapeHtml(item.scopeLabel)}</span> ${escapeHtml(item.meta)}</span>
      </span>
      ${open}
    </button>`;
  }

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }
}

if (!customElements.get("competition-list")) {
  customElements.define("competition-list", CompetitionList);
}

declare global {
  interface HTMLElementTagNameMap {
    "competition-list": CompetitionList;
  }
  interface HTMLElementEventMap {
    "competition-selected": CustomEvent<{ competitionId: string }>;
    "competition-create-requested": CustomEvent<undefined>;
  }
}

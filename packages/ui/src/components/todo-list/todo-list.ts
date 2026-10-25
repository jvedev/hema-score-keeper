import css from "./todo-list.css?raw";
import { formatAge, t, type MessageKey } from "../../i18n/i18n.js";
import type { TodoItemView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { toNumber } from "../../utils/to-number.js";
import { BaseComponent } from "../base-component/base-component.js";
import "../bout-seal/bout-seal.js";

export interface TodoActionDetail {
  boutId: string;
}

type TodoAction = "approve" | "object" | "withdraw" | "referee-approve";

const EVENTS: Record<TodoAction, string> = {
  approve: "todo-approve",
  object: "todo-object",
  withdraw: "todo-withdraw",
  "referee-approve": "todo-referee-approve",
};

const KINDS: Record<
  TodoItemView["kind"],
  { seal: string; note: MessageKey; actions: ReadonlyArray<{ action: TodoAction; label: MessageKey; primary: boolean }> }
> = {
  approve: {
    seal: 'status="COUNTED" referee-approved',
    note: "todo.kind.approve",
    actions: [
      { action: "approve", label: "todo.approve", primary: true },
      { action: "object", label: "todo.object", primary: false },
    ],
  },
  objection: {
    seal: 'status="OBJECTED" referee-approved',
    note: "todo.kind.objection",
    actions: [{ action: "withdraw", label: "todo.withdraw", primary: false }],
  },
  referee: {
    seal: 'status="SCORED"',
    note: "todo.kind.referee",
    actions: [{ action: "referee-approve", label: "todo.refereeApprove", primary: true }],
  },
};

/**
 * What a fighter has to do, in the given order (the app sorts oldest first). Renders nothing when empty.
 * Fires `todo-approve`, `todo-object`, `todo-withdraw` and `todo-referee-approve`, each with `{ boutId }`.
 */
export class TodoList extends BaseComponent {
  #items: TodoItemView[] = [];
  /** Clock used for ages; tests set it. */
  now: Date | null = null;

  set items(items: TodoItemView[]) {
    this.#items = items;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-action]");
      const item = button?.closest<HTMLElement>("[data-bout-id]");
      const action = button?.dataset.action as TodoAction | undefined;
      if (button && item && action && action in EVENTS) {
        this.dispatchEvent(
          new CustomEvent<TodoActionDetail>(EVENTS[action], { bubbles: true, composed: true, detail: { boutId: item.dataset.boutId! } }),
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
    if (this.#items.length === 0) {
      this.render(css, "");
      return;
    }
    const now = this.now ?? new Date();
    const rows = this.#items
      .map((item) => {
        const kind = KINDS[item.kind];
        const competition = item.competitionName ? ` · ${escapeHtml(item.competitionName)}` : "";
        const names = item.kind === "referee" ? escapeHtml(item.opponentName) : t("todo.vs", { name: escapeHtml(item.opponentName) });
        return `<li class="item" data-bout-id="${escapeHtml(item.boutId)}" data-kind="${item.kind}">
          <bout-seal ${kind.seal}></bout-seal>
          <span class="score">${toNumber(item.ownScore)}–${toNumber(item.opponentScore)}</span>
          <span class="what">
            <span class="names">${names}</span>
            <span class="detail">${t(kind.note)}${competition}</span>
          </span>
          <span class="age">${formatAge(item.since, now)}</span>
          <span class="actions">${kind.actions
            .map(({ action, label, primary }) => `<button type="button" class="${primary ? "primary" : "secondary"}" data-action="${action}">${t(label)}</button>`)
            .join("")}</span>
        </li>`;
      })
      .join("");
    this.render(css, `<h3>${t("todo.heading", { count: this.#items.length })}</h3><ul>${rows}</ul>`);
  }
}

if (!customElements.get("todo-list")) {
  customElements.define("todo-list", TodoList);
}

declare global {
  interface HTMLElementTagNameMap {
    "todo-list": TodoList;
  }
  interface HTMLElementEventMap {
    "todo-approve": CustomEvent<TodoActionDetail>;
    "todo-object": CustomEvent<TodoActionDetail>;
    "todo-withdraw": CustomEvent<TodoActionDetail>;
    "todo-referee-approve": CustomEvent<TodoActionDetail>;
  }
}

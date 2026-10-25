import css from "./join-card.css?raw";
import { t, type MessageKey } from "../../i18n/i18n.js";
import type { JoinCardView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { toNumber } from "../../utils/to-number.js";
import { BaseComponent } from "../base-component/base-component.js";

const ENDED_STATUSES: ReadonlySet<string> = new Set(["CLOSED", "ARCHIVED"]);

export interface JoinCardDetail {
  competitionId: string;
}

/**
 * Summary of a competition a fighter can join: scope line, place info and a Join or Leave button
 * (with a pending state; no Leave once the competition is closed or archived). Attribute `busy` disables the buttons while the app talks to the server.
 * Fires `join-requested` and `leave-requested` with `{ competitionId }`.
 */
export class JoinCard extends BaseComponent {
  static readonly observedAttributes = ["busy"];

  #competition: JoinCardView | null = null;

  set competition(competition: JoinCardView | null) {
    this.#competition = competition;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-action]");
      if (!button || button.disabled || !this.#competition) {
        return;
      }
      const type = button.dataset.action === "join" ? "join-requested" : button.dataset.action === "leave" ? "leave-requested" : null;
      if (type) {
        this.dispatchEvent(
          new CustomEvent<JoinCardDetail>(type, { bubbles: true, composed: true, detail: { competitionId: this.#competition.id } }),
        );
      }
    });
    this.onLocaleChange(() => this.#draw());
    this.#draw();
  }

  attributeChangedCallback(): void {
    this.#syncBusy();
  }

  #syncBusy(): void {
    const busy = this.hasAttribute("busy");
    this.root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = busy;
    });
  }

  #draw(): void {
    if (!this.isConnected) {
      return;
    }
    const competition = this.#competition;
    if (!competition) {
      this.render(css, "");
      return;
    }
    const mine = competition.myStatus;
    const places =
      competition.placesLeft === null
        ? t("join.noLimit")
        : toNumber(competition.placesLeft) === 1
          ? t("join.placeLeft")
          : t("join.placesLeft", { count: toNumber(competition.placesLeft) });
    let state = "";
    let button = "";
    if (mine === "ACTIVE") {
      state = t("join.in");
      // A closed or archived competition is over: nobody leaves it any more.
      button = ENDED_STATUSES.has(competition.status) ? "" : this.#button("leave", "join.leave", false);
    } else if (mine === "PENDING") {
      state = t("join.pending");
      button = this.#button("leave", "join.withdraw", false);
    } else if (!competition.joinable) {
      state = t("join.notOpen");
    } else {
      button = this.#button("join", "join.join", true);
    }
    this.render(
      css,
      `<article class="card">
        <header>
          <h3 class="name">${escapeHtml(competition.name)}</h3>
          <span class="status">${escapeHtml(t(`lifecycle.${competition.status}` as MessageKey))}</span>
        </header>
        <p class="scope">${t("join.scope", { scope: escapeHtml(competition.scopeLabel) })}</p>
        <p class="places">${places}</p>
        ${competition.signupsNeedApproval ? `<p class="approval">${t("join.needsApproval")}</p>` : ""}
        ${state ? `<p class="state">${state}</p>` : ""}
        ${button}
      </article>`,
    );
    this.#syncBusy();
  }

  #button(action: "join" | "leave", label: MessageKey, primary: boolean): string {
    return `<button type="button" class="${primary ? "primary" : "secondary"}" data-action="${action}">${t(label)}</button>`;
  }
}

if (!customElements.get("join-card")) {
  customElements.define("join-card", JoinCard);
}

declare global {
  interface HTMLElementTagNameMap {
    "join-card": JoinCard;
  }
  interface HTMLElementEventMap {
    "join-requested": CustomEvent<JoinCardDetail>;
    "leave-requested": CustomEvent<JoinCardDetail>;
  }
}

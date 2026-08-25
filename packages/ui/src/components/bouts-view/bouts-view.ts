import css from "./bouts-view.css?raw";
import html from "./bouts-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface BoutSummary {
  id: string;
  opponentName: string;
  scoreForParticipant: number;
  scoreForOpponent: number;
  result: "win" | "loss" | "draw";
  date: string;
}

export interface BoutsViewConfig {
  loading: boolean;
  error: string | null;
  participantName: string;
  bouts: readonly BoutSummary[];
}

export class BoutsView extends BaseComponent {
  #config: BoutsViewConfig = {
    loading: true,
    error: null,
    participantName: "",
    bouts: [],
  };

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: BoutsViewConfig): void {
    this.#config = config;
    this.#render();
  }

  #render(): void {
    this.render(css, html);
    this.queryRoot<HTMLElement>("#participant-name").textContent = this.#config.participantName;

    this.registerEvent(this.queryRoot<HTMLButtonElement>("#back-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("back-requested", { bubbles: true }));
    });
    this.registerEvent(this.queryRoot<HTMLButtonElement>("#new-bout-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("new-bout-requested", { bubbles: true }));
    });

    const message = this.queryRoot<HTMLElement>("#message");
    const list = this.queryRoot<HTMLElement>("#bout-list");
    list.replaceChildren();
    message.textContent = "";
    message.classList.remove("is-error");

    if (this.#config.loading) {
      message.textContent = "Loading bouts...";
      return;
    }
    if (this.#config.error) {
      message.textContent = this.#config.error;
      message.classList.add("is-error");
      return;
    }
    if (this.#config.bouts.length === 0) {
      message.textContent = "No bouts recorded yet.";
      return;
    }

    for (const bout of this.#config.bouts) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `bout-row bout-row-${bout.result}`;

      const opponent = document.createElement("strong");
      opponent.textContent = `vs ${bout.opponentName}`;
      const score = document.createElement("span");
      score.className = "bout-score";
      score.textContent = `${bout.scoreForParticipant} – ${bout.scoreForOpponent}`;
      const date = document.createElement("span");
      date.className = "bout-date";
      date.textContent = bout.date;

      row.append(opponent, score, date);
      this.registerEvent(row, "click", () => {
        this.dispatchEvent(
          new CustomEvent("bout-selected", { bubbles: true, detail: { boutId: bout.id } }),
        );
      });
      list.append(row);
    }
  }
}

if (!customElements.get("bouts-view")) {
  customElements.define("bouts-view", BoutsView);
}

declare global {
  interface HTMLElementEventMap {
    "new-bout-requested": CustomEvent<void>;
  }

  interface HTMLElementTagNameMap {
    "bouts-view": BoutsView;
  }
}

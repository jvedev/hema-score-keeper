import css from "./ranking-view.css?raw";
import html from "./ranking-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface RankingEntry {
  participantId: string;
  position: number;
  name: string;
  rating: number;
}

export interface RankingViewConfig {
  loading: boolean;
  error: string | null;
  competitionName: string;
  entries: readonly RankingEntry[];
}

export class RankingView extends BaseComponent {
  #config: RankingViewConfig = {
    loading: true,
    error: null,
    competitionName: "",
    entries: [],
  };

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: RankingViewConfig): void {
    this.#config = config;
    this.#render();
  }

  #render(): void {
    this.render(css, html);
    this.queryRoot<HTMLElement>("#competition-name").textContent = this.#config.competitionName;

    this.registerEvent(this.queryRoot<HTMLButtonElement>("#back-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("back-requested", { bubbles: true }));
    });
    this.registerEvent(this.queryRoot<HTMLButtonElement>("#view-participants-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("view-participants-requested", { bubbles: true }));
    });
    const refreshButton = this.queryRoot<HTMLButtonElement>("#refresh-button");
    refreshButton.disabled = this.#config.loading;
    this.registerEvent(refreshButton, "click", () => {
      this.dispatchEvent(new CustomEvent("refresh-requested", { bubbles: true }));
    });
    this.registerEvent(this.queryRoot<HTMLButtonElement>("#new-bout-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("new-bout-requested", { bubbles: true }));
    });

    const message = this.queryRoot<HTMLElement>("#message");
    const list = this.queryRoot<HTMLElement>("#ranking-list");
    list.replaceChildren();
    message.textContent = "";
    message.classList.remove("is-error");

    if (this.#config.loading) {
      message.textContent = "Loading ranking...";
      return;
    }
    if (this.#config.error) {
      message.textContent = this.#config.error;
      message.classList.add("is-error");
      return;
    }
    if (this.#config.entries.length === 0) {
      message.textContent = "No ranked participants yet.";
      return;
    }

    for (const entry of this.#config.entries) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ranking-row";

      const position = document.createElement("span");
      position.className = "ranking-position";
      position.textContent = `#${entry.position}`;

      const name = document.createElement("strong");
      name.textContent = entry.name;

      const rating = document.createElement("span");
      rating.className = "ranking-rating";
      rating.textContent = String(entry.rating);

      row.append(position, name, rating);
      this.registerEvent(row, "click", () => {
        this.dispatchEvent(
          new CustomEvent("participant-selected", {
            bubbles: true,
            detail: { participantId: entry.participantId },
          }),
        );
      });
      list.append(row);
    }
  }
}

if (!customElements.get("ranking-view")) {
  customElements.define("ranking-view", RankingView);
}

declare global {
  interface HTMLElementEventMap {
    "participant-selected": CustomEvent<{ participantId: string }>;
    "back-requested": CustomEvent<void>;
    "view-participants-requested": CustomEvent<void>;
    "new-bout-requested": CustomEvent<void>;
    "refresh-requested": CustomEvent<void>;
  }

  interface HTMLElementTagNameMap {
    "ranking-view": RankingView;
  }
}

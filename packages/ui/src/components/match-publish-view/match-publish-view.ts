import css from "./match-publish-view.css?raw";
import html from "./match-publish-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";
import "../confirm-button/confirm-button.js";

export interface MatchPublishConfig {
  fighterAName: string;
  fighterBName: string;
  scoreA: number;
  scoreB: number;
  winnerName: string | null;
}

export class MatchPublishView extends BaseComponent {
  #config: MatchPublishConfig = {
    fighterAName: "",
    fighterBName: "",
    scoreA: 0,
    scoreB: 0,
    winnerName: null,
  };
  #publishing = false;
  #error: string | null = null;
  #confirmButton?: HTMLElement;
  #declineButton?: HTMLButtonElement;
  #errorMessage?: HTMLElement;

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: MatchPublishConfig): void {
    this.#config = config;
    this.#publishing = false;
    this.#error = null;
    this.#render();
  }

  setPublishing(isPublishing: boolean): void {
    this.#publishing = isPublishing;
    this.#applyStatus();
  }

  setError(message: string | null): void {
    this.#error = message;
    this.#applyStatus();
  }

  #applyStatus(): void {
    this.#confirmButton?.toggleAttribute("disabled", this.#publishing);
    if (this.#declineButton) this.#declineButton.disabled = this.#publishing;
    if (this.#errorMessage) {
      this.#errorMessage.textContent = this.#error ?? "";
      this.#errorMessage.hidden = !this.#error;
    }
  }

  #render(): void {
    this.render(css, html);
    const config = this.#config;
    this.queryRoot<HTMLElement>("#fighter-a-name").textContent = config.fighterAName;
    this.queryRoot<HTMLElement>("#fighter-b-name").textContent = config.fighterBName;
    this.queryRoot<HTMLElement>("#score-a").textContent = String(config.scoreA);
    this.queryRoot<HTMLElement>("#score-b").textContent = String(config.scoreB);
    this.queryRoot<HTMLElement>("#winner").textContent = config.winnerName
      ? `Winner: ${config.winnerName}`
      : "Draw";

    this.#confirmButton = this.queryRoot("confirm-button");
    this.#declineButton = this.queryRoot<HTMLButtonElement>("#decline-button");
    this.#errorMessage = this.queryRoot<HTMLElement>("#error-message");
    this.#applyStatus();

    this.registerEvent(this.#declineButton, "click", () => {
      this.dispatchEvent(new CustomEvent("decline-requested", { bubbles: true }));
    });
    this.registerEvent(this.#confirmButton, "confirmed", () => {
      this.dispatchEvent(new CustomEvent("publish-requested", { bubbles: true }));
    });
  }
}

if (!customElements.get("match-publish-view")) {
  customElements.define("match-publish-view", MatchPublishView);
}

declare global {
  interface HTMLElementEventMap {
    "publish-requested": CustomEvent<void>;
    "decline-requested": CustomEvent<void>;
  }

  interface HTMLElementTagNameMap {
    "match-publish-view": MatchPublishView;
  }
}

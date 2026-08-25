import css from "./bout-details-view.css?raw";
import html from "./bout-details-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface BoutDetails {
  id: string;
  fighterAName: string;
  fighterBName: string;
  scoreA: number;
  scoreB: number;
  winnerName: string | null;
  date: string;
}

export interface BoutDetailsConfig {
  loading: boolean;
  error: string | null;
  bout: BoutDetails | null;
}

export class BoutDetailsView extends BaseComponent {
  #config: BoutDetailsConfig = { loading: true, error: null, bout: null };

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: BoutDetailsConfig): void {
    this.#config = config;
    this.#render();
  }

  #render(): void {
    this.render(css, html);
    this.registerEvent(this.queryRoot<HTMLButtonElement>("#back-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("back-requested", { bubbles: true }));
    });

    const message = this.queryRoot<HTMLElement>("#message");
    const summary = this.queryRoot<HTMLElement>("#summary");
    message.textContent = "";
    message.classList.remove("is-error");
    summary.hidden = true;

    if (this.#config.loading) {
      message.textContent = "Loading bout...";
      return;
    }
    if (this.#config.error) {
      message.textContent = this.#config.error;
      message.classList.add("is-error");
      return;
    }

    const bout = this.#config.bout;
    if (!bout) {
      message.textContent = "Bout not found.";
      return;
    }

    summary.hidden = false;
    const fighterAName = this.queryRoot<HTMLElement>("#fighter-a-name");
    const fighterBName = this.queryRoot<HTMLElement>("#fighter-b-name");
    fighterAName.textContent = bout.fighterAName;
    fighterBName.textContent = bout.fighterBName;
    this.queryRoot<HTMLElement>("#score-a").textContent = String(bout.scoreA);
    this.queryRoot<HTMLElement>("#score-b").textContent = String(bout.scoreB);
    this.queryRoot<HTMLElement>("#date").textContent = bout.date;
    this.queryRoot<HTMLElement>("#winner").textContent = bout.winnerName
      ? `Winner: ${bout.winnerName}`
      : "Draw";
    fighterAName.classList.toggle("is-winner", bout.winnerName === bout.fighterAName);
    fighterBName.classList.toggle("is-winner", bout.winnerName === bout.fighterBName);
  }
}

if (!customElements.get("bout-details-view")) {
  customElements.define("bout-details-view", BoutDetailsView);
}

declare global {
  interface HTMLElementTagNameMap {
    "bout-details-view": BoutDetailsView;
  }
}

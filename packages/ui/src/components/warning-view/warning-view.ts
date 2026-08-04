import css from "./warning-view.css?raw";
import html from "./warning-view.html?raw";
import { BaseComponent } from "../base-component/base-component";
import {
  dispatchMatchEvent,
  type FighterIdentifier,
} from "../../events/match-event";
import "../confirm-button/confirm-button";

interface WarningFighter {
  name: string;
  backgroundColor: string;
  textColor: string;
}

export interface WarningPenalty {
  description: string;
  penalties: number[];
  disqualify: boolean;
}

export interface WarningViewConfig {
  fighterA: WarningFighter;
  fighterB: WarningFighter;
  penalties: WarningPenalty[];
}

type WizardStep = "fighter" | "penalty" | "deduction";

export class WarningView extends BaseComponent {
  #config: WarningViewConfig = {
    fighterA: {
      name: "Fighter A",
      backgroundColor: "#21c15b",
      textColor: "#071a0d",
    },
    fighterB: {
      name: "Fighter B",
      backgroundColor: "#2f7dfa",
      textColor: "#ffffff",
    },
    penalties: [],
  };
  #step: WizardStep = "fighter";
  #fighter: FighterIdentifier | undefined;
  #penalty: WarningPenalty | undefined;
  #pointsDeducted: number | undefined;
  #elapsedTimeSeconds = 0;

  connectedCallback(): void {
    this.render(css, html);
    this.registerEvent(this.queryRoot(".cancel"), "click", () => this.close());
    this.registerEvent(this.queryRoot(".back"), "click", () => this.#back());
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: WarningViewConfig): void {
    this.#config = {
      ...config,
      penalties: config.penalties.map((penalty) => ({
        ...penalty,
        penalties: [...penalty.penalties],
      })),
    };
    this.#applyFighterStyles();
    if (this.isConnected) this.#render();
  }

  open(elapsedTimeSeconds: number): void {
    this.#elapsedTimeSeconds = Math.max(0, elapsedTimeSeconds);
    this.#step = "fighter";
    this.#fighter = undefined;
    this.#penalty = undefined;
    this.#pointsDeducted = undefined;
    this.#render();
    this.setAttribute("open", "");
  }

  close(): void {
    this.removeAttribute("open");
  }

  #render(): void {
    const labels: Record<WizardStep, string> = {
      fighter: "1 / 3 · Choose fighter",
      penalty: "2 / 3 · Choose warning",
      deduction: "3 / 3 · Choose penalty",
    };
    this.queryRoot(".step-label").textContent = labels[this.#step];
    this.queryRoot<HTMLButtonElement>(".back").hidden = this.#step === "fighter";

    if (this.#step === "fighter") this.#renderFighters();
    else if (this.#step === "penalty") this.#renderPenalties();
    else this.#renderDeductions();
  }

  #renderFighters(): void {
    const content = this.queryRoot<HTMLElement>(".content");
    const grid = document.createElement("div");
    grid.className = "fighter-grid";
    grid.append(
      this.#button(this.#config.fighterA.name, "fighter-a", () => {
        this.#fighter = "A";
        this.#step = "penalty";
        this.#render();
      }),
      this.#button(this.#config.fighterB.name, "fighter-b", () => {
        this.#fighter = "B";
        this.#step = "penalty";
        this.#render();
      }),
    );
    content.replaceChildren(grid);
  }

  #renderPenalties(): void {
    const content = this.queryRoot<HTMLElement>(".content");
    content.replaceChildren(
      ...this.#config.penalties.map((penalty) =>
        this.#button(penalty.description, "penalty-option", () => {
          this.#penalty = penalty;
          this.#pointsDeducted = undefined;
          this.#step = "deduction";
          this.#render();
        }),
      ),
    );
  }

  #renderDeductions(): void {
    if (!this.#penalty) throw new Error("A warning must be selected.");
    const content = this.queryRoot<HTMLElement>(".content");
    const elements: HTMLElement[] = this.#penalty.penalties.map((points) =>
      this.#button(
        `${points} ${points === 1 ? "point" : "points"}`,
        `deduction-option${this.#pointsDeducted === points ? " selected" : ""}`,
        () => {
          this.#pointsDeducted = points;
          this.#renderDeductions();
        },
      ),
    );
    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    if (this.#pointsDeducted !== undefined) {
      const confirm = document.createElement("confirm-button");
      confirm.setAttribute("label", "Register warning");
      confirm.setAttribute("confirm-label", "Confirm warning?");
      this.registerEvent(confirm, "confirmed", () => this.#submitWarning());
      actions.append(confirm);
    }

    if (this.#penalty.disqualify) {
      const disqualify = document.createElement("confirm-button");
      disqualify.setAttribute("variant", "danger");
      disqualify.setAttribute("label", "Disqualify");
      disqualify.setAttribute("confirm-label", "Confirm disqualification?");
      this.registerEvent(disqualify, "confirmed", () =>
        this.#submitDisqualification(),
      );
      actions.append(disqualify);
    }

    elements.push(actions);
    content.replaceChildren(...elements);
  }

  #back(): void {
    if (this.#step === "deduction") {
      this.#step = "penalty";
      this.#penalty = undefined;
      this.#pointsDeducted = undefined;
    } else if (this.#step === "penalty") {
      this.#step = "fighter";
      this.#fighter = undefined;
    }
    this.#render();
  }

  #submitWarning(): void {
    if (
      !this.#fighter ||
      !this.#penalty ||
      this.#pointsDeducted === undefined
    ) {
      throw new Error("Warning event is incomplete.");
    }
    dispatchMatchEvent({
      elapsedTimeSeconds: this.#elapsedTimeSeconds,
      type: "warning",
      fighter: this.#fighter,
      description: this.#penalty.description,
      pointsDeducted: this.#pointsDeducted,
    });
    this.close();
  }

  #submitDisqualification(): void {
    if (!this.#fighter || !this.#penalty) {
      throw new Error("Disqualification event is incomplete.");
    }
    dispatchMatchEvent({
      elapsedTimeSeconds: this.#elapsedTimeSeconds,
      type: "disqualification",
      fighter: this.#fighter,
      description: this.#penalty.description,
    });
    this.close();
  }

  #button(
    label: string,
    className: string,
    handler: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    this.registerEvent(button, "click", handler);
    return button;
  }

  #applyFighterStyles(): void {
    this.style.setProperty(
      "--warning-fighter-a-background",
      this.#config.fighterA.backgroundColor,
    );
    this.style.setProperty(
      "--warning-fighter-a-text",
      this.#config.fighterA.textColor,
    );
    this.style.setProperty(
      "--warning-fighter-b-background",
      this.#config.fighterB.backgroundColor,
    );
    this.style.setProperty(
      "--warning-fighter-b-text",
      this.#config.fighterB.textColor,
    );
  }
}

if (!customElements.get("warning-view")) {
  customElements.define("warning-view", WarningView);
}

declare global {
  interface HTMLElementTagNameMap {
    "warning-view": WarningView;
  }
}

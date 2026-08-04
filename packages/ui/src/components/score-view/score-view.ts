import css from "./score-view.css?raw";
import html from "./score-view.html?raw";
import { BaseComponent } from "../base-component/base-component";
import {
  dispatchMatchEvent,
  type FighterIdentifier,
  type ScoreAdjustmentMatchEventDetail,
  type ScoreMatchEventDetail,
} from "../../events/match-event";
import "../fighter-score/fighter-score";

type FighterId = "a" | "b";
type ScoreSelection = number | "no-score" | "low-quality";
export type MatchEventType = "no-score" | "hit" | "afterblow" | "double";

export interface ScoreViewFighter {
  name: string;
  score: number;
  backgroundColor: string;
  textColor: string;
}

export interface ScoreViewConfig {
  scores: number[];
  fighterA: ScoreViewFighter;
  fighterB: ScoreViewFighter;
}

export class ScoreView extends BaseComponent {
  #config: ScoreViewConfig = {
    scores: [1, 2, 3, 4],
    fighterA: {
      name: "Fighter A",
      score: 0,
      backgroundColor: "#21c15b",
      textColor: "#071a0d",
    },
    fighterB: {
      name: "Fighter B",
      score: 0,
      backgroundColor: "#2f7dfa",
      textColor: "#ffffff",
    },
  };
  #selection: Record<FighterId, ScoreSelection> = {
    a: "no-score",
    b: "no-score",
  };
  #elapsedTimeSeconds = 0;

  connectedCallback(): void {
    this.render(css, html);
    this.registerEvent(this.queryRoot(".cancel"), "click", () => this.close());
    this.#registerScoreCorrection("a", "A");
    this.#registerScoreCorrection("b", "B");
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: ScoreViewConfig): void {
    this.#config = {
      ...config,
      scores: [...config.scores],
    };
    if (this.isConnected) this.#render();
  }

  setScores(fighterAScore: number, fighterBScore: number): void {
    this.#config = {
      ...this.#config,
      fighterA: { ...this.#config.fighterA, score: Math.max(0, fighterAScore) },
      fighterB: { ...this.#config.fighterB, score: Math.max(0, fighterBScore) },
    };
    if (this.isConnected) this.#render();
  }

  open(elapsedTimeSeconds: number): void {
    this.#elapsedTimeSeconds = Math.max(0, elapsedTimeSeconds);
    this.#selection = { a: "no-score", b: "no-score" };
    this.#render();
    this.setAttribute("open", "");
  }

  close(): void {
    this.removeAttribute("open");
  }

  #render(): void {
    this.#renderFighter("a", this.#config.fighterA);
    this.#renderFighter("b", this.#config.fighterB);
    this.#renderOptions("a");
    this.#renderOptions("b");
    this.#renderOutcomes();
  }

  #renderFighter(fighter: FighterId, config: ScoreViewFighter): void {
    const element =
      this.queryRoot<HTMLElementTagNameMap["fighter-score"]>(
        `#fighter-${fighter}`,
      );
    element.setAttribute("name", config.name);
    element.setAttribute("score", String(config.score));
    this.style.setProperty(
      `--score-fighter-${fighter}-background`,
      config.backgroundColor,
    );
    this.style.setProperty(`--score-fighter-${fighter}-text`, config.textColor);
  }

  #renderOptions(fighter: FighterId): void {
    const container = this.queryRoot<HTMLElement>(
      `.score-options[data-fighter="${fighter}"]`,
    );
    const options: Array<{ value: ScoreSelection; label: string }> = [
      { value: "no-score", label: "No score" },
      ...this.#config.scores.map((score) => ({
        value: score,
        label: String(score),
      })),
      { value: "low-quality", label: "Low quality" },
    ];

    container.replaceChildren(
      ...options.map(({ value, label }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.classList.toggle("selected", this.#selection[fighter] === value);
        this.registerEvent(button, "click", () => {
          this.#selection[fighter] = value;
          this.#renderOptions(fighter);
          this.#renderOutcomes();
        });
        return button;
      }),
    );
  }

  #renderOutcomes(): void {
    const outcomes = this.queryRoot<HTMLElement>(".outcomes");
    const scoreA = this.#numericScore("a");
    const scoreB = this.#numericScore("b");
    outcomes.replaceChildren();
    outcomes.classList.toggle("two-column", scoreA > 0 && scoreB > 0);

    if (scoreA === 0 && scoreB === 0) {
      outcomes.append(
        this.#createOutcomeButton("No score", "no-score", () =>
          this.#submit("no-score"),
        ),
      );
      return;
    }

    if (scoreA === 0 || scoreB === 0) {
      outcomes.append(
        this.#createOutcomeButton("Hit", "hit", () => this.#submit("hit")),
      );
      return;
    }

    outcomes.append(
      this.#createOutcomeButton("First", "first-a", () =>
        this.#submit("afterblow", "A"),
      ),
      this.#createOutcomeButton("First", "first-b", () =>
        this.#submit("afterblow", "B"),
      ),
      this.#createOutcomeButton("Double", "double", () =>
        this.#submit("double"),
      ),
    );
  }

  #createOutcomeButton(
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

  #numericScore(fighter: FighterId): number {
    const selection = this.#selection[fighter];
    return typeof selection === "number" ? selection : 0;
  }

  #submit(type: MatchEventType, firstFighter?: FighterIdentifier): void {
    const base = {
      elapsedTimeSeconds: this.#elapsedTimeSeconds,
      fighterAScore: this.#numericScore("a"),
      fighterBScore: this.#numericScore("b"),
      details: {
        fighterA: { outcome: this.#outcome("a") },
        fighterB: { outcome: this.#outcome("b") },
      },
    };
    const detail: ScoreMatchEventDetail =
      type === "afterblow"
        ? {
            ...base,
            type,
            firstFighter: this.#requiredFirstFighter(firstFighter),
          }
        : { ...base, type };

    dispatchMatchEvent(detail);
    this.close();
  }

  #registerScoreCorrection(
    fighter: FighterId,
    identifier: FighterIdentifier,
  ): void {
    const element =
      this.queryRoot<HTMLElementTagNameMap["fighter-score"]>(
        `#fighter-${fighter}`,
      );
    this.registerEvent<CustomEvent<{ score: number }>>(
      element,
      "score-change",
      (event) => {
        event.stopPropagation();
        const detail: ScoreAdjustmentMatchEventDetail = {
          elapsedTimeSeconds: this.#elapsedTimeSeconds,
          type: "score-adjustment",
          fighter: identifier,
          score: event.detail.score,
        };
        dispatchMatchEvent(detail);
      },
    );
  }

  #requiredFirstFighter(
    fighter: FighterIdentifier | undefined,
  ): FighterIdentifier {
    if (!fighter) {
      throw new Error("An afterblow must identify the first fighter.");
    }
    return fighter;
  }

  #outcome(fighter: FighterId): "score" | "low-quality" | "no-score" {
    const selection = this.#selection[fighter];
    return typeof selection === "number" ? "score" : selection;
  }
}

if (!customElements.get("score-view")) {
  customElements.define("score-view", ScoreView);
}

declare global {
  interface HTMLElementTagNameMap {
    "score-view": ScoreView;
  }
}

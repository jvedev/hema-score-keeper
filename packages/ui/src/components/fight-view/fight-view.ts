import css from "./fight-view.css?raw";
import html from "./fight-view.html?raw";
import {
  dispatchMatchEvent,
  type FighterIdentifier,
  type ScoreAdjustmentMatchEventDetail,
} from "../../events/match-event";
import { BaseComponent } from "../base-component/base-component";
import "../confirm-button/confirm-button";
import "../fighter-score/fighter-score";
import "../hema-timer/hema-timer";

export interface MatchScores {
  fighterAScore: number;
  fighterBScore: number;
}

export interface FightArenaConfig {
  name: string;
  fighterAName: string;
  fighterBName: string;
  leftFighterStyle: FighterStyleConfig;
  rightFighterStyle: FighterStyleConfig;
}

export interface FighterStyleConfig {
  backgroundColor: string;
  textColor: string;
}

export class FightView extends BaseComponent {
  #timer!: HTMLElementTagNameMap["hema-timer"];
  #fighterLeft!: HTMLElementTagNameMap["fighter-score"];
  #fighterRight!: HTMLElementTagNameMap["fighter-score"];
  #timeoutButton!: HTMLButtonElement;
  #buttonStack!: HTMLElement;
  #wakeStatus!: HTMLElement;
  #matchStarted = false;
  #matchActive = false;
  #colorsSwapped = false;
  #leftFighterStyle: FighterStyleConfig = {
    backgroundColor: "#21c15b",
    textColor: "#071a0d",
  };
  #rightFighterStyle: FighterStyleConfig = {
    backgroundColor: "#2f7dfa",
    textColor: "#ffffff",
  };

  connectedCallback(): void {
    this.render(css, html);
    this.#timer = this.queryRoot("#timer");
    this.#fighterLeft = this.queryRoot("#fighter-left");
    this.#fighterRight = this.queryRoot("#fighter-right");
    this.#timeoutButton = this.queryRoot("#timeout-button");
    this.#buttonStack = this.queryRoot(".button-stack");
    this.#wakeStatus = this.queryRoot("#wake-status");
    this.#registerScoreCorrection(this.#fighterLeft, "A");
    this.#registerScoreCorrection(this.#fighterRight, "B");

    this.registerEvent(this.queryRoot("#hit-button"), "click", () => {
      this.dispatchEvent(
        new CustomEvent("hit-requested", {
          bubbles: true,
          detail: { elapsedTimeSeconds: this.#timer.elapsedSeconds },
        }),
      );
    });
    this.registerEvent(this.queryRoot("#warning-button"), "click", () => {
      this.dispatchEvent(
        new CustomEvent("warning-requested", {
          bubbles: true,
          detail: { elapsedTimeSeconds: this.#timer.elapsedSeconds },
        }),
      );
    });
    this.registerEvent(this.#timeoutButton, "click", () => this.#toggleTimer());
    this.registerEvent(this.queryRoot("#reset-button"), "confirmed", () => {
      this.#resetFight();
      this.dispatchEvent(new CustomEvent("match-reset-requested", {
        bubbles: true,
      }));
    });
    this.registerEvent(this.queryRoot("#forfeit-button"), "confirmed", () => {
      this.#timer.stop();
      this.#requestView("forfeit-requested");
    });
    this.registerEvent(this.queryRoot("#swap-button"), "click", () =>
      this.#swapColors(),
    );
    this.#syncControls();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  setWakeLockActive(active: boolean): void {
    this.#wakeStatus.classList.toggle("on", active);
  }

  configureArena(config: FightArenaConfig): void {
    this.queryRoot("#arena-name").textContent = config.name;
    this.#fighterLeft.setAttribute("name", config.fighterAName);
    this.#fighterRight.setAttribute("name", config.fighterBName);
    this.#leftFighterStyle = config.leftFighterStyle;
    this.#rightFighterStyle = config.rightFighterStyle;
    this.#colorsSwapped = false;
    this.#applyFighterColors();
  }

  setMatchDuration(durationSeconds: number): void {
    this.#timer.setAttribute("seconds", String(Math.max(0, durationSeconds)));
    this.#resetFight();
  }

  setScores(scores: MatchScores): void {
    this.#fighterLeft.setAttribute("score", String(scores.fighterAScore));
    this.#fighterRight.setAttribute("score", String(scores.fighterBScore));
  }

  setMatchActive(active: boolean): void {
    this.#matchActive = active;
    if (!active) this.#timer.stop();
    this.#syncControls();
  }

  setMatchStarted(started: boolean): void {
    this.#matchStarted = started;
    if (!started) this.#timer.stop();
    this.#syncControls();
  }

  #requestView(
    eventName: "hit-requested" | "warning-requested" | "forfeit-requested",
  ): void {
    this.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
  }

  #toggleTimer(): void {
    if (!this.#matchStarted) {
      this.#matchStarted = true;
    }
    this.#timer.toggle();
    this.#syncControls();
  }

  #resetFight(): void {
    this.#timer.reset();
    this.setScores({ fighterAScore: 0, fighterBScore: 0 });
    this.#matchStarted = false;
    this.#syncControls();
  }

  #registerScoreCorrection(
    fighter: HTMLElementTagNameMap["fighter-score"],
    identifier: FighterIdentifier,
  ): void {
    this.registerEvent<CustomEvent<{ score: number }>>(
      fighter,
      "score-change",
      (event) => {
        event.stopPropagation();
        const detail: ScoreAdjustmentMatchEventDetail = {
          elapsedTimeSeconds: this.#timer.elapsedSeconds,
          type: "score-adjustment",
          fighter: identifier,
          score: event.detail.score,
        };
        dispatchMatchEvent(detail);
      },
    );
  }

  #swapColors(): void {
    this.#colorsSwapped = !this.#colorsSwapped;
    this.#applyFighterColors();
  }

  #applyFighterColors(): void {
    const left = this.#colorsSwapped
      ? this.#rightFighterStyle
      : this.#leftFighterStyle;
    const right = this.#colorsSwapped
      ? this.#leftFighterStyle
      : this.#rightFighterStyle;

    this.style.setProperty(
      "--hema-left-background-color",
      left.backgroundColor,
    );
    this.style.setProperty("--hema-left-text-color", left.textColor);
    this.style.setProperty(
      "--hema-right-background-color",
      right.backgroundColor,
    );
    this.style.setProperty("--hema-right-text-color", right.textColor);
  }

  #syncControls(): void {
    const started = this.#matchStarted;
    const active = this.#matchActive;
    this.queryRoot<HTMLButtonElement>("#hit-button").disabled =
      !started || !active;
    this.queryRoot<HTMLButtonElement>("#warning-button").disabled =
      !started || !active;
    this.queryRoot<HTMLButtonElement>("#timeout-button").disabled =
      started ? !active : false;
    this.queryRoot<HTMLButtonElement>("#hit-button").toggleAttribute(
      "hidden",
      !started,
    );
    this.queryRoot<HTMLButtonElement>("#warning-button").toggleAttribute(
      "hidden",
      !started,
    );
    this.#buttonStack.classList.toggle("pre-start", !started);
    this.queryRoot<HTMLElementTagNameMap["confirm-button"]>(
      "#forfeit-button",
    ).toggleAttribute("disabled", !started || !active);

    if (!started) {
      this.#timeoutButton.textContent = "Start";
      this.#timeoutButton.classList.add("starting");
      this.#timeoutButton.classList.remove("running", "paused");
      return;
    }

    const running = this.#timer.running;
    this.#timeoutButton.textContent = running ? "Timeout" : "Continue";
    this.#timeoutButton.classList.toggle("running", running);
    this.#timeoutButton.classList.toggle("paused", !running);
    this.#timeoutButton.classList.remove("starting");
  }
}

if (!customElements.get("fight-view")) {
  customElements.define("fight-view", FightView);
}

declare global {
  interface HTMLElementTagNameMap {
    "fight-view": FightView;
  }
}

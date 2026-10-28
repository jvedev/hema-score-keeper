import css from "./fight-view.css?raw";
import html from "./fight-view.html?raw";
import {
  dispatchMatchEvent,
  type FighterIdentifier,
  type ScoreAdjustmentMatchEventDetail,
} from "../../events/match-event.js";
import { BaseComponent } from "../base-component/base-component.js";
import "../confirm-button/confirm-button.js";
import "../fighter-score/fighter-score.js";
import "../hema-timer/hema-timer.js";

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
  #endMatchButton!: HTMLButtonElement;
  #buttonStack!: HTMLElement;
  #wakeStatus!: HTMLElement;
  #matchStarted = false;
  #matchActive = false;
  #matchCompleted = false;
  #colorsSwapped = false;
  #ringMode = false;
  #readOnly = false;
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
    this.#endMatchButton = this.queryRoot("#end-match-button");
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
    this.registerEvent(this.#timer, "timer-end", () => {
      this.#syncControls();
      this.#dispatchClock();
    });
    this.registerEvent(this.#endMatchButton, "click", () => {
      this.dispatchEvent(
        new CustomEvent("end-match-requested", {
          bubbles: true,
          detail: { elapsedTimeSeconds: this.#timer.elapsedSeconds },
        }),
      );
    });
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
    this.#matchCompleted = false;
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

  setMatchCompleted(completed: boolean): void {
    this.#matchCompleted = completed;
    if (completed) {
      this.#matchActive = false;
      this.#timer.stop();
    }
    this.#syncControls();
  }

  /** The bout clock: elapsed seconds. */
  get clockSeconds(): number {
    return this.#timer.elapsedSeconds;
  }

  get clockRunning(): boolean {
    return this.#timer.running;
  }

  /**
   * Shows the clock paused with `elapsedSeconds` gone (call after `setMatchDuration`). `started` opens the screen past
   * its Start button, for a bout that already began.
   */
  setClock(elapsedSeconds: number, started: boolean): void {
    this.#timer.setElapsed(elapsedSeconds);
    this.#matchStarted = started;
    this.#syncControls();
  }

  /**
   * A new countdown length with `elapsedSeconds` gone, the clock paused; scores and the started state stay
   * (an extension keeps the time gone, a new round starts at 0).
   */
  setDuration(totalSeconds: number, elapsedSeconds: number): void {
    this.#timer.setAttribute("seconds", String(Math.max(0, totalSeconds)));
    this.#timer.setElapsed(elapsedSeconds);
    this.#syncControls();
  }

  /**
   * Ring mode: the score lives on the backend, so reset and forfeit are not offered and the scores cannot be edited
   * by double-tapping them.
   */
  setRingMode(enabled: boolean): void {
    this.#ringMode = enabled;
    this.#syncControls();
  }

  /** Read-only (another device keeps the ring): the clock stops and every control is disabled. */
  setReadOnly(readOnly: boolean): void {
    this.#readOnly = readOnly;
    this.toggleAttribute("read-only", readOnly);
    if (readOnly) this.#timer.stop();
    this.#syncControls();
  }

  #dispatchClock(): void {
    this.dispatchEvent(
      new CustomEvent("clock-toggled", {
        bubbles: true,
        detail: { elapsedTimeSeconds: this.#timer.elapsedSeconds, running: this.#timer.running },
      }),
    );
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
    this.#dispatchClock();
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
    const active = this.#matchActive && !this.#readOnly;
    const readOnly = this.#readOnly;
    this.queryRoot<HTMLButtonElement>("#hit-button").disabled =
      !started || !active;
    this.queryRoot<HTMLButtonElement>("#warning-button").disabled =
      !started || !active;
    this.queryRoot<HTMLButtonElement>("#timeout-button").disabled =
      readOnly || (started ? !active : false);
    this.#endMatchButton.disabled = readOnly;
    this.queryRoot<HTMLButtonElement>("#hit-button").toggleAttribute(
      "hidden",
      !started,
    );
    this.queryRoot<HTMLButtonElement>("#warning-button").toggleAttribute(
      "hidden",
      !started,
    );
    const reset = this.queryRoot<HTMLElementTagNameMap["confirm-button"]>(
      "#reset-button",
    );
    const forfeit = this.queryRoot<HTMLElementTagNameMap["confirm-button"]>(
      "#forfeit-button",
    );
    reset.toggleAttribute("disabled", !started || !active);
    forfeit.toggleAttribute("disabled", !started || !active);
    reset.hidden = this.#ringMode;
    forfeit.hidden = this.#ringMode;
    this.#fighterLeft.toggleAttribute("locked", this.#ringMode || readOnly);
    this.#fighterRight.toggleAttribute("locked", this.#ringMode || readOnly);
    this.#timer.toggleAttribute("locked", this.#ringMode || readOnly);
    this.#buttonStack.classList.toggle("pre-start", !started);

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
  interface HTMLElementEventMap {
    "hit-requested": CustomEvent<{ elapsedTimeSeconds: number }>;
    "warning-requested": CustomEvent<{ elapsedTimeSeconds: number }>;
    "match-reset-requested": CustomEvent<void>;
    "end-match-requested": CustomEvent<{ elapsedTimeSeconds: number }>;
    "forfeit-requested": CustomEvent<void>;
    "clock-toggled": CustomEvent<{ elapsedTimeSeconds: number; running: boolean }>;
  }

  interface HTMLElementTagNameMap {
    "fight-view": FightView;
  }
}

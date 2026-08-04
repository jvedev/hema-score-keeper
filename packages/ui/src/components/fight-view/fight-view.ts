import css from "./fight-view.css?raw";
import html from "./fight-view.html?raw";
import { BaseComponent } from "../base-component/base-component";
import "../confirm-button/confirm-button";
import "../fighter-score/fighter-score";
import "../hema-timer/hema-timer";

export interface FightArenaConfig {
  name: string;
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
  #wakeStatus!: HTMLElement;
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
    this.#wakeStatus = this.queryRoot("#wake-status");

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
    this.registerEvent(this.queryRoot("#reset-button"), "confirmed", () =>
      this.#resetFight(),
    );
    this.registerEvent(this.queryRoot("#forfeit-button"), "confirmed", () => {
      this.#timer.stop();
      this.#requestView("forfeit-requested");
    });
    this.registerEvent(this.queryRoot("#swap-button"), "click", () =>
      this.#swapColors(),
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  setWakeLockActive(active: boolean): void {
    this.#wakeStatus.classList.toggle("on", active);
  }

  configureArena(config: FightArenaConfig): void {
    this.queryRoot("#arena-name").textContent = config.name;
    this.#leftFighterStyle = config.leftFighterStyle;
    this.#rightFighterStyle = config.rightFighterStyle;
    this.#colorsSwapped = false;
    this.#applyFighterColors();
  }

  setMatchDuration(durationSeconds: number): void {
    this.#timer.setAttribute("seconds", String(Math.max(0, durationSeconds)));
    this.#resetFight();
  }

  #requestView(
    eventName: "hit-requested" | "warning-requested" | "forfeit-requested",
  ): void {
    this.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
  }

  #toggleTimer(): void {
    const running = this.#timer.toggle();
    this.#timeoutButton.textContent = running ? "Timeout" : "Continue";
    this.#timeoutButton.classList.toggle("running", running);
    this.#timeoutButton.classList.toggle("paused", !running);
  }

  #resetFight(): void {
    this.#timer.reset();
    this.#fighterLeft.reset();
    this.#fighterRight.reset();
    this.#timeoutButton.textContent = "Start";
    this.#timeoutButton.classList.remove("running");
    this.#timeoutButton.classList.add("paused");
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
}

if (!customElements.get("fight-view")) {
  customElements.define("fight-view", FightView);
}

declare global {
  interface HTMLElementTagNameMap {
    "fight-view": FightView;
  }
}

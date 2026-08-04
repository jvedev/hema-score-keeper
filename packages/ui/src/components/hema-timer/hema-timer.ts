import css from "./hema-timer.css?raw";
import html from "./hema-timer.html?raw";
import { BaseComponent } from "../base-component/base-component";
import { registerDoubleTap } from "../../utils/double-tap";

export class HemaTimer extends BaseComponent {
  static readonly observedAttributes = ["seconds"];

  #totalSeconds = 120;
  #remainingSeconds = 120;
  #running = false;
  #intervalId: number | undefined;
  #draft = { minutes: 2, seconds: 0 };
  #digits!: HTMLElement;
  #adjust!: HTMLElement;
  #minutes!: HTMLElement;
  #seconds!: HTMLElement;

  get running(): boolean {
    return this.#running;
  }

  get remainingSeconds(): number {
    return this.#remainingSeconds;
  }

  get elapsedSeconds(): number {
    return this.#totalSeconds - this.#remainingSeconds;
  }

  connectedCallback(): void {
    this.render(css, html);
    this.#readSeconds();
    this.#digits = this.queryRoot(".digits");
    this.#adjust = this.queryRoot(".adjust");
    this.#minutes = this.queryRoot('[data-role="minutes"]');
    this.#seconds = this.queryRoot('[data-role="seconds"]');

    registerDoubleTap(
      this.queryRoot(".face"),
      () => this.#openAdjust(),
      this.signal,
    );
    this.queryRootAll<HTMLElement>(".column").forEach((column) =>
      this.#wireColumn(column),
    );
    this.registerEvent(this.queryRoot(".cancel"), "click", () =>
      this.#closeAdjust(),
    );
    this.registerEvent(this.queryRoot(".apply"), "click", () =>
      this.#applyAdjust(),
    );
    this.#renderTime();
  }

  override disconnectedCallback(): void {
    this.stop();
    super.disconnectedCallback();
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name !== "seconds" || oldValue === newValue || !this.isConnected) return;
    this.#readSeconds();
    this.#renderTime();
  }

  start(): void {
    if (this.#running || this.#remainingSeconds === 0) return;
    this.#running = true;
    this.#intervalId = window.setInterval(() => {
      this.#remainingSeconds = Math.max(0, this.#remainingSeconds - 1);
      this.#renderTime();

      if (this.#remainingSeconds === 0) {
        this.stop();
        this.dispatchEvent(new CustomEvent("timer-end", { bubbles: true }));
      }
    }, 1000);
  }

  stop(): void {
    this.#running = false;
    if (this.#intervalId !== undefined) {
      window.clearInterval(this.#intervalId);
      this.#intervalId = undefined;
    }
  }

  toggle(): boolean {
    if (this.#running) this.stop();
    else this.start();
    return this.#running;
  }

  reset(): void {
    this.stop();
    this.#remainingSeconds = this.#totalSeconds;
    this.#renderTime();
  }

  #readSeconds(): void {
    const parsed = Number.parseInt(this.getAttribute("seconds") ?? "120", 10);
    this.#totalSeconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : 120;
    this.#remainingSeconds = this.#totalSeconds;
    this.#draft = {
      minutes: Math.floor(this.#totalSeconds / 60),
      seconds: this.#totalSeconds % 60,
    };
  }

  #wireColumn(column: HTMLElement): void {
    const unit = column.dataset.unit;
    if (unit !== "minutes" && unit !== "seconds") return;

    const step = (delta: number) => this.#stepDraft(unit, delta);
    this.registerEvent(column.querySelector(".up")!, "click", () => step(1));
    this.registerEvent(column.querySelector(".down")!, "click", () => step(-1));

    const value = column.querySelector<HTMLElement>(".value");
    if (!value) throw new Error(`Missing timer value for "${unit}".`);

    let dragging = false;
    let startY = 0;
    let accumulated = 0;
    const pixelsPerStep = 24;

    this.registerEvent<PointerEvent>(value, "pointerdown", (event) => {
      dragging = true;
      startY = event.clientY;
      accumulated = 0;
      value.setPointerCapture(event.pointerId);
    });
    this.registerEvent<PointerEvent>(value, "pointermove", (event) => {
      if (!dragging) return;
      const steps = Math.trunc(
        (startY - event.clientY - accumulated) / pixelsPerStep,
      );
      if (steps === 0) return;
      step(steps);
      accumulated += steps * pixelsPerStep;
    });
    const endDrag = () => {
      dragging = false;
    };
    this.registerEvent(value, "pointerup", endDrag);
    this.registerEvent(value, "pointercancel", endDrag);
  }

  #stepDraft(unit: "minutes" | "seconds", delta: number): void {
    if (unit === "minutes") {
      this.#draft.minutes = Math.max(
        0,
        Math.min(99, this.#draft.minutes + delta),
      );
    } else {
      this.#draft.seconds =
        (((this.#draft.seconds + delta) % 60) + 60) % 60;
    }
    this.#renderDraft();
  }

  #openAdjust(): void {
    this.#draft = {
      minutes: Math.floor(this.#remainingSeconds / 60),
      seconds: this.#remainingSeconds % 60,
    };
    this.#renderDraft();
    this.#adjust.classList.add("open");
  }

  #closeAdjust(): void {
    this.#adjust.classList.remove("open");
  }

  #applyAdjust(): void {
    this.#remainingSeconds = this.#draft.minutes * 60 + this.#draft.seconds;
    this.#totalSeconds = this.#remainingSeconds;
    this.stop();
    this.#renderTime();
    this.#closeAdjust();
    this.dispatchEvent(
      new CustomEvent("time-changed", {
        bubbles: true,
        detail: { seconds: this.#remainingSeconds },
      }),
    );
  }

  #renderDraft(): void {
    this.#minutes.textContent = String(this.#draft.minutes).padStart(2, "0");
    this.#seconds.textContent = String(this.#draft.seconds).padStart(2, "0");
  }

  #renderTime(): void {
    if (!this.#digits) return;
    const minutes = Math.floor(this.#remainingSeconds / 60);
    const seconds = this.#remainingSeconds % 60;
    this.#digits.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    this.#digits.classList.toggle("low", this.#remainingSeconds <= 10);
  }
}

if (!customElements.get("hema-timer")) {
  customElements.define("hema-timer", HemaTimer);
}

declare global {
  interface HTMLElementTagNameMap {
    "hema-timer": HemaTimer;
  }
}

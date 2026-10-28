import { t } from "@hema/ui";
import type { Translate } from "../ring/ring-texts";
import { headerText, renderMessage, renderScoreboard, type Connection, type ScoreboardData } from "./scoreboard-view";
import "./scoreboard.css";

/** The scoreboard asks the backend this often; the clock ticks on screen in between. */
export const POLL_MS = 1000;
const TICK_MS = 250;
const REQUEST_TIMEOUT_MS = 4000;
/** No answer for this long: "connection lost" (the last data stays on screen). */
export const LOST_AFTER_MS = 5000;
const FLIP_KEY = "hema-scoreboard.flipped";

export interface ScoreboardOptions {
  baseUrl: string;
  token: string;
  root: HTMLElement;
  fetcher?: typeof fetch;
  now?: () => number;
  storage?: Storage;
}

/** A ring's scoreboard on a monitor: view only, no sign-in. */
export class Scoreboard {
  readonly #options: Required<Omit<ScoreboardOptions, "fetcher" | "now" | "storage">>;
  readonly #title: HTMLElement;
  readonly #body: HTMLElement;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #storage: Storage;
  #data: ScoreboardData | null = null;
  #receivedAt = 0;
  #lastSuccess = 0;
  #invalid = false;
  #flipped: boolean;
  #html = "";
  #timers: number[] = [];
  #inFlight = false;

  constructor(options: ScoreboardOptions) {
    this.#options = { baseUrl: options.baseUrl, token: options.token, root: options.root };
    this.#fetch = options.fetcher ?? ((...args) => fetch(...args));
    this.#now = options.now ?? (() => Date.now());
    this.#storage = options.storage ?? localStorage;
    this.#flipped = this.#readFlip();
    this.#lastSuccess = this.#now();
    // The header and its button are made once; only the part below is redrawn (every tick).
    const header = document.createElement("header");
    header.className = "sb-header";
    this.#title = document.createElement("span");
    const flip = document.createElement("button");
    flip.type = "button";
    flip.className = "sb-flip";
    flip.textContent = t("scoreboard.flip");
    flip.addEventListener("click", () => this.flip());
    header.append(this.#title, flip);
    this.#body = document.createElement("div");
    this.#body.className = "sb-body";
    options.root.replaceChildren(header, this.#body);
  }

  get flipped(): boolean {
    return this.#flipped;
  }

  start(): void {
    void this.poll();
    this.#timers.push(window.setInterval(() => void this.poll(), POLL_MS));
    this.#timers.push(window.setInterval(() => this.render(), TICK_MS));
  }

  stop(): void {
    for (const timer of this.#timers) window.clearInterval(timer);
    this.#timers = [];
  }

  /** Swaps the sides on this screen (a scoreboard opposite the table sees the fighters the other way round). */
  flip(): void {
    this.#flipped = !this.#flipped;
    try {
      this.#storage.setItem(FLIP_KEY, this.#flipped ? "1" : "0");
    } catch {
      // Not remembered; the screen still flips.
    }
    this.render();
  }

  async poll(): Promise<void> {
    if (this.#inFlight || this.#invalid) return;
    this.#inFlight = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.#fetch(`${this.#options.baseUrl}/scoreboard/${encodeURIComponent(this.#options.token)}`, { signal: controller.signal, cache: "no-store" });
      if (response.status === 404) {
        this.#invalid = true;
        this.stop();
      } else if (response.ok) {
        this.#data = (await response.json()) as ScoreboardData;
        this.#receivedAt = this.#now();
        this.#lastSuccess = this.#receivedAt;
      }
    } catch {
      // Offline or timed out: the last data stays, "connection lost" shows after a while.
    } finally {
      window.clearTimeout(timeout);
      this.#inFlight = false;
    }
    this.render();
  }

  render(): void {
    const now = this.#now();
    let html: string;
    if (this.#invalid) {
      html = renderMessage(t("scoreboard.linkInvalid"));
    } else if (!this.#data) {
      html = renderMessage(t(now - this.#lastSuccess > LOST_AFTER_MS ? "scoreboard.connectionLost" : "scoreboard.loading"));
    } else {
      const connection: Connection = now - this.#lastSuccess > LOST_AFTER_MS ? "lost" : "ok";
      html = renderScoreboard(this.#data, this.#flipped, connection, now - this.#receivedAt, t as Translate);
    }
    this.#title.textContent = this.#data ? headerText(this.#data) : "";
    if (html !== this.#html) {
      this.#body.innerHTML = html;
      this.#html = html;
    }
  }

  #readFlip(): boolean {
    try {
      return this.#storage.getItem(FLIP_KEY) === "1";
    } catch {
      return false;
    }
  }
}

/** Takes over the page for the scoreboard: the rest of the app is removed, and the screen is kept awake. */
export function openScoreboard(baseUrl: string, token: string): Scoreboard {
  document.body.className = "scoreboard-page";
  const root = document.createElement("div");
  root.className = "scoreboard";
  document.body.replaceChildren(root);
  const board = new Scoreboard({ baseUrl, token, root });
  board.start();
  const keepAwake = () => {
    if (document.visibilityState === "visible" && "wakeLock" in navigator) {
      void navigator.wakeLock.request("screen").catch(() => undefined);
    }
  };
  keepAwake();
  document.addEventListener("visibilitychange", keepAwake);
  return board;
}

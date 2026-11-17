import { t } from "@hema/ui";
import type { Translate } from "../ring/ring-texts";
import { DEFAULT_SCOREBOARD_SETTINGS, headerText, renderMessage, renderScoreboard, scoreboardClasses, settingsOf, type Connection, type ScoreboardData } from "./scoreboard-view";
import "./scoreboard.css";

/** The scoreboard asks the backend this often; the clock ticks on screen in between. */
export const POLL_MS = 1000;
const TICK_MS = 250;
const REQUEST_TIMEOUT_MS = 4000;
/** No answer for this long: "connection lost" (the last data stays on screen). */
export const LOST_AFTER_MS = 5000;

export interface ScoreboardOptions {
  baseUrl: string;
  token: string;
  root: HTMLElement;
  fetcher?: typeof fetch;
  now?: () => number;
}

/**
 * A ring's scoreboard on a monitor: view only, no sign-in. How it looks (mirrored, next bout, text size, theme) is set
 * at the table and arrives with each poll; the screen itself has no controls.
 */
export class Scoreboard {
  readonly #options: Required<Omit<ScoreboardOptions, "fetcher" | "now">>;
  readonly #title: HTMLElement;
  readonly #body: HTMLElement;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  #data: ScoreboardData | null = null;
  #receivedAt = 0;
  #lastSuccess = 0;
  #invalid = false;
  #html = "";
  #timers: number[] = [];
  #inFlight = false;

  constructor(options: ScoreboardOptions) {
    this.#options = { baseUrl: options.baseUrl, token: options.token, root: options.root };
    this.#fetch = options.fetcher ?? ((...args) => fetch(...args));
    this.#now = options.now ?? (() => Date.now());
    this.#lastSuccess = this.#now();
    // The header is made once; only the part below is redrawn (every tick).
    const header = document.createElement("header");
    header.className = "sb-header";
    this.#title = document.createElement("span");
    header.append(this.#title);
    this.#body = document.createElement("div");
    this.#body.className = "sb-body";
    options.root.className = scoreboardClasses(DEFAULT_SCOREBOARD_SETTINGS);
    options.root.replaceChildren(header, this.#body);
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
      html = renderScoreboard(this.#data, connection, now - this.#receivedAt, t as Translate);
    }
    const classes = scoreboardClasses(this.#data ? settingsOf(this.#data) : DEFAULT_SCOREBOARD_SETTINGS);
    if (this.#options.root.className !== classes) this.#options.root.className = classes;
    this.#title.textContent = this.#data ? headerText(this.#data) : "";
    if (html !== this.#html) {
      this.#body.innerHTML = html;
      this.#html = html;
    }
  }
}

/** Takes over the page for the scoreboard: the rest of the app is removed, and the screen is kept awake. */
export function openScoreboard(baseUrl: string, token: string): Scoreboard {
  document.body.className = "scoreboard-page";
  const root = document.createElement("div");
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

import { escapeHtml, LOCALE_CHANGE_EVENT, setLocale, t, type FightView, type MatchEventDetail, type ScoreView, type WarningView } from "@hema/ui";
import type { BoutScore, LiveBoutRow } from "./live-client";
import { LiveClient } from "./live-client";
import { textColorFor } from "../scoreboard/scoreboard-view";
import { boutRowText, loadRetryText, type Translate } from "./ring-texts";
import { RingController, ringPenalties, type BoutScreen, type NotAppliedItem, type OpenBout, type PhaseView, type RingModeState, type RingView, type SendStatus } from "./ring-controller";

const LEFT_COLOR = "#21c15b";
const RIGHT_COLOR = "#2f7dfa";

function fighterStyle(color: string) {
  return { backgroundColor: color, textColor: textColorFor(color) };
}

/** The ring path: `/ring/<token>`. Null for any other path. */
export function ringTokenFromPath(pathname: string): string | null {
  const match = /^\/ring\/([^/]+)\/?$/.exec(pathname);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** What ring mode needs from the rest of the app (screens and the fight mode live in main.ts). */
export interface RingHost {
  showRingScreen(): void;
  /** Shows the fight screen for a ring bout (main.ts routes its match events here). */
  showFightScreen(): void;
  enterFightMode(): Promise<void>;
  exitFightMode(): Promise<void>;
}

export interface RingElements {
  /** The static sign-in form (kept out of the re-rendered part so typing is never wiped). */
  loginForm: HTMLFormElement;
  loginError: HTMLElement;
  /** The re-rendered ring screen. */
  body: HTMLElement;
  /** Slotted into the fight view: notice, status line, undo, back. */
  bar: HTMLElement;
  fightView: FightView;
  scoreView: ScoreView;
  warningView: WarningView;
}

/** Ring mode on the score-keeper: the ring screen, and the existing scoring screen driven by `RingController`. */
export class RingMode {
  #client: LiveClient | null = null;
  #controller: RingController | null = null;
  #state: Readonly<RingModeState> | null = null;
  #active = false;

  constructor(
    private readonly baseUrl: string,
    private readonly elements: RingElements,
    private readonly host: RingHost,
  ) {
    elements.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#signIn();
    });
    elements.body.addEventListener("click", (event) => this.#onAction(event));
    elements.bar.addEventListener("click", (event) => this.#onAction(event));
    elements.fightView.addEventListener("clock-toggled", () => {
      if (this.#active) {
        this.#controller?.clockToggled();
      }
    });
    window.addEventListener(LOCALE_CHANGE_EVENT, () => this.#rerender());
  }

  get active(): boolean {
    return this.#active;
  }

  async open(ringToken: string): Promise<void> {
    this.#active = true;
    this.host.showRingScreen();
    const controller = this.#ensureController();
    const session = this.#client!.currentSession();
    if (session) {
      setLocale(session.user.language);
    }
    await controller.open(ringToken);
  }

  /** A score or warning from the scoring screen. */
  matchEvent(event: MatchEventDetail): void {
    this.#controller?.matchEvent(event);
  }

  /** "End match" on the scoring screen: finish the bout and offer the next one. */
  async endBout(): Promise<void> {
    await this.#controller?.finishBout();
  }

  /** Leaving ring mode (another route). The queues stay saved; they are sent when the ring is opened again. */
  close(): void {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    this.#controller?.close();
    this.#resetFightView();
  }

  #ensureController(): RingController {
    if (!this.#controller) {
      this.#client = new LiveClient(this.baseUrl);
      this.#controller = new RingController({
        api: this.#client,
        view: this.#view(),
        boutScreen: this.#boutScreen(),
      });
    }
    return this.#controller;
  }

  async #signIn(): Promise<void> {
    const form = new FormData(this.elements.loginForm);
    await this.#controller?.signIn(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
    const session = this.#client?.currentSession();
    if (session && !this.#state?.signInError) {
      this.elements.loginForm.reset();
      setLocale(session.user.language);
    }
  }

  #onAction(event: Event): void {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
    const controller = this.#controller;
    if (!target || !controller) {
      return;
    }
    switch (target.dataset.action) {
      case "take":
        void controller.takeRing();
        break;
      case "retry":
        void controller.reload();
        break;
      case "open":
        void controller.openBout(target.dataset.bout ?? "");
        break;
      case "undo":
        controller.undo();
        break;
      case "back":
        void controller.backToRing();
        break;
      case "dismiss-not-applied":
        controller.dismissNotApplied();
        break;
      case "dismiss-rejected":
        controller.dismissRejected();
        break;
      case "extension":
        controller.extension();
        break;
      case "sudden-death":
        controller.suddenDeath();
        break;
      case "next-round":
        controller.nextRound();
        break;
      case "start-round":
        controller.startRound();
        break;
    }
  }

  #view(): RingView {
    return {
      render: (state) => {
        this.#state = state;
        this.#rerender();
      },
      confirmTakeover: async (keeperName) => window.confirm(t("ring.confirmTakeover", { name: keeperName })),
    };
  }

  #boutScreen(): BoutScreen {
    const { fightView, scoreView, warningView, bar } = this.elements;
    return {
      open: async (bout: OpenBout) => {
        this.host.showFightScreen();
        const { rules, ring } = this.#controller!.state;
        const leftStyle = fighterStyle(ring?.leftColor ?? LEFT_COLOR);
        const rightStyle = fighterStyle(ring?.rightColor ?? RIGHT_COLOR);
        const names = { fighterA: { name: bout.fighterLeft, ...leftStyle }, fighterB: { name: bout.fighterRight, ...rightStyle } };
        fightView.configureArena({
          name: bout.label,
          fighterAName: bout.fighterLeft,
          fighterBName: bout.fighterRight,
          leftFighterStyle: leftStyle,
          rightFighterStyle: rightStyle,
        });
        fightView.setRingMode(true);
        fightView.setMatchDuration(bout.durationSeconds);
        fightView.setMatchCompleted(false);
        fightView.setMatchActive(true);
        fightView.setClock(bout.clockSeconds, bout.started);
        fightView.setScores({ fighterAScore: bout.score.left, fighterBScore: bout.score.right });
        scoreView.configure({
          scores: rules.scores,
          fighterA: { ...names.fighterA, score: bout.score.left },
          fighterB: { ...names.fighterB, score: bout.score.right },
          allowAfterblow: false,
          allowScoreCorrection: false,
        });
        warningView.configure({ ...names, penalties: ringPenalties(rules.penalties) });
        bar.hidden = false;
        await this.host.enterFightMode();
      },
      show: () => {
        this.host.showFightScreen();
        bar.hidden = false;
      },
      setScore: (score: BoutScore) => {
        fightView.setScores({ fighterAScore: score.left, fighterBScore: score.right });
        scoreView.setScores(score.left, score.right);
      },
      setReadOnly: (readOnly: boolean) => {
        fightView.setReadOnly(readOnly);
        if (readOnly) {
          scoreView.close();
          warningView.close();
        }
      },
      clock: () => ({ seconds: fightView.clockSeconds, running: fightView.clockRunning }),
      setDuration: (totalSeconds: number, elapsedSeconds: number) => fightView.setDuration(totalSeconds, elapsedSeconds),
      close: async () => {
        this.#resetFightView();
        await this.host.exitFightMode();
        this.host.showRingScreen();
      },
    };
  }

  #resetFightView(): void {
    this.elements.bar.hidden = true;
    this.elements.fightView.setReadOnly(false);
    this.elements.fightView.setRingMode(false);
  }

  #rerender(): void {
    const state = this.#state;
    if (!state || !this.#active) {
      return;
    }
    if (state.screen !== "bout") {
      this.host.showRingScreen();
    }
    const signIn = state.screen === "signIn";
    this.elements.loginForm.hidden = !signIn;
    this.elements.loginError.hidden = !state.signInError;
    this.elements.loginError.textContent = state.signInError ?? "";
    // Only what changed is replaced, so a button is not swapped out under the keeper's finger on every status update.
    replaceHtml(this.elements.body, renderRingBody(state));
    replaceHtml(this.elements.bar, state.screen === "bout" ? renderBar(state) : "");
  }
}

const rendered = new WeakMap<HTMLElement, string>();

function replaceHtml(element: HTMLElement, html: string): void {
  if (rendered.get(element) !== html) {
    element.innerHTML = html;
    rendered.set(element, html);
  }
}

// --- rendering (data is escaped, numbers coerced) ---

function renderRingBody(state: Readonly<RingModeState>): string {
  switch (state.screen) {
    case "loading":
      return `<p class="mode-copy">${escapeHtml(t("ring.loading"))}</p>`;
    case "signIn":
      return state.notice?.key === "ring.signedOut" ? `<p class="ring-notice" role="alert">${escapeHtml(t("ring.signedOut"))}</p>` : "";
    case "invalidLink":
      return `<p class="mode-eyebrow">${escapeHtml(t("ring.eyebrow"))}</p>
        <h1>${escapeHtml(t("ring.linkInvalid"))}</h1>
        <p class="mode-copy">${escapeHtml(t("ring.linkInvalidHint"))}</p>`;
    case "error":
      return `<p class="mode-eyebrow">${escapeHtml(t("ring.eyebrow"))}</p>
        <p class="mode-copy">${escapeHtml(t("ring.loadFailed"))}</p>
        <p class="mode-copy competition-error" role="status">${escapeHtml(state.loadRetry ? loadRetryText(state.loadRetry.unsent, t as Translate) : (state.error ?? ""))}</p>
        <div class="mode-actions"><button type="button" class="mode-button" data-action="retry">${escapeHtml(t("ring.retry"))}</button></div>`;
    case "ring":
    case "bout":
      return renderRing(state);
  }
}

function renderRing(state: Readonly<RingModeState>): string {
  const next = state.bouts.find((bout) => bout.id === state.nextBoutId);
  return `<p class="mode-eyebrow">${escapeHtml(state.tournamentName)}</p>
    <h1>${escapeHtml(state.ring?.name ?? "")}</h1>
    <p class="mode-copy ring-keeper">${escapeHtml(keeperLine(state))}</p>
    ${renderNotice(state)}
    ${state.isKeeper ? "" : `<div class="mode-actions"><button type="button" class="mode-button mode-button-primary" data-action="take">${escapeHtml(t("ring.take"))}</button></div>`}
    ${
      next && state.isKeeper
        ? `<div class="mode-actions"><button type="button" class="mode-button mode-button-primary" data-action="open" data-bout="${escapeHtml(next.id)}">${escapeHtml(
            t("ring.next", { left: next.fighterLeft, right: next.fighterRight }),
          )}</button></div>`
        : ""
    }
    ${renderStatus(state.status)}
    ${renderNotApplied(state.notApplied)}
    ${
      state.bouts.length === 0
        ? `<p class="mode-copy">${escapeHtml(t("ring.noBouts"))}</p>`
        : `<ol class="ring-bouts">${state.bouts.map((bout) => renderBoutRow(bout, state)).join("")}</ol>`
    }`;
}

function keeperLine(state: Readonly<RingModeState>): string {
  if (state.isKeeper) {
    return t("ring.keeperYou");
  }
  return state.activeKeeper ? t("ring.keeperOther", { name: state.activeKeeper.userName }) : t("ring.keeperNone");
}

function renderNotice(state: Readonly<RingModeState>): string {
  if (!state.notice || state.notice.key === "ring.signedOut") {
    return "";
  }
  return `<p class="ring-notice" role="alert">${escapeHtml(t(state.notice.key, state.notice.params ?? {}))}</p>`;
}

const STATUS_KEYS = { PENDING: "ring.statusPending", RUNNING: "ring.statusRunning", DONE: "ring.statusDone" } as const;

function renderBoutRow(bout: LiveBoutRow, state: Readonly<RingModeState>): string {
  const text = boutRowText(Number(bout.score?.doubles ?? 0), t as Translate);
  const score = bout.score
    ? `<span class="ring-bout-score">${Number(bout.score.left)} – ${Number(bout.score.right)}${text.doubles ? ` <small>${escapeHtml(text.doubles)}</small>` : ""}</span>`
    : "";
  const action =
    bout.status === "DONE"
      ? ""
      : `<button type="button" class="mode-button" data-action="open" data-bout="${escapeHtml(bout.id)}">${escapeHtml(t(state.isKeeper ? "ring.open" : "ring.view"))}</button>`;
  return `<li class="ring-bout ring-bout-${escapeHtml(bout.status.toLowerCase())}${bout.id === state.nextBoutId ? " ring-bout-next" : ""}">
      <span class="ring-bout-order">${Number(bout.order)}</span>
      <span class="ring-bout-names">${escapeHtml(bout.fighterLeft)} <small>${escapeHtml(text.vs)}</small> ${escapeHtml(bout.fighterRight)}
        <small class="ring-bout-status">${escapeHtml(t(STATUS_KEYS[bout.status] ?? "ring.statusPending"))}</small></span>
      ${score}
      ${action}
    </li>`;
}

/** "All sent" / "n not sent" / "Offline · n not sent", red when something was refused or could not be saved. */
export function statusText(status: SendStatus): string {
  const parts = [
    status.offline ? t("ring.offline", { count: status.pending }) : status.pending > 0 ? t("ring.notSent", { count: status.pending }) : t("ring.allSent"),
  ];
  if (status.rejected.length > 0) {
    parts.push(t("ring.rejected", { count: status.rejected.length }));
  }
  if (status.persistenceFailed) {
    parts.push(t("ring.notSaved"));
  }
  return parts.join(" · ");
}

function renderStatus(status: SendStatus): string {
  const dismiss =
    status.rejected.length > 0
      ? ` <button type="button" class="ring-link" data-action="dismiss-rejected">${escapeHtml(t("ring.dismiss"))}</button>`
      : "";
  return `<p class="ring-status${status.alarm ? " ring-status-alarm" : ""}${status.offline ? " ring-status-offline" : ""}" aria-live="polite">${escapeHtml(statusText(status))}${dismiss}</p>`;
}

function renderNotApplied(items: readonly NotAppliedItem[]): string {
  if (items.length === 0) {
    return "";
  }
  const lines = items.map((item) => {
    if (item.kind === "undo") {
      return t("ring.notAppliedUndo");
    }
    const params = { left: Number(item.exchange.leftPoints), right: Number(item.exchange.rightPoints) };
    return t(item.exchange.kind === "DEDUCTION" ? "ring.notAppliedDeduction" : "ring.notAppliedExchange", params);
  });
  return `<div class="ring-not-applied" role="alert">
      <p>${escapeHtml(t("ring.notApplied"))}</p>
      <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      <button type="button" class="ring-link" data-action="dismiss-not-applied">${escapeHtml(t("ring.dismiss"))}</button>
    </div>`;
}

function minutesSeconds(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Round, rounds won, overtime or the break, and the buttons the keeper may use now. */
export function phaseLine(phase: PhaseView): string[] {
  const parts: string[] = [];
  if (phase.rounds > 1) {
    parts.push(t("ring.round", { round: String(phase.round), rounds: String(phase.rounds) }));
    parts.push(t("ring.roundsWon", { left: String(phase.roundsWon.left), right: String(phase.roundsWon.right) }));
  }
  if (phase.period === "EXTENSION") parts.push(t("ring.inExtension", { n: String(phase.extension) }));
  if (phase.period === "SUDDEN_DEATH") parts.push(t("ring.inSuddenDeath"));
  if (phase.period === "BREAK") {
    parts.push(phase.breakRemaining ? t("ring.break", { time: minutesSeconds(phase.breakRemaining) }) : t("ring.breakOver"));
  }
  if (phase.warnings.left > 0 || phase.warnings.right > 0) {
    parts.push(t("ring.warnings", { left: String(phase.warnings.left), right: String(phase.warnings.right) }));
  }
  return parts;
}

function renderPhase(phase: PhaseView): string {
  const parts = phaseLine(phase);
  const button = (action: string, label: string) => `<button type="button" class="ring-bar-button ring-bar-button-primary" data-action="${action}">${escapeHtml(label)}</button>`;
  const buttons = [
    phase.steps.extension ? button("extension", t("ring.extension")) : "",
    phase.steps.suddenDeath ? button("sudden-death", t("ring.suddenDeath")) : "",
    phase.steps.nextRound ? button("next-round", t("ring.nextRound")) : "",
    phase.steps.startRound ? button("start-round", t("ring.startRound", { round: String(phase.round + 1) })) : "",
  ].join("");
  if (parts.length === 0 && buttons === "") {
    return "";
  }
  return `<div class="ring-bar-row ring-phase${phase.period === "BREAK" ? " ring-phase-break" : ""}">
      ${parts.length > 0 ? `<p class="ring-phase-text" aria-live="polite">${escapeHtml(parts.join(" · "))}</p>` : ""}
      ${buttons}
    </div>`;
}

function renderBar(state: Readonly<RingModeState>): string {
  const take = !state.isKeeper && state.notice?.key !== "ring.linkInvalid";
  return `${renderNotice(state)}
    ${state.phase ? renderPhase(state.phase) : ""}
    <div class="ring-bar-row">
      ${renderStatus(state.status)}
      <button type="button" class="ring-bar-button" data-action="undo"${state.canUndo ? "" : " disabled"}>${escapeHtml(t("ring.undo"))}</button>
      ${take ? `<button type="button" class="ring-bar-button" data-action="take">${escapeHtml(t("ring.take"))}</button>` : ""}
      <button type="button" class="ring-bar-button" data-action="back">${escapeHtml(t("ring.backToRing"))}</button>
    </div>
    ${renderNotApplied(state.notApplied)}`;
}

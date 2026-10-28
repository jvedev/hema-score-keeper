import { ApiError, SessionExpiredError } from "@hema/api-session";
import {
  nextSteps,
  parseRingRules,
  roundSeconds,
  roundsWon,
  type BoutPeriod,
  type BoutPhase,
  type NextSteps,
  type RingRules,
  type SideScore,
} from "@hema/competition-domain";
import type { MatchEventDetail } from "@hema/ui";
import { exchangeFromMatchEvent, type LiveExchangeInput } from "./exchange-mapping";
import type {
  AcknowledgedExchange,
  ActiveKeeper,
  BoutDetail,
  BoutStateReport,
  BoutScore,
  ExchangeToSend,
  LiveBoutRow,
  LiveRing,
  LiveSession,
  LiveWriter,
  RingByToken,
} from "./live-client";
import { getOutbox, type Outbox, type OutboxOp, type OutboxState, type OutboxTimers, type RejectedOp } from "./outbox";

/** While the bout clock runs, the keeper reports it this often (and on every pause and resume). */
export const CLOCK_REPORT_MS = 5000;
/** Bouts whose queue must not be resent (this device re-claimed the ring) but could not be checked against the server yet. */
/** Outbox storage keys (see outbox.ts), to count what is queued before the ring is known. */
const OUTBOX_PREFIX = "hema-score-keeper.outbox.";
/** Delays before the next ring reload while the server cannot be reached; the last one repeats. */
const LOAD_RETRY_MS = [1000, 2000, 5000, 5000];
const STALE_KEY = "hema-score-keeper.ring-stale-bouts";
/** Per ring: what was dropped as "not applied", kept until the keeper dismisses it. */
const NOT_APPLIED_PREFIX = "hema-score-keeper.ring-not-applied.";
/** A bout read that raced an acknowledged write is read again, at most this many times. */
const MAX_READS = 5;

/** What ring mode needs from the backend. `LiveClient` is the real one. */
export interface RingApi extends LiveWriter {
  readonly deviceId: string;
  currentSession(): LiveSession | null;
  login(username: string, password: string): Promise<LiveSession>;
  hasClaim(ringId: string): boolean;
  /** The ring token this device's stored claim was made under, or null. */
  claimToken(ringId: string): string | null;
  ringByToken(ringToken: string): Promise<RingByToken>;
  getBout(boutId: string): Promise<BoutDetail>;
  claim(ringToken: string, ringId: string, options?: { confirm?: boolean }): Promise<{ ring: LiveRing }>;
}

/** The bout as the scoring screen opens it: the clock always starts paused, at the seconds the backend stored. */
export interface OpenBout {
  id: string;
  label: string;
  fighterLeft: string;
  fighterRight: string;
  clockSeconds: number;
  /** The countdown length of the round the bout is in (its time plus extensions). */
  durationSeconds: number;
  /** The bout has begun (it runs on the server, or has time or exchanges): the screen opens past its Start button. */
  started: boolean;
  score: BoutScore;
}

/** The existing scoring (fight) screen, as ring mode drives it. */
export interface BoutScreen {
  open(bout: OpenBout): Promise<void>;
  setScore(score: BoutScore): void;
  /** Read-only stops the clock and disables every control. */
  setReadOnly(readOnly: boolean): void;
  /** Shows the open bout again as it was (after the sign-in screen), clock untouched. */
  show(): void;
  /** The clock now: elapsed seconds and whether it runs. */
  clock(): { seconds: number; running: boolean };
  /** A new countdown length with `elapsedSeconds` gone (an extension keeps the time gone; a new round starts at 0). Clock paused. */
  setDuration(totalSeconds: number, elapsedSeconds: number): void;
  close(): Promise<void>;
}

export type NoticeKey = "ring.takenOver" | "ring.notClaimed" | "ring.linkInvalid" | "ring.signedOut" | "ring.loadFailed";

export interface Notice {
  key: NoticeKey;
  params?: Record<string, string>;
}

/** An exchange or undo that never reached the server and was dropped from the queue: the keeper re-enters it if needed. */
export type NotAppliedItem = { kind: "exchange"; exchange: LiveExchangeInput } | { kind: "undo" };

export interface SendStatus {
  /** Ops not acknowledged yet ("n not sent"; 0 is "all sent"). */
  pending: number;
  /** The outbox is backing off after a failed send. */
  offline: boolean;
  /** Something needs the keeper's eye: an op was refused, or the queue could not be saved. */
  alarm: boolean;
  persistenceFailed: boolean;
  rejected: readonly RejectedOp[];
}

/** Where the open bout is, for the ring bar. */
export interface PhaseView {
  round: number;
  rounds: number;
  period: BoutPeriod;
  extension: number;
  roundsWon: SideScore;
  warnings: SideScore;
  /** What the keeper may do now (all false when read-only). */
  steps: NextSteps;
  /** In a break: seconds left (0 once it is over). */
  breakRemaining: number | null;
}

export interface RingModeState {
  screen: "loading" | "signIn" | "invalidLink" | "error" | "ring" | "bout";
  signInError: string | null;
  /** For the error screen, or a short failure on the ring screen. */
  error: string | null;
  ring: LiveRing | null;
  tournamentName: string;
  bouts: LiveBoutRow[];
  activeKeeper: ActiveKeeper | null;
  /** This device keeps the ring (as far as it knows; a TAKEN_OVER answer says otherwise). */
  isKeeper: boolean;
  readOnly: boolean;
  notice: Notice | null;
  /** The bout on the scoring screen. */
  boutId: string | null;
  /** After a finish: the bout to offer next. */
  nextBoutId: string | null;
  status: SendStatus;
  notApplied: NotAppliedItem[];
  canUndo: boolean;
  /** The ring could not be loaded because the server cannot be reached: it is tried again by itself. `unsent` counts score ops still queued. */
  loadRetry: { unsent: number } | null;
  /** The tournament's ring rules. */
  rules: RingRules;
  /** The open bout's round, period and warnings; null off the scoring screen. */
  phase: PhaseView | null;
}

export interface RingView {
  render(state: Readonly<RingModeState>): void;
  /** Someone else keeps the ring: ask before taking it over. */
  confirmTakeover(keeperName: string): Promise<boolean>;
}

export interface ClockTimer {
  every(run: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

export interface RingControllerOptions {
  api: RingApi;
  view: RingView;
  boutScreen: BoutScreen;
  storage?: Storage;
  /** The outbox's retry timers. */
  timers?: OutboxTimers;
  clockTimer?: ClockTimer;
  /** Milliseconds now (the break countdown). */
  now?: () => number;
}

interface HistoryEntry {
  clientExchangeId: string;
  serverId: string | null;
  exchange: LiveExchangeInput;
}

/**
 * The sheet's rule, as the backend counts it: an exchange where both fighters score is a double and counts 0 for both;
 * a deduction is negative points for one fighter. The ruleset's own switches do not apply in ring mode.
 */
export function sheetScore(exchanges: readonly { kind: "EXCHANGE" | "DEDUCTION"; leftPoints: number; rightPoints: number }[]): BoutScore {
  const score: BoutScore = { left: 0, right: 0, doubles: 0 };
  for (const exchange of exchanges) {
    if (exchange.kind === "EXCHANGE" && exchange.leftPoints > 0 && exchange.rightPoints > 0) {
      score.doubles += 1;
      continue;
    }
    score.left += exchange.leftPoints;
    score.right += exchange.rightPoints;
  }
  return score;
}

/** Warnings in ring mode: the sheet has no place for a disqualification, so it is not offered (and a warning that only disqualifies goes). */
export function ringPenalties<P extends { description: string; penalties: number[]; disqualify: boolean }>(penalties: readonly P[]): P[] {
  return penalties.filter((penalty) => penalty.penalties.length > 0).map((penalty) => ({ ...penalty, penalties: [...penalty.penalties], disqualify: false }));
}

function isScore(value: unknown): value is BoutScore {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { left, right, doubles } = value as Record<string, unknown>;
  return typeof left === "number" && typeof right === "number" && typeof doubles === "number";
}

function scoreFromResponse(response: unknown): BoutScore | null {
  const score = typeof response === "object" && response !== null ? (response as { score?: unknown }).score : undefined;
  return isScore(score) ? score : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ring mode (`/ring/:token`): sign in, see the ring's bouts and keeper, take the ring, score its bouts on the existing
 * scoring screen with every write going through the outbox, and turn read-only when another device takes over.
 * It holds no DOM: `RingView` renders the state and `BoutScreen` is the scoring screen.
 */
export class RingController {
  readonly #api: RingApi;
  readonly #view: RingView;
  readonly #screen: BoutScreen;
  readonly #storage: Storage;
  readonly #timers: OutboxTimers | undefined;
  readonly #clockTimer: ClockTimer;
  readonly #writer: LiveWriter;
  readonly #now: () => number;
  #token = "";
  #phase: BoutPhase = { round: 1, period: "REGULAR", extension: 0 };
  #warnings: SideScore = { left: 0, right: 0 };
  /** When the break began on this device (ms), and the timer that counts it down on screen. */
  #breakStartedAt: number | null = null;
  #breakHandle: unknown = null;
  #state: RingModeState = RingController.#initial();
  /** Bouts whose outbox this page uses, with their last seen state. */
  readonly #touched = new Map<string, { outbox: Outbox; last: OutboxState; unsubscribe: () => void }>();
  #history: HistoryEntry[] = [];
  #serverScore: BoutScore | null = null;
  #clockHandle: unknown = null;
  /** Bumped whenever another bout opens, so late answers about an older one are ignored. */
  #generation = 0;
  /** Exchange and undo writes acknowledged per bout: a bout read during which this changed may predate one of them. */
  readonly #acks = new Map<string, number>();
  /** Another device took this ring from this device; only then is the old queue dropped on the next claim. */
  #takenOver = false;
  /** The scheduled reload after an unreachable server, and how many times in a row it failed. */
  #loadRetryHandle: unknown = null;
  #loadFailures = 0;
  /** Bumped by close(): a ring load that started before it is dropped when it ends (no retry, no claim). */
  #loadGeneration = 0;
  /** Identifies the scheduled retry: one that was cancelled does nothing even if its timer still fires. */
  #retrySeq = 0;
  /** The ring load in flight for open/reload/retry: a second request joins it, so two loads never both claim. */
  #loading: Promise<void> | null = null;

  constructor(options: RingControllerOptions) {
    this.#api = options.api;
    this.#view = options.view;
    this.#screen = options.boutScreen;
    this.#storage = options.storage ?? localStorage;
    this.#timers = options.timers;
    this.#clockTimer = options.clockTimer ?? { every: (run, ms) => setInterval(run, ms), cancel: (handle) => clearInterval(handle as ReturnType<typeof setInterval>) };
    this.#writer = this.#scoreCapturingWriter();
    this.#now = options.now ?? (() => Date.now());
  }

  static #initial(): RingModeState {
    return {
      screen: "loading",
      signInError: null,
      error: null,
      ring: null,
      tournamentName: "",
      bouts: [],
      activeKeeper: null,
      isKeeper: false,
      readOnly: true,
      notice: null,
      boutId: null,
      nextBoutId: null,
      status: { pending: 0, offline: false, alarm: false, persistenceFailed: false, rejected: [] },
      notApplied: [],
      canUndo: false,
      loadRetry: null,
      rules: parseRingRules(null),
      phase: null,
    };
  }

  get state(): Readonly<RingModeState> {
    return this.#state;
  }

  /** Opens the ring behind a link. Without a sign-in, shows the sign-in screen first. */
  async open(ringToken: string): Promise<void> {
    this.close();
    this.#token = ringToken;
    this.#state = RingController.#initial();
    this.#render();
    if (!this.#api.currentSession()) {
      this.#update({ screen: "signIn" });
      return;
    }
    await this.#loadOnce();
  }

  async signIn(username: string, password: string): Promise<void> {
    this.#update({ signInError: null });
    try {
      await this.#api.login(username, password);
    } catch (error) {
      this.#update({ signInError: errorMessage(error) });
      return;
    }
    const signedOut = [...this.#touched.entries()].filter(([, entry]) => entry.last.status === "signedOut");
    for (const [, entry] of signedOut) {
      entry.outbox.resume();
    }
    const openBout = this.#state.boutId;
    if (this.#state.notice?.key === "ring.signedOut") {
      this.#update({ notice: null });
    }
    for (const [, entry] of signedOut) {
      void entry.outbox.flush();
    }
    if (openBout) {
      // Back to the bout the keeper was scoring, whichever outbox signed out; its clock reports start again.
      this.#update({ screen: "bout" });
      this.#screen.show();
      this.#screen.setReadOnly(this.#state.readOnly);
      this.#showScore();
      this.clockToggled();
      return;
    }
    await this.#loadOnce();
  }

  /** "Take this ring": claims it, asking first when someone else keeps it. */
  async takeRing(): Promise<void> {
    await this.#claim(false);
  }

  /** Opens a bout on the scoring screen: its stored exchanges, and the clock paused at the stored seconds. */
  async openBout(boutId: string): Promise<void> {
    const row = this.#state.bouts.find((bout) => bout.id === boutId);
    if (!row) {
      return;
    }
    const generation = ++this.#generation;
    this.#stopClockReports();
    const outbox = this.#outboxFor(boutId);
    let read: { detail: BoutDetail; consistent: boolean };
    try {
      read = await this.#readBout(boutId);
    } catch (error) {
      this.#loadFailed(error);
      return;
    }
    if (generation !== this.#generation) {
      return;
    }
    const { detail } = read;
    if (this.#staleBouts().includes(boutId)) {
      this.#dropStale(outbox, detail);
    } else {
      outbox.reconcile(detail.exchanges, { complete: read.consistent });
    }
    this.#serverScore = detail.score;
    this.#history = this.#historyFrom(detail, outbox);
    this.#restorePhase(detail);
    const started = detail.bout.status !== "PENDING" || detail.clock.seconds > 0 || detail.exchanges.length > 0;
    this.#setBoutStatus(boutId, detail.bout.status);
    this.#update({ screen: "bout", boutId, nextBoutId: null });
    await this.#screen.open({
      id: boutId,
      label: row.label ?? `${row.order}`,
      fighterLeft: row.fighterLeft,
      fighterRight: row.fighterRight,
      clockSeconds: detail.clock.seconds,
      durationSeconds: roundSeconds(this.#state.rules, this.#phase.extension),
      started,
      score: this.#displayScore(),
    });
    this.#screen.setReadOnly(this.#state.readOnly);
    this.#showScore();
    if (this.#state.isKeeper) {
      // The bout opens paused; a clock the server still has running is reported paused too, so the scoreboard agrees.
      if (detail.clock.running) {
        outbox.enqueueClock(this.#withState({ seconds: detail.clock.seconds, running: false }));
      }
      void outbox.flush();
    }
  }

  /** A match event from the scoring screen (score, warning). Read-only, or not an exchange the sheet takes: nothing is sent. */
  matchEvent(event: MatchEventDetail): void {
    const outbox = this.#currentOutbox();
    if (!outbox || this.#state.readOnly) {
      return;
    }
    if (event.type === "warning") {
      const side = event.fighter === "A" ? "left" : "right";
      this.#warnings = { ...this.#warnings, [side]: this.#warnings[side] + 1 };
      this.#reportState();
    }
    const mapped = exchangeFromMatchEvent(event);
    if (!mapped) {
      return;
    }
    const exchange = this.#state.rules.format.rounds > 1 ? { ...mapped, round: this.#phase.round } : mapped;
    const clientExchangeId = outbox.enqueueExchange(exchange);
    this.#history.push({ clientExchangeId, serverId: null, exchange });
    this.#setBoutStatus(this.#state.boutId!, "RUNNING", true);
    this.#showScore();
  }

  /** Undoes the newest exchange of the open bout. */
  undo(): void {
    const outbox = this.#currentOutbox();
    if (!outbox || this.#state.readOnly) {
      return;
    }
    const last = this.#history.pop();
    if (!last) {
      return;
    }
    if (last.serverId) {
      outbox.enqueueUndo(last.serverId);
    } else {
      outbox.enqueueUndoOfClientExchange(last.clientExchangeId);
    }
    this.#showScore();
  }

  /** The scoring screen's clock was paused or resumed: report it, and keep reporting it every 5 s while it runs. */
  clockToggled(): void {
    const outbox = this.#currentOutbox();
    if (!outbox || this.#state.readOnly) {
      return;
    }
    const clock = this.#screen.clock();
    if (clock.running && this.#boutRow()?.status === "PENDING") {
      outbox.enqueueStart();
      this.#setBoutStatus(this.#state.boutId!, "RUNNING", true);
    }
    outbox.enqueueClock(this.#withState(clock));
    this.#stopClockReports();
    this.#refreshPhase();
    if (clock.running) {
      this.#clockHandle = this.#clockTimer.every(() => {
        const now = this.#screen.clock();
        if (this.#state.readOnly || !now.running) {
          this.#stopClockReports();
          return;
        }
        this.#currentOutbox()?.enqueueClock(this.#withState(now));
      }, CLOCK_REPORT_MS);
    }
  }

  /** A tied round at time-up: an extension adds its time to the countdown. */
  extension(): void {
    if (!this.#state.phase?.steps.extension) {
      return;
    }
    const clock = this.#screen.clock();
    this.#phase = { ...this.#phase, period: "EXTENSION", extension: this.#phase.extension + 1 };
    this.#screen.setDuration(roundSeconds(this.#state.rules, this.#phase.extension), clock.seconds);
    this.#reportState();
  }

  /** A tied round after the extensions: first point wins, no time. */
  suddenDeath(): void {
    if (!this.#state.phase?.steps.suddenDeath) {
      return;
    }
    this.#phase = { ...this.#phase, period: "SUDDEN_DEATH" };
    this.#reportState();
  }

  /** Ends the round: the break between rounds starts counting down. */
  nextRound(): void {
    if (!this.#state.phase?.steps.nextRound) {
      return;
    }
    this.#phase = { ...this.#phase, period: "BREAK" };
    this.#startBreak(this.#now());
    this.#reportState();
  }

  /** From the break (whenever the keeper is ready): the next round starts at 0–0 with a full clock. */
  startRound(): void {
    if (!this.#state.phase?.steps.startRound) {
      return;
    }
    this.#stopBreak();
    this.#phase = { round: this.#phase.round + 1, period: "REGULAR", extension: 0 };
    this.#screen.setDuration(this.#state.rules.maxDurationSeconds, 0);
    this.#reportState();
    this.#showScore();
  }

  /** Ends the open bout: the clock is reported paused, the bout is finished, and the next bout is offered. */
  async finishBout(): Promise<void> {
    const outbox = this.#currentOutbox();
    const boutId = this.#state.boutId;
    if (!outbox || !boutId) {
      return;
    }
    if (!this.#state.readOnly) {
      outbox.enqueueClock(this.#withState({ seconds: this.#screen.clock().seconds, running: false }));
      outbox.enqueueFinish();
      this.#setBoutStatus(boutId, "DONE", true);
    }
    await this.#leaveBout(boutId);
  }

  /** Back to the ring list without finishing (the clock is reported paused). */
  async backToRing(): Promise<void> {
    const outbox = this.#currentOutbox();
    const boutId = this.#state.boutId;
    if (!outbox || !boutId) {
      return;
    }
    if (!this.#state.readOnly && this.#screen.clock().running) {
      outbox.enqueueClock(this.#withState({ seconds: this.#screen.clock().seconds, running: false }));
    }
    await this.#leaveBout(boutId, false);
  }

  /** Loads the ring again after an error, as opening the link would (a ring nobody keeps is claimed). */
  async reload(): Promise<void> {
    this.#cancelLoadRetry();
    await this.#loadOnce();
  }

  dismissNotApplied(): void {
    const ringId = this.#state.ring?.id;
    if (ringId) {
      try {
        this.#storage.removeItem(NOT_APPLIED_PREFIX + ringId);
      } catch {
        // Nothing stored.
      }
    }
    this.#update({ notApplied: [] });
  }

  dismissRejected(): void {
    for (const { outbox } of this.#touched.values()) {
      for (const op of outbox.state().rejected) {
        outbox.dismissRejected(op.opId);
      }
    }
  }

  /** Stops the clock reports and listening to the outboxes (leaving ring mode). The queues stay saved and keep sending. */
  close(): void {
    this.#cancelLoadRetry();
    this.#loadGeneration++;
    this.#loading = null;
    this.#stopClockReports();
    for (const { unsubscribe } of this.#touched.values()) {
      unsubscribe();
    }
    this.#touched.clear();
    this.#generation++;
  }

  // --- ring ---

  /** Loads the ring (claiming a free one), or joins the load already in flight. */
  #loadOnce(): Promise<void> {
    if (this.#loading) {
      return this.#loading;
    }
    const load: Promise<void> = this.#loadRing(true).finally(() => {
      if (this.#loading === load) {
        this.#loading = null;
      }
    });
    this.#loading = load;
    return load;
  }

  async #loadRing(mayClaim: boolean): Promise<void> {
    const generation = this.#loadGeneration;
    let ring: RingByToken;
    try {
      ring = await this.#api.ringByToken(this.#token);
    } catch (error) {
      if (generation === this.#loadGeneration) {
        this.#loadFailed(error, true);
      }
      return;
    }
    if (generation !== this.#loadGeneration) {
      return;
    }
    this.#cancelLoadRetry();
    this.#loadFailures = 0;
    const keepsIt = ring.youAreKeeper === true;
    const claimToken = this.#api.hasClaim(ring.ring.id) ? this.#api.claimToken(ring.ring.id) : null;
    // A claim made under another ring token: the link was rotated since, and someone may have kept the ring meanwhile.
    const rotatedClaim = !keepsIt && claimToken !== null && claimToken !== this.#token;
    // A stored claim while another device keeps the ring: this device was taken over (maybe before a reload).
    if (!keepsIt && ring.activeKeeper !== null && this.#api.hasClaim(ring.ring.id)) {
      this.#takenOver = true;
    }
    this.#update({
      screen: this.#state.screen === "bout" ? "bout" : "ring",
      ring: ring.ring,
      tournamentName: ring.tournament.name,
      rules: parseRingRules(ring.rules),
      bouts: ring.bouts,
      activeKeeper: ring.activeKeeper,
      isKeeper: keepsIt,
      readOnly: !keepsIt,
      error: null,
      loadRetry: null,
      nextBoutId: this.#state.nextBoutId ?? this.#firstOpenBout(ring.bouts),
      notApplied: this.#storedNotApplied(ring.ring.id),
    });
    if (rotatedClaim) {
      // Treated as taken over: what was queued under the old link is reconciled, shown as not applied and dropped.
      await this.#dropStaleQueues();
    }
    // A reload with a stored claim does not claim again: a claim pauses the ring's clocks. A ring nobody keeps is
    // claimed straight away; one someone else keeps waits for "Take this ring".
    if (mayClaim && !keepsIt && ring.activeKeeper === null && !this.#lostRing()) {
      await this.#claim(false);
      return;
    }
    if (keepsIt) {
      this.#flushWaitingBouts();
    }
  }

  /** Bouts left with unsent ops (a reload while offline, a bout finished just before) carry on sending. */
  #flushWaitingBouts(): void {
    const stale = this.#staleBouts();
    for (const bout of this.#state.bouts) {
      if (stale.includes(bout.id)) {
        continue;
      }
      const outbox = this.#touched.get(bout.id)?.outbox ?? this.#registeredOutbox(bout.id);
      if (outbox.pending() > 0) {
        void this.#outboxFor(bout.id).flush();
      }
    }
  }

  /** The device was told it lost the ring (taken over, link invalid) in this page; only an explicit tap claims again. */
  #lostRing(): boolean {
    const key = this.#state.notice?.key;
    return key === "ring.takenOver" || key === "ring.notClaimed";
  }

  async #claim(confirm: boolean): Promise<void> {
    const ring = this.#state.ring;
    if (!ring) {
      return;
    }
    try {
      await this.#api.claim(this.#token, ring.id, confirm ? { confirm: true } : {});
    } catch (error) {
      if (!confirm && error instanceof ApiError && error.status === 409 && error.body.reason === "ACTIVE_KEEPER") {
        const name = keeperName(error.body.activeKeeper) ?? this.#state.activeKeeper?.userName ?? "";
        if (await this.#view.confirmTakeover(name)) {
          await this.#claim(true);
        }
        return;
      }
      this.#loadFailed(error);
      return;
    }
    this.#update({ isKeeper: true, readOnly: false, notice: null, error: null });
    if (this.#takenOver) {
      // Taken back from another device: the old queue is never resent.
      this.#takenOver = false;
      await this.#dropStaleQueues();
    } else {
      // Nobody else kept the ring meanwhile: what is queued is still this keeper's and is sent (after the ring reload).
      for (const { outbox, last } of this.#touched.values()) {
        if (last.status === "takenOver" || last.status === "linkInvalid") {
          outbox.resume();
        }
      }
    }
    // The claim paused the ring's clocks: the open bout is read again (clock paused where the server has it).
    const openBout = this.#state.boutId;
    await this.#loadRing(false);
    if (openBout && this.#state.screen === "bout") {
      await this.openBout(openBout);
    }
  }

  /**
   * This device just (re)claimed the ring. What it still had queued for the ring's bouts was written while it was not
   * the keeper, or before a takeover: it is never resent (the new keeper may have entered the same exchanges). Each
   * queue is checked against the server, and what the server does not have is shown as not applied and dropped.
   */
  async #dropStaleQueues(): Promise<void> {
    for (const bout of this.#state.bouts) {
      const outbox = this.#touched.get(bout.id)?.outbox ?? this.#registeredOutbox(bout.id);
      outbox.dispose();
      if (outbox.pending() === 0) {
        outbox.resume();
        continue;
      }
      this.#markStale(bout.id, true);
      try {
        this.#dropStale(outbox, (await this.#readBout(bout.id)).detail);
      } catch {
        // Checked when the bout is opened; until then it is not sent.
      }
    }
  }

  #dropStale(outbox: Outbox, detail: BoutDetail): void {
    outbox.reconcile(detail.exchanges, { complete: true });
    const dropped = outbox.discard();
    outbox.resume();
    this.#markStale(detail.bout.id, false);
    this.#addNotApplied(dropped);
  }

  #addNotApplied(ops: readonly OutboxOp[]): void {
    const items: NotAppliedItem[] = [];
    for (const op of ops) {
      if (op.type === "exchange") {
        items.push({ kind: "exchange", exchange: op.exchange });
      } else if (op.type === "undo") {
        items.push({ kind: "undo" });
      }
    }
    if (items.length > 0) {
      const notApplied = [...this.#state.notApplied, ...items];
      const ringId = this.#state.ring?.id;
      if (ringId) {
        try {
          this.#storage.setItem(NOT_APPLIED_PREFIX + ringId, JSON.stringify(notApplied));
        } catch {
          // Not storable: shown in this page only.
        }
      }
      this.#update({ notApplied });
    }
  }

  #storedNotApplied(ringId: string): NotAppliedItem[] {
    try {
      const parsed: unknown = JSON.parse(this.#storage.getItem(NOT_APPLIED_PREFIX + ringId) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((item): item is NotAppliedItem => typeof item === "object" && item !== null && (item.kind === "undo" || item.kind === "exchange")) : [];
    } catch {
      return [];
    }
  }

  #loadFailed(error: unknown, retryLoad = false): void {
    if (error instanceof SessionExpiredError) {
      this.#update({ screen: "signIn" });
      return;
    }
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      this.#stopClockReports();
      this.#update({ screen: "invalidLink", readOnly: true, isKeeper: false });
      return;
    }
    if (retryLoad && !(error instanceof ApiError && error.status < 500 && error.status !== 408 && error.status !== 429)) {
      this.#scheduleLoadRetry();
      if (this.#state.ring) {
        this.#update({ notice: { key: "ring.loadFailed" } });
      }
      return;
    }
    if (this.#state.ring) {
      this.#update({ error: errorMessage(error), notice: { key: "ring.loadFailed" } });
      return;
    }
    this.#update({ screen: "error", error: errorMessage(error) });
  }

  /** Network, timeout or server trouble: load the ring again after 1, 2, 5, 5... seconds until it works. */
  #scheduleLoadRetry(): void {
    this.#cancelLoadRetry();
    const delay = LOAD_RETRY_MS[Math.min(this.#loadFailures, LOAD_RETRY_MS.length - 1)]!;
    this.#loadFailures += 1;
    const seq = this.#retrySeq;
    const run = () => {
      if (seq !== this.#retrySeq) {
        return;
      }
      this.#loadRetryHandle = null;
      void this.#loadOnce();
    };
    this.#loadRetryHandle = this.#timers ? this.#timers.set(run, delay) : setTimeout(run, delay);
    this.#update({ loadRetry: { unsent: this.#unsentScores() }, ...(this.#state.ring ? {} : { screen: "error" as const, error: null }) });
  }

  #cancelLoadRetry(): void {
    this.#retrySeq++;
    if (this.#loadRetryHandle === null) {
      return;
    }
    if (this.#timers) {
      this.#timers.clear(this.#loadRetryHandle);
    } else {
      clearTimeout(this.#loadRetryHandle as ReturnType<typeof setTimeout>);
    }
    this.#loadRetryHandle = null;
  }

  /** Score ops (not clock reports) still queued in storage for this ring (every stored queue while the ring is not known yet). */
  #unsentScores(): number {
    const ids = this.#state.ring ? new Set(this.#state.bouts.map((bout) => bout.id)) : null;
    let count = 0;
    try {
      for (let index = 0; index < this.#storage.length; index++) {
        const key = this.#storage.key(index);
        if (!key?.startsWith(OUTBOX_PREFIX) || (ids && !ids.has(key.slice(OUTBOX_PREFIX.length)))) {
          continue;
        }
        const parsed = JSON.parse(this.#storage.getItem(key) ?? "null") as { queue?: Array<{ type?: string }> } | null;
        count += (parsed?.queue ?? []).filter((op) => op.type !== "clock").length;
      }
    } catch {
      // Unreadable storage: nothing to count.
    }
    return count;
  }

  #firstOpenBout(bouts: readonly LiveBoutRow[], after = -Infinity): string | null {
    return bouts.find((bout) => bout.order > after && bout.status !== "DONE")?.id ?? null;
  }

  // --- bout ---

  async #leaveBout(boutId: string, offerNext = true): Promise<void> {
    this.#stopClockReports();
    this.#generation++;
    const order = this.#state.bouts.find((bout) => bout.id === boutId)?.order ?? -Infinity;
    this.#stopBreak();
    await this.#screen.close();
    this.#history = [];
    this.#serverScore = null;
    this.#update({
      phase: null,
      screen: "ring",
      boutId: null,
      canUndo: false,
      nextBoutId: offerNext ? this.#firstOpenBout(this.#state.bouts, order) : this.#state.nextBoutId,
    });
    try {
      const ring = await this.#api.ringByToken(this.#token);
      // Scores of bouts still being sent are newer here than on the server.
      const local = new Map(this.#state.bouts.map((bout) => [bout.id, bout]));
      this.#update({
        bouts: ring.bouts.map((bout) => (this.#pendingFor(bout.id) > 0 ? (local.get(bout.id) ?? bout) : bout)),
        activeKeeper: ring.activeKeeper,
      });
    } catch {
      // The list stays as it was; the status line shows what is not sent.
    }
  }

  #historyFrom(detail: BoutDetail, outbox: Outbox): HistoryEntry[] {
    const history: HistoryEntry[] = detail.exchanges
      .filter((exchange) => !exchange.undoneAt)
      .sort((a, b) => a.seq - b.seq)
      .map((exchange) => ({
        clientExchangeId: exchange.clientExchangeId,
        serverId: exchange.id,
        exchange: {
          kind: exchange.kind,
          leftPoints: exchange.leftPoints,
          rightPoints: exchange.rightPoints,
          isDouble: exchange.isDouble,
          firstScorer: exchange.firstScorer,
          ...(exchange.round !== undefined && exchange.round !== 1 ? { round: exchange.round } : {}),
        },
      }));
    // A stopped queue is not shown as applied: the screen shows what the server has.
    if (outbox.state().unconfirmed > 0) {
      return history;
    }
    for (const op of outbox.queued()) {
      if (op.type === "exchange") {
        history.push({ clientExchangeId: op.clientExchangeId, serverId: null, exchange: op.exchange });
      } else if (op.type === "undo") {
        const index = history.findIndex((entry) => (op.expectedExchangeId !== undefined ? entry.serverId === op.expectedExchangeId : entry.clientExchangeId === op.expectedClientExchangeId));
        if (index >= 0) {
          history.splice(index, 1);
        }
      }
    }
    return history;
  }

  /** The server's score once nothing is waiting to be sent (so the screen and the sheet agree), else the sheet rule over what this device has. */
  #displayScore(): BoutScore {
    const boutId = this.#state.boutId;
    if (this.#state.rules.format.rounds > 1) {
      return this.#roundScore(this.#phase.round);
    }
    if (boutId && this.#serverScore && this.#pendingFor(boutId) === 0 && !this.#stopped(boutId)) {
      return this.#serverScore;
    }
    return sheetScore(this.#history.map((entry) => entry.exchange));
  }

  /** One round's score by the sheet rule, from what this device has (an exchange without a round is round 1). */
  #roundScore(round: number): BoutScore {
    return sheetScore(this.#history.filter((entry) => (entry.exchange.round ?? 1) === round).map((entry) => entry.exchange));
  }

  // --- rounds, break and overtime ---

  #stateReport(): BoutStateReport {
    return { ...this.#phase, warningsLeft: this.#warnings.left, warningsRight: this.#warnings.right };
  }

  #withState(clock: { seconds: number; running: boolean }): { seconds: number; running: boolean; state: BoutStateReport } {
    return { seconds: clock.seconds, running: clock.running, state: this.#stateReport() };
  }

  /** Reports the bout's state now (with the clock as it is) and redraws the bar. */
  #reportState(): void {
    if (!this.#state.readOnly) {
      this.#currentOutbox()?.enqueueClock(this.#withState(this.#screen.clock()));
    }
    this.#refreshPhase();
  }

  #restorePhase(detail: BoutDetail): void {
    this.#stopBreak();
    const bout = detail.bout;
    this.#phase = { round: bout.round ?? 1, period: bout.period ?? "REGULAR", extension: bout.extension ?? 0 };
    this.#warnings = { left: bout.warningsLeft ?? 0, right: bout.warningsRight ?? 0 };
    if (this.#phase.period === "BREAK") {
      // The break goes on from where the server has it.
      const breakSeconds = this.#state.rules.format.breakSeconds;
      const remaining = detail.display?.remainingSeconds ?? breakSeconds;
      this.#startBreak(this.#now() - (breakSeconds - remaining) * 1000);
    }
  }

  #startBreak(startedAt: number): void {
    this.#stopBreak();
    this.#breakStartedAt = startedAt;
    this.#breakHandle = this.#clockTimer.every(() => {
      this.#refreshPhase();
      if ((this.#state.phase?.breakRemaining ?? 0) <= 0 && this.#breakHandle !== null) {
        this.#clockTimer.cancel(this.#breakHandle);
        this.#breakHandle = null;
      }
    }, 1000);
  }

  #stopBreak(): void {
    if (this.#breakHandle !== null) {
      this.#clockTimer.cancel(this.#breakHandle);
      this.#breakHandle = null;
    }
    this.#breakStartedAt = null;
  }

  #refreshPhase(): void {
    if (this.#state.screen !== "bout") {
      return;
    }
    const rules = this.#state.rules;
    const phase = this.#phase;
    const scores = Array.from({ length: phase.round }, (_, index) => this.#roundScore(index + 1));
    const won = roundsWon(scores, phase.round - 1);
    const clock = this.#screen.clock();
    const timeUp = !clock.running && clock.seconds >= roundSeconds(rules, phase.extension);
    const steps = this.#state.readOnly
      ? { extension: false, suddenDeath: false, nextRound: false, startRound: false }
      : nextSteps(rules, phase, this.#displayScore(), won, timeUp);
    const breakRemaining =
      phase.period === "BREAK" && this.#breakStartedAt !== null
        ? Math.max(0, rules.format.breakSeconds - Math.floor((this.#now() - this.#breakStartedAt) / 1000))
        : null;
    this.#update({ phase: { ...phase, rounds: rules.format.rounds, roundsWon: won, warnings: { ...this.#warnings }, steps, breakRemaining } });
  }

  #showScore(): void {
    if (this.#state.screen !== "bout") {
      return;
    }
    const score = this.#displayScore();
    this.#screen.setScore(score);
    const boutId = this.#state.boutId!;
    this.#update({
      canUndo: !this.#state.readOnly && this.#history.length > 0,
      bouts: this.#state.bouts.map((bout) => (bout.id === boutId ? { ...bout, score } : bout)),
    });
    this.#refreshPhase();
  }

  /** After a takeover, an invalid link or a refusal: read the bout again and show what the server has. */
  async #reread(boutId: string, outcome: "takenOver" | "linkInvalid" | "rejected"): Promise<void> {
    const entry = this.#touched.get(boutId);
    if (!entry) {
      return;
    }
    const generation = this.#generation;
    let read: { detail: BoutDetail; consistent: boolean };
    try {
      read = await this.#readBout(boutId);
    } catch {
      return;
    }
    const { detail } = read;
    entry.outbox.reconcile(detail.exchanges, { complete: read.consistent });
    if (outcome === "linkInvalid") {
      this.#addNotApplied(entry.outbox.discard());
    }
    if (boutId === this.#state.boutId && generation === this.#generation && this.#state.screen === "bout") {
      this.#serverScore = detail.score;
      this.#history = this.#historyFrom(detail, entry.outbox);
      this.#showScore();
    }
  }

  /**
   * Reads the bout. The outbox may be sending meanwhile: when a write of this bout is acknowledged between sending the
   * read and its answer, the answer may predate that write (an acknowledged exchange missing from it would make a
   * queued undo of it look done), so it is read again. `consistent` is false only when that kept happening; the
   * caller then does not treat the answer as the complete list.
   */
  async #readBout(boutId: string): Promise<{ detail: BoutDetail; consistent: boolean }> {
    for (let attempt = 1; ; attempt++) {
      const acksBefore = this.#acks.get(boutId) ?? 0;
      const detail = await this.#api.getBout(boutId);
      if ((this.#acks.get(boutId) ?? 0) === acksBefore) {
        return { detail, consistent: true };
      }
      if (attempt >= MAX_READS) {
        return { detail, consistent: false };
      }
    }
  }

  #setBoutStatus(boutId: string, status: LiveBoutRow["status"], onlyForward = false): void {
    const rank = { PENDING: 0, RUNNING: 1, DONE: 2 } as const;
    this.#update({
      bouts: this.#state.bouts.map((bout) => (bout.id === boutId && (!onlyForward || rank[status] > rank[bout.status]) ? { ...bout, status } : bout)),
    });
  }

  #boutRow(): LiveBoutRow | undefined {
    return this.#state.bouts.find((bout) => bout.id === this.#state.boutId);
  }

  #stopClockReports(): void {
    if (this.#clockHandle !== null) {
      this.#clockTimer.cancel(this.#clockHandle);
      this.#clockHandle = null;
    }
  }

  // --- outboxes ---

  #currentOutbox(): Outbox | undefined {
    return this.#state.screen === "bout" && this.#state.boutId ? this.#touched.get(this.#state.boutId)?.outbox : undefined;
  }

  /** The bout's outbox, listened to (its state feeds the status line and the takeover handling). */
  #outboxFor(boutId: string): Outbox {
    const existing = this.#touched.get(boutId);
    if (existing) {
      // A new ring link for the bout lifts an invalid-link stop; the caller flushes.
      existing.outbox.useRingToken(this.#token);
      return existing.outbox;
    }
    const outbox = this.#registeredOutbox(boutId);
    this.#touched.set(boutId, { outbox, last: outbox.state(), unsubscribe: outbox.subscribe((state) => this.#onOutbox(boutId, state)) });
    this.#updateStatus();
    return outbox;
  }

  /** The page's one outbox for the bout (registered by bout id), without listening to it. */
  #registeredOutbox(boutId: string): Outbox {
    return getOutbox({ boutId, ringToken: this.#token, writer: this.#writer, storage: this.#storage, ...(this.#timers ? { timers: this.#timers } : {}) });
  }

  #onOutbox(boutId: string, state: OutboxState): void {
    const entry = this.#touched.get(boutId);
    if (!entry) {
      return;
    }
    const before = entry.last;
    entry.last = state;
    this.#updateStatus();
    if (state.status !== before.status) {
      if (state.status === "takenOver") {
        if (state.activeKeeper) {
          this.#takenOver = true;
        }
        this.#lose(state.activeKeeper ? { key: "ring.takenOver", params: { name: state.activeKeeper.userName } } : { key: "ring.notClaimed" }, state.activeKeeper);
        void this.#reread(boutId, "takenOver");
        return;
      }
      if (state.status === "linkInvalid") {
        this.#lose({ key: "ring.linkInvalid" }, this.#state.activeKeeper);
        void this.#reread(boutId, "linkInvalid");
        return;
      }
      if (state.status === "signedOut") {
        this.#stopClockReports();
        this.#update({ notice: { key: "ring.signedOut" }, screen: "signIn" });
        return;
      }
    }
    if (state.rejected.length > before.rejected.length) {
      void this.#reread(boutId, "rejected");
      return;
    }
    if (boutId === this.#state.boutId && state.pending !== before.pending) {
      this.#showScore();
    }
  }

  /** This device is no longer the keeper: read-only, the clock stops, the notice says why. */
  #lose(notice: Notice, activeKeeper: ActiveKeeper | null): void {
    this.#stopClockReports();
    this.#screen.setReadOnly(true);
    this.#update({ isKeeper: false, readOnly: true, canUndo: false, notice, activeKeeper });
  }

  #updateStatus(): void {
    let pending = 0;
    let offline = false;
    let persistenceFailed = false;
    const rejected: RejectedOp[] = [];
    for (const { last } of this.#touched.values()) {
      pending += last.pendingScores;
      offline ||= last.status === "offline";
      persistenceFailed ||= last.persistenceFailed;
      rejected.push(...last.rejected);
    }
    this.#update({ status: { pending, offline, persistenceFailed, rejected, alarm: rejected.length > 0 || persistenceFailed } });
  }

  #pendingFor(boutId: string): number {
    return this.#touched.get(boutId)?.last.pending ?? 0;
  }

  #stopped(boutId: string): boolean {
    return (this.#touched.get(boutId)?.last.unconfirmed ?? 0) > 0;
  }

  /** Writes go to the backend unchanged; the score each answer carries is kept, and an exchange's server id noted for undo. */
  #scoreCapturingWriter(): LiveWriter {
    const api = this.#api;
    const acked = <T>(boutId: string, response: T): T => {
      this.#acks.set(boutId, (this.#acks.get(boutId) ?? 0) + 1);
      return response;
    };
    const noted = (boutId: string, response: unknown) => {
      const score = scoreFromResponse(response);
      if (score && boutId === this.#state.boutId) {
        this.#serverScore = score;
      }
      return response;
    };
    return {
      // Only exchange and undo answers count for the re-read check: start, clock and finish do not change the exchanges.
      startBout: (token, boutId) => api.startBout(token, boutId),
      setClock: (token, boutId, clock) => api.setClock(token, boutId, clock),
      finishBout: async (token, boutId) => noted(boutId, await api.finishBout(token, boutId)),
      undo: async (token, boutId, expectedExchangeId) => noted(boutId, acked(boutId, await api.undo(token, boutId, expectedExchangeId))),
      postExchange: async (token: string, boutId: string, exchange: ExchangeToSend): Promise<AcknowledgedExchange> => {
        const ack = acked(boutId, await api.postExchange(token, boutId, exchange));
        noted(boutId, ack);
        if (boutId === this.#state.boutId) {
          const entry = this.#history.find((candidate) => candidate.clientExchangeId === exchange.clientExchangeId);
          if (entry) {
            entry.serverId = ack.exchange.id;
          }
        }
        return ack;
      },
    };
  }

  // --- stale bouts (survive a reload) ---

  #staleBouts(): string[] {
    try {
      const parsed: unknown = JSON.parse(this.#storage.getItem(STALE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  #markStale(boutId: string, stale: boolean): void {
    const others = this.#staleBouts().filter((id) => id !== boutId);
    try {
      this.#storage.setItem(STALE_KEY, JSON.stringify(stale ? [...others, boutId] : others));
    } catch {
      // Not storable: the check happens in this page only.
    }
  }

  // --- state ---

  #update(changes: Partial<RingModeState>): void {
    this.#state = { ...this.#state, ...changes };
    this.#render();
  }

  #render(): void {
    this.#view.render(this.#state);
  }
}

function keeperName(value: unknown): string | null {
  const name = typeof value === "object" && value !== null ? (value as { userName?: unknown }).userName : undefined;
  return typeof name === "string" ? name : null;
}


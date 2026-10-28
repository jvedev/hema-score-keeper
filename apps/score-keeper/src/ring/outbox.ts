import { ApiError, SessionExpiredError } from "@hema/api-session";
import type { LiveExchangeInput } from "./exchange-mapping";
import { newId } from "./ids";
import type { ActiveKeeper, BoutStateReport, LiveWriter } from "./live-client";

export type { LiveWriter } from "./live-client";

const STORAGE_PREFIX = "hema-score-keeper.outbox.";
/** Waits between retries after a failed send: 1 s, 2 s, 5 s, then every 5 s. */
const BACKOFF_MS = [1000, 2000, 5000];

interface OpBase {
  /** Local id of this queue entry. */
  opId: string;
}

export type OutboxOp =
  | (OpBase & { type: "start" })
  | (OpBase & { type: "finish" })
  | (OpBase & { type: "clock"; seconds: number; running: boolean; state?: BoutStateReport })
  /** The `clientExchangeId` is made when the exchange is queued and sent unchanged on every retry. */
  | (OpBase & { type: "exchange"; clientExchangeId: string; exchange: LiveExchangeInput })
  /** Names the exchange by its server id, or by the `clientExchangeId` of one queued here (its server id is looked up when it is sent). */
  | (OpBase & { type: "undo"; expectedExchangeId?: string; expectedClientExchangeId?: string });

/** An operation the backend refused (a 4xx other than an invalid link or a takeover). Shown to the user, never retried. */
export type RejectedOp = OutboxOp & { status: number; message: string };

export type OutboxStatus =
  /** Nothing is being sent and nothing is stuck (there may be ops waiting for `flush`). */
  | "idle"
  | "sending"
  /** The last send failed (no connection or a server error); a retry is scheduled. */
  | "offline"
  /** Another device keeps the ring now. Stopped; the queue is `unconfirmed`. */
  | "takenOver"
  /** The ring link was rotated (403). Stopped for good; the queue is `unconfirmed`. */
  | "linkInvalid"
  /** The sign-in expired. Stopped until `resume()`; the queue is `unconfirmed`. */
  | "signedOut";

export interface OutboxState {
  status: OutboxStatus;
  /** Ops still to send. */
  pending: number;
  /** Ops still to send that are not clock reports: what the keeper is told is "not sent". */
  pendingScores: number;
  /** When stopped on `takenOver`, `linkInvalid` or `signedOut`: the pending ops, which may or may not have reached the server. Otherwise 0. */
  unconfirmed: number;
  rejected: readonly RejectedOp[];
  /** With `takenOver`: who keeps the ring now; null when nobody does (show "ring not claimed"). */
  activeKeeper: ActiveKeeper | null;
  /** The queue could not be written to storage, so it would not survive a reload. Warn the user. */
  persistenceFailed: boolean;
}

/** What `reconcile` needs to know about an exchange the server stores (from `GET /live-bouts/:id`). */
export interface ServerExchangeRef {
  id: string;
  clientExchangeId: string;
  undoneAt?: string | null;
}

export interface OutboxTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface OutboxOptions {
  boutId: string;
  ringToken: string;
  writer: LiveWriter;
  storage?: Storage;
  /** Makes `clientExchangeId`s. */
  newId?: () => string;
  timers?: OutboxTimers;
  /** Send straight after queueing (default true). Off, only `flush()` and the retry timer send. */
  autoFlush?: boolean;
}

interface Persisted {
  seq: number;
  queue: OutboxOp[];
  rejected: RejectedOp[];
  /** clientExchangeId to the server's exchange id, for exchanges this bout's undos refer to. */
  acked: Record<string, string>;
}

type Stop = { status: "takenOver"; activeKeeper: ActiveKeeper | null } | { status: "linkInvalid" } | { status: "signedOut" };

/** The send could not be made at all: the exchange the undo names was never stored. */
class Unsendable extends Error {}

/**
 * The queue of one bout's writes. Ops are saved before anything is sent and sent strictly in order, one at a time,
 * so a flaky connection or a reload never loses or reorders them; an exchange keeps the same `clientExchangeId`
 * on every retry, which the backend treats as the same exchange. Call `flush()` when the page loads.
 */
export class Outbox {
  readonly #boutId: string;
  #ringToken: string;
  readonly #writer: LiveWriter;
  readonly #storage: Storage;
  readonly #newId: () => string;
  readonly #timers: OutboxTimers;
  readonly #autoFlush: boolean;
  readonly #listeners = new Set<(state: OutboxState) => void>();
  #data: Persisted;
  #stop: Stop | null = null;
  #offline = false;
  #inLoop = false;
  #loop: Promise<void> = Promise.resolve();
  #inflight: string | null = null;
  #timer: unknown = null;
  #failures = 0;
  #persistenceFailed = false;

  constructor(options: OutboxOptions) {
    this.#boutId = options.boutId;
    this.#ringToken = options.ringToken;
    this.#writer = options.writer;
    this.#storage = options.storage ?? localStorage;
    this.#newId = options.newId ?? newId;
    this.#timers = options.timers ?? { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
    this.#autoFlush = options.autoFlush ?? true;
    this.#data = this.#load();
  }

  /** Ops still to send. */
  pending(): number {
    return this.#data.queue.length;
  }

  state(): OutboxState {
    const stopped = this.#stop !== null;
    return {
      status: this.#stop?.status ?? (this.#inLoop ? "sending" : this.#offline ? "offline" : "idle"),
      pending: this.#data.queue.length,
      pendingScores: this.#data.queue.filter((op) => op.type !== "clock").length,
      unconfirmed: stopped ? this.#data.queue.length : 0,
      rejected: [...this.#data.rejected],
      activeKeeper: this.#stop?.status === "takenOver" ? this.#stop.activeKeeper : null,
      persistenceFailed: this.#persistenceFailed,
    };
  }

  /** The ops that were not acknowledged when the outbox stopped on a takeover, invalid link or expired sign-in; empty otherwise. */
  unconfirmedOps(): OutboxOp[] {
    return this.#stop ? [...this.#data.queue] : [];
  }

  /** Every op still to send, in order (whether stopped or not); a copy. */
  queued(): OutboxOp[] {
    return [...this.#data.queue];
  }

  /** Calls `listener` with the new state whenever it changes. Returns the unsubscribe function. */
  subscribe(listener: (state: OutboxState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  enqueueStart(): void {
    this.#enqueue((opId) => ({ opId, type: "start" }));
  }

  enqueueFinish(): void {
    this.#enqueue((opId) => ({ opId, type: "finish" }));
  }

  /** Only the newest unsent clock matters, so older unsent ones are dropped. */
  enqueueClock(clock: { seconds: number; running: boolean; state?: BoutStateReport }): void {
    const state = clock.state ? { ...clock.state } : undefined;
    this.#enqueue((opId) => ({ opId, type: "clock", seconds: clock.seconds, running: clock.running, ...(state ? { state } : {}) }), (op) => op.type !== "clock" || op.opId === this.#inflight);
  }

  /** Queues the exchange and returns its `clientExchangeId`. */
  enqueueExchange(exchange: LiveExchangeInput): string {
    const clientExchangeId = this.#newId();
    this.#enqueue((opId) => ({ opId, type: "exchange", clientExchangeId, exchange }));
    return clientExchangeId;
  }

  /** Undo of an exchange the backend already stored, named by its server id. */
  enqueueUndo(expectedExchangeId: string): void {
    this.#enqueue((opId) => ({ opId, type: "undo", expectedExchangeId }));
  }

  /** Undo of an exchange queued here, named by its `clientExchangeId`; its server id is looked up once it was acknowledged. */
  enqueueUndoOfClientExchange(expectedClientExchangeId: string): void {
    this.#enqueue((opId) => ({ opId, type: "undo", expectedClientExchangeId }));
  }

  /** Sends what is queued, in order, until it is empty or something stops it. Resolves when that pass is over. */
  flush(): Promise<void> {
    if (this.#inLoop) {
      return this.#loop;
    }
    if (this.#stop) {
      return Promise.resolve();
    }
    this.#inLoop = true;
    this.#loop = this.#run();
    return this.#loop;
  }

  /** Switches to a new ring link for this bout (the old one was rotated) and lifts an invalid-link stop. */
  useRingToken(ringToken: string): void {
    if (ringToken === this.#ringToken) {
      return;
    }
    this.#ringToken = ringToken;
    if (this.#stop?.status === "linkInvalid") {
      this.resume();
    }
  }

  /** After a takeover, invalid link or expired sign-in: try sending again (once this device claimed the ring again or signed in). */
  resume(): void {
    this.#stop = null;
    this.#offline = false;
    this.#failures = 0;
    this.#emit();
  }

  /**
   * Drops the queued ops the server already has. Call it with the server's exchanges for this bout after the outbox
   * stopped on a takeover: an exchange that got through before the takeover must not be sent again, and an undo the
   * server already shows as done is dropped. What the server has not seen stays queued.
   *
   * With `complete: true` the list is every active exchange of the bout (what `GET /live-bouts/:id` returns, which leaves
   * undone exchanges out): an undo whose target has a known server id that is missing from the list was done already.
   */
  reconcile(serverExchanges: readonly ServerExchangeRef[], options: { complete?: boolean } = {}): void {
    const byClientId = new Map(serverExchanges.map((exchange) => [exchange.clientExchangeId, exchange]));
    const byId = new Map(serverExchanges.map((exchange) => [exchange.id, exchange]));
    this.#mutate((data) => {
      for (const exchange of serverExchanges) {
        data.acked[exchange.clientExchangeId] = exchange.id;
      }
      data.queue = data.queue.filter((op) => {
        if (op.type === "exchange") {
          return !byClientId.has(op.clientExchangeId);
        }
        if (op.type === "undo") {
          const targetId = op.expectedExchangeId ?? data.acked[op.expectedClientExchangeId ?? ""];
          if (targetId === undefined) {
            return true;
          }
          const target = byId.get(targetId);
          return target ? !target.undoneAt : !options.complete;
        }
        return true;
      });
    });
    this.#emit();
  }

  /**
   * Drops every queued op and returns them. After this device re-claims a ring it was taken over from, the old queue
   * must not be resent (the new keeper may have entered the same exchanges): reconcile first, then discard what is
   * left and show it as "not applied" for the keeper to re-enter.
   */
  discard(): OutboxOp[] {
    let dropped: OutboxOp[] = [];
    this.#mutate((data) => {
      dropped = data.queue;
      data.queue = [];
    });
    this.#emit();
    return dropped;
  }

  /** Removes a refused op from the list once the user has seen it. */
  dismissRejected(opId: string): void {
    this.#mutate((data) => {
      data.rejected = data.rejected.filter((op) => op.opId !== opId);
    });
    this.#emit();
  }

  /** Stops the retry timer (the queue stays saved). */
  dispose(): void {
    this.#clearTimer();
  }

  async #run(): Promise<void> {
    this.#clearTimer();
    this.#emit();
    try {
      for (;;) {
        this.#reread();
        const op = this.#data.queue[0];
        if (!op) {
          this.#offline = false;
          return;
        }
        this.#inflight = op.opId;
        let acknowledged: { clientExchangeId: string; serverId: string } | null;
        try {
          acknowledged = await this.#send(op);
        } catch (error) {
          if (!this.#handleFailure(op, error)) {
            return;
          }
          continue;
        }
        this.#failures = 0;
        this.#offline = false;
        this.#mutate((data) => {
          if (acknowledged) {
            data.acked[acknowledged.clientExchangeId] = acknowledged.serverId;
          }
          data.queue = data.queue.filter((queued) => queued.opId !== op.opId);
        });
        this.#emit();
      }
    } finally {
      this.#inflight = null;
      this.#inLoop = false;
      this.#emit();
    }
  }

  /** Sends one op; for an exchange, returns the server id it was stored under. */
  async #send(op: OutboxOp): Promise<{ clientExchangeId: string; serverId: string } | null> {
    const token = this.#ringToken;
    switch (op.type) {
      case "start":
        await this.#writer.startBout(token, this.#boutId);
        return null;
      case "finish":
        await this.#writer.finishBout(token, this.#boutId);
        return null;
      case "clock":
        await this.#writer.setClock(token, this.#boutId, { seconds: op.seconds, running: op.running, ...(op.state ? { state: op.state } : {}) });
        return null;
      case "exchange": {
        const ack = await this.#writer.postExchange(token, this.#boutId, { clientExchangeId: op.clientExchangeId, ...op.exchange });
        return { clientExchangeId: op.clientExchangeId, serverId: ack.exchange.id };
      }
      case "undo": {
        const expected = op.expectedExchangeId ?? this.#data.acked[op.expectedClientExchangeId ?? ""];
        if (expected === undefined) {
          throw new Unsendable("The exchange to undo was never stored.");
        }
        await this.#writer.undo(token, this.#boutId, expected);
        return null;
      }
      default: {
        // A queue entry this version does not know (damaged, or from another version): refused, never acknowledged.
        const unknown: never = op;
        throw new Unsendable(`Unknown operation type "${String((unknown as { type?: unknown }).type)}".`);
      }
    }
  }

  /** Decides what a failed send means. Returns true to carry on with the next op, false to end the pass. */
  #handleFailure(op: OutboxOp, error: unknown): boolean {
    if (error instanceof Unsendable) {
      this.#reject(op, 0, error.message);
      return true;
    }
    if (error instanceof SessionExpiredError) {
      this.#stopWith({ status: "signedOut" });
      return false;
    }
    if (error instanceof ApiError) {
      if (error.status === 403) {
        this.#stopWith({ status: "linkInvalid" });
        return false;
      }
      if (error.status === 409 && error.body.reason === "TAKEN_OVER") {
        this.#stopWith({ status: "takenOver", activeKeeper: activeKeeperOf(error.body.activeKeeper) });
        return false;
      }
      if (error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429) {
        this.#reject(op, error.status, error.message);
        return true;
      }
    }
    // No connection, a server error, a timeout: the op stays queued and is tried again.
    this.#offline = true;
    this.#failures += 1;
    const delay = BACKOFF_MS[Math.min(this.#failures - 1, BACKOFF_MS.length - 1)]!;
    this.#timer = this.#timers.set(() => {
      this.#timer = null;
      void this.flush();
    }, delay);
    return false;
  }

  #stopWith(stop: Stop): void {
    this.#stop = stop;
    this.#offline = false;
  }

  #reject(op: OutboxOp, status: number, message: string): void {
    this.#mutate((data) => {
      data.queue = data.queue.filter((queued) => queued.opId !== op.opId);
      data.rejected.push({ ...op, status, message });
    });
    this.#emit();
  }

  #enqueue(make: (opId: string) => OutboxOp, keep: (op: OutboxOp) => boolean = () => true): void {
    this.#mutate((data) => {
      data.seq += 1;
      data.queue = data.queue.filter(keep);
      data.queue.push(make(`op${data.seq}`));
    });
    this.#emit();
    if (this.#autoFlush && !this.#stop && this.#timer === null) {
      void this.flush();
    }
  }

  /**
   * Every change starts from what is stored right now and writes it back, so a second outbox over the same bout
   * (another tab) cannot overwrite this one's changes. Once saving has failed, the memory copy is the only one and is kept.
   */
  #mutate(change: (data: Persisted) => void): void {
    this.#reread();
    change(this.#data);
    this.#save();
  }

  #reread(): void {
    if (!this.#persistenceFailed) {
      this.#data = this.#load();
    }
  }

  #clearTimer(): void {
    if (this.#timer !== null) {
      this.#timers.clear(this.#timer);
      this.#timer = null;
    }
  }

  #emit(): void {
    const state = this.state();
    for (const listener of [...this.#listeners]) {
      listener(state);
    }
  }

  get #key(): string {
    return STORAGE_PREFIX + this.#boutId;
  }

  #save(): void {
    try {
      this.#storage.setItem(this.#key, JSON.stringify(this.#data));
      this.#persistenceFailed = false;
    } catch {
      // Storage full or blocked: the queue still works in memory for this page, and the state says so.
      this.#persistenceFailed = true;
    }
  }

  #load(): Persisted {
    try {
      const parsed = JSON.parse(this.#storage.getItem(this.#key) ?? "null") as Partial<Persisted> | null;
      if (parsed && Array.isArray(parsed.queue)) {
        return {
          seq: typeof parsed.seq === "number" ? parsed.seq : parsed.queue.length,
          queue: parsed.queue,
          rejected: Array.isArray(parsed.rejected) ? parsed.rejected : [],
          acked: parsed.acked && typeof parsed.acked === "object" ? parsed.acked : {},
        };
      }
    } catch {
      // Unreadable: start empty.
    }
    return { seq: 0, queue: [], rejected: [], acked: {} };
  }
}

function activeKeeperOf(value: unknown): ActiveKeeper | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { userName, since } = value as Record<string, unknown>;
  return typeof userName === "string" && typeof since === "string" ? { userName, since } : null;
}

const registry = new Map<string, Outbox>();

/**
 * The one outbox of a bout in this page. Two instances over one queue would send the same ops twice, so screens ask here.
 * The options only matter when the outbox is created; a different ring link for the same bout updates the existing one.
 */
export function getOutbox(options: OutboxOptions): Outbox {
  const existing = registry.get(options.boutId);
  if (existing) {
    existing.useRingToken(options.ringToken);
    return existing;
  }
  const created = new Outbox(options);
  registry.set(options.boutId, created);
  return created;
}

/** Forgets the registered outboxes (tests; or after signing out). Their queues stay in storage. */
export function resetOutboxes(): void {
  for (const outbox of registry.values()) {
    outbox.dispose();
  }
  registry.clear();
}

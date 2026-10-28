import { ApiError, SessionExpiredError } from "@hema/api-session";
import type { MatchEventDetail } from "@hema/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveKeeper, BoutDetail, BoutScore, BoutStateReport, ClockReport, ExchangeToSend, LiveBoutRow, LiveSession, RingByToken, ServerExchange } from "./live-client";
import { resetOutboxes } from "./outbox";
import { RingController, ringPenalties, sheetScore, type BoutScreen, type OpenBout, type RingApi, type RingModeState, type RingView } from "./ring-controller";
import { MemoryStorage } from "./test-support";

const SINCE = "2026-10-26T10:00:00Z";
const keeper = (userName: string): ActiveKeeper => ({ userName, since: SINCE });
const takenOver = (activeKeeper: ActiveKeeper | null) => new ApiError("Taken over.", 409, undefined, { reason: "TAKEN_OVER", activeKeeper });
const activeKeeperRefusal = (activeKeeper: ActiveKeeper) => new ApiError("Someone keeps this ring.", 409, undefined, { reason: "ACTIVE_KEEPER", activeKeeper });

function boutRow(id: string, order: number, status: LiveBoutRow["status"] = "PENDING"): LiveBoutRow {
  return { id, ringId: "r1", order, label: `Bout ${order}`, fighterLeft: `L${order}`, fighterRight: `R${order}`, status, score: null, clock: { seconds: 0, running: false, updatedAt: null } };
}

function serverExchange(clientExchangeId: string, leftPoints: number, rightPoints: number, seq: number): ServerExchange {
  return { id: `srv-${clientExchangeId}`, clientExchangeId, kind: leftPoints < 0 || rightPoints < 0 ? "DEDUCTION" : "EXCHANGE", leftPoints, rightPoints, isDouble: leftPoints > 0 && rightPoints > 0, firstScorer: null, seq, undoneAt: null };
}

const hit = (a: number, b: number): MatchEventDetail => ({
  elapsedTimeSeconds: 10,
  type: a > 0 && b > 0 ? "double" : "hit",
  fighterAScore: a,
  fighterBScore: b,
  details: { fighterA: { outcome: a > 0 ? "score" : "no-score" }, fighterB: { outcome: b > 0 ? "score" : "no-score" } },
});

/** The backend as the ring screens see it. `writeScript` decides what each next write does (an Error to throw, else it is stored). */
class FakeApi implements RingApi {
  readonly deviceId = "dev-1";
  session: LiveSession | null = { accessToken: "a", refreshToken: "r", user: { id: "u1", name: "Me", language: "en" } };
  claims: Record<string, string> = {};
  /** The ring token each stored claim was made under. */
  claimTokens: Record<string, string> = {};
  ring: RingByToken | Error = { ring: { id: "r1", tournamentId: "t1", name: "Ring 1", order: 1 }, tournament: { id: "t1", name: "Cup", mode: "SHEET" }, bouts: [boutRow("b1", 1), boutRow("b2", 2)], activeKeeper: null, youAreKeeper: false };
  /** The device the server has as the ring's keeper. */
  keeperDevice: string | null = null;
  exchanges: Record<string, ServerExchange[]> = { b1: [], b2: [] };
  clocks: Record<string, { seconds: number; running: boolean }> = { b1: { seconds: 0, running: false }, b2: { seconds: 0, running: false } };
  calls: string[] = [];
  claimScript: Array<Error | undefined> = [];
  writeScript: Array<Error | undefined> = [];
  /** When set, the score the backend answers with (to show the screen prefers it). */
  scoreOverride: BoutScore | null = null;
  /** When set, each exchange or undo waits for it before the server handles it. */
  writeGate: (() => Promise<void>) | null = null;
  /** When set, a read is handled by the server at once but its answer waits for this. */
  readGate: (() => Promise<void>) | null = null;

  currentSession = () => this.session;
  login = async () => this.session!;
  hasClaim = (ringId: string) => ringId in this.claims;
  claimToken = (ringId: string) => this.claimTokens[ringId] ?? null;
  ringByToken = async (token: string) => {
    this.calls.push(`ring ${token}`);
    if (this.ring instanceof Error) throw this.ring;
    return { ...structuredClone(this.ring), youAreKeeper: this.keeperDevice === this.deviceId };
  };
  getBout = async (boutId: string): Promise<BoutDetail> => {
    this.calls.push(`get ${boutId}`);
    const ring = this.ring as RingByToken;
    const bout = ring.bouts.find((candidate) => candidate.id === boutId)!;
    const exchanges = this.exchanges[boutId]!.filter((exchange) => exchange.undoneAt === null);
    const clock = { ...this.clocks[boutId]!, updatedAt: SINCE };
    const answer = { bout: { ...bout, clock }, exchanges: structuredClone(exchanges), score: sheetScore(exchanges), clock };
    if (this.readGate) await this.readGate();
    return answer;
  };
  claim = async (token: string, ringId: string, options: { confirm?: boolean } = {}) => {
    this.calls.push(options.confirm ? "claim confirm" : "claim");
    const outcome = this.claimScript.shift();
    if (outcome) throw outcome;
    this.claims[ringId] = SINCE;
    this.claimTokens[ringId] = token;
    this.keeperDevice = this.deviceId;
    for (const clock of Object.values(this.clocks)) clock.running = false;
    (this.ring as RingByToken).activeKeeper = keeper("Me");
    return { ring: (this.ring as RingByToken).ring };
  };

  async #gate(): Promise<void> {
    if (this.writeGate) await this.writeGate();
  }
  #write(label: string): void {
    this.calls.push(label);
    const outcome = this.writeScript.shift();
    if (outcome) throw outcome;
  }
  #score(boutId: string): BoutScore {
    return this.scoreOverride ?? sheetScore(this.exchanges[boutId]!.filter((exchange) => exchange.undoneAt === null));
  }
  startBout = async (_token: string, boutId: string) => this.#write(`start ${boutId}`);
  finishBout = async (_token: string, boutId: string) => {
    this.#write(`finish ${boutId}`);
    return { score: this.#score(boutId) };
  };
  /** The bout state sent with each clock report. */
  states: BoutStateReport[] = [];
  setClock = async (_token: string, boutId: string, clock: ClockReport) => {
    this.#write(`clock ${clock.seconds}/${clock.running}`);
    this.clocks[boutId] = { seconds: clock.seconds, running: clock.running };
    if (clock.state) this.states.push(clock.state);
  };
  undo = async (_token: string, boutId: string, expectedExchangeId: string) => {
    await this.#gate();
    this.#write(`undo ${expectedExchangeId}`);
    const target = this.exchanges[boutId]!.find((exchange) => exchange.id === expectedExchangeId)!;
    target.undoneAt = SINCE;
    return { score: this.#score(boutId) };
  };
  postExchange = async (_token: string, boutId: string, exchange: ExchangeToSend) => {
    await this.#gate();
    this.#write(`exchange ${exchange.leftPoints}/${exchange.rightPoints}`);
    const list = this.exchanges[boutId]!;
    const stored = { ...serverExchange(exchange.clientExchangeId, exchange.leftPoints, exchange.rightPoints, list.length + 1), ...(exchange.round ? { round: exchange.round } : {}) };
    list.push(stored);
    return { exchange: { id: stored.id, clientExchangeId: stored.clientExchangeId }, score: this.#score(boutId) };
  };
}

class FakeView implements RingView {
  state: RingModeState | null = null;
  answers: boolean[] = [];
  asked: string[] = [];
  render(state: Readonly<RingModeState>): void {
    this.state = structuredClone(state) as RingModeState;
  }
  async confirmTakeover(keeperName: string): Promise<boolean> {
    this.asked.push(keeperName);
    return this.answers.shift() ?? false;
  }
}

class FakeBoutScreen implements BoutScreen {
  opened: OpenBout | null = null;
  score: BoutScore | null = null;
  readOnly = false;
  clockNow = { seconds: 0, running: false };
  closed = 0;
  shown = 0;
  show(): void {
    this.shown += 1;
  }
  async open(bout: OpenBout): Promise<void> {
    this.opened = bout;
    this.clockNow = { seconds: bout.clockSeconds, running: false };
  }
  setScore(score: BoutScore): void {
    this.score = score;
  }
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    if (readOnly) this.clockNow = { ...this.clockNow, running: false };
  }
  clock(): { seconds: number; running: boolean } {
    return this.clockNow;
  }
  duration: number | null = null;
  setDuration(totalSeconds: number, elapsedSeconds: number): void {
    this.duration = totalSeconds;
    this.clockNow = { seconds: elapsedSeconds, running: false };
  }
  async close(): Promise<void> {
    this.closed += 1;
  }
}

let api: FakeApi;
let view: FakeView;
let screen: FakeBoutScreen;
let storage: MemoryStorage;
let intervals: Array<{ run: () => void; ms: number; cancelled: boolean }>;
/** The outbox retries scheduled so far (they only run when a test runs them). */
let retries: Array<() => void>;

function controller(): RingController {
  return new RingController({
    api,
    view,
    boutScreen: screen,
    storage,
    // Retries never fire by themselves in these tests.
    timers: { set: (run) => retries.push(run), clear: () => undefined },
    clockTimer: {
      every: (run, ms) => {
        const handle = { run, ms, cancelled: false };
        intervals.push(handle);
        return handle;
      },
      cancel: (handle) => {
        (handle as { cancelled: boolean }).cancelled = true;
      },
    },
  });
}

const state = () => view.state!;

beforeEach(() => {
  api = new FakeApi();
  view = new FakeView();
  screen = new FakeBoutScreen();
  storage = new MemoryStorage();
  intervals = [];
  retries = [];
  resetOutboxes();
});

/** A device that already keeps ring r1 (it claimed it before a reload). */
function asKeeper(): void {
  api.claims = { r1: SINCE };
  api.claimTokens = { r1: "tok" };
  api.keeperDevice = api.deviceId;
  (api.ring as RingByToken).activeKeeper = keeper("Me");
}

/** Another device keeps ring r1. */
function keptBy(name: string): void {
  api.keeperDevice = "other-device";
  (api.ring as RingByToken).activeKeeper = keeper(name);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("ring mode", () => {
  it("rotated token shows invalid link", async () => {
    api.ring = new ApiError("Ring link not found.", 404, undefined, {});
    await controller().open("old-token");
    expect(state().screen).toBe("invalidLink");
    expect(api.calls).toEqual(["ring old-token"]);
  });

  it("asks to sign in first and comes back to the ring", async () => {
    api.session = null;
    const ring = controller();
    await ring.open("tok");
    expect(state().screen).toBe("signIn");
    expect(api.calls).toEqual([]);
    api.session = { accessToken: "a", refreshToken: "r", user: { id: "u1", name: "Me", language: "en" } };
    await ring.signIn("me", "secret");
    expect(state().screen).toBe("ring");
    expect(state().ring?.name).toBe("Ring 1");
  });

  it("claim on an active ring asks to confirm", async () => {
    keptBy("Ann");
    const ring = controller();
    await ring.open("tok");
    // Someone else keeps it: nothing is claimed by opening the link.
    expect(api.calls).toEqual(["ring tok"]);
    expect(state().isKeeper).toBe(false);
    expect(state().activeKeeper?.userName).toBe("Ann");

    api.claimScript = [activeKeeperRefusal(keeper("Ann"))];
    view.answers = [true];
    await ring.takeRing();
    expect(view.asked).toEqual(["Ann"]);
    expect(api.calls.filter((call) => call.startsWith("claim"))).toEqual(["claim", "claim confirm"]);
    expect(state().isKeeper).toBe(true);
    expect(state().readOnly).toBe(false);
  });

  it("declining the takeover leaves the ring to its keeper", async () => {
    keptBy("Ann");
    const ring = controller();
    await ring.open("tok");
    api.claimScript = [activeKeeperRefusal(keeper("Ann"))];
    view.answers = [false];
    await ring.takeRing();
    expect(api.calls.filter((call) => call.startsWith("claim"))).toEqual(["claim"]);
    expect(state().isKeeper).toBe(false);
  });

  it("a ring nobody keeps is claimed when this device has no claim for it", async () => {
    await controller().open("tok");
    expect(api.calls).toContain("claim");
    expect(state().isKeeper).toBe(true);
  });

  it("resume loads exchanges and paused clock", async () => {
    asKeeper();
    api.exchanges.b1 = [serverExchange("c1", 3, 0, 1), serverExchange("c2", 1, 1, 2), serverExchange("c3", -1, 0, 3)];
    api.clocks.b1 = { seconds: 75, running: true };
    (api.ring as RingByToken).bouts[0]!.status = "RUNNING";
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");

    // A reload with a stored claim does not claim again (that would pause the clock).
    expect(api.calls.some((call) => call.startsWith("claim"))).toBe(false);
    expect(state().screen).toBe("bout");
    expect(screen.opened).toMatchObject({ id: "b1", fighterLeft: "L1", fighterRight: "R1", clockSeconds: 75, started: true });
    expect(screen.clock().running).toBe(false);
    // The sheet rule: the double counts 0 for both, the deduction is negative.
    expect(screen.score).toEqual({ left: 2, right: 0, doubles: 1 });
    expect(state().canUndo).toBe(true);
    // The server still had the clock running: the keeper tells it the clock is paused.
    await vi.waitFor(() => expect(api.calls).toContain("clock 75/false"));
  });

  it("taken over turns read-only", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [takenOver(keeper("Bob"))];
    ring.matchEvent(hit(2, 0));
    await vi.waitFor(() => expect(state().readOnly).toBe(true));
    expect(state().notice).toEqual({ key: "ring.takenOver", params: { name: "Bob" } });
    expect(screen.readOnly).toBe(true);
    // The bout is read again from the server before anything is shown as refused.
    await vi.waitFor(() => expect(api.calls.filter((call) => call === "get b1")).toHaveLength(2));
    await vi.waitFor(() => expect(screen.score).toEqual({ left: 0, right: 0, doubles: 0 }));
    expect(state().status.pending).toBe(1);

    const writes = api.calls.length;
    ring.matchEvent(hit(1, 0));
    ring.undo();
    expect(api.calls.length).toBe(writes);
  });

  it("taken over with nobody keeping says the ring is not claimed", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [takenOver(null)];
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().notice).toEqual({ key: "ring.notClaimed" }));
  });

  it("an undo answered with TAKEN_OVER is re-read before it is shown as refused", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    ring.matchEvent(hit(3, 0));
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    // The new keeper already undid it: the server shows it undone.
    api.writeScript = [takenOver(keeper("Bob"))];
    api.exchanges.b1![0]!.undoneAt = SINCE;
    ring.undo();
    await vi.waitFor(() => expect(state().readOnly).toBe(true));
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(screen.score).toEqual({ left: 0, right: 0, doubles: 0 });
  });

  it("re-claiming after a takeover does not resend the stale queue", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [takenOver(keeper("Bob"))];
    ring.matchEvent(hit(2, 0));
    await vi.waitFor(() => expect(state().readOnly).toBe(true));
    await vi.waitFor(() => expect(api.calls.filter((call) => call === "get b1")).toHaveLength(2));

    keptBy("Bob");
    api.claimScript = [activeKeeperRefusal(keeper("Bob"))];
    view.answers = [true];
    await ring.takeRing();

    expect(state().isKeeper).toBe(true);
    expect(state().notApplied).toEqual([{ kind: "exchange", exchange: { kind: "EXCHANGE", leftPoints: 2, rightPoints: 0, isDouble: false, firstScorer: null } }]);
    expect(state().status.pending).toBe(0);
    expect(api.calls.filter((call) => call.startsWith("exchange"))).toEqual(["exchange 2/0"]);
    expect(screen.readOnly).toBe(false);
    expect(screen.score).toEqual({ left: 0, right: 0, doubles: 0 });
  });

  it("a write refused with 403 re-reads the bout, then shows what was not applied", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [new ApiError("Ring link is no longer valid.", 403, undefined, {})];
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().notApplied).toHaveLength(1));
    expect(state().notice).toEqual({ key: "ring.linkInvalid" });
    expect(state().readOnly).toBe(true);
    expect(api.calls.slice(-2)).toEqual(["exchange 1/0", "get b1"]);
    expect(state().status.pending).toBe(0);

    // The list survives a reload until the keeper dismisses it.
    resetOutboxes();
    const reloaded = controller();
    await reloaded.open("tok");
    expect(state().notApplied).toHaveLength(1);
    reloaded.dismissNotApplied();
    resetOutboxes();
    await controller().open("tok");
    expect(state().notApplied).toEqual([]);
  });

  it("the status line counts what is not sent, shows offline, and turns red on a refusal", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [new TypeError("Failed to fetch")];
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().status).toMatchObject({ pending: 1, offline: true, alarm: false }));

    resetOutboxes();
    const other = controller();
    await other.open("tok");
    await other.openBout("b2");
    api.writeScript = [new ApiError("Bad exchange.", 400, undefined, {})];
    other.matchEvent(hit(2, 0));
    await vi.waitFor(() => expect(state().status).toMatchObject({ pending: 0, alarm: true }));
    expect(state().status.rejected).toHaveLength(1);
  });

  it("shows the score the backend answers with once everything is sent", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    ring.matchEvent(hit(2, 1));
    expect(screen.score).toEqual({ left: 0, right: 0, doubles: 1 });
    api.scoreOverride = { left: 9, right: 9, doubles: 9 };
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(screen.score).toEqual({ left: 9, right: 9, doubles: 9 }));
  });

  it("the clock is reported on pause, on resume and every 5 s while it runs", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    screen.clockNow = { seconds: 0, running: true };
    ring.clockToggled();
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.ms).toBe(5000);
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    screen.clockNow = { seconds: 5, running: true };
    intervals[0]!.run();
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    screen.clockNow = { seconds: 7, running: false };
    ring.clockToggled();
    expect(intervals[0]!.cancelled).toBe(true);
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.calls.filter((call) => /^(start|clock)/.test(call))).toEqual(["start b1", "clock 0/true", "clock 5/true", "clock 7/false"]);
  });

  it("undo, finish, then the next bout is offered", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    ring.matchEvent(hit(2, 0));
    ring.matchEvent(hit(0, 1));
    ring.undo();
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(screen.score).toEqual({ left: 2, right: 0, doubles: 0 });
    await ring.finishBout();
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.calls.filter((call) => /^(exchange|undo|finish)/.test(call))).toEqual(["exchange 2/0", "exchange 0/1", `undo ${api.exchanges.b1![1]!.id}`, "finish b1"]);
    expect(screen.closed).toBe(1);
    expect(state().screen).toBe("ring");
    expect(state().nextBoutId).toBe("b2");
  });
});

describe("ring mode fixes", () => {
  it("a read that races an acknowledged write is read again before the queue is reconciled", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    const write = deferred();
    api.writeGate = () => write.promise;
    ring.matchEvent(hit(2, 0));
    ring.undo();
    // The bout is read while the exchange is in flight: the server answers before it stores the exchange...
    const read = deferred();
    api.readGate = () => read.promise;
    const reopened = ring.openBout("b1");
    await vi.waitFor(() => expect(api.calls.filter((call) => call === "get b1")).toHaveLength(2));
    // ...then stores and acknowledges it; the undo behind it fails to send (offline).
    api.writeGate = null;
    api.writeScript = [undefined, new TypeError("Failed to fetch")];
    write.resolve();
    await vi.waitFor(() => expect(state().status.offline).toBe(true));
    api.readGate = null;
    read.resolve();
    await reopened;
    // The stale answer (without the exchange) did not make the queued undo look done.
    expect(api.calls.filter((call) => call === "get b1")).toHaveLength(3);
    expect(state().status.pending).toBe(1);
    expect(screen.score).toEqual({ left: 0, right: 0, doubles: 0 });
    expect(state().canUndo).toBe(false);
  });

  it("signing in again resumes every outbox that stopped signed out", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [new SessionExpiredError()];
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().screen).toBe("signIn"));
    await ring.openBout("b2");
    api.writeScript = [new SessionExpiredError()];
    ring.matchEvent(hit(0, 2));
    await vi.waitFor(() => expect(state().screen).toBe("signIn"));
    expect(state().status.pending).toBe(2);

    await ring.signIn("me", "secret");
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.exchanges.b1).toHaveLength(1);
    expect(api.exchanges.b2).toHaveLength(1);
    expect(state().screen).toBe("bout");
  });

  it("the ring says whether this device keeps it", async () => {
    // A stored claim, but the server has another device as keeper (a takeover before the reload).
    api.claims = { r1: SINCE };
    keptBy("Bob");
    await controller().open("tok");
    expect(state().isKeeper).toBe(false);
    expect(api.calls.some((call) => call.startsWith("claim"))).toBe(false);
  });

  it("an unkept ring with a stored claim is claimed and its queue is sent, not dropped", async () => {
    asKeeper();
    const first = controller();
    await first.open("tok");
    await first.openBout("b1");
    api.writeScript = [new TypeError("Failed to fetch")];
    first.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().status.offline).toBe(true));
    first.close();

    // The link was rotated meanwhile: nobody keeps the ring.
    api.keeperDevice = null;
    (api.ring as RingByToken).activeKeeper = null;
    resetOutboxes();
    await controller().open("tok");
    await vi.waitFor(() => expect(api.exchanges.b1).toHaveLength(1));
    expect(state().notApplied).toEqual([]);
    expect(api.calls.filter((call) => call.startsWith("exchange"))).toEqual(["exchange 1/0", "exchange 1/0"]);
  });

  it("after a takeover before a reload, taking the ring back drops the old queue", async () => {
    asKeeper();
    const first = controller();
    await first.open("tok");
    await first.openBout("b1");
    api.writeScript = [new TypeError("Failed to fetch")];
    first.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().status.offline).toBe(true));
    first.close();

    keptBy("Bob");
    resetOutboxes();
    const ring = controller();
    await ring.open("tok");
    api.claimScript = [activeKeeperRefusal(keeper("Bob"))];
    view.answers = [true];
    await ring.takeRing();
    expect(state().isKeeper).toBe(true);
    expect(state().notApplied).toHaveLength(1);
    expect(api.calls.filter((call) => call.startsWith("exchange"))).toEqual(["exchange 1/0"]);
  });
});

describe("ring mode fixes, round 2", () => {
  it("after a background bout signs out, signing in goes back to the open bout and its clock reports go on", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [new TypeError("Failed to fetch")];
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().status.offline).toBe(true));
    await ring.backToRing();
    await ring.openBout("b2");
    screen.clockNow = { seconds: 0, running: true };
    ring.clockToggled();
    await vi.waitFor(() => expect(api.calls).toContain("clock 0/true"));

    // b1's retry meets an expired sign-in.
    api.writeScript = [new SessionExpiredError()];
    retries.at(-1)!();
    await vi.waitFor(() => expect(state().screen).toBe("signIn"));
    expect(intervals.every((interval) => interval.cancelled)).toBe(true);

    screen.clockNow = { seconds: 12, running: true };
    await ring.signIn("me", "secret");
    expect(state().screen).toBe("bout");
    expect(state().boutId).toBe("b2");
    expect(screen.shown).toBe(1);
    await vi.waitFor(() => expect(api.exchanges.b1).toHaveLength(1));
    const live = intervals.filter((interval) => !interval.cancelled);
    expect(live).toHaveLength(1);
    screen.clockNow = { seconds: 17, running: true };
    live[0]!.run();
    await vi.waitFor(() => expect(api.calls).toContain("clock 17/true"));
    expect(api.calls).toContain("clock 12/true");
  });

  it("only exchange and undo acknowledgements make a bout read go again", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    const read = deferred();
    api.readGate = () => read.promise;
    const reopened = ring.openBout("b1");
    await vi.waitFor(() => expect(api.calls.filter((call) => call === "get b1")).toHaveLength(2));
    // A start and a clock report are acknowledged while the read is out.
    screen.clockNow = { seconds: 0, running: true };
    ring.clockToggled();
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.calls).toContain("clock 0/true");
    api.readGate = null;
    read.resolve();
    await reopened;
    expect(api.calls.filter((call) => call === "get b1")).toHaveLength(2);
  });

  it("a claim made under a rotated ring link counts as taken over: the old queue is not resent", async () => {
    asKeeper();
    const first = controller();
    await first.open("tok");
    await first.openBout("b1");
    api.writeScript = [new TypeError("Failed to fetch")];
    first.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().status.offline).toBe(true));
    first.close();

    // Another keeper took the ring, then the link was rotated (which clears the keeper).
    api.keeperDevice = null;
    (api.ring as RingByToken).activeKeeper = null;
    resetOutboxes();
    await controller().open("new-tok");
    expect(state().notApplied).toEqual([{ kind: "exchange", exchange: { kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, isDouble: false, firstScorer: null } }]);
    expect(api.calls.filter((call) => call.startsWith("exchange"))).toEqual(["exchange 1/0"]);
    // The free ring is claimed under the new link.
    expect(api.claimTokens.r1).toBe("new-tok");
    expect(state().isKeeper).toBe(true);
    expect(state().status.pending).toBe(0);
  });
});

describe("ring rules", () => {
  it("disqualification is not offered in ring mode", () => {
    expect(
      ringPenalties([
        { description: "Late", penalties: [], disqualify: true },
        { description: "Other", penalties: [1, 2], disqualify: true },
      ]),
    ).toEqual([{ description: "Other", penalties: [1, 2], disqualify: false }]);
  });
});

describe("ring mode fixes, end-to-end check", () => {
  // Phase-2 e2e: with the clock running offline the bar said "3 not sent" for 2 exchanges, and the old keeper's
  // phone said "1 not sent" after a takeover although only a clock report was left. Clock reports are not scores.
  it("the not-sent count leaves out clock reports", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [undefined, new TypeError("Failed to fetch")];
    screen.clockNow = { seconds: 0, running: true };
    ring.clockToggled();
    await vi.waitFor(() => expect(state().status.offline).toBe(true));
    expect(state().status.pending).toBe(0);
    ring.matchEvent(hit(1, 0));
    await vi.waitFor(() => expect(state().status.pending).toBe(1));
  });

  it("a takeover found by a clock report leaves nothing shown as not sent", async () => {
    asKeeper();
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    api.writeScript = [undefined, takenOver(keeper("Bob"))];
    screen.clockNow = { seconds: 0, running: true };
    ring.clockToggled();
    await vi.waitFor(() => expect(state().readOnly).toBe(true));
    expect(state().notice).toEqual({ key: "ring.takenOver", params: { name: "Bob" } });
    await vi.waitFor(() => expect(api.calls.filter((call) => call === "get b1")).toHaveLength(2));
    expect(state().status.pending).toBe(0);
    expect(state().notApplied).toEqual([]);
  });
  // Phase-2 final review: a ring reloaded while offline sat on the error screen until someone tapped "Try again".
  describe("a ring reloaded while the server cannot be reached", () => {
    function loadFlaky(failures: number, error: Error): { delays: number[]; clears: unknown[]; timers: Array<() => void>; made: RingController } {
      const delays: number[] = [];
      const clears: unknown[] = [];
      const timers: Array<() => void> = [];
      let left = failures;
      const real = api.ringByToken;
      api.ringByToken = async (token: string) => {
        if (left > 0) {
          left -= 1;
          api.calls.push(`ring ${token}`);
          throw error;
        }
        return real(token);
      };
      const made = new RingController({
        api,
        view,
        boutScreen: screen,
        storage,
        timers: {
          set: (run, ms) => {
            delays.push(ms);
            timers.push(run);
            return timers.length;
          },
          clear: (handle) => {
            clears.push(handle);
          },
        },
        clockTimer: { every: () => 0, cancel: () => undefined },
      });
      return { delays, clears, timers, made };
    }

    it("retries by itself with a growing delay, then loads the ring and sends what was queued", async () => {
      asKeeper();
      const first = controller();
      await first.open("tok");
      await first.openBout("b1");
      api.writeScript = [new TypeError("Failed to fetch")];
      first.matchEvent(hit(1, 0));
      await vi.waitFor(() => expect(state().status.pending).toBe(1));
      first.close();
      resetOutboxes();
      api.writeScript = [];
      api.calls = [];

      const { delays, timers, made } = loadFlaky(2, new TypeError("Failed to fetch"));
      await made.open("tok");
      expect(state().screen).toBe("error");
      expect(state().loadRetry).toEqual({ unsent: 1 });
      expect(delays).toEqual([1000]);

      timers[0]!();
      await vi.waitFor(() => expect(delays).toEqual([1000, 2000]));
      expect(state().screen).toBe("error");

      timers[1]!();
      await vi.waitFor(() => expect(state().screen).toBe("ring"));
      expect(state().loadRetry).toBeNull();
      await vi.waitFor(() => expect(api.calls.some((call) => call.startsWith("exchange"))).toBe(true));
      expect(delays).toEqual([1000, 2000]);
    });

    it("does not retry a refused link, and close() cancels a scheduled retry", async () => {
      const refused = loadFlaky(5, new ApiError("Gone", 404, undefined, {}));
      await refused.made.open("tok");
      expect(state().screen).toBe("invalidLink");
      expect(refused.delays).toEqual([]);

      const down = loadFlaky(1, new ApiError("Bad gateway", 503, undefined, {}));
      await down.made.open("tok");
      expect(down.delays).toEqual([1000]);
      down.made.close();

      const flaky = loadFlaky(1, new TypeError("Failed to fetch"));
      await flaky.made.open("tok");
      expect(flaky.delays).toEqual([1000]);
      flaky.made.close();
      // The scheduled retry was cleared (handle 1 is what `set` returned) ...
      expect(flaky.clears).toEqual([1]);
      // ... and even a retry that still fires does nothing: no new load, no claim.
      const loadsBefore = api.calls.filter((call) => call.startsWith("ring ")).length;
      flaky.timers[0]!();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(api.calls.filter((call) => call.startsWith("ring ")).length).toBe(loadsBefore);
      expect(api.calls).not.toContain("claim");
      expect(state().screen).toBe("error");
      expect(flaky.delays).toEqual([1000]);
    });

    it("a load still in flight when close() runs schedules no retry and claims nothing when it ends", async () => {
      const { delays, made } = loadFlaky(0, new TypeError("unused"));
      let fail!: (error: Error) => void;
      api.ringByToken = () => new Promise((_resolve, reject) => (fail = reject));
      const opening = made.open("tok");
      made.close();
      fail(new TypeError("Failed to fetch"));
      await opening;
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(delays).toEqual([]);
      expect(api.calls).not.toContain("claim");
    });

    it("a load that succeeds after close() does not claim the ring", async () => {
      const { made } = loadFlaky(0, new TypeError("unused"));
      let succeed!: () => void;
      const real = api.ringByToken;
      api.ringByToken = (token: string) => new Promise((resolve) => (succeed = () => resolve(real(token))));
      const opening = made.open("tok");
      made.close();
      succeed();
      await opening;
      expect(api.calls).not.toContain("claim");
    });

    it("Try again while a retry is pending cancels it: one load and one claim", async () => {
      const { delays, clears, timers, made } = loadFlaky(1, new TypeError("Failed to fetch"));
      await made.open("tok");
      expect(delays).toEqual([1000]);
      await made.reload();
      expect(clears).toEqual([1]);
      expect(state().screen).toBe("ring");
      timers[0]!();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(api.calls.filter((call) => call === "claim")).toHaveLength(1);
      // The failed load, and the tapped one (a claim reads the ring once more); the stale timer added none.
      expect(api.calls.filter((call) => call.startsWith("ring "))).toHaveLength(3);
    });

    it("two Try again taps while a load is in flight share it", async () => {
      const { made } = loadFlaky(0, new TypeError("unused"));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const real = api.ringByToken;
      api.ringByToken = async (token: string) => {
        await gate;
        return real(token);
      };
      const first = made.reload();
      const second = made.reload();
      release();
      await Promise.all([first, second]);
      // One load plus the re-read after its claim, not two loads.
      expect(api.calls.filter((call) => call.startsWith("ring "))).toHaveLength(2);
      expect(api.calls.filter((call) => call === "claim")).toHaveLength(1);
    });
  });
});

describe("rounds, break and overtime", () => {
  function withRules(rules: Record<string, unknown>): void {
    asKeeper();
    (api.ring as RingByToken).rules = rules;
  }

  it("ends a round at time-up, counts the break down and starts the next round at 0–0", async () => {
    let now = 1_000_000;
    withRules({ maxDurationSeconds: 180, rounds: 3, breakSeconds: 60 });
    const ring = new RingController({ api, view, boutScreen: screen, storage, timers: { set: () => undefined, clear: () => undefined }, clockTimer: { every: (run, ms) => { const handle = { run, ms, cancelled: false }; intervals.push(handle); return handle; }, cancel: (handle) => { (handle as { cancelled: boolean }).cancelled = true; } }, now: () => now });
    await ring.open("tok");
    await ring.openBout("b1");
    expect(screen.opened!.durationSeconds).toBe(180);
    ring.matchEvent(hit(2, 0));
    expect(state().phase).toMatchObject({ round: 1, rounds: 3, steps: { nextRound: true } });
    screen.clockNow = { seconds: 180, running: false };
    ring.clockToggled();
    ring.nextRound();
    expect(state().phase).toMatchObject({ period: "BREAK", breakRemaining: 60, steps: { startRound: true } });
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.states.at(-1)).toMatchObject({ round: 1, period: "BREAK" });
    now += 20_000;
    intervals.at(-1)!.run();
    expect(state().phase!.breakRemaining).toBe(40);
    ring.startRound();
    expect(state().phase).toMatchObject({ round: 2, period: "REGULAR", roundsWon: { left: 1, right: 0 }, breakRemaining: null });
    expect(screen.duration).toBe(180);
    expect(screen.clockNow.seconds).toBe(0);
    expect(screen.score).toEqual({ left: 0, right: 0, doubles: 0 });
    ring.matchEvent(hit(0, 1));
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.exchanges.b1!.map((exchange) => exchange.round ?? 1)).toEqual([1, 2]);
    expect(api.states.at(-1)).toEqual({ round: 2, period: "REGULAR", extension: 0, warningsLeft: 0, warningsRight: 0 });
  });

  it("offers an extension on a tie at time-up, then sudden death", async () => {
    withRules({ maxDurationSeconds: 180, extensions: 1, extensionSeconds: 30, suddenDeath: true });
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    ring.matchEvent(hit(1, 0));
    ring.matchEvent(hit(0, 1));
    expect(state().phase!.steps.extension).toBe(false);
    screen.clockNow = { seconds: 180, running: false };
    ring.clockToggled();
    expect(state().phase!.steps).toMatchObject({ extension: true, suddenDeath: false, nextRound: false });
    ring.extension();
    expect(screen.duration).toBe(210);
    expect(screen.clockNow.seconds).toBe(180);
    expect(state().phase).toMatchObject({ period: "EXTENSION", extension: 1 });
    screen.clockNow = { seconds: 210, running: false };
    ring.clockToggled();
    expect(state().phase!.steps).toMatchObject({ extension: false, suddenDeath: true });
    ring.suddenDeath();
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.states.at(-1)).toMatchObject({ period: "SUDDEN_DEATH", extension: 1 });
  });

  it("sends warning counts and restores the bout state on open", async () => {
    withRules({ rounds: 3, breakSeconds: 60 });
    const ring = controller();
    await ring.open("tok");
    await ring.openBout("b1");
    ring.matchEvent({ type: "warning", fighter: "B", description: "Warning", pointsDeducted: 0, elapsedTimeSeconds: 5 });
    await vi.waitFor(() => expect(state().status.pending).toBe(0));
    expect(api.states.at(-1)).toMatchObject({ warningsLeft: 0, warningsRight: 1 });
    expect(state().phase!.warnings).toEqual({ left: 0, right: 1 });

    const row = (api.ring as RingByToken).bouts.find((bout) => bout.id === "b2")!;
    Object.assign(row, { round: 2, period: "BREAK", extension: 0, warningsLeft: 2, warningsRight: 0 });
    const getBout = api.getBout;
    api.getBout = async (boutId) => ({ ...(await getBout(boutId)), display: { remainingSeconds: 25 } as unknown as NonNullable<BoutDetail["display"]> });
    await ring.backToRing();
    await ring.openBout("b2");
    expect(state().phase).toMatchObject({ round: 2, period: "BREAK", breakRemaining: 25, warnings: { left: 2, right: 0 } });
  });
});

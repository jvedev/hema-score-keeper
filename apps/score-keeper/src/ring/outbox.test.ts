import { ApiError } from "@hema/api-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveExchangeInput } from "./exchange-mapping";
import { LiveClient } from "./live-client";
import { Outbox, getOutbox, resetOutboxes, type LiveWriter, type OutboxOptions } from "./outbox";
import { MemoryStorage } from "./test-support";

const hit = (leftPoints: number): LiveExchangeInput => ({ kind: "EXCHANGE", leftPoints, rightPoints: 0, isDouble: false, firstScorer: null });

const network = () => new TypeError("Failed to fetch");
const takenOver = (activeKeeper: { userName: string; since: string } | null = { userName: "Bo", since: "2026-10-26T10:00:00Z" }) =>
  new ApiError("This ring was taken over.", 409, undefined, { reason: "TAKEN_OVER", activeKeeper });
const refused = (status: number, message = "Refused") => new ApiError(message, status, undefined, {});

/** Records each write as text; `script` holds what each next write does (an Error to throw, or nothing to succeed). */
class FakeWriter implements LiveWriter {
  readonly calls: string[] = [];
  readonly bodies: unknown[] = [];
  script: Array<Error | undefined> = [];

  #next(label: string, body: unknown): Promise<unknown> {
    this.calls.push(label);
    this.bodies.push(body);
    const outcome = this.script.shift();
    return outcome ? Promise.reject(outcome) : Promise.resolve({});
  }
  startBout = (_token: string, boutId: string) => this.#next(`start ${boutId}`, undefined);
  finishBout = (_token: string, boutId: string) => this.#next(`finish ${boutId}`, undefined);
  setClock = (_token: string, _boutId: string, clock: { seconds: number; running: boolean }) => this.#next(`clock ${clock.seconds}/${clock.running}`, clock);
  undo = (_token: string, _boutId: string, expectedExchangeId: string) => this.#next(`undo ${expectedExchangeId}`, undefined);
  postExchange = async (_token: string, _boutId: string, exchange: LiveExchangeInput & { clientExchangeId: string }) => {
    await this.#next(`exchange ${exchange.clientExchangeId}`, exchange);
    return { exchange: { id: `srv-${exchange.clientExchangeId}`, clientExchangeId: exchange.clientExchangeId } };
  };
}

let storage: MemoryStorage;
let writer: FakeWriter;
let ids: number;
let delays: number[];

function outbox(overrides: Partial<OutboxOptions> = {}): Outbox {
  return new Outbox({
    boutId: "b1",
    ringToken: "tok",
    writer,
    storage: storage,
    newId: () => `c${++ids}`,
    timers: { set: (_run, ms) => (delays.push(ms), delays.length), clear: () => undefined },
    autoFlush: false,
    ...overrides,
  });
}

beforeEach(() => {
  storage = new MemoryStorage();
  writer = new FakeWriter();
  ids = 0;
  delays = [];
  resetOutboxes();
});

describe("Outbox", () => {
  it("outbox survives reload and sends in order", async () => {
    const first = outbox();
    first.enqueueStart();
    first.enqueueExchange(hit(1));
    first.enqueueExchange(hit(2));
    first.enqueueUndo("srv-x");
    first.enqueueFinish();
    writer.script = [network()];
    await first.flush();
    expect(first.pending()).toBe(5);
    expect(first.state().status).toBe("offline");

    // The page reloads: a new outbox over the same storage.
    const offlineCalls = writer.calls.length;
    const second = outbox({ newId: () => "never" });
    expect(second.pending()).toBe(5);
    await second.flush();
    expect(writer.calls.slice(offlineCalls)).toEqual(["start b1", "exchange c1", "exchange c2", "undo srv-x", "finish b1"]);
    expect(second.pending()).toBe(0);
    expect(second.state().status).toBe("idle");
    expect(outbox().pending()).toBe(0);
  });

  it("outbox stops on TAKEN_OVER", async () => {
    const box = outbox();
    box.enqueueExchange(hit(1));
    box.enqueueExchange(hit(2));
    box.enqueueUndo("srv-9");
    writer.script = [undefined, takenOver()];
    await box.flush();
    expect(writer.calls).toEqual(["exchange c1", "exchange c2"]);
    const state = box.state();
    expect(state.status).toBe("takenOver");
    expect(state.activeKeeper).toEqual({ userName: "Bo", since: "2026-10-26T10:00:00Z" });
    // Not lost and not refused: the two unsent ops are unconfirmed.
    expect(state.unconfirmed).toBe(2);
    expect(state.rejected).toEqual([]);
    expect(box.pending()).toBe(2);
    await box.flush();
    expect(writer.calls).toHaveLength(2);
    expect(delays).toEqual([]);
  });

  it("an undo that gets TAKEN_OVER is unconfirmed, not rejected", async () => {
    const box = outbox();
    box.enqueueUndo("srv-1");
    writer.script = [takenOver(null)];
    await box.flush();
    expect(box.state()).toMatchObject({ status: "takenOver", activeKeeper: null, unconfirmed: 1, rejected: [] });
  });

  it("an invalid link (403) stops for good and keeps the ops unconfirmed", async () => {
    const box = outbox();
    box.enqueueExchange(hit(1));
    box.enqueueFinish();
    writer.script = [refused(403, "Invalid ring link")];
    await box.flush();
    expect(box.state()).toMatchObject({ status: "linkInvalid", unconfirmed: 2, rejected: [] });
    await box.flush();
    expect(writer.calls).toHaveLength(1);
  });

  it("rejected op is surfaced not retried", async () => {
    const box = outbox();
    box.enqueueExchange(hit(1));
    box.enqueueExchange(hit(2));
    writer.script = [refused(409, "This bout is finished."), undefined];
    await box.flush();
    expect(writer.calls).toEqual(["exchange c1", "exchange c2"]);
    const [rejected] = box.state().rejected;
    expect(rejected).toMatchObject({ type: "exchange", clientExchangeId: "c1", status: 409, message: "This bout is finished." });
    expect(box.pending()).toBe(0);

    // Reloaded: still shown, still not sent again, until the user dismisses it.
    const again = outbox();
    await again.flush();
    expect(writer.calls).toHaveLength(2);
    expect(again.state().rejected).toHaveLength(1);
    again.dismissRejected(rejected!.opId);
    expect(outbox().state().rejected).toEqual([]);
  });

  it("a 400 is rejected too", async () => {
    const box = outbox();
    box.enqueueClock({ seconds: 5, running: true });
    writer.script = [refused(400)];
    await box.flush();
    expect(box.state().rejected).toHaveLength(1);
  });

  it("same clientExchangeId on retry", async () => {
    const box = outbox();
    const id = box.enqueueExchange(hit(3));
    writer.script = [network(), network()];
    await box.flush();
    await box.flush();
    await outbox().flush();
    expect(writer.calls).toEqual([`exchange ${id}`, `exchange ${id}`, `exchange ${id}`]);
    expect(writer.bodies[2]).toMatchObject({ clientExchangeId: id, leftPoints: 3 });
  });

  it("retries with back-off 1s, 2s, 5s, then every 5s, and starts over after a success", async () => {
    const box = outbox();
    box.enqueueExchange(hit(1));
    writer.script = [network(), network(), network(), network(), network()];
    for (let attempt = 0; attempt < 5; attempt++) await box.flush();
    expect(delays).toEqual([1000, 2000, 5000, 5000, 5000]);
    await box.flush(); // succeeds
    box.enqueueExchange(hit(2));
    writer.script = [network()];
    await box.flush();
    expect(delays.at(-1)).toBe(1000);
  });

  it("a server error (5xx) is retried like a network error", async () => {
    const box = outbox();
    box.enqueueFinish();
    writer.script = [refused(503)];
    await box.flush();
    expect(box.state()).toMatchObject({ status: "offline", rejected: [] });
    expect(box.pending()).toBe(1);
  });

  it("an undo can name the exchange by clientExchangeId; it uses the server id once that exchange was acknowledged", async () => {
    const box = outbox();
    const id = box.enqueueExchange(hit(1));
    box.enqueueUndoOfClientExchange(id);
    await box.flush();
    expect(writer.calls).toEqual([`exchange ${id}`, `undo srv-${id}`]);
  });

  it("an undo of an exchange that never got stored is rejected", async () => {
    const box = outbox();
    const id = box.enqueueExchange(hit(1));
    box.enqueueUndoOfClientExchange(id);
    writer.script = [refused(409)];
    await box.flush();
    expect(writer.calls).toEqual([`exchange ${id}`]);
    expect(box.state().rejected.map((op) => op.type)).toEqual(["exchange", "undo"]);
  });

  it("only the newest unsent clock is kept", async () => {
    const box = outbox();
    box.enqueueClock({ seconds: 1, running: true });
    box.enqueueExchange(hit(1));
    box.enqueueClock({ seconds: 2, running: true });
    box.enqueueClock({ seconds: 3, running: false });
    await box.flush();
    expect(writer.calls).toEqual(["exchange c1", "clock 3/false"]);
  });

  it("reconcile drops the ops the server already has", async () => {
    const box = outbox();
    const sent = box.enqueueExchange(hit(1));
    const unsent = box.enqueueExchange(hit(2));
    box.enqueueUndoOfClientExchange(sent);
    box.enqueueFinish();
    writer.script = [takenOver()];
    await box.flush();
    expect(box.state().unconfirmed).toBe(4);

    // The server stored the first exchange (the request got through before the takeover) and nothing else.
    box.reconcile([{ id: "srv-1", clientExchangeId: sent, undoneAt: null }]);
    expect(box.state().unconfirmed).toBe(3);
    expect(box.unconfirmedOps().map((op) => op.type)).toEqual(["exchange", "undo", "finish"]);
    expect(box.unconfirmedOps()[0]).toMatchObject({ clientExchangeId: unsent });

    // An undo the server already shows as done is dropped too.
    box.reconcile([{ id: "srv-1", clientExchangeId: sent, undoneAt: "2026-10-26T10:05:00Z" }]);
    expect(box.unconfirmedOps().map((op) => op.type)).toEqual(["exchange", "finish"]);
  });

  it("with the complete list of active exchanges, an undo whose known target is missing counts as done", async () => {
    const box = outbox();
    const sent = box.enqueueExchange(hit(1));
    await box.flush();
    const unsent = box.enqueueExchange(hit(2));
    box.enqueueUndo("srv-gone");
    box.enqueueUndoOfClientExchange(sent);
    box.enqueueUndoOfClientExchange(unsent);
    writer.script = [takenOver()];
    await box.flush();
    expect(box.state().unconfirmed).toBe(4);

    // GET /live-bouts/:id lists only the active exchanges: the acknowledged one was undone meanwhile, and so was "srv-gone".
    box.reconcile([], { complete: true });
    expect(box.unconfirmedOps().map((op) => op.type)).toEqual(["exchange", "undo"]);
    // The undo of an exchange the server never got stays: its target is unknown there, not undone.
    expect(box.unconfirmedOps()[1]).toMatchObject({ expectedClientExchangeId: unsent });
  });

  it("resume lets a re-claimed ring send what is left", async () => {
    const box = outbox();
    box.enqueueFinish();
    writer.script = [takenOver()];
    await box.flush();
    box.resume();
    expect(box.state().status).toBe("idle");
    await box.flush();
    expect(box.pending()).toBe(0);
    expect(writer.calls).toEqual(["finish b1", "finish b1"]);
  });

  it("discard drops the queue after a takeover and returns what was dropped", async () => {
    const box = outbox();
    box.enqueueExchange(hit(1));
    box.enqueueExchange(hit(2));
    writer.script = [takenOver()];
    await box.flush();
    const dropped = box.discard();
    expect(dropped.map((op) => op.type)).toEqual(["exchange", "exchange"]);
    expect(box.pending()).toBe(0);
    expect(outbox().pending()).toBe(0);
    box.resume();
    await box.flush();
    expect(writer.calls).toHaveLength(1);
  });

  it("notifies subscribers when its state changes", async () => {
    const box = outbox();
    const seen: number[] = [];
    const stop = box.subscribe((state) => seen.push(state.pending));
    box.enqueueFinish();
    await box.flush();
    stop();
    const count = seen.length;
    box.enqueueFinish();
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(0);
    expect(seen).toHaveLength(count);
  });

  it("keeps one queue per bout", () => {
    const one = outbox();
    const two = outbox({ boutId: "b2" });
    one.enqueueFinish();
    expect(two.pending()).toBe(0);
    expect(outbox({ boutId: "b1" }).pending()).toBe(1);
  });
});

describe("Outbox hardening", () => {
  it("a request that never answers makes the outbox offline, then it resends and the later ops go out once", async () => {
    storage.setItem("hema-score-keeper.session", JSON.stringify({ accessToken: "a1", refreshToken: "r1", user: { id: "u1", name: "M", language: "en" } }));
    const sent: string[] = [];
    let hang = true;
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      if (hang) {
        return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
      }
      sent.push(`${url} ${String(init.body)}`);
      return Promise.resolve(new Response(JSON.stringify({ exchange: { id: "srv", clientExchangeId: "x" } }), { status: 200 }));
    });
    const client = new LiveClient("/api/v1", storage, () => new Date(), 20);
    const box = outbox({ writer: client });
    const id = box.enqueueExchange(hit(1));
    box.enqueueFinish();
    await box.flush();
    expect(box.state().status).toBe("offline");
    expect(box.pending()).toBe(2);
    expect(delays).toEqual([1000]);
    hang = false;
    await box.flush();
    expect(box.pending()).toBe(0);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain(id);
    expect(sent[1]).toContain("/finish");
  });

  it("reports when the queue could not be saved", async () => {
    const broken = new MemoryStorage();
    broken.setItem = () => {
      throw new Error("quota");
    };
    const box = outbox({ storage: broken });
    expect(box.state().persistenceFailed).toBe(false);
    box.enqueueExchange(hit(1));
    expect(box.state().persistenceFailed).toBe(true);
    expect(box.pending()).toBe(1);
    await box.flush();
    expect(box.pending()).toBe(0);
  });

  it("rejects an operation of an unknown type instead of acknowledging it", async () => {
    storage.setItem("hema-score-keeper.outbox.b1", JSON.stringify({ seq: 1, queue: [{ opId: "op1", type: "bogus" }], rejected: [], acked: {} }));
    const box = outbox();
    await box.flush();
    expect(writer.calls).toEqual([]);
    expect(box.pending()).toBe(0);
    expect(box.state().rejected).toHaveLength(1);
    expect(box.state().rejected[0]).toMatchObject({ opId: "op1", message: expect.stringContaining("bogus") });
  });

  it("keeps one outbox per bout in the registry", () => {
    const options = { boutId: "b1", ringToken: "tok", writer, storage, autoFlush: false };
    const one = getOutbox(options);
    expect(getOutbox(options)).toBe(one);
    expect(getOutbox({ ...options, boutId: "b2" })).not.toBe(one);
    resetOutboxes();
    expect(getOutbox(options)).not.toBe(one);
  });

  it("a new ring link for the same bout updates the registry outbox token and lifts an invalid-link stop", async () => {
    const options = { boutId: "b1", ringToken: "old", writer, storage, autoFlush: false };
    const box = getOutbox(options);
    box.enqueueFinish();
    writer.script = [refused(403)];
    await box.flush();
    expect(box.state().status).toBe("linkInvalid");
    expect(getOutbox({ ...options, ringToken: "new" })).toBe(box);
    expect(box.state().status).toBe("idle");
  });

  it("two outboxes over one storage do not overwrite each other", async () => {
    const one = outbox();
    const two = outbox();
    one.enqueueStart();
    two.enqueueFinish();
    one.enqueueExchange(hit(1));
    expect(outbox().pending()).toBe(3);
    await two.flush();
    expect(writer.calls).toEqual(["start b1", "finish b1", expect.stringMatching(/^exchange /)]);
    expect(outbox().pending()).toBe(0);
    one.enqueueFinish();
    expect(outbox().pending()).toBe(1);
  });
});

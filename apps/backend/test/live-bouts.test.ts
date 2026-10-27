import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scoreOf } from "../src/live/bout-score.js";
import { bearer, createTestContext, insertUser, YieldAfterEachQuery, type TestContext, type TestUser } from "./helpers.js";

describe("scoreOf", () => {
  it("scoreOf counts doubles as zero", () => {
    expect(
      scoreOf([
        { kind: "EXCHANGE", leftPoints: 2, rightPoints: 0 },
        { kind: "EXCHANGE", leftPoints: 1, rightPoints: 1 },
        { kind: "EXCHANGE", leftPoints: 0, rightPoints: 3 },
        { kind: "EXCHANGE", leftPoints: 0, rightPoints: 0 },
      ]),
    ).toEqual({ left: 2, right: 3, doubles: 1 });
  });

  it("scoreOf applies deductions", () => {
    expect(
      scoreOf([
        { kind: "EXCHANGE", leftPoints: 3, rightPoints: 0 },
        { kind: "DEDUCTION", leftPoints: -1, rightPoints: 0 },
        { kind: "DEDUCTION", leftPoints: 0, rightPoints: -2 },
      ]),
    ).toEqual({ left: 2, right: -2, doubles: 0 });
  });
});

const RING_TOKEN = "ring-token-R";
const DEVICE_ID = "device-1";

describe("live bouts", () => {
  let ctx: TestContext;
  let user: TestUser;
  let boutId: string;
  let ringId: string;

  async function setup(plugins: YieldAfterEachQuery[] = [], googleSpreadsheetId: string | null = null): Promise<void> {
    ctx = await createTestContext({ plugins });
    user = await insertUser(ctx.database, { id: "scorer", role: "USER" });
    await ctx.database
      .insertInto("LiveTournament")
      .values({ id: "T", name: "T", mode: "SHEET", layoutVersion: "v3", googleSpreadsheetId, createdByUserId: user.id, createdAt: "2026-10-25T10:00:00.000Z" })
      .execute();
    ringId = "R";
    await ctx.database.insertInto("LiveRing").values({ id: ringId, tournamentId: "T", name: "Ring 1", order: 1, keeperToken: RING_TOKEN }).execute();
    boutId = "B1";
    await ctx.database
      .insertInto("LiveBout")
      .values({
        id: boutId, tournamentId: "T", ringId, order: 1, label: "Match 1", sheetName: "Pool_1", headerCell: "B25",
        fighterLeft: "Ronald", fighterRight: "Diego", status: "PENDING", startedAt: null, finishedAt: null,
      })
      .execute();
    // Writes need the ring's keeper: claim the ring with this device, then every write sends the headers.
    const claimed = await ctx.app.inject({
      method: "POST", url: `/api/v1/live-rings/by-token/${RING_TOKEN}/claim`, payload: { deviceId: DEVICE_ID }, headers: bearer(user),
    });
    expect(claimed.statusCode).toBe(200);
  }

  beforeEach(async () => {
    process.env.LIVE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "live-bouts-"));
    await setup();
  });

  afterEach(async () => {
    delete process.env.LIVE_DATA_DIR;
    await ctx.app.close();
  });

  function post(url: string, payload?: unknown, as: TestUser | null = user) {
    const keeper = { "x-ring-token": RING_TOKEN, "x-device-id": DEVICE_ID };
    return ctx.app.inject({ method: "POST", url, payload: payload as object | undefined, headers: as ? { ...bearer(as), ...keeper } : keeper });
  }

  function exchange(id: string, left: number, right: number, extra: Record<string, unknown> = {}, bout = boutId) {
    return post(`/api/v1/live-bouts/${bout}/exchanges`, { clientExchangeId: id, kind: "EXCHANGE", leftPoints: left, rightPoints: right, ...extra });
  }

  /** Undo of the newest active exchange, naming it as the client would. */
  async function undo(bout = boutId) {
    const newest = (await rows(bout)).filter((row) => row.undoneAt === null).at(-1);
    return post(`/api/v1/live-bouts/${bout}/undo`, { expectedExchangeId: newest?.id ?? "none" });
  }

  async function rows(bout = boutId) {
    return ctx.database.selectFrom("LiveExchange").selectAll().where("boutId", "=", bout).orderBy("seq").execute();
  }

  it("same clientExchangeId is stored once", async () => {
    const first = await exchange("c1", 2, 0);
    expect(first.statusCode).toBe(200);
    const again = await exchange("c1", 2, 0);
    expect(again.statusCode).toBe(200);
    expect(again.json().exchange.id).toBe(first.json().exchange.id);
    expect(again.json().score).toEqual({ left: 2, right: 0, doubles: 0 });
    expect(await rows()).toHaveLength(1);
  });

  it("a resend returns the stored exchange even after undo and does not bring it back", async () => {
    await exchange("c1", 2, 0);
    await undo();
    const again = await exchange("c1", 2, 0);
    expect(again.statusCode).toBe(200);
    expect(again.json().score).toEqual({ left: 0, right: 0, doubles: 0 });
    expect(await rows()).toHaveLength(1);
  });

  it("concurrent exchanges get distinct seq", async () => {
    await ctx.app.close();
    await setup([new YieldAfterEachQuery()]);
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => exchange(`c${index}`, 1, 0)));
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200, 200]);
    const stored = await rows();
    expect(stored.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(stored.map((row) => row.clientExchangeId)).size).toBe(6);
    const detail = await ctx.app.inject({ method: "GET", url: `/api/v1/live-bouts/${boutId}`, headers: bearer(user) });
    expect(detail.json().score.left).toBe(6);
  });

  it("concurrent resends of one clientExchangeId store one row", async () => {
    await ctx.app.close();
    await setup([new YieldAfterEachQuery()]);
    const responses = await Promise.all([exchange("same", 1, 0), exchange("same", 1, 0), exchange("same", 1, 0)]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(await rows()).toHaveLength(1);
  });

  it("undo removes only the newest", async () => {
    await exchange("c1", 1, 0);
    await exchange("c2", 0, 2);
    await exchange("c3", 3, 0);
    const undone = await undo();
    expect(undone.statusCode).toBe(200);
    expect(undone.json().score).toEqual({ left: 1, right: 2, doubles: 0 });
    const stored = await rows();
    expect(stored.map((row) => row.undoneAt !== null)).toEqual([false, false, true]);
    await undo();
    expect((await rows()).map((row) => row.undoneAt !== null)).toEqual([false, true, true]);
    // The next exchange gets a fresh seq after the undone ones.
    await exchange("c4", 1, 0);
    expect((await rows()).map((row) => row.seq)).toEqual([1, 2, 3, 4]);
  });

  it("undo with nothing to undo is 409", async () => {
    expect((await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: "x" })).statusCode).toBe(409);
  });

  it("undo without expectedExchangeId is 400 and removes nothing", async () => {
    await exchange("c1", 1, 0);
    expect((await post(`/api/v1/live-bouts/${boutId}/undo`)).statusCode).toBe(400);
    expect((await post(`/api/v1/live-bouts/${boutId}/undo`, {})).statusCode).toBe(400);
    expect((await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: null })).statusCode).toBe(400);
    expect((await rows()).every((row) => row.undoneAt === null)).toBe(true);
  });

  it("a retried undo of an already undone exchange is 200 with the current score and removes nothing", async () => {
    await exchange("c1", 1, 0);
    const second = await exchange("c2", 0, 2);
    const id = second.json().exchange.id as string;
    const first = await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: id });
    expect(first.statusCode).toBe(200);
    const retry = await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: id });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().score).toEqual({ left: 1, right: 0, doubles: 0 });
    expect(retry.json().undone).toMatchObject({ id });
    expect((await rows()).map((row) => row.undoneAt !== null)).toEqual([false, true]);
  });

  it("writes to a finished bout are refused", async () => {
    await exchange("c1", 1, 0);
    expect((await post(`/api/v1/live-bouts/${boutId}/finish`)).statusCode).toBe(200);
    expect((await exchange("c2", 1, 0)).statusCode).toBe(409);
    expect((await undo()).statusCode).toBe(409);
    expect((await post(`/api/v1/live-bouts/${boutId}/start`)).statusCode).toBe(409);
    expect(await rows()).toHaveLength(1);
    // A resend of the stored exchange still answers.
    expect((await exchange("c1", 1, 0)).statusCode).toBe(200);
  });

  it("anonymous is 401", async () => {
    expect((await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "x", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 }, null)).statusCode).toBe(401);
    expect((await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: "x" }, null)).statusCode).toBe(401);
    expect((await post(`/api/v1/live-bouts/${boutId}/start`, undefined, null)).statusCode).toBe(401);
    expect((await post(`/api/v1/live-bouts/${boutId}/finish`, undefined, null)).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: "GET", url: `/api/v1/live-bouts/${boutId}` })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: "GET", url: `/api/v1/live-rings/${ringId}/bouts` })).statusCode).toBe(401);
    expect(await rows()).toHaveLength(0);
  });

  it("exchange enqueues sync", async () => {
    await exchange("c1", 1, 0);
    const jobs = await ctx.database.selectFrom("LiveSyncJob").selectAll().where("boutId", "=", boutId).execute();
    expect(jobs.map((job) => [job.target, job.status])).toEqual([["LOCAL", "PENDING"]]);
  });

  it("exchange and undo enqueue sync, including GOOGLE when configured", async () => {
    await ctx.app.close();
    await setup([], "sheet-id");
    const pending = async () =>
      (await ctx.database.selectFrom("LiveSyncJob").select(["target", "status"]).where("boutId", "=", boutId).orderBy("target").execute()).length;
    const clear = () => ctx.database.deleteFrom("LiveSyncJob").execute();
    await exchange("c1", 1, 0);
    expect(await pending()).toBe(2);
    await clear();
    expect((await undo()).statusCode).toBe(200);
    expect(await pending()).toBe(2);
  });

  it("start and finish create no sync job (the sheet depends only on exchanges)", async () => {
    await ctx.app.close();
    await setup([], "sheet-id");
    const jobs = () => ctx.database.selectFrom("LiveSyncJob").selectAll().execute();
    expect((await post(`/api/v1/live-bouts/${boutId}/start`)).statusCode).toBe(200);
    expect(await jobs()).toEqual([]);
    expect((await post(`/api/v1/live-bouts/${boutId}/finish`)).statusCode).toBe(200);
    expect(await jobs()).toEqual([]);
    const bout = await ctx.database.selectFrom("LiveBout").selectAll().where("id", "=", boutId).executeTakeFirstOrThrow();
    expect(bout.status).toBe("DONE");
  });

  it("a failed write leaves no exchange and no sync job", async () => {
    await ctx.database.deleteFrom("LiveTournament").execute().catch(() => undefined);
    // Bout is gone with the tournament (cascade): the request is a 404 and nothing is stored.
    expect((await exchange("c1", 1, 0)).statusCode).toBe(404);
    expect(await ctx.database.selectFrom("LiveSyncJob").selectAll().execute()).toHaveLength(0);
  });

  it("an exchange on a pending bout starts it", async () => {
    await exchange("c1", 1, 0);
    const detail = await ctx.app.inject({ method: "GET", url: `/api/v1/live-bouts/${boutId}`, headers: bearer(user) });
    expect(detail.json().bout.status).toBe("RUNNING");
    expect(detail.json().bout.startedAt).not.toBeNull();
  });

  describe("validation", () => {
    it.each([
      ["non-integer", { leftPoints: 1.5, rightPoints: 0 }],
      ["NaN-like string", { leftPoints: "2", rightPoints: 0 }],
      ["null", { leftPoints: null, rightPoints: 0 }],
      ["above 10", { leftPoints: 11, rightPoints: 0 }],
      ["below -10", { leftPoints: 0, rightPoints: -11 }],
      ["negative exchange", { leftPoints: -1, rightPoints: 0 }],
      ["missing points", { leftPoints: 1 }],
      ["0/0 exchange", { leftPoints: 0, rightPoints: 0 }],
    ])("rejects %s points", async (_name, points) => {
      const response = await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "v", kind: "EXCHANGE", ...points });
      expect(response.statusCode).toBe(400);
      expect(await rows()).toHaveLength(0);
    });

    it("rejects an unknown kind, an empty id, a bad firstScorer and a wrong isDouble", async () => {
      const base = { clientExchangeId: "v", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 };
      for (const bad of [{ kind: "OTHER" }, { clientExchangeId: "" }, { clientExchangeId: 5 }, { firstScorer: "MIDDLE" }, { isDouble: true }]) {
        expect((await post(`/api/v1/live-bouts/${boutId}/exchanges`, { ...base, ...bad })).statusCode).toBe(400);
      }
      expect(await rows()).toHaveLength(0);
    });

    it("accepts the boundaries 10 and -10", async () => {
      expect((await exchange("a", 10, 0)).statusCode).toBe(200);
      const deduction = await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "b", kind: "DEDUCTION", leftPoints: 0, rightPoints: -10 });
      expect(deduction.statusCode).toBe(200);
      expect(deduction.json().score).toEqual({ left: 10, right: -10, doubles: 0 });
    });

    it.each([
      ["both sides negative", { leftPoints: -1, rightPoints: -1 }],
      ["negative and positive", { leftPoints: -1, rightPoints: 1 }],
      ["both zero", { leftPoints: 0, rightPoints: 0 }],
      ["positive only", { leftPoints: 1, rightPoints: 0 }],
    ])("rejects a deduction with %s", async (_name, points) => {
      const response = await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "d", kind: "DEDUCTION", ...points });
      expect(response.statusCode).toBe(400);
      expect(await rows()).toHaveLength(0);
    });

    it("stores a double with both points and marks it", async () => {
      const response = await exchange("dbl", 1, 1, { firstScorer: "LEFT" });
      expect(response.json().score).toEqual({ left: 0, right: 0, doubles: 1 });
      expect(response.json().exchange).toMatchObject({ isDouble: true, firstScorer: "LEFT" });
    });

    it("a deduction is stored negative for that fighter", async () => {
      await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "d", kind: "DEDUCTION", leftPoints: -1, rightPoints: 0 });
      expect(await rows()).toMatchObject([{ kind: "DEDUCTION", leftPoints: -1, rightPoints: 0, isDouble: 0 }]);
    });
  });

  it("lists a ring's bouts in order with score and status, and the tournament view carries scores", async () => {
    await ctx.database
      .insertInto("LiveBout")
      .values({
        id: "B0", tournamentId: "T", ringId, order: 0, label: "First", sheetName: "Pool_1", headerCell: "H25",
        fighterLeft: "A", fighterRight: "B", status: "PENDING", startedAt: null, finishedAt: null,
      })
      .execute();
    await exchange("c1", 2, 0);
    await exchange("c2", 0, 1);
    const list = await ctx.app.inject({ method: "GET", url: `/api/v1/live-rings/${ringId}/bouts`, headers: bearer(user) });
    const bouts = list.json().bouts as { id: string; status: string; score: unknown }[];
    expect(bouts.map((bout) => bout.id)).toEqual(["B0", "B1"]);
    expect(bouts[1]).toMatchObject({ status: "RUNNING", score: { left: 2, right: 1, doubles: 0 } });
    // An unscored bout has a null score, on both routes; a scored one the same { left, right, doubles } shape.
    expect(bouts[0]!.score).toBeNull();
    const view = await ctx.app.inject({ method: "GET", url: "/api/v1/live-tournaments/T", headers: bearer(user) });
    const viewBouts = view.json().bouts as Record<string, unknown>[];
    const byId = new Map(viewBouts.map((bout) => [bout.id, bout]));
    expect(byId.get("B1")!.score).toEqual({ left: 2, right: 1, doubles: 0 });
    expect(byId.get("B0")!.score).toBeNull();
    expect(viewBouts.every((bout) => !("scoreLeft" in bout) && !("scoreRight" in bout))).toBe(true);
  });

  it("same clientExchangeId with different values is 409 and keeps the stored exchange", async () => {
    const first = await exchange("c1", 2, 0, { firstScorer: "LEFT" });
    const variants: Record<string, unknown>[] = [
      { leftPoints: 3, rightPoints: 0 },
      { leftPoints: 0, rightPoints: 2 },
      { leftPoints: 2, rightPoints: 0, firstScorer: "RIGHT" },
      { leftPoints: 2, rightPoints: 0 },
    ];
    for (const variant of variants) {
      const response = await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "c1", kind: "EXCHANGE", ...variant });
      expect(response.statusCode).toBe(409);
      expect(response.json().message ?? response.json().error).toContain("clientExchangeId already used with different values");
    }
    const kind = await post(`/api/v1/live-bouts/${boutId}/exchanges`, { clientExchangeId: "c1", kind: "DEDUCTION", leftPoints: -2, rightPoints: 0, firstScorer: "LEFT" });
    expect(kind.statusCode).toBe(409);
    const same = await exchange("c1", 2, 0, { firstScorer: "LEFT" });
    expect(same.statusCode).toBe(200);
    expect(same.json().exchange.id).toBe(first.json().exchange.id);
    expect(await rows()).toHaveLength(1);
  });

  it("a failure after the exchange insert rolls back the exchange and the bout status", async () => {
    await sql`DROP TABLE LiveSyncJob`.execute(ctx.database);
    const response = await exchange("c1", 1, 0);
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(await rows()).toHaveLength(0);
    const bout = await ctx.database.selectFrom("LiveBout").selectAll().where("id", "=", boutId).executeTakeFirstOrThrow();
    expect(bout.status).toBe("PENDING");
    expect(bout.startedAt).toBeNull();
  });

  it("undo with a stale expectedExchangeId is 409 and removes nothing", async () => {
    const first = await exchange("c1", 1, 0);
    const second = await exchange("c2", 0, 2);
    const stale = await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: first.json().exchange.id });
    expect(stale.statusCode).toBe(409);
    const unknown = await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: "not-an-exchange" });
    expect(unknown.statusCode).toBe(409);
    expect((await rows()).every((row) => row.undoneAt === null)).toBe(true);
    const ok = await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: second.json().exchange.id });
    expect(ok.statusCode).toBe(200);
    expect((await rows()).map((row) => row.undoneAt !== null)).toEqual([false, true]);
    const bad = await post(`/api/v1/live-bouts/${boutId}/undo`, { expectedExchangeId: 5 });
    expect(bad.statusCode).toBe(400);
  });

  it("unknown ring is 404", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/live-rings/nope/bouts", headers: bearer(user) });
    expect(response.statusCode).toBe(404);
  });

  it("unknown bout is 404", async () => {
    expect((await exchange("c1", 1, 0, {}, "nope")).statusCode).toBe(404);
  });
});

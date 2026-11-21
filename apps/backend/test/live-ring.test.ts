import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, YieldAfterEachQuery, type TestContext, type TestUser } from "./helpers.js";
import { createLiveTournament } from "./live-fixtures.js";

const TOKEN = "ring-1-token";
const OTHER_TOKEN = "ring-2-token";

describe("live ring keeper", () => {
  let ctx: TestContext;
  let creator: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let tournamentId: string;
  let ringOneId: string;
  let ringTwoId: string;
  let boutOneId: string;
  let boutTwoId: string;
  let boutThreeId: string;

  async function setup(plugins: YieldAfterEachQuery[] = []): Promise<void> {
    ctx = await createTestContext({ plugins });
    creator = await insertUser(ctx.database, { id: "creator", role: "USER", name: "Carla Creator" });
    alice = await insertUser(ctx.database, { id: "alice", role: "USER", name: "Alice Keeper" });
    bob = await insertUser(ctx.database, { id: "bob", role: "USER", name: "Bob Keeper" });
    const left = await insertUser(ctx.database, { id: "fighter-left", role: "USER", name: "L" });
    const right = await insertUser(ctx.database, { id: "fighter-right", role: "USER", name: "R" });
    const live = await createLiveTournament(ctx, {
      admin: creator,
      rings: [
        { key: "one", name: "Ring 1", keeperToken: TOKEN },
        { key: "two", name: "Ring 2", keeperToken: OTHER_TOKEN },
      ],
      bouts: [
        { key: "one", ring: "one", left, right },
        { key: "two", ring: "one", left, right },
        { key: "three", ring: "one", left, right },
        { key: "other-ring", ring: "two", left, right },
      ],
      scorers: [alice, bob],
    });
    tournamentId = live.liveTournamentId;
    ringOneId = live.ringId("one");
    ringTwoId = live.ringId("two");
    boutOneId = live.boutId("one");
    boutTwoId = live.boutId("two");
    boutThreeId = live.boutId("three");
  }

  beforeEach(async () => {
    await setup();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  function get(url: string, as: TestUser | null) {
    return ctx.app.inject({ method: "GET", url, headers: as ? bearer(as) : {} });
  }

  function post(url: string, as: TestUser | null, payload?: unknown, headers: Record<string, string> = {}) {
    return ctx.app.inject({ method: "POST", url, payload: payload as object | undefined, headers: { ...(as ? bearer(as) : {}), ...headers } });
  }

  function claim(as: TestUser, deviceId: string, confirm?: boolean, token = TOKEN) {
    return post(`/api/v1/live-rings/by-token/${token}/claim`, as, confirm === undefined ? { deviceId } : { deviceId, confirm });
  }

  function keeper(deviceId: string, token = TOKEN): Record<string, string> {
    return { "x-ring-token": token, "x-device-id": deviceId };
  }

  function exchange(as: TestUser, deviceId: string, clientExchangeId: string, left = 1, right = 0, token = TOKEN, bout = boutOneId) {
    return post(`/api/v1/live-bouts/${bout}/exchanges`, as, { clientExchangeId, kind: "EXCHANGE", leftPoints: left, rightPoints: right }, keeper(deviceId, token));
  }

  async function ring(id = ringOneId) {
    return ctx.database.selectFrom("LiveRing").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  }

  async function exchangeRows(bout = boutOneId) {
    return ctx.database.selectFrom("LiveExchange").selectAll().where("boutId", "=", bout).orderBy("seq").execute();
  }

  async function bout(id = boutOneId) {
    return ctx.database.selectFrom("LiveBout").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  }

  it("claim on a free ring", async () => {
    const before = await get(`/api/v1/live-rings/by-token/${TOKEN}`, alice);
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      ring: { id: ringOneId, name: "Ring 1", tournamentId },
      tournament: { id: tournamentId, name: "Tournament" },
      activeKeeper: null,
    });
    expect(before.json().tournament).not.toHaveProperty("mode");
    expect((before.json().bouts as { id: string }[]).map((b) => b.id)).toEqual([boutOneId, boutTwoId, boutThreeId]);

    const claimed = await claim(alice, "dev-a");
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().ring).toMatchObject({ id: ringOneId, name: "Ring 1" });
    expect(await ring()).toMatchObject({ activeDeviceId: "dev-a", activeUserId: "alice" });

    const after = await get(`/api/v1/live-rings/by-token/${TOKEN}`, bob);
    expect(after.json().activeKeeper).toEqual({ userName: "Alice Keeper", since: (await ring()).activeSince });

    // The same device claiming again needs no confirm.
    expect((await claim(alice, "dev-a")).statusCode).toBe(200);

    // Unknown token, missing deviceId and anonymous.
    expect((await get("/api/v1/live-rings/by-token/nope", alice)).statusCode).toBe(404);
    expect((await claim(alice, "dev-a", undefined, "nope")).statusCode).toBe(404);
    expect((await post(`/api/v1/live-rings/by-token/${TOKEN}/claim`, alice, {})).statusCode).toBe(400);
    expect((await get(`/api/v1/live-rings/by-token/${TOKEN}`, null)).statusCode).toBe(401);
    expect((await post(`/api/v1/live-rings/by-token/${TOKEN}/claim`, null, { deviceId: "x" })).statusCode).toBe(401);
  });

  it("the ring view says whether the asking device keeps the ring", async () => {
    const view = (as: TestUser, deviceId?: string) =>
      ctx.app.inject({ method: "GET", url: `/api/v1/live-rings/by-token/${TOKEN}`, headers: { ...bearer(as), ...(deviceId ? { "x-device-id": deviceId } : {}) } });
    expect((await view(alice, "dev-a")).json().youAreKeeper).toBe(false);
    await claim(alice, "dev-a");
    const mine = await view(alice, "dev-a");
    expect(mine.json().youAreKeeper).toBe(true);
    expect((await view(alice, "dev-b")).json().youAreKeeper).toBe(false);
    expect((await view(bob)).json().youAreKeeper).toBe(false);
    // The device id itself is never returned.
    expect(mine.body).not.toContain("dev-a");
  });

  it("claim on an active ring needs confirm", async () => {
    await claim(alice, "dev-a");
    const refused = await claim(bob, "dev-b");
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ reason: "ACTIVE_KEEPER", activeKeeper: { userName: "Alice Keeper" } });
    expect((await ring()).activeDeviceId).toBe("dev-a");
    expect((await claim(bob, "dev-b", false)).statusCode).toBe(409);

    const confirmed = await claim(bob, "dev-b", true);
    expect(confirmed.statusCode).toBe(200);
    expect(await ring()).toMatchObject({ activeDeviceId: "dev-b", activeUserId: "bob" });
  });

  it("writes from a replaced device are refused", async () => {
    await claim(alice, "dev-a");
    const stored = await exchange(alice, "dev-a", "c1", 2, 0);
    expect(stored.statusCode).toBe(200);
    await claim(bob, "dev-b", true);

    // The old device's queued writes are refused, not applied.
    const late = await exchange(alice, "dev-a", "c2", 1, 0);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ reason: "TAKEN_OVER", activeKeeper: { userName: "Bob Keeper" } });
    const stale = keeper("dev-a");
    for (const [url, body] of [
      [`/api/v1/live-bouts/${boutOneId}/undo`, { expectedExchangeId: stored.json().exchange.id }],
      [`/api/v1/live-bouts/${boutOneId}/start`, undefined],
      [`/api/v1/live-bouts/${boutOneId}/finish`, undefined],
      [`/api/v1/live-bouts/${boutOneId}/clock`, { seconds: 10, running: true }],
    ] as const) {
      const response = await post(url, alice, body, stale);
      expect(response.statusCode, url).toBe(409);
      expect(response.json().reason, url).toBe("TAKEN_OVER");
    }
    // Same account, other device: still not the keeper.
    expect((await exchange(bob, "dev-a", "c3")).statusCode).toBe(409);

    // A resend of an exchange stored while dev-a was keeper answers with the stored row and creates nothing.
    const resend = await exchange(alice, "dev-a", "c1", 2, 0);
    expect(resend.statusCode).toBe(200);
    expect(resend.json().exchange.id).toBe(stored.json().exchange.id);
    expect((await exchange(alice, "dev-a", "c1", 3, 0)).statusCode).toBe(409);
    expect(await exchangeRows()).toHaveLength(1);
    expect((await bout()).status).toBe("RUNNING");
    expect((await bout()).clockSeconds).toBe(0);

    // Missing or wrong ring token is 403, also for the active keeper; a missing device id is 400.
    expect((await post(`/api/v1/live-bouts/${boutOneId}/exchanges`, bob, { clientExchangeId: "c4", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 }, { "x-device-id": "dev-b" })).statusCode).toBe(403);
    expect((await exchange(bob, "dev-b", "c4", 1, 0, "wrong")).statusCode).toBe(403);
    expect((await exchange(bob, "dev-b", "c4", 1, 0, OTHER_TOKEN)).statusCode).toBe(403);
    expect((await post(`/api/v1/live-bouts/${boutOneId}/exchanges`, bob, { clientExchangeId: "c4", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 }, { "x-ring-token": TOKEN })).statusCode).toBe(400);
    expect(await exchangeRows()).toHaveLength(1);

    // The new keeper continues the bout.
    const next = await exchange(bob, "dev-b", "c4", 0, 1);
    expect(next.statusCode).toBe(200);
    expect(next.json().score).toEqual({ left: 2, right: 1, doubles: 0 });
  });

  it("a takeover racing a write never lets the old device write after it", async () => {
    await ctx.app.close();
    await setup([new YieldAfterEachQuery()]);
    await claim(alice, "dev-a");
    for (let round = 0; round < 5; round++) {
      await claim(alice, "dev-a", true);
      const [write, takeover] = await Promise.all([exchange(alice, "dev-a", `race-${round}`), claim(bob, "dev-b", true)]);
      expect(takeover.statusCode).toBe(200);
      const storedRow = (await exchangeRows()).find((row) => row.clientExchangeId === `race-${round}`);
      if (write.statusCode === 200) {
        // Accepted before the takeover committed: stored, and created no later than the claim.
        expect(storedRow).toBeDefined();
        expect(storedRow!.createdAt <= (await ring()).activeSince!).toBe(true);
      } else {
        expect(write.statusCode).toBe(409);
        expect(storedRow).toBeUndefined();
      }
    }
  });

  it("rotated token is unknown", async () => {
    await claim(alice, "dev-a");
    expect((await post(`/api/v1/live-rings/${ringOneId}/rotate-token`, alice)).statusCode).toBe(403);
    expect((await post(`/api/v1/live-rings/${ringOneId}/rotate-token`, null)).statusCode).toBe(401);
    expect((await post("/api/v1/live-rings/nope/rotate-token", creator)).statusCode).toBe(404);

    const rotated = await post(`/api/v1/live-rings/${ringOneId}/rotate-token`, creator);
    expect(rotated.statusCode).toBe(200);
    const newToken = rotated.json().ring.keeperToken as string;
    expect(newToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newToken).not.toBe(TOKEN);
    expect((await ring()).keeperToken).toBe(newToken);

    expect((await get(`/api/v1/live-rings/by-token/${TOKEN}`, alice)).statusCode).toBe(404);
    expect((await claim(alice, "dev-a", true)).statusCode).toBe(404);
    expect((await exchange(alice, "dev-a", "old-link")).statusCode).toBe(403);

    // The new link works, and nobody is keeping the ring until it is claimed with it.
    const fresh = await get(`/api/v1/live-rings/by-token/${newToken}`, bob);
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().activeKeeper).toBeNull();
    expect((await claim(bob, "dev-b", undefined, newToken)).statusCode).toBe(200);
    expect((await exchange(bob, "dev-b", "new-link", 1, 0, newToken)).statusCode).toBe(200);
  });

  it("claim pauses a running clock", async () => {
    await claim(alice, "dev-a");
    expect((await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { seconds: 42, running: true }, keeper("dev-a"))).statusCode).toBe(200);
    expect(await bout()).toMatchObject({ clockSeconds: 42, clockRunning: 1 });

    await claim(bob, "dev-b", true);
    expect(await bout()).toMatchObject({ clockSeconds: 42, clockRunning: 0 });
    const view = await get(`/api/v1/live-bouts/${boutOneId}`, bob);
    expect(view.json().clock).toMatchObject({ seconds: 42, running: false });

    // The new keeper restarts it.
    expect((await post(`/api/v1/live-bouts/${boutOneId}/clock`, bob, { seconds: 42, running: true }, keeper("dev-b"))).statusCode).toBe(200);
    expect((await get(`/api/v1/live-bouts/${boutOneId}`, bob)).json().clock).toMatchObject({ seconds: 42, running: true });
  });

  it("clock is stored and returned", async () => {
    await claim(alice, "dev-a");
    const initial = await get(`/api/v1/live-bouts/${boutOneId}`, alice);
    expect(initial.json().clock).toEqual({ seconds: 0, running: false, updatedAt: null });

    const response = await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { seconds: 75, running: true }, keeper("dev-a"));
    expect(response.statusCode).toBe(200);
    expect(response.json().clock).toMatchObject({ seconds: 75, running: true });
    const view = await get(`/api/v1/live-bouts/${boutOneId}`, alice);
    expect(view.json().clock).toMatchObject({ seconds: 75, running: true });
    expect(view.json().clock.updatedAt).toEqual(expect.any(String));
    const byToken = await get(`/api/v1/live-rings/by-token/${TOKEN}`, alice);
    expect((byToken.json().bouts as { id: string; clock: unknown }[]).find((b) => b.id === boutOneId)!.clock).toMatchObject({ seconds: 75, running: true });

    for (const bad of [{ seconds: -1, running: true }, { seconds: 1.5, running: true }, { seconds: "3", running: true }, { seconds: 3, running: "yes" }, { seconds: 3 }, {}]) {
      expect((await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, bad, keeper("dev-a"))).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect(await bout()).toMatchObject({ clockSeconds: 75, clockRunning: 1 });
    // The clock does not start the bout.
    expect((await bout()).status).toBe("PENDING");
    expect((await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { seconds: 5, running: false }, keeper("dev-a", OTHER_TOKEN))).statusCode).toBe(403);
  });

  it("rules: a tournament admin sets them, the ring view and display use them", async () => {
    const put = (as: TestUser, payload: unknown) => ctx.app.inject({ method: "PUT", url: `/api/v1/live-tournaments/${tournamentId}/rules`, payload: payload as object, headers: bearer(as) });
    expect((await put(alice, { rounds: 3 })).statusCode).toBe(403);
    const saved = await put(creator, { maxDurationSeconds: 120, maxDoubles: 2, rounds: 3, breakSeconds: 30, lastExchangeSeconds: 10, extensions: 1, extensionSeconds: 30 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().rules.format).toMatchObject({ rounds: 3, breakSeconds: 30, extensions: 1 });
    // Invalid values are refused with a reason; the saved rules stay as they were.
    const refused = await put(creator, { maxDurationSeconds: 0, rounds: 12 });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain("Bout length");
    expect(refused.json().error).toContain("Rounds");
    expect((await get(`/api/v1/live-tournaments/${tournamentId}`, alice)).json().rules.maxDurationSeconds).toBe(120);
    const view = await get(`/api/v1/live-rings/by-token/${TOKEN}`, alice);
    expect(view.json().rules).toMatchObject({ maxDurationSeconds: 120, maxDoubles: 2, format: { rounds: 3 } });
    expect((await get(`/api/v1/live-tournaments/${tournamentId}`, alice)).json().rules.format.rounds).toBe(3);

    await claim(alice, "dev-a");
    await exchange(alice, "dev-a", "c1", 2, 0);
    await post(`/api/v1/live-bouts/${boutOneId}/exchanges`, alice, { clientExchangeId: "c2", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, round: 2 }, keeper("dev-a"));
    const state = { seconds: 100, running: false, round: 2, period: "REGULAR", extension: 0, warningsLeft: 1, warningsRight: 2 };
    expect((await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, state, keeper("dev-a"))).statusCode).toBe(200);
    const detail = (await get(`/api/v1/live-bouts/${boutOneId}`, alice)).json();
    expect(detail.display).toMatchObject({
      round: 2, rounds: 3, roundsWon: { left: 1, right: 0 }, score: { left: 1, right: 0 }, warnings: { left: 1, right: 2 },
      remainingSeconds: 20, tone: "NORMAL", period: "REGULAR", extension: null,
    });
    await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { ...state, seconds: 140, period: "EXTENSION", extension: 1 }, keeper("dev-a"));
    expect((await get(`/api/v1/live-bouts/${boutOneId}`, alice)).json().display).toMatchObject({ extension: 1, remainingSeconds: 10, tone: "OVERTIME" });
    for (const bad of [{ ...state, period: "NAP" }, { ...state, round: 0 }, { ...state, warningsLeft: -1 }, { seconds: 1, running: false, round: 1 }]) {
      expect((await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, bad, keeper("dev-a"))).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await post(`/api/v1/live-bouts/${boutOneId}/exchanges`, alice, { clientExchangeId: "c3", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, round: 10 }, keeper("dev-a"))).statusCode).toBe(400);
  });

  it("the break counts down from when it began on the server", async () => {
    await ctx.database.updateTable("LiveTournament").set({ ruleset: JSON.stringify({ rounds: 3, breakSeconds: 60 }) }).where("id", "=", tournamentId).execute();
    await claim(alice, "dev-a");
    await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { seconds: 180, running: false, round: 1, period: "BREAK", extension: 0, warningsLeft: 0, warningsRight: 0 }, keeper("dev-a"));
    const startedAt = (await bout()).periodStartedAt!;
    // A repeat of the same state does not restart the break.
    await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { seconds: 180, running: false, round: 1, period: "BREAK", extension: 0, warningsLeft: 0, warningsRight: 0 }, keeper("dev-a"));
    expect((await bout()).periodStartedAt).toBe(startedAt);
    await ctx.database.updateTable("LiveBout").set({ periodStartedAt: new Date(Date.parse(startedAt) - 25_000).toISOString() }).where("id", "=", boutOneId).execute();
    const display = (await get(`/api/v1/live-bouts/${boutOneId}`, alice)).json().display;
    expect(display.period).toBe("BREAK");
    expect(display.remainingSeconds).toBeGreaterThanOrEqual(34);
    expect(display.remainingSeconds).toBeLessThanOrEqual(35);
  });

  it("scoreboard: view only, no sign-in, current bout, on deck and the pool", async () => {
    await ctx.database.updateTable("LiveRing").set({ scoreboardToken: "board-1" }).where("id", "=", ringOneId).execute();
    expect((await get("/api/v1/scoreboard/nope", null)).statusCode).toBe(404);
    const idle = (await get("/api/v1/scoreboard/board-1", null)).json();
    expect(idle).toMatchObject({
      ring: { name: "Ring 1", leftColor: "#d62828", rightColor: "#2f7dfa", scoreboard: { mirrored: false, showNext: true, textSize: "MEDIUM", theme: "DARK" } },
      current: null,
      onDeck: { label: "Bout 1" },
      after: { label: "Bout 2" },
    });
    // The pool is the next bout's scheduled phase: its stage and time slot.
    expect(idle.pool.name).toBe("Bracket · Slot 1");
    expect(idle.pool.bouts.map((b: { label: string; isNext: boolean }) => [b.label, b.isNext])).toEqual([["Bout 1", true], ["Bout 2", false], ["Bout 3", false]]);

    await claim(alice, "dev-a");
    await exchange(alice, "dev-a", "c1", 2, 0);
    await post(`/api/v1/live-bouts/${boutOneId}/clock`, alice, { seconds: 30, running: true }, keeper("dev-a"));
    const live = (await get("/api/v1/scoreboard/board-1", null)).json();
    expect(live.current).toMatchObject({ label: "Bout 1", display: { score: { left: 2, right: 0 }, running: true } });
    expect(live.current.display.remainingSeconds).toBeLessThanOrEqual(150);
    expect(live).toMatchObject({ onDeck: { label: "Bout 2" }, after: { label: "Bout 3" } });
    // The keeper link is not a scoreboard link, and the scoreboard token opens nothing else.
    expect((await get(`/api/v1/scoreboard/${TOKEN}`, null)).statusCode).toBe(404);
    expect((await get("/api/v1/live-rings/by-token/board-1", alice)).statusCode).toBe(404);

    await post(`/api/v1/live-bouts/${boutOneId}/finish`, alice, {}, keeper("dev-a"));
    const after = (await get("/api/v1/scoreboard/board-1", null)).json();
    expect(after.current).toBeNull();
    expect(after.pool.bouts[0]).toMatchObject({ label: "Bout 1", status: "DONE", result: { left: 2, right: 0 } });
    expect(after.pool.bouts[1]).toMatchObject({ label: "Bout 2", isNext: true, result: null });
  });

  it("a running clock runs on at most 10 s past the keeper's last report", async () => {
    await ctx.database.updateTable("LiveBout").set({ clockSeconds: 30, clockRunning: 1, clockUpdatedAt: new Date(Date.now() - 60_000).toISOString(), status: "RUNNING" }).where("id", "=", boutOneId).execute();
    await ctx.database.updateTable("LiveRing").set({ scoreboardToken: "board-1" }).where("id", "=", ringOneId).execute();
    expect((await get("/api/v1/scoreboard/board-1", null)).json().current.display.remainingSeconds).toBe(140);
  });

  function putAs(url: string, as: TestUser | null, payload: unknown, headers: Record<string, string> = {}) {
    return ctx.app.inject({ method: "PUT", url, payload: payload as object, headers: { ...(as ? bearer(as) : {}), ...headers } });
  }

  const RED = "#d62828";
  const BLUE = "#2f7dfa";
  const SETTINGS = { mirrored: true, showNext: false, textSize: "LARGE", theme: "LIGHT" } as const;

  async function addPaletteColor(hex: string) {
    const event = await ctx.database.selectFrom("EventColor").select("eventId").executeTakeFirstOrThrow();
    await ctx.database.insertInto("EventColor").values({ id: `color-${hex}`, eventId: event.eventId, name: hex, preset: null, hex, order: 9 }).execute();
  }

  it("colours and a new scoreboard link: tournament admin only, colours from the event palette", async () => {
    const put = (as: TestUser, payload: unknown) => putAs(`/api/v1/live-rings/${ringOneId}/colors`, as, payload);
    await addPaletteColor("#ffd400");
    expect((await put(alice, { leftColor: BLUE, rightColor: RED })).statusCode).toBe(403);
    expect((await put(creator, { leftColor: "red", rightColor: BLUE })).statusCode).toBe(400);
    // Not in the palette, the same colour twice, or missing.
    expect((await put(creator, { leftColor: "#ff0000", rightColor: BLUE })).statusCode).toBe(400);
    expect((await put(creator, { leftColor: BLUE, rightColor: BLUE })).statusCode).toBe(400);
    expect((await put(creator, { leftColor: BLUE })).statusCode).toBe(400);
    expect((await put(creator, { leftColor: "#FFD400", rightColor: RED })).json().ring).toMatchObject({ leftColor: "#ffd400", rightColor: RED });
    expect((await get(`/api/v1/live-rings/by-token/${TOKEN}`, alice)).json().ring).toMatchObject({ leftColor: "#ffd400" });
    const admin = await insertUser(ctx.database, { id: "sysadmin", role: "SYSTEM_ADMIN" });
    expect((await put(admin, { leftColor: BLUE, rightColor: RED })).statusCode).toBe(200);
    const before = (await ring()).scoreboardToken;
    expect((await post(`/api/v1/live-rings/${ringOneId}/rotate-scoreboard-token`, alice)).statusCode).toBe(403);
    const rotated = (await post(`/api/v1/live-rings/${ringOneId}/rotate-scoreboard-token`, creator)).json().ring.scoreboardToken;
    expect(rotated).not.toBe(before);
    expect((await ring()).keeperToken).toBe(TOKEN);
    const links = (await get(`/api/v1/live-tournaments/${tournamentId}/rings`, creator)).json().rings;
    expect(links[0].scoreboardToken).toBe(rotated);
  });

  it("the table view lists the event palette", async () => {
    const view = (await get(`/api/v1/live-rings/by-token/${TOKEN}`, alice)).json();
    expect(view.palette).toEqual([
      { id: expect.any(String), name: null, preset: "RED", hex: RED },
      { id: expect.any(String), name: null, preset: "BLUE", hex: BLUE },
    ]);
    expect(view.ring.scoreboard).toEqual({ mirrored: false, showNext: true, textSize: "MEDIUM", theme: "DARK" });
  });

  it("the table holding the ring sets its colours and scoreboard settings; nobody else can", async () => {
    const colors = (as: TestUser | null, deviceId: string | null, payload: unknown = { leftColor: BLUE, rightColor: RED }) =>
      putAs(`/api/v1/live-rings/by-token/${TOKEN}/colors`, as, payload, deviceId ? { "x-device-id": deviceId } : {});
    const settings = (as: TestUser | null, deviceId: string | null, payload: unknown = SETTINGS) =>
      putAs(`/api/v1/live-rings/by-token/${TOKEN}/scoreboard-settings`, as, payload, deviceId ? { "x-device-id": deviceId } : {});

    // Nobody holds the ring yet.
    expect((await colors(alice, "dev-a")).statusCode).toBe(409);
    await claim(alice, "dev-a");

    const savedColors = await colors(alice, "dev-a");
    expect(savedColors.statusCode).toBe(200);
    expect(savedColors.json().ring).toMatchObject({ leftColor: BLUE, rightColor: RED });
    const savedSettings = await settings(alice, "dev-a");
    expect(savedSettings.statusCode).toBe(200);
    expect(savedSettings.json().ring.scoreboard).toEqual(SETTINGS);
    expect(await ring()).toMatchObject({ scoreboardMirrored: 1, scoreboardShowNext: 0, scoreboardTextSize: "LARGE", scoreboardTheme: "LIGHT" });

    // The scoreboard picks them up.
    await ctx.database.updateTable("LiveRing").set({ scoreboardToken: "board-1" }).where("id", "=", ringOneId).execute();
    expect((await get("/api/v1/scoreboard/board-1", null)).json().ring).toMatchObject({ leftColor: BLUE, rightColor: RED, scoreboard: SETTINGS });

    // Other device, other user on the same device id, no device id, signed out, wrong link.
    expect((await colors(alice, "dev-b")).statusCode).toBe(409);
    expect((await settings(alice, "dev-b")).json()).toMatchObject({ reason: "TAKEN_OVER" });
    expect((await colors(bob, "dev-a")).statusCode).toBe(409);
    expect((await settings(bob, "dev-a")).statusCode).toBe(409);
    expect((await colors(alice, null)).statusCode).toBe(400);
    expect((await colors(null, "dev-a")).statusCode).toBe(401);
    expect((await settings(null, "dev-a")).statusCode).toBe(401);
    expect((await putAs("/api/v1/live-rings/by-token/nope/colors", alice, { leftColor: BLUE, rightColor: RED }, { "x-device-id": "dev-a" })).statusCode).toBe(404);

    // After a takeover the old holder can no longer write.
    await claim(bob, "dev-b", true);
    expect((await settings(alice, "dev-a")).statusCode).toBe(409);
    expect((await settings(bob, "dev-b", { ...SETTINGS, theme: "DARK" })).statusCode).toBe(200);

    // Bad values are 400 for the holder too.
    expect((await colors(bob, "dev-b", { leftColor: "#123456", rightColor: RED })).statusCode).toBe(400);
    for (const bad of [
      { ...SETTINGS, mirrored: "yes" },
      { ...SETTINGS, showNext: 1 },
      { ...SETTINGS, textSize: "HUGE" },
      { ...SETTINGS, theme: "BLUE" },
      { mirrored: true, showNext: true, textSize: "SMALL" },
      { ...SETTINGS, extra: true },
      [],
    ]) {
      expect((await settings(bob, "dev-b", bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await ring()).scoreboardTheme).toBe("DARK");
  });

  it("scoreboard settings by admins: tournament admins and system admins only", async () => {
    const put = (as: TestUser | null, payload: unknown = SETTINGS) => putAs(`/api/v1/live-rings/${ringOneId}/scoreboard-settings`, as, payload);
    const admin = await insertUser(ctx.database, { id: "sysadmin", role: "SYSTEM_ADMIN" });
    expect((await put(creator)).json().ring.scoreboard).toEqual(SETTINGS);
    expect((await put(admin, { ...SETTINGS, textSize: "SMALL" })).json().ring.scoreboard.textSize).toBe("SMALL");
    expect((await put(alice)).statusCode).toBe(403);
    expect((await put(null)).statusCode).toBe(401);
    expect((await put(creator, { ...SETTINGS, theme: "GREY" })).statusCode).toBe(400);
    expect((await putAs("/api/v1/live-rings/nope/scoreboard-settings", creator, SETTINGS)).statusCode).toBe(404);
    const links = (await get(`/api/v1/live-tournaments/${tournamentId}/rings`, creator)).json().rings;
    expect(links[0].scoreboard).toEqual({ ...SETTINGS, textSize: "SMALL" });
  });

  it("ring links visible to tournament admins and system admins only", async () => {
    const admin = await insertUser(ctx.database, { id: "admin", role: "SYSTEM_ADMIN" });
    await claim(alice, "dev-a");
    const own = await get(`/api/v1/live-tournaments/${tournamentId}/rings`, creator);
    expect(own.statusCode).toBe(200);
    expect(own.json().rings).toEqual([
      expect.objectContaining({ id: ringOneId, name: "Ring 1", order: 1, keeperToken: TOKEN, activeKeeper: expect.objectContaining({ userName: "Alice Keeper" }) }),
      expect.objectContaining({ id: ringTwoId, name: "Ring 2", order: 2, keeperToken: OTHER_TOKEN, activeKeeper: null }),
    ]);
    expect((await get(`/api/v1/live-tournaments/${tournamentId}/rings`, admin)).statusCode).toBe(200);
    expect((await get(`/api/v1/live-tournaments/${tournamentId}/rings`, alice)).statusCode).toBe(403);
    expect((await get(`/api/v1/live-tournaments/${tournamentId}/rings`, null)).statusCode).toBe(401);
    expect((await get("/api/v1/live-tournaments/nope/rings", creator)).statusCode).toBe(404);

    // No other route leaks a token or the keeper's device id.
    for (const url of [`/api/v1/live-rings/by-token/${TOKEN}`, `/api/v1/live-tournaments/${tournamentId}`, `/api/v1/live-rings/${ringOneId}/bouts`, `/api/v1/live-bouts/${boutOneId}`]) {
      const body = (await get(url, bob)).body;
      expect(body, url).not.toContain(OTHER_TOKEN);
      expect(body, url).not.toContain(TOKEN);
      expect(body, url).not.toContain("dev-a");
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";
import { createLiveTournament } from "./live-fixtures.js";
import { queueOnDeckNotifications, runPushOnce, type PushSender } from "../src/live/push-notifications.js";

describe("live tournament push notifications", () => {
  let ctx: TestContext;
  let account: TestUser;
  let boutId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const admin = await insertUser(ctx.database, { id: "organizer", role: "USER" });
    account = await insertUser(ctx.database, { id: "fighter-account", role: "USER", name: "Eva" });
    const opponent = await insertUser(ctx.database, { id: "opponent", role: "USER", name: "Opponent" });
    const live = await createLiveTournament(ctx, {
      admin,
      rings: [{ key: "a", name: "Ring A" }],
      bouts: [{ key: "first", ring: "a", left: account, right: opponent }],
    });
    boutId = live.boutId("first");
    await ctx.database.insertInto("LivePushSubscription").values({
      id: "subscription-1",
      userId: account.id,
      endpoint: "https://fcm.googleapis.com/subscription-1",
      p256dh: "public-key",
      auth: "auth-key",
      createdAt: "2026-10-28T10:00:00.000Z",
      updatedAt: "2026-10-28T10:00:00.000Z",
    }).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
    vi.unstubAllEnvs();
  });

  it("creates one durable on-deck job per bout and device, then sends it once", async () => {
    const now = new Date("2026-10-28T10:10:00.000Z");
    expect(await queueOnDeckNotifications(ctx.database, now)).toBe(1);
    expect(await queueOnDeckNotifications(ctx.database, now)).toBe(0);

    const send = vi.fn<PushSender["send"]>().mockResolvedValue();
    const result = await runPushOnce(ctx.database, { send }, now);
    expect(result).toEqual({ queued: 0, sent: 1, failed: 0, expired: 0 });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      endpoint: "https://fcm.googleapis.com/subscription-1",
      keys: { p256dh: "public-key", auth: "auth-key" },
    });
    expect(JSON.parse(send.mock.calls[0]?.[1] ?? "{}")).toMatchObject({
      title: "You're on deck",
      tag: `on-deck-${boutId}`,
    });
    const repeated = await runPushOnce(ctx.database, { send }, now);
    expect(repeated.sent).toBe(0);
    expect(send).toHaveBeenCalledOnce();
  });

  it("retries transient failures and removes expired push subscriptions", async () => {
    const now = new Date("2026-10-28T10:10:00.000Z");
    await queueOnDeckNotifications(ctx.database, now);
    const retrySender: PushSender = { send: vi.fn().mockRejectedValue(new Error("network down")) };
    const failed = await runPushOnce(ctx.database, retrySender, now);
    expect(failed.failed).toBe(1);
    const pending = await ctx.database.selectFrom("LivePushJob").select(["status", "attempts", "lastError"]).executeTakeFirstOrThrow();
    expect(pending).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Push service request failed." });

    const expired = Object.assign(new Error("gone"), { statusCode: 410 });
    const expiredResult = await runPushOnce(ctx.database, { send: vi.fn().mockRejectedValue(expired) }, new Date(now.getTime() + 10_000));
    expect(expiredResult.expired).toBe(1);
    expect(await ctx.database.selectFrom("LivePushSubscription").selectAll().execute()).toHaveLength(0);
    expect(await ctx.database.selectFrom("LivePushJob").selectAll().execute()).toHaveLength(0);
  });

  it("stores subscriptions only for the signed-in account", async () => {
    const denied = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/push-subscriptions",
      payload: { subscription: { endpoint: "https://fcm.googleapis.com/new", keys: { p256dh: "p", auth: "a" } } },
    });
    expect(denied.statusCode).toBe(401);

    const unsafeEndpoint = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/push-subscriptions",
      headers: bearer(account),
      payload: { subscription: { endpoint: "https://127.0.0.1/internal", keys: { p256dh: "p", auth: "a" } } },
    });
    expect(unsafeEndpoint.statusCode).toBe(400);

    const saved = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/push-subscriptions",
      headers: bearer(account),
      payload: { subscription: { endpoint: "https://fcm.googleapis.com/new", keys: { p256dh: "p", auth: "a" } } },
    });
    expect(saved.statusCode).toBe(200);
    const rows = await ctx.database.selectFrom("LivePushSubscription").select(["userId", "endpoint"]).execute();
    expect(rows).toContainEqual({ userId: account.id, endpoint: "https://fcm.googleapis.com/new" });
  });

  it("drops queued alerts when a browser endpoint is reassigned to another account", async () => {
    const now = new Date("2026-10-28T10:10:00.000Z");
    await queueOnDeckNotifications(ctx.database, now);
    const other = await insertUser(ctx.database, { id: "other-account", role: "USER" });
    const saved = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/push-subscriptions",
      headers: bearer(other),
      payload: {
        subscription: {
          endpoint: "https://fcm.googleapis.com/subscription-1",
          keys: { p256dh: "new-public-key", auth: "new-auth-key" },
        },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(await ctx.database.selectFrom("LivePushJob").selectAll().execute()).toHaveLength(0);
    expect(await ctx.database.selectFrom("LivePushSubscription").select(["userId", "p256dh"]).executeTakeFirst())
      .toEqual({ userId: other.id, p256dh: "new-public-key" });
  });

  it("does not deliver an on-deck alert after that bout is no longer next", async () => {
    const now = new Date("2026-10-28T10:10:00.000Z");
    await queueOnDeckNotifications(ctx.database, now);
    await ctx.database.updateTable("LiveBout").set({ status: "RUNNING" }).where("id", "=", boutId).execute();
    const send = vi.fn<PushSender["send"]>().mockResolvedValue();
    const result = await runPushOnce(ctx.database, { send }, now);
    expect(result.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(await ctx.database.selectFrom("LivePushJob").select("status").executeTakeFirst()).toEqual({ status: "DONE" });
  });
});

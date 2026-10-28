import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { Kysely } from "kysely";
import type { BackendDatabase } from "../db.js";
import { requireUser } from "../bouts/bout-routes.js";
import { ensureObject, HttpError, requireString } from "../http.js";

const PUSH_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 5 * 60_000;
const PUSH_SERVICE_HOSTS = new Set([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function registerPushRoutes(app: import("fastify").FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.get("/api/v1/push/vapid-public-key", async () => {
    const config = vapidConfig();
    if (!config) throw new HttpError(503, "Push notifications are not configured.");
    return { publicKey: config.publicKey };
  });

  app.post("/api/v1/me/push-subscriptions", async (request) => {
    const user = await requireUser(request, database);
    const body = ensureObject(request.body, "Push subscription");
    const raw = ensureObject(body.subscription, "Push subscription");
    const keys = ensureObject(raw.keys, "Push subscription keys");
    const endpoint = requireString(raw.endpoint, "Endpoint");
    if (!endpoint.startsWith("https://")) throw new HttpError(400, "Endpoint must use HTTPS.");
    const subscription: PushSubscriptionInput = {
      endpoint,
      keys: {
        p256dh: requireString(keys.p256dh, "p256dh key"),
        auth: requireString(keys.auth, "auth key"),
      },
    };
    const endpointUrl = parsePushEndpoint(subscription.endpoint);
    if (!isSupportedPushHost(endpointUrl.hostname)) {
      throw new HttpError(400, "Endpoint is not a supported browser push service.");
    }
    const now = app.now().toISOString();
    await database.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("LivePushSubscription")
        .select(["id", "userId"])
        .where("endpoint", "=", subscription.endpoint)
        .executeTakeFirst();
      if (existing && existing.userId !== user.id) {
        await trx.deleteFrom("LivePushSubscription").where("id", "=", existing.id).execute();
      }
      if (existing?.userId === user.id) {
        await trx
          .updateTable("LivePushSubscription")
          .set({ p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updatedAt: now })
          .where("id", "=", existing.id)
          .execute();
      } else {
        await trx
          .insertInto("LivePushSubscription")
          .values({
            id: randomUUID(),
            userId: user.id,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    });
    return { ok: true };
  });

  app.delete("/api/v1/me/push-subscriptions", async (request) => {
    const user = await requireUser(request, database);
    const body = ensureObject(request.body, "Push subscription");
    const endpoint = requireString(body.endpoint, "Endpoint");
    await database
      .deleteFrom("LivePushSubscription")
      .where("userId", "=", user.id)
      .where("endpoint", "=", endpoint)
      .execute();
    return { ok: true };
  });
}

function parsePushEndpoint(endpoint: string): URL {
  if (endpoint.length > 2_048) throw new HttpError(400, "Endpoint is too long.");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HttpError(400, "Endpoint must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || (url.port !== "" && url.port !== "443") || url.username || url.password) {
    throw new HttpError(400, "Endpoint must be a valid HTTPS push URL.");
  }
  return url;
}

function isSupportedPushHost(host: string): boolean {
  const normalised = host.toLocaleLowerCase("en");
  return PUSH_SERVICE_HOSTS.has(normalised) || normalised.endsWith(".notify.windows.com");
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function queueOnDeckNotifications(db: Kysely<BackendDatabase>, now: Date): Promise<number> {
  const pending = await db
    .selectFrom("LiveRing as Ring")
    .innerJoin("LiveBout as Bout", "Bout.ringId", "Ring.id")
    .select([
      "Ring.id as ringId",
      "Ring.name as ringName",
      "Bout.id as boutId",
      "Bout.tournamentId",
      "Bout.label",
      "Bout.order",
      "Bout.fighterLeftId",
      "Bout.fighterRightId",
    ])
    .where("Bout.status", "=", "PENDING")
    .orderBy("Ring.id")
    .orderBy("Bout.order")
    .execute();
  const nextByRing = new Map<string, (typeof pending)[number]>();
  for (const bout of pending) {
    if (!nextByRing.has(bout.ringId)) nextByRing.set(bout.ringId, bout);
  }

  let queued = 0;
  for (const bout of nextByRing.values()) {
    const fighterIds = [...new Set([bout.fighterLeftId, bout.fighterRightId].filter((id): id is string => Boolean(id)))];
    if (fighterIds.length === 0) continue;
    const linked = await db
      .selectFrom("LiveTournamentFighter")
      .select(["id", "userId", "name"])
      .where("id", "in", fighterIds)
      .where("userId", "is not", null)
      .where("ambiguous", "=", 0)
      .execute();
    for (const fighter of linked) {
      if (!fighter.userId) continue;
      const subscriptions = await db
        .selectFrom("LivePushSubscription")
        .select("id")
        .where("userId", "=", fighter.userId)
        .execute();
      const basePath = process.env.COMPETITION_PWA_BASE_PATH?.trim() || "/hema-score-keeper/competition/";
      const appBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
      const payload = JSON.stringify({
        title: "You're on deck",
        body: `${fighter.name} · ${bout.label} · ${bout.ringName}`,
        tag: `on-deck-${bout.boutId}`,
        url: `${appBase.endsWith("/") ? appBase : `${appBase}/`}tournaments/${encodeURIComponent(bout.tournamentId)}`,
      });
      for (const subscription of subscriptions) {
        const inserted = await db
          .insertInto("LivePushJob")
          .values({
            id: randomUUID(),
            subscriptionId: subscription.id,
            tournamentId: bout.tournamentId,
            boutId: bout.boutId,
            payload,
            status: "PENDING",
            attempts: 0,
            nextAttemptAt: now.toISOString(),
            lastError: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .onConflict((conflict) => conflict.columns(["boutId", "subscriptionId"]).doNothing())
          .executeTakeFirst();
        queued += Number(inserted.numInsertedOrUpdatedRows ?? 0);
      }
    }
  }
  return queued;
}

export interface PushSender {
  send(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<void>;
}

export function createPushSender(env: NodeJS.ProcessEnv = process.env): PushSender | null {
  const config = vapidConfig(env);
  if (!config) return null;
  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch {
    console.error("Web Push is disabled: VAPID configuration is invalid.");
    return null;
  }
  return {
    async send(subscription, payload) {
      await webpush.sendNotification(subscription, payload, { TTL: 3_600 });
    },
  };
}

export async function runPushOnce(
  db: Kysely<BackendDatabase>,
  sender: PushSender | null,
  now: Date,
): Promise<{ queued: number; sent: number; failed: number; expired: number }> {
  const queued = await queueOnDeckNotifications(db, now);
  const totals = { queued, sent: 0, failed: 0, expired: 0 };
  if (!sender) return totals;

  const jobs = await db
    .selectFrom("LivePushJob")
    .select(["id", "subscriptionId", "boutId", "payload", "attempts"])
    .where("status", "=", "PENDING")
    .where("nextAttemptAt", "<=", now.toISOString())
    .orderBy("createdAt")
    .execute();
  for (const job of jobs) {
    const claimed = await db
      .updateTable("LivePushJob")
      .set({ status: "SENDING", updatedAt: now.toISOString() })
      .where("id", "=", job.id)
      .where("status", "=", "PENDING")
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) === 0) continue;

    const subscription = await db
      .selectFrom("LivePushSubscription")
      .select(["id", "endpoint", "p256dh", "auth"])
      .where("id", "=", job.subscriptionId)
      .executeTakeFirst();
    if (!subscription) {
      await db.updateTable("LivePushJob").set({ status: "DONE", updatedAt: now.toISOString() }).where("id", "=", job.id).execute();
      continue;
    }
    if (!(await isStillOnDeckForSubscriber(db, job.boutId, subscription.id))) {
      await db.updateTable("LivePushJob").set({ status: "DONE", updatedAt: now.toISOString() }).where("id", "=", job.id).execute();
      continue;
    }

    try {
      await sender.send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, job.payload);
      await db.updateTable("LivePushJob").set({ status: "DONE", lastError: null, updatedAt: now.toISOString() }).where("id", "=", job.id).execute();
      totals.sent += 1;
    } catch (error) {
      const statusCode = errorStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        await db.deleteFrom("LivePushSubscription").where("id", "=", subscription.id).execute();
        totals.expired += 1;
        continue;
      }
      const attempts = job.attempts + 1;
      const lastError = statusCode ? `Push service returned HTTP ${statusCode}.` : "Push service request failed.";
      const failed = attempts >= MAX_ATTEMPTS;
      const nextAttemptAt = new Date(now.getTime() + Math.min(5_000 * 2 ** (attempts - 1), MAX_BACKOFF_MS)).toISOString();
      await db
        .updateTable("LivePushJob")
        .set({
          status: failed ? "FAILED" : "PENDING",
          attempts,
          nextAttemptAt,
          lastError,
          updatedAt: now.toISOString(),
        })
        .where("id", "=", job.id)
        .execute();
      console.error(`Web Push delivery ${failed ? "failed permanently" : "will retry"} for job ${job.id}: ${lastError}`);
      totals.failed += 1;
    }
  }
  return totals;
}

async function isStillOnDeckForSubscriber(
  db: Kysely<BackendDatabase>,
  boutId: string,
  subscriptionId: string,
): Promise<boolean> {
  const [bout, subscription] = await Promise.all([
    db.selectFrom("LiveBout").select(["ringId", "order", "status", "fighterLeftId", "fighterRightId"]).where("id", "=", boutId).executeTakeFirst(),
    db.selectFrom("LivePushSubscription").select("userId").where("id", "=", subscriptionId).executeTakeFirst(),
  ]);
  if (!bout || bout.status !== "PENDING" || !subscription) return false;
  const fighterIds = [bout.fighterLeftId, bout.fighterRightId].filter((id): id is string => Boolean(id));
  if (fighterIds.length === 0) return false;
  const linked = await db
    .selectFrom("LiveTournamentFighter")
    .select("id")
    .where("id", "in", fighterIds)
    .where("userId", "=", subscription.userId)
    .where("ambiguous", "=", 0)
    .executeTakeFirst();
  if (!linked) return false;
  const earlier = await db
    .selectFrom("LiveBout")
    .select("id")
    .where("ringId", "=", bout.ringId)
    .where("status", "=", "PENDING")
    .where("order", "<", bout.order)
    .executeTakeFirst();
  return !earlier;
}

function errorStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const status = error.statusCode;
  return typeof status === "number" ? status : null;
}

export function startPushWorker(db: Kysely<BackendDatabase>, intervalMs = PUSH_INTERVAL_MS): () => void {
  const sender = createPushSender();
  if (!sender) console.error("Web Push is disabled: set WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, and WEB_PUSH_SUBJECT.");
  let stopped = false;
  let running = false;
  const recover = db
    .updateTable("LivePushJob")
    .set({ status: "PENDING", nextAttemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where("status", "=", "SENDING")
    .execute();
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await recover;
      if (!stopped) await runPushOnce(db, sender, new Date());
    } catch (error) {
      console.error("Web Push worker failed:", error instanceof Error ? error.message : "unknown error");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

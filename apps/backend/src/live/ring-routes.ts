import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { ensureObject, HttpError, requireString } from "../http.js";
import { displayOf, rulesOf, type RoundExchange } from "./bout-display.js";
import { poolNameIn, poolNamesOf, sameBoutPool } from "./bout-pools.js";
import { ringBouts } from "./bout-routes.js";
import { requireTournamentAdmin } from "./live-routes.js";
import { eventPalette, requirePaletteColors } from "../events/event-colors.js";
import { requireLiveRingAccess } from "./ring-access.js";
import { activeKeeperOf, newKeeperToken, publicRing } from "./ring-keeper.js";
import { parseScoreboardSettings, ringEventId, scoreboardColumns, scoreboardSettingsOf } from "./ring-settings.js";

async function ringByToken(db: DbExecutor, token: string) {
  const ring = await db.selectFrom("LiveRing").selectAll().where("keeperToken", "=", token).executeTakeFirst();
  if (!ring) throw new HttpError(404, "This ring link is no longer valid.");
  return ring;
}

/** The takeover clock: every running clock of the ring pauses at the seconds the backend last heard. */
async function pauseRingClocks(db: DbExecutor, ringId: string, now: string): Promise<void> {
  await db
    .updateTable("LiveBout")
    .set({ clockRunning: 0, clockUpdatedAt: now })
    .where("ringId", "=", ringId)
    .where("clockRunning", "=", 1)
    .execute();
}

function isActiveDevice(activeDeviceId: string | null, header: string | string[] | undefined): boolean {
  return typeof header === "string" && header !== "" && activeDeviceId !== null && header === activeDeviceId;
}

type SignedInUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * A ring setting written from the table: only the device (`X-Device-Id`) and the user that hold the ring may write.
 * Call it with the write's own transaction, so a takeover can't commit between the check and the write.
 */
async function requireRingHolder(trx: DbExecutor, token: string, user: SignedInUser, deviceHeader: string | string[] | undefined) {
  const deviceId = typeof deviceHeader === "string" ? deviceHeader.trim() : "";
  if (deviceId === "") throw new HttpError(400, "The X-Device-Id header is required.");
  const ring = await ringByToken(trx, token);
  await requireLiveRingAccess(trx, ring.id, user);
  if (ring.activeDeviceId !== deviceId || ring.activeUserId !== user.id) {
    throw new HttpError(409, "This ring is kept by another device.", undefined, { reason: "TAKEN_OVER", activeKeeper: await activeKeeperOf(trx, ring) });
  }
  return ring;
}

/** Both colours from the ring's event palette and different (400 otherwise). */
async function saveRingColors(trx: DbExecutor, ringId: string, body: unknown) {
  const object = ensureObject(body, "Colors");
  const colors = await requirePaletteColors(trx, await ringEventId(trx, ringId), { leftColor: object.leftColor, rightColor: object.rightColor });
  await trx.updateTable("LiveRing").set(colors).where("id", "=", ringId).execute();
  return trx.selectFrom("LiveRing").selectAll().where("id", "=", ringId).executeTakeFirstOrThrow();
}

async function saveScoreboardSettings(trx: DbExecutor, ringId: string, body: unknown) {
  await trx.updateTable("LiveRing").set(scoreboardColumns(parseScoreboardSettings(body))).where("id", "=", ringId).execute();
  return trx.selectFrom("LiveRing").selectAll().where("id", "=", ringId).executeTakeFirstOrThrow();
}

export function registerRingRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  // Any signed-in account holding the ring link may open and claim the ring; the link alone (no sign-in) may not.
  app.get("/api/v1/live-rings/by-token/:token", async (request) => {
    const user = await requireUser(request, database);
    const ring = await ringByToken(database, requirePathParam(request, "token"));
    const accessiblePhases = await requireLiveRingAccess(database, ring.id, user);
    const tournament = await database
      .selectFrom("LiveTournament")
      .select(["id", "name", "ruleset"])
      .where("id", "=", ring.tournamentId)
      .executeTakeFirstOrThrow();
    return {
      ring: publicRing(ring),
      tournament: { id: tournament.id, name: tournament.name },
      rules: rulesOf(tournament.ruleset),
      bouts: await ringBouts(database, ring.id, app.now(), accessiblePhases ?? undefined),
      activeKeeper: await activeKeeperOf(database, ring),
      // The colours the table may choose from for this ring.
      palette: (await eventPalette(database, await ringEventId(database, ring.id))).map(({ id, name, preset, hex }) => ({ id, name, preset, hex })),
      // Whether the device asking (optional X-Device-Id) is the active keeper. The device id itself is never returned.
      youAreKeeper: isActiveDevice(ring.activeDeviceId, request.headers["x-device-id"]),
    };
  });

  app.post("/api/v1/live-rings/by-token/:token/claim", async (request) => {
    const user = await requireUser(request, database);
    const token = requirePathParam(request, "token");
    const body = ensureObject(request.body ?? {}, "Claim");
    const deviceId = requireString(body.deviceId, "deviceId");
    if (deviceId.length > 100) throw new HttpError(400, "deviceId is too long.");
    if (body.confirm !== undefined && typeof body.confirm !== "boolean") throw new HttpError(400, "confirm must be true or false.");
    const confirm = body.confirm === true;
    return database.transaction().execute(async (trx) => {
      const ring = await ringByToken(trx, token);
      await requireLiveRingAccess(trx, ring.id, user);
      if (ring.activeDeviceId !== null && ring.activeDeviceId !== deviceId && !confirm) {
        const activeKeeper = await activeKeeperOf(trx, ring);
        throw new HttpError(409, "Someone else is keeping this ring; confirm to take it over.", undefined, {
          reason: "ACTIVE_KEEPER",
          activeKeeper,
        });
      }
      const now = app.now().toISOString();
      await trx
        .updateTable("LiveRing")
        .set({ activeDeviceId: deviceId, activeUserId: user.id, activeSince: now })
        .where("id", "=", ring.id)
        .execute();
      await pauseRingClocks(trx, ring.id, now);
      return { ring: publicRing(ring) };
    });
  });

  // Ring colours and scoreboard settings from the table: only the holding device and user.
  app.put("/api/v1/live-rings/by-token/:token/colors", async (request) => {
    const user = await requireUser(request, database);
    const token = requirePathParam(request, "token");
    return database.transaction().execute(async (trx) => {
      const ring = await requireRingHolder(trx, token, user, request.headers["x-device-id"]);
      return { ring: publicRing(await saveRingColors(trx, ring.id, request.body)) };
    });
  });

  app.put("/api/v1/live-rings/by-token/:token/scoreboard-settings", async (request) => {
    const user = await requireUser(request, database);
    const token = requirePathParam(request, "token");
    return database.transaction().execute(async (trx) => {
      const ring = await requireRingHolder(trx, token, user, request.headers["x-device-id"]);
      return { ring: publicRing(await saveScoreboardSettings(trx, ring.id, request.body)) };
    });
  });

  // The scoreboard: view only, no sign-in. It shows what the backend works out and works nothing out itself.
  app.get("/api/v1/scoreboard/:token", async (request) => {
    const token = requirePathParam(request, "token");
    const ring = await database.selectFrom("LiveRing").selectAll().where("scoreboardToken", "=", token).executeTakeFirst();
    if (!ring) throw new HttpError(404, "This scoreboard link is no longer valid.");
    return scoreboardView(database, ring, app.now());
  });

  app.post("/api/v1/live-rings/:id/rotate-scoreboard-token", async (request) => {
    const user = await requireUser(request, database);
    const ring = await adminRing(database, requirePathParam(request, "id"), user);
    const scoreboardToken = newKeeperToken();
    await database.updateTable("LiveRing").set({ scoreboardToken }).where("id", "=", ring.id).execute();
    return { ring: { ...publicRing(ring), scoreboardToken } };
  });

  app.put("/api/v1/live-rings/:id/colors", async (request) => {
    const user = await requireUser(request, database);
    const ring = await adminRing(database, requirePathParam(request, "id"), user);
    return database.transaction().execute(async (trx) => ({ ring: publicRing(await saveRingColors(trx, ring.id, request.body)) }));
  });

  app.put("/api/v1/live-rings/:id/scoreboard-settings", async (request) => {
    const user = await requireUser(request, database);
    const ring = await adminRing(database, requirePathParam(request, "id"), user);
    return database.transaction().execute(async (trx) => ({ ring: publicRing(await saveScoreboardSettings(trx, ring.id, request.body)) }));
  });

  // A new token makes the old link stop working. Nobody keeps the ring until it is claimed with the new link.
  app.post("/api/v1/live-rings/:id/rotate-token", async (request) => {
    const user = await requireUser(request, database);
    const ringId = requirePathParam(request, "id");
    const found = await database.selectFrom("LiveRing").select("tournamentId").where("id", "=", ringId).executeTakeFirst();
    if (!found) throw new HttpError(404, "Ring not found.");
    await requireTournamentAdmin(database, found.tournamentId, user);
    return database.transaction().execute(async (trx) => {
      const now = app.now().toISOString();
      await trx
        .updateTable("LiveRing")
        .set({ keeperToken: newKeeperToken(), activeDeviceId: null, activeUserId: null, activeSince: null })
        .where("id", "=", ringId)
        .execute();
      await pauseRingClocks(trx, ringId, now);
      const ring = await trx.selectFrom("LiveRing").selectAll().where("id", "=", ringId).executeTakeFirstOrThrow();
      return { ring: { ...publicRing(ring), keeperToken: ring.keeperToken, activeKeeper: null } };
    });
  });
}

async function adminRing(database: Kysely<BackendDatabase>, ringId: string, user: SignedInUser) {
  const ring = await database.selectFrom("LiveRing").selectAll().where("id", "=", ringId).executeTakeFirst();
  if (!ring) throw new HttpError(404, "Ring not found.");
  await requireTournamentAdmin(database, ring.tournamentId, user);
  return ring;
}

type ScoreboardRing = Awaited<ReturnType<typeof ringByToken>>;

/**
 * What a ring's scoreboard shows: the bout being fought (the first RUNNING one), who is on deck and the bout after
 * (the first PENDING ones), and the pool of the next bout with each played bout's result.
 */
async function scoreboardView(database: Kysely<BackendDatabase>, ring: ScoreboardRing, now: Date) {
  const tournament = await database.selectFrom("LiveTournament").select(["name", "ruleset"]).where("id", "=", ring.tournamentId).executeTakeFirstOrThrow();
  const rules = rulesOf(tournament.ruleset);
  const bouts = await database.selectFrom("LiveBout").selectAll().where("ringId", "=", ring.id).orderBy("order").execute();
  const exchanges: Array<RoundExchange & { boutId: string }> =
    bouts.length === 0
      ? []
      : await database
          .selectFrom("LiveExchange")
          .select(["boutId", "kind", "leftPoints", "rightPoints", "round"])
          .where("boutId", "in", bouts.map((bout) => bout.id))
          .where("undoneAt", "is", null)
          .execute();
  const display = (bout: (typeof bouts)[number]) => displayOf(rules, bout, exchanges.filter((exchange) => exchange.boutId === bout.id), now);
  const names = (bout: (typeof bouts)[number] | undefined) => (bout ? { label: bout.label, fighterLeft: bout.fighterLeft, fighterRight: bout.fighterRight } : null);
  const current = bouts.find((bout) => bout.status === "RUNNING");
  const pending = bouts.filter((bout) => bout.status === "PENDING");
  const poolOf = pending[0] ?? current;
  const poolNames = await poolNamesOf(database, poolOf ? [poolOf] : []);
  const hasRounds = rules.format.rounds > 1;
  return {
    serverTime: now.toISOString(),
    tournamentName: tournament.name,
    ring: { name: ring.name, leftColor: ring.leftColor, rightColor: ring.rightColor, scoreboard: scoreboardSettingsOf(ring) },
    current: current ? { ...names(current), display: display(current) } : null,
    onDeck: names(pending[0]),
    after: names(pending[1]),
    pool: poolOf
      ? {
          name: poolNameIn(poolNames, poolOf),
          bouts: bouts
            .filter((bout) => sameBoutPool(bout, poolOf))
            .map((bout) => {
              const shown = bout.status === "PENDING" ? null : display(bout);
              const result = shown ? (hasRounds ? shown.roundsWon : shown.score) : null;
              return { ...names(bout), status: bout.status, isNext: bout.id === pending[0]?.id, result };
            }),
        }
      : null,
  };
}

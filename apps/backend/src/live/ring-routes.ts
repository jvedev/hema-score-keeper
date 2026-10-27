import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { ensureObject, HttpError, requireString } from "../http.js";
import { ringBouts } from "./bout-routes.js";
import { requireTournamentAdmin } from "./live-routes.js";
import { activeKeeperOf, newKeeperToken, publicRing } from "./ring-keeper.js";

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

export function registerRingRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  // Any signed-in account holding the ring link may open and claim the ring; the link alone (no sign-in) may not.
  app.get("/api/v1/live-rings/by-token/:token", async (request) => {
    await requireUser(request, database);
    const ring = await ringByToken(database, requirePathParam(request, "token"));
    const tournament = await database
      .selectFrom("LiveTournament")
      .select(["id", "name", "mode"])
      .where("id", "=", ring.tournamentId)
      .executeTakeFirstOrThrow();
    return {
      ring: publicRing(ring),
      tournament,
      bouts: await ringBouts(database, ring.id),
      activeKeeper: await activeKeeperOf(database, ring),
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

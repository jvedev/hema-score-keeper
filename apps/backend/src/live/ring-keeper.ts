import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { HttpError } from "../http.js";

type LiveRingRow = Selectable<BackendDatabase["LiveRing"]>;

export interface ActiveKeeper {
  userName: string;
  since: string;
}

/** The secret in a ring link: 24 random bytes, base64url (32 characters). */
export function newKeeperToken(): string {
  return randomBytes(24).toString("base64url");
}

function sameToken(given: string, stored: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function header(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

/** Who keeps the ring, for display. Never includes the device id: knowing it would let anyone write as the keeper. */
export async function activeKeeperOf(db: DbExecutor, ring: Pick<LiveRingRow, "activeDeviceId" | "activeUserId" | "activeSince">): Promise<ActiveKeeper | null> {
  if (!ring.activeDeviceId || !ring.activeUserId || !ring.activeSince) return null;
  const user = await db.selectFrom("User").select("name").where("id", "=", ring.activeUserId).executeTakeFirst();
  return { userName: user?.name ?? "", since: ring.activeSince };
}

/** A public view of a ring: no keeper token, no device id. */
export function publicRing(ring: LiveRingRow) {
  return { id: ring.id, tournamentId: ring.tournamentId, name: ring.name, order: ring.order, leftColor: ring.leftColor, rightColor: ring.rightColor };
}

export interface KeeperCheck {
  ring: LiveRingRow;
  deviceId: string;
  /** Throws 409 TAKEN_OVER unless the device is the ring's active keeper. */
  requireActiveDevice(): Promise<void>;
}

/**
 * Checks the `X-Ring-Token` header against the bout's ring: a missing or wrong token is 403, a missing
 * `X-Device-Id` is 400. Call it with the write's own transaction, so a takeover can't commit between the check
 * and the write. The device check is separate, because a resend of an already stored exchange skips it.
 */
export async function checkRingToken(trx: DbExecutor, request: FastifyRequest, ringId: string): Promise<KeeperCheck> {
  const token = header(request, "x-ring-token");
  const ring = await trx.selectFrom("LiveRing").selectAll().where("id", "=", ringId).executeTakeFirstOrThrow();
  if (token === null || !sameToken(token, ring.keeperToken)) {
    throw new HttpError(403, "This ring link is not valid for this bout.");
  }
  const deviceId = header(request, "x-device-id");
  if (deviceId === null) throw new HttpError(400, "The X-Device-Id header is required.");
  return {
    ring,
    deviceId,
    async requireActiveDevice() {
      if (ring.activeDeviceId === deviceId) return;
      const activeKeeper = await activeKeeperOf(trx, ring);
      throw new HttpError(409, "This ring is kept by another device.", undefined, { reason: "TAKEN_OVER", activeKeeper });
    },
  };
}

/** The full keeper check for a write: right ring token and the active device. */
export async function requireKeeper(trx: DbExecutor, request: FastifyRequest, ringId: string): Promise<KeeperCheck> {
  const check = await checkRingToken(trx, request, ringId);
  await check.requireActiveDevice();
  return check;
}

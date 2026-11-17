import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Kysely, Selectable } from "kysely";
import { requirePathParam } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { ensureObject, HttpError } from "../http.js";
import { requireEventAdmin } from "./access.js";
import { eventPalette, MIN_EVENT_COLORS, requireHexColor } from "./event-colors.js";

type EventColorRow = Selectable<BackendDatabase["EventColor"]>;

const MAX_NAME_LENGTH = 40;

function optionalName(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new HttpError(400, "Colour name must be text.");
  const name = value.trim();
  if (name === "") throw new HttpError(400, "Colour name is required.");
  if (name.length > MAX_NAME_LENGTH) throw new HttpError(400, `Colour name is longer than ${MAX_NAME_LENGTH} characters.`);
  return name;
}

async function requireColorRow(executor: DbExecutor, id: string): Promise<EventColorRow> {
  const row = await executor.selectFrom("EventColor").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) throw new HttpError(404, "Colour not found.");
  return row;
}

async function requireUnusedHex(executor: DbExecutor, eventId: string, hex: string, exceptId?: string): Promise<void> {
  let query = executor.selectFrom("EventColor").select("id").where("eventId", "=", eventId).where("hex", "=", hex);
  if (exceptId) query = query.where("id", "!=", exceptId);
  if (await query.executeTakeFirst()) throw new HttpError(409, "The event already has this colour.");
}

/** The live rings of an event's tournaments. */
function eventRings(executor: DbExecutor, eventId: string) {
  return executor
    .selectFrom("LiveRing")
    .innerJoin("LiveTournament", "LiveTournament.id", "LiveRing.tournamentId")
    .innerJoin("Tournament", "Tournament.id", "LiveTournament.sourceTournamentId")
    .where("Tournament.eventId", "=", eventId);
}

async function isColorInUse(executor: DbExecutor, eventId: string, hex: string): Promise<boolean> {
  const arena = await executor
    .selectFrom("Arena")
    .select("id")
    .where("eventId", "=", eventId)
    .where((eb) => eb.or([eb("leftColor", "=", hex), eb("rightColor", "=", hex)]))
    .executeTakeFirst();
  if (arena) return true;
  const ring = await eventRings(executor, eventId)
    .select("LiveRing.id")
    .where((eb) => eb.or([eb("LiveRing.leftColor", "=", hex), eb("LiveRing.rightColor", "=", hex)]))
    .executeTakeFirst();
  return ring !== undefined;
}

/** A changed hex follows into every arena and live ring of the event that used the old one. */
async function replaceHexInUse(executor: DbExecutor, eventId: string, from: string, to: string): Promise<void> {
  for (const side of ["leftColor", "rightColor"] as const) {
    await executor.updateTable("Arena").set({ [side]: to }).where("eventId", "=", eventId).where(side, "=", from).execute();
    const rings = await eventRings(executor, eventId).select("LiveRing.id").where(`LiveRing.${side}`, "=", from).execute();
    if (rings.length > 0) {
      await executor.updateTable("LiveRing").set({ [side]: to }).where("id", "in", rings.map((ring) => ring.id)).execute();
    }
  }
}

function requireColorIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) throw new HttpError(400, "colorIds must be a list of colour ids.");
  return value as string[];
}

/** Event colour palette: event admins (and system admins) add, rename, recolour, reorder and remove colours. */
export function registerEventColorRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.post("/api/v1/events/:id/colors", async (request) => {
    const user = await requireUser(request, database);
    const eventId = requirePathParam(request, "id");
    await requireEventAdmin(database, eventId, user);
    const body = ensureObject(request.body, "Colour");
    const name = optionalName(body.name);
    if (name === undefined) throw new HttpError(400, "Colour name is required.");
    const hex = requireHexColor(body.hex, "hex");
    return database.transaction().execute(async (trx) => {
      await requireUnusedHex(trx, eventId, hex);
      const last = await trx.selectFrom("EventColor").select((eb) => eb.fn.max("order").as("order")).where("eventId", "=", eventId).executeTakeFirst();
      const order = last?.order === null || last?.order === undefined ? 0 : Number(last.order) + 1;
      await trx.insertInto("EventColor").values({ id: randomUUID(), eventId, name, preset: null, hex, order }).execute();
      return { colors: await eventPalette(trx, eventId) };
    });
  });

  app.patch("/api/v1/event-colors/:id", async (request) => {
    const user = await requireUser(request, database);
    const existing = await requireColorRow(database, requirePathParam(request, "id"));
    await requireEventAdmin(database, existing.eventId, user);
    const body = ensureObject(request.body, "Colour");
    const name = optionalName(body.name);
    const hex = body.hex === undefined ? undefined : requireHexColor(body.hex, "hex");
    return database.transaction().execute(async (trx) => {
      if (hex !== undefined && hex !== existing.hex) {
        await requireUnusedHex(trx, existing.eventId, hex, existing.id);
        await replaceHexInUse(trx, existing.eventId, existing.hex, hex);
      }
      const changes = { ...(name === undefined ? {} : { name }), ...(hex === undefined ? {} : { hex }) };
      if (Object.keys(changes).length > 0) await trx.updateTable("EventColor").set(changes).where("id", "=", existing.id).execute();
      return { colors: await eventPalette(trx, existing.eventId) };
    });
  });

  app.delete("/api/v1/event-colors/:id", async (request) => {
    const user = await requireUser(request, database);
    const existing = await requireColorRow(database, requirePathParam(request, "id"));
    await requireEventAdmin(database, existing.eventId, user);
    return database.transaction().execute(async (trx) => {
      const palette = await eventPalette(trx, existing.eventId);
      if (palette.length <= MIN_EVENT_COLORS) throw new HttpError(409, `An event keeps at least ${MIN_EVENT_COLORS} colours.`, undefined, { reason: "TOO_FEW_COLORS" });
      if (await isColorInUse(trx, existing.eventId, existing.hex)) {
        throw new HttpError(409, "This colour is used by an arena or ring; choose another colour there first.", undefined, { reason: "COLOR_IN_USE" });
      }
      await trx.deleteFrom("EventColor").where("id", "=", existing.id).execute();
      return { colors: await eventPalette(trx, existing.eventId) };
    });
  });

  // The full new order: every colour of the event exactly once.
  app.put("/api/v1/events/:id/colors/order", async (request) => {
    const user = await requireUser(request, database);
    const eventId = requirePathParam(request, "id");
    await requireEventAdmin(database, eventId, user);
    const colorIds = requireColorIds(ensureObject(request.body, "Colour order").colorIds);
    return database.transaction().execute(async (trx) => {
      const current = await eventPalette(trx, eventId);
      const known = new Set(current.map((color) => color.id));
      if (colorIds.length !== known.size || new Set(colorIds).size !== colorIds.length || colorIds.some((id) => !known.has(id))) {
        throw new HttpError(400, "colorIds must list every colour of the event once.");
      }
      for (const [order, id] of colorIds.entries()) {
        await trx.updateTable("EventColor").set({ order }).where("id", "=", id).execute();
      }
      return { colors: await eventPalette(trx, eventId) };
    });
  });
}

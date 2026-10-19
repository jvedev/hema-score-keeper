import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requireAdminUser, requirePathParam } from "./access-user.js";
import type { BackendDatabase } from "./db.js";
import { ensureObject, HttpError, requireString } from "./http.js";
import { generateId } from "./read-model.js";

export function registerClubRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.get("/api/v1/clubs", async () =>
    database.selectFrom("Club").selectAll().orderBy("name").orderBy("slug").execute());

  app.post("/api/v1/clubs", async (request) => {
    await requireAdminUser(request, database);
    const body = ensureObject(request.body, "Club");
    const id = generateId();
    await database.insertInto("Club").values({
      id,
      name: requireString(body.name, "Club name"),
      slug: requireString(body.slug, "Club slug"),
      area: body.area === undefined ? null : optionalArea(body.area),
      countryCode: body.countryCode === undefined ? null : optionalCountryCode(body.countryCode),
    }).execute();
    return requireClub(database, id);
  });

  app.patch("/api/v1/clubs/:id", async (request) => {
    const user = await requireAdminUser(request, database);
    const clubId = requirePathParam(request, "id");
    await requireClub(database, clubId);
    if (user.role !== "SYSTEM_ADMIN" && user.clubId !== clubId) {
      throw new HttpError(403, "You can only change your own club.");
    }

    const body = ensureObject(request.body, "Club");
    const changes: { name?: string; area?: string | null; countryCode?: string | null } = {};
    if (body.name !== undefined) {
      changes.name = requireString(body.name, "Club name");
    }
    if (body.area !== undefined) {
      changes.area = optionalArea(body.area);
    }
    if (body.countryCode !== undefined) {
      changes.countryCode = optionalCountryCode(body.countryCode);
    }
    if (Object.keys(changes).length > 0) {
      await database.updateTable("Club").set(changes).where("id", "=", clubId).execute();
    }
    return requireClub(database, clubId);
  });
}

async function requireClub(database: Kysely<BackendDatabase>, id: string) {
  const club = await database.selectFrom("Club").selectAll().where("id", "=", id).executeTakeFirst();
  if (!club) {
    throw new HttpError(404, `Club "${id}" not found.`);
  }
  return club;
}

function optionalArea(value: unknown): string | null {
  return value === null ? null : requireString(value, "Area");
}

/** ISO 3166-1 alpha-2, stored upper case (NL, BE, DE…). */
function optionalCountryCode(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  const code = requireString(value, "Country code").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new HttpError(400, "Country code must be two letters, like NL or BE.");
  }
  return code;
}

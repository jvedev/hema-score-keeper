import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam, type AccessUser } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import { requireCompetition } from "../competition-model.js";
import type { BackendDatabase } from "../db.js";
import { ensureObject, HttpError, requireString } from "../http.js";
import { defaultRulesetDefinition, generateId } from "../read-model.js";
import { requireEventAdmin } from "../events/access.js";
import { requireCompetitionAdmin } from "./access.js";
import { withInviteCodeForAdmins } from "./signup-routes.js";

export function registerEventLinkRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  /** Create a Competition attached to an Event. Requires Event admin. Does NOT require admin user role. */
  app.post("/api/v1/events/:eventId/competitions", async (request) => {
    const user = await requireUser(request, database);
    const eventId = requirePathParam(request, "eventId");
    await requireEventAdmin(database, eventId, user);

    const body = ensureObject(request.body, "Competition");
    const name = requireString(body.name, "Competition name");
    const slug = requireString(body.slug, "Competition slug");
    const date = requireString(body.date, "Date");
    const visibility = body.visibility === "CLUB_ONLY" ? "CLUB_ONLY" : "PUBLIC";
    const clubId = body.clubId === undefined || body.clubId === null ? null : requireString(body.clubId, "Club ID");

    const id = generateId();
    await database.transaction().execute(async (transaction) => {
      await transaction.insertInto("Competition").values({
        id,
        name,
        slug,
        status: "DRAFT",
        date,
        rulesetJson: JSON.stringify(body.rulesetJson ?? defaultRulesetDefinition()),
        visibility,
        clubId,
        eventId,
      }).execute();
      await transaction.insertInto("CompetitionAdmin").values({ competitionId: id, userId: user.id, role: "OWNER" }).execute();
    });
    return withInviteCodeForAdmins(database, user, await requireCompetition(database, id));
  });

  /** List Competitions attached to an Event. Requires Event admin. */
  app.get("/api/v1/events/:eventId/competitions", async (request) => {
    const user = await requireUser(request, database);
    const eventId = requirePathParam(request, "eventId");
    await requireEventAdmin(database, eventId, user);

    const competitions = await database
      .selectFrom("Competition")
      .select(["id", "name", "slug", "status", "date", "visibility", "clubId", "eventId"])
      .where("eventId", "=", eventId)
      .orderBy("name")
      .execute();
    return competitions;
  });

  /** Attach or detach a Competition from an Event. */
  app.patch("/api/v1/competitions/:id/event", async (request) => {
    const user = await requireUser(request, database);
    const competitionId = requirePathParam(request, "id");
    await requireCompetition(database, competitionId);

    const body = ensureObject(request.body, "Event link");
    const newEventId = body.eventId === undefined ? null : (body.eventId === null ? null : requireString(body.eventId, "Event ID"));

    const competition = await database
      .selectFrom("Competition")
      .select(["id", "eventId"])
      .where("id", "=", competitionId)
      .executeTakeFirstOrThrow();

    // Detach case
    if (newEventId === null) {
      if (competition.eventId === null) {
        return await requireCompetition(database, competitionId);
      }
      await requireCompetitionAdmin(database, user, competitionId);
      await database.updateTable("Competition").set({ eventId: null }).where("id", "=", competitionId).execute();
      return await requireCompetition(database, competitionId);
    }

    // Attach case — requires admin rights on both sides: the target Event, and the Competition itself
    // (owner/co-admin or system admin). Otherwise attaching would hand an Event admin rights over a
    // Competition they don't manage.
    await requireEventAdmin(database, newEventId, user);
    await requireCompetitionAdmin(database, user, competitionId);

    // Validate cardinality: Competition must not already be attached to another Event
    if (competition.eventId !== null && competition.eventId !== newEventId) {
      throw new HttpError(409, "This competition is already attached to another event.");
    }
    // If already attached to the same event, no-op
    if (competition.eventId === newEventId) {
      return await requireCompetition(database, competitionId);
    }

    await database.updateTable("Competition").set({ eventId: newEventId }).where("id", "=", competitionId).execute();
    return await requireCompetition(database, competitionId);
  });
}

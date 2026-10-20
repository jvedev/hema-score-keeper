import {
  CompetitionTransitionError,
  readinessChecklist,
  transitionCompetition,
  type CompetitionAction,
  type CompetitionStatus,
} from "@hema/competition-domain";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requireAdminUser, requirePathParam, type AccessUser } from "../access-user.js";
import { hashEmail } from "../auth.js";
import { listCompetitions, requireCompetition } from "../competition-model.js";
import type { BackendDatabase } from "../db.js";
import { ensureObject, HttpError, requireBoolean, requireString } from "../http.js";
import { defaultRulesetDefinition, generateId, requireUserRow } from "../read-model.js";
import { listManagedCompetitionIds, requireCompetitionAdmin } from "./access.js";
import { registerCoAdminRoutes } from "./co-admin-routes.js";
import { needsYou } from "./needs-you.js";
import { hasScope, parseScope } from "./scope.js";

const COMPETITION_ACTIONS: readonly CompetitionAction[] = ["OPEN_REGISTRATION", "START", "CLOSE", "REOPEN", "ARCHIVE"];
const LIFECYCLE_STATUSES: readonly CompetitionStatus[] = ["DRAFT", "REGISTRATION_OPEN", "RUNNING", "CLOSED", "ARCHIVED"];
// Anything else (including a legacy status) counts as locked.
const RULESET_EDITABLE_STATUSES = new Set(["DRAFT", "REGISTRATION_OPEN"]);

export function registerCompetitionAdminRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  registerCoAdminRoutes(app, database);

  app.get("/api/v1/admin/needs-you", async (request) => needsYou(database, await requireAdminUser(request, database)));

  app.get("/api/v1/competitions/admin", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitions = await listCompetitions(database);
    const managed = await listManagedCompetitionIds(database, user);
    if (managed === "ALL") {
      return competitions;
    }
    const managedIds = new Set(managed);
    return competitions.filter((competition) => managedIds.has(competition.id));
  });

  app.post("/api/v1/competitions", async (request) => {
    const user = await requireAdminUser(request, database);
    const body = ensureObject(request.body, "Competition");
    const clubId = body.clubId === undefined || body.clubId === null ? null : requireString(body.clubId, "Club ID");
    const visibility = requireVisibility(body.visibility === undefined ? "PUBLIC" : body.visibility);
    if (visibility === "CLUB_ONLY" && clubId === null) {
      throw new HttpError(400, "Club-only competitions require a club.");
    }
    if (clubId !== null) {
      await requireClubForUser(database, user, clubId);
    }

    const id = generateId();
    await database.transaction().execute(async (transaction) => {
      await transaction.insertInto("Competition").values({
        id,
        name: requireString(body.name, "Competition name"),
        slug: requireString(body.slug, "Competition slug"),
        // New competitions always start as drafts; status changes go through the lifecycle.
        status: "DRAFT",
        date: requireString(body.date, "Date"),
        rulesetJson: JSON.stringify(body.rulesetJson ?? defaultRulesetDefinition()),
        visibility,
        clubId,
      }).execute();
      await transaction.insertInto("CompetitionAdmin").values({ competitionId: id, userId: user.id, role: "OWNER" }).execute();
    });
    return requireCompetition(database, id);
  });

  app.patch("/api/v1/competitions/:id", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const existing = await requireCompetition(database, competitionId);
    await requireCompetitionAdmin(database, user, competitionId);

    // Everything is validated before anything is written, so a refused PATCH changes nothing.
    const body = ensureObject(request.body, "Competition");
    const changes: Record<string, unknown> = {};
    if (body.name !== undefined) {
      changes.name = requireString(body.name, "Competition name");
    }
    if (body.slug !== undefined) {
      changes.slug = requireString(body.slug, "Competition slug");
    }
    if (body.status !== undefined) {
      throw new HttpError(400, "Use the transitions endpoint to change status.");
    }
    if (body.date !== undefined) {
      changes.date = requireString(body.date, "Date");
    }
    if (body.visibility !== undefined) {
      changes.visibility = requireVisibility(body.visibility);
    }
    if (body.clubId !== undefined) {
      const clubId = body.clubId === null ? null : requireString(body.clubId, "Club ID");
      if (clubId !== null) {
        await requireClubForUser(database, user, clubId);
      }
      changes.clubId = clubId;
    }
    if (body.rulesetJson !== undefined) {
      if (!RULESET_EDITABLE_STATUSES.has(existing.status)) {
        throw new HttpError(409, "The ruleset is fixed once the competition is running.");
      }
      changes.rulesetJson = JSON.stringify(body.rulesetJson);
    }
    if (body.acceptsOtherBouts !== undefined) {
      changes.acceptsOtherBouts = requireBoolean(body.acceptsOtherBouts, "Accepts other bouts") ? 1 : 0;
    }
    if (body.scope !== undefined) {
      const scope = parseScope(body.scope);
      changes.scopeKind = scope.kind;
      changes.scopeValuesJson = JSON.stringify(scope.values);
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Competition").set(changes).where("id", "=", competitionId).execute();
    }
    return requireCompetition(database, competitionId);
  });

  app.post("/api/v1/competitions/:id/transitions", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const competition = await requireCompetition(database, competitionId);
    await requireCompetitionAdmin(database, user, competitionId);

    const body = ensureObject(request.body, "Transition");
    const action = requireString(body.action, "Action");
    if (!COMPETITION_ACTIONS.includes(action as CompetitionAction)) {
      throw new HttpError(400, `Action must be one of ${COMPETITION_ACTIONS.join(", ")}.`);
    }

    if (!LIFECYCLE_STATUSES.includes(competition.status as CompetitionStatus)) {
      throw new HttpError(409, `This competition has an unknown status "${competition.status}"; ask a system admin to fix it.`);
    }

    const checklist = readinessChecklist({
      // The ruleset is stored inline and always present.
      rulesetVersionId: "inline",
      hasScope: hasScope(competition.scope),
      startDate: competition.date,
    });
    let next: CompetitionStatus;
    try {
      next = transitionCompetition(competition.status as CompetitionStatus, action as CompetitionAction, checklist);
    } catch (error) {
      if (error instanceof CompetitionTransitionError) {
        throw new HttpError(409, error.message, error.code === "NOT_READY" ? { checklist } : undefined);
      }
      throw error;
    }

    await database.updateTable("Competition").set({ status: next }).where("id", "=", competitionId).execute();
    return requireCompetition(database, competitionId);
  });

  app.post("/api/v1/competitions/:id/participants", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    await requireCompetition(database, competitionId);
    await requireCompetitionAdmin(database, user, competitionId);

    const body = ensureObject(request.body, "Participant");
    const id = generateId();
    if (body.kind !== undefined && body.kind !== "MEMBER") {
      throw new HttpError(400, "Guests are no longer supported; invite the person to enrol instead.");
    }
    const kind = "MEMBER";
    const userId = body.userId === undefined || body.userId === null ? null : requireString(body.userId, "User ID");
    const clubId = body.clubId === undefined || body.clubId === null ? null : requireString(body.clubId, "Club ID");
    if (userId !== null) {
      const linkedUser = await requireUserRow(database, userId);
      if (clubId !== null && linkedUser.clubId !== clubId) {
        throw new HttpError(400, "Participant club must match the linked user club.");
      }
    }
    if (clubId !== null) {
      const club = await database.selectFrom("Club").selectAll().where("id", "=", clubId).executeTakeFirst();
      if (!club) {
        throw new HttpError(404, `Club "${clubId}" not found.`);
      }
    }

    await database.insertInto("CompetitionParticipant").values({
      id,
      competitionId,
      name: requireString(body.name, "Participant name"),
      displayName: body.displayName === undefined ? requireString(body.name, "Participant name") : requireString(body.displayName, "Display name"),
      linkedUserEmail: body.linkedUserEmail === undefined ? null : requireString(body.linkedUserEmail, "Linked user email"),
      linkedUserEmailHash: body.linkedUserEmail === undefined ? null : hashEmail(requireString(body.linkedUserEmail, "Linked user email")),
      clubId,
      userId,
      kind,
    }).execute();

    return database.selectFrom("CompetitionParticipant").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  });
}

function requireVisibility(value: unknown): "PUBLIC" | "CLUB_ONLY" {
  const visibility = requireString(value, "Visibility");
  if (visibility !== "PUBLIC" && visibility !== "CLUB_ONLY") {
    throw new HttpError(400, "Visibility must be PUBLIC or CLUB_ONLY.");
  }
  return visibility;
}

async function requireClubForUser(database: Kysely<BackendDatabase>, user: AccessUser, clubId: string): Promise<void> {
  const club = await database.selectFrom("Club").selectAll().where("id", "=", clubId).executeTakeFirst();
  if (!club) {
    throw new HttpError(404, `Club "${clubId}" not found.`);
  }
  if (user.role !== "SYSTEM_ADMIN" && user.clubId !== clubId) {
    throw new HttpError(403, "You can only manage competitions for your own club.");
  }
}

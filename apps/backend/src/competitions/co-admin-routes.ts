import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requireAdminUser, requirePathParam } from "../access-user.js";
import { requireCompetition } from "../competition-model.js";
import type { BackendDatabase } from "../db.js";
import { ensureObject, HttpError, requireString } from "../http.js";
import { requireCompetitionAdmin, type CompetitionAdminRole } from "./access.js";

export interface CompetitionAdminEntry {
  userId: string;
  name: string;
  username: string;
  role: CompetitionAdminRole;
}

export function registerCoAdminRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.get("/api/v1/competitions/:id/admins", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    await requireCompetition(database, competitionId);
    await requireCompetitionAdmin(database, user, competitionId);
    return listAdmins(database, competitionId);
  });

  app.post("/api/v1/competitions/:id/admins", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    await requireCompetition(database, competitionId);
    requireOwnerOrSystem(await requireCompetitionAdmin(database, user, competitionId), "add co-admins");

    const userId = requireString(ensureObject(request.body, "Co-admin").userId, "User ID");
    const target = await database.selectFrom("User").select(["id", "role"]).where("id", "=", userId).executeTakeFirst();
    if (!target) {
      throw new HttpError(404, `User "${userId}" not found.`);
    }
    if (target.role !== "COMPETITION_ADMIN" && target.role !== "SYSTEM_ADMIN") {
      throw new HttpError(400, "Only competition admins can become co-admins.");
    }
    const existing = await findAdminRow(database, competitionId, userId);
    if (existing) {
      throw new HttpError(409, "This person already manages the competition.");
    }

    await database.insertInto("CompetitionAdmin").values({ competitionId, userId, role: "CO_ADMIN" }).execute();
    return listAdmins(database, competitionId);
  });

  app.delete("/api/v1/competitions/:id/admins/:userId", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const userId = requirePathParam(request, "userId");
    await requireCompetition(database, competitionId);
    const callerRole = await requireCompetitionAdmin(database, user, competitionId);
    if (userId !== user.id) {
      requireOwnerOrSystem(callerRole, "remove other co-admins");
    }

    const target = await findAdminRow(database, competitionId, userId);
    if (!target) {
      throw new HttpError(404, "This person doesn't manage the competition.");
    }
    if (target.role === "OWNER") {
      throw new HttpError(409, "Transfer ownership first.");
    }

    await database
      .deleteFrom("CompetitionAdmin")
      .where("competitionId", "=", competitionId)
      .where("userId", "=", userId)
      .execute();
    return listAdmins(database, competitionId);
  });

  app.post("/api/v1/competitions/:id/owner", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    await requireCompetition(database, competitionId);
    requireOwnerOrSystem(await requireCompetitionAdmin(database, user, competitionId), "transfer ownership");

    const userId = requireString(ensureObject(request.body, "Owner").userId, "User ID");
    const target = await findAdminRow(database, competitionId, userId);
    if (target?.role !== "CO_ADMIN") {
      throw new HttpError(400, "Ownership can only go to an existing co-admin.");
    }

    await database.transaction().execute(async (transaction) => {
      // Demote first: the database allows only one owner per competition.
      await transaction
        .updateTable("CompetitionAdmin")
        .set({ role: "CO_ADMIN" })
        .where("competitionId", "=", competitionId)
        .where("role", "=", "OWNER")
        .execute();
      await transaction
        .updateTable("CompetitionAdmin")
        .set({ role: "OWNER" })
        .where("competitionId", "=", competitionId)
        .where("userId", "=", userId)
        .execute();
    });
    return listAdmins(database, competitionId);
  });
}

function requireOwnerOrSystem(role: CompetitionAdminRole | "SYSTEM_ADMIN", action: string): void {
  if (role === "CO_ADMIN") {
    throw new HttpError(403, `Only the owner can ${action}.`);
  }
}

function findAdminRow(database: Kysely<BackendDatabase>, competitionId: string, userId: string) {
  return database
    .selectFrom("CompetitionAdmin")
    .select("role")
    .where("competitionId", "=", competitionId)
    .where("userId", "=", userId)
    .executeTakeFirst();
}

async function listAdmins(database: Kysely<BackendDatabase>, competitionId: string): Promise<CompetitionAdminEntry[]> {
  return database
    .selectFrom("CompetitionAdmin")
    .innerJoin("User", "User.id", "CompetitionAdmin.userId")
    .select(["CompetitionAdmin.userId as userId", "User.name as name", "User.username as username", "CompetitionAdmin.role as role"])
    .where("CompetitionAdmin.competitionId", "=", competitionId)
    .orderBy("User.name")
    .execute();
}

import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { ApiRulesetDefinition, EntryKind, ScheduleRole, StageOfficialRole, StageType } from "./api-types.js";
import { db, type BackendDatabase, toSqliteBoolean } from "./db.js";
import {
  createAuthTokenPair,
  generateToken,
  hashEmail,
  hashPassword,
  hashToken,
  verifyJwt,
  verifyPassword,
} from "./auth.js";
import { readSheetValues, writeSheetValues } from "./google-sheets.js";
import {
  ensureJsonValue,
  ensureObject,
  HttpError,
  isSqliteConstraintError,
  optionalString,
  requireBoolean,
  requireInteger,
  requirePositiveInteger,
  requireString,
} from "./http.js";
import {
  defaultRulesetDefinition,
  ensureSchedule,
  generateId,
  insertExchange,
  listExchangesForMatch,
  listRulesetDetails,
  nextRulesetVersion,
  requireArenaApi,
  requireArenaRow,
  requireEntryApi,
  requireEntryInTournament,
  requireEntryRow,
  requireEventApi,
  requireEventRow,
  requireEventScheduleResponse,
  requireMatchApi,
  requireMatchRow,
  requireRulesetDetail,
  requireRulesetForEvent,
  requireScheduledAssignmentApi,
  requireScheduledAssignmentRow,
  requireScheduledPhaseApi,
  requireScheduledPhaseRow,
  requireScheduleTimeSlotApi,
  requireScheduleTimeSlotRow,
  requireSkillApi,
  requireSkillRow,
  requireStageOfficialRow,
  requireStageApi,
  requireStageRow,
  requireTournamentApi,
  requireTournamentRow,
  requireUserApi,
  requireUserRow,
  listMatches,
  listRounds,
  syncAllPlannerArtifacts,
  syncEventArtifacts,
  syncStageArtifacts,
  toEventMutationResult,
  validateScheduledPhase,
  loadEvents,
  loadUsers,
} from "./read-model.js";
import {
  listBouts,
  listCompetitions,
  listParticipants,
  listRanking,
  createBout,
  declineBout,
  publishBout,
  type CompetitionMatchInput,
  requireBout,
  requireCompetition,
} from "./competition-model.js";

const tournamentColors = ["#5B8CFF", "#E06C75", "#98C379", "#E5C07B", "#C678DD", "#56B6C2"];
const loginRefreshTtlSeconds = 7 * 24 * 60 * 60;

const accountRoles = new Set(["USER", "COMPETITION_ADMIN", "SYSTEM_ADMIN"]);
const participantKinds = new Set(["MEMBER", "GUEST"]);

function requireAccountRole(value: unknown, label: string): "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN" {
  if (typeof value !== "string" || !accountRoles.has(value)) {
    throw new HttpError(400, `${label} must be USER, COMPETITION_ADMIN, or SYSTEM_ADMIN.`);
  }
  return value as "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
}

function requireParticipantKind(value: unknown, label: string): "MEMBER" | "GUEST" {
  if (typeof value !== "string" || !participantKinds.has(value)) {
    throw new HttpError(400, `${label} must be MEMBER or GUEST.`);
  }
  return value as "MEMBER" | "GUEST";
}

interface AccessUser {
  id: string;
  clubId: string | null;
  role: "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
}

async function resolveAccessUser(request: FastifyRequest, database: Kysely<BackendDatabase>): Promise<AccessUser | null> {
  const authorization = request.headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  const claims = verifyJwt(token, "access");
  const user = await database.selectFrom("User").selectAll().where("id", "=", claims.sub).executeTakeFirst();
  if (!user) {
    throw new HttpError(401, "Authenticated user not found.");
  }

  return {
    id: user.id,
    clubId: user.clubId,
    role: user.role as AccessUser["role"],
  };
}

function canAccessCompetition(user: AccessUser | null, competition: { visibility: string; clubId: string | null }): boolean {
  if (competition.visibility === "PUBLIC") {
    return true;
  }

  if (!user) {
    return false;
  }

  if (user.role === "SYSTEM_ADMIN" || user.role === "COMPETITION_ADMIN") {
    return true;
  }

  return user.clubId !== null && user.clubId === competition.clubId;
}

async function requireAdminUser(request: FastifyRequest, database: Kysely<BackendDatabase>): Promise<AccessUser> {
  const user = await resolveAccessUser(request, database);
  if (!user || user.role === "USER") {
    throw new HttpError(403, "Competition admin access required.");
  }
  return user;
}

export function createApp(database: Kysely<BackendDatabase> = db) {
  const app = Fastify();

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    reply.header("Vary", "Origin");
    if (request.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({
        error: error.message,
        details: error.details,
      });
      return;
    }

    if (isSqliteConstraintError(error)) {
      reply.status(409).send({ error: error.message });
      return;
    }

    console.error(error);
    reply.status(500).send({ error: "Internal Server Error" });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: "Not Found" });
  });

  app.addHook("onClose", async () => {
    await database.destroy();
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/v1/google-sheets/values", async (request) => {
    const query = ensureObject(request.query ?? {}, "Query");
    const spreadsheetId = requireString(query.spreadsheetId, "spreadsheetId");
    const range = requireString(query.range, "range");
    const values = await readSheetValues(spreadsheetId, range);
    return { values };
  });

  app.put("/api/v1/google-sheets/values", async (request) => {
    const body = ensureObject(request.body, "Google Sheets values");
    const spreadsheetId = requireString(body.spreadsheetId, "Spreadsheet ID");
    const range = requireString(body.range, "Range");
    if (!Array.isArray(body.values)) {
      throw new HttpError(400, "values must be an array of rows.");
    }
    await writeSheetValues(spreadsheetId, range, body.values as unknown[][]);
    return { ok: true };
  });

  app.get("/api/v1/competitions", async (request) => {
    const user = await resolveAccessUser(request, database);
    const competitions = await listCompetitions(database);
    return competitions.filter((competition) => canAccessCompetition(user, competition));
  });
  app.get("/api/v1/competitions/:id", async (request) => {
    const user = await resolveAccessUser(request, database);
    const competition = await requireCompetition(database, requirePathParam(request, "id"));
    if (!canAccessCompetition(user, competition)) {
      throw new HttpError(404, `Competition "${competition.id}" not found.`);
    }
    return competition;
  });
  app.get("/api/v1/competitions/:id/participants", async (request) => {
    const user = await resolveAccessUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const competition = await requireCompetition(database, competitionId);
    if (!canAccessCompetition(user, competition)) {
      throw new HttpError(404, `Competition "${competition.id}" not found.`);
    }
    return listParticipants(database, competitionId);
  });
  app.get("/api/v1/competitions/:id/ranking", async (request) => {
    const user = await resolveAccessUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const competition = await requireCompetition(database, competitionId);
    if (!canAccessCompetition(user, competition)) {
      throw new HttpError(404, `Competition "${competition.id}" not found.`);
    }
    return listRanking(database, competitionId);
  });
  app.get("/api/v1/competitions/:id/bouts", async (request) => {
    const user = await resolveAccessUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const competition = await requireCompetition(database, competitionId);
    if (!canAccessCompetition(user, competition)) {
      throw new HttpError(404, `Competition "${competition.id}" not found.`);
    }
    return listBouts(database, competitionId);
  });
  app.get("/api/v1/competitions/:id/bouts/:boutId", async (request) => {
    const competitionId = requirePathParam(request, "id");
    const params = ensureObject(request.params ?? {}, "Route parameters");
    const boutId = requireString(params.boutId, "Bout ID");
    return requireBout(database, competitionId, boutId);
  });
  app.post("/api/v1/competitions/:id/bouts", async (request) => {
    const competitionId = requirePathParam(request, "id");
    const body = ensureObject(request.body, "Bout");
    const fighterAId = requireString(body.fighterAId, "Fighter A ID");
    const fighterBId = requireString(body.fighterBId, "Fighter B ID");
    const scoreA = requireInteger(body.scoreA, "Score A");
    const scoreB = requireInteger(body.scoreB, "Score B");
    const winnerParticipantId =
      body.winnerParticipantId === null || body.winnerParticipantId === undefined
        ? null
        : requireString(body.winnerParticipantId, "Winner participant ID");
    const date = requireString(body.date, "Date");
    const details = body.details === undefined ? {} : ensureJsonValue(body.details);

    return createBout(database, competitionId, generateId(), {
      fighterAId,
      fighterBId,
      scoreA,
      scoreB,
      winnerParticipantId,
      date,
      details: details as CompetitionMatchInput["details"],
    });
  });
  app.put("/api/v1/competitions/:id/bouts/:boutId", async (request) => {
    const competitionId = requirePathParam(request, "id");
    const params = ensureObject(request.params ?? {}, "Route parameters");
    const boutId = requireString(params.boutId, "Bout ID");
    const body = ensureObject(request.body, "Bout");
    const fighterAId = requireString(body.fighterAId, "Fighter A ID");
    const fighterBId = requireString(body.fighterBId, "Fighter B ID");
    const scoreA = requireInteger(body.scoreA, "Score A");
    const scoreB = requireInteger(body.scoreB, "Score B");
    const winnerParticipantId =
      body.winnerParticipantId === null || body.winnerParticipantId === undefined
        ? null
        : requireString(body.winnerParticipantId, "Winner participant ID");
    const date = requireString(body.date, "Date");
    const details = body.details === undefined ? {} : ensureJsonValue(body.details);

    return publishBout(database, competitionId, boutId, {
      fighterAId,
      fighterBId,
      scoreA,
      scoreB,
      winnerParticipantId,
      date,
      details: details as CompetitionMatchInput["details"],
    });
  });
  app.delete("/api/v1/competitions/:id/bouts/:boutId", async (request) => {
    const competitionId = requirePathParam(request, "id");
    const params = ensureObject(request.params ?? {}, "Route parameters");
    const boutId = requireString(params.boutId, "Bout ID");
    const bout = await declineBout(database, competitionId, boutId);
    return bout;
  });

  app.get("/api/v1/users", async (request) => {
    await requireAdminUser(request, database);
    return loadUsers(database);
  });

  app.post("/api/v1/users", async (request) => {
    await requireAdminUser(request, database);
    const body = ensureObject(request.body, "User");
    const id = generateId();
    await database.insertInto("User").values({
      id,
      clubId: body.clubId === undefined || body.clubId === null ? null : requireString(body.clubId, "Club ID"),
      username: requireString(body.username, "Username"),
      passwordHash: body.passwordHash === undefined || body.passwordHash === null ? null : requireString(body.passwordHash, "Password hash"),
      emailHash: body.emailHash === undefined || body.emailHash === null ? null : requireString(body.emailHash, "Email hash"),
      role: body.role === undefined ? "USER" : requireAccountRole(body.role, "Role"),
      status: body.status === undefined ? "ACTIVE" : requireString(body.status, "Status"),
      judgeVolunteer: 0,
      juryVolunteer: 0,
      tableVolunteer: 0,
      otherVolunteer: 0,
    }).execute();
    return requireUserApi(database, id);
  });

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
    }).execute();
    return database.selectFrom("Club").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  });

  app.get("/api/v1/competitions/admin", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitions = await listCompetitions(database);
    if (user.role === "SYSTEM_ADMIN") {
      return competitions;
    }
    return competitions.filter((competition) => competition.clubId === user.clubId || competition.clubId === null);
  });

  app.post("/api/v1/competitions", async (request) => {
    const user = await requireAdminUser(request, database);
    const body = ensureObject(request.body, "Competition");
    const clubId = body.clubId === undefined || body.clubId === null ? null : requireString(body.clubId, "Club ID");
    const visibility = body.visibility === undefined ? "PUBLIC" : requireString(body.visibility, "Visibility");
    if (visibility !== "PUBLIC" && visibility !== "CLUB_ONLY") {
      throw new HttpError(400, "Visibility must be PUBLIC or CLUB_ONLY.");
    }
    if (visibility === "CLUB_ONLY" && clubId === null) {
      throw new HttpError(400, "Club-only competitions require a club.");
    }
    if (clubId !== null) {
      const club = await database.selectFrom("Club").selectAll().where("id", "=", clubId).executeTakeFirst();
      if (!club) {
        throw new HttpError(404, `Club "${clubId}" not found.`);
      }
      if (user.role !== "SYSTEM_ADMIN" && user.clubId !== clubId) {
        throw new HttpError(403, "You can only manage competitions for your own club.");
      }
    }

    const id = generateId();
    await database.insertInto("Competition").values({
      id,
      name: requireString(body.name, "Competition name"),
      slug: requireString(body.slug, "Competition slug"),
      status: body.status === undefined ? "DRAFT" : requireString(body.status, "Status"),
      date: requireString(body.date, "Date"),
      rulesetJson: JSON.stringify(body.rulesetJson ?? defaultRulesetDefinition()),
      visibility,
      clubId,
    }).execute();
    return requireCompetition(database, id);
  });

  app.patch("/api/v1/competitions/:id", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const existing = await requireCompetition(database, competitionId);
    if (user.role !== "SYSTEM_ADMIN" && existing.clubId !== null && existing.clubId !== user.clubId) {
      throw new HttpError(403, "You can only manage competitions for your own club.");
    }

    const body = ensureObject(request.body, "Competition");
    const changes: Record<string, unknown> = {};
    if (body.name !== undefined) {
      changes.name = requireString(body.name, "Competition name");
    }
    if (body.slug !== undefined) {
      changes.slug = requireString(body.slug, "Competition slug");
    }
    if (body.status !== undefined) {
      changes.status = requireString(body.status, "Status");
    }
    if (body.date !== undefined) {
      changes.date = requireString(body.date, "Date");
    }
    if (body.visibility !== undefined) {
      const visibility = requireString(body.visibility, "Visibility");
      if (visibility !== "PUBLIC" && visibility !== "CLUB_ONLY") {
        throw new HttpError(400, "Visibility must be PUBLIC or CLUB_ONLY.");
      }
      changes.visibility = visibility;
    }
    if (body.clubId !== undefined) {
      const clubId = body.clubId === null ? null : requireString(body.clubId, "Club ID");
      if (clubId !== null) {
        const club = await database.selectFrom("Club").selectAll().where("id", "=", clubId).executeTakeFirst();
        if (!club) {
          throw new HttpError(404, `Club "${clubId}" not found.`);
        }
        if (user.role !== "SYSTEM_ADMIN" && user.clubId !== clubId) {
          throw new HttpError(403, "You can only manage competitions for your own club.");
        }
      }
      changes.clubId = clubId;
    }
    if (body.rulesetJson !== undefined) {
      changes.rulesetJson = JSON.stringify(body.rulesetJson);
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Competition").set(changes).where("id", "=", competitionId).execute();
    }
    return requireCompetition(database, competitionId);
  });

  app.post("/api/v1/competitions/:id/participants", async (request) => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const competition = await requireCompetition(database, competitionId);
    if (user.role !== "SYSTEM_ADMIN" && competition.clubId !== null && competition.clubId !== user.clubId) {
      throw new HttpError(403, "You can only manage competitions for your own club.");
    }

    const body = ensureObject(request.body, "Participant");
    const id = generateId();
    const kind = body.kind === undefined ? "MEMBER" : requireParticipantKind(body.kind, "Participant kind");
    const userId = body.userId === undefined || body.userId === null ? null : requireString(body.userId, "User ID");
    let clubId = body.clubId === undefined || body.clubId === null ? null : requireString(body.clubId, "Club ID");
    if (kind === "GUEST" && clubId === null) {
      clubId = competition.clubId ?? user.clubId;
    }
    if (kind === "GUEST" && userId !== null) {
      throw new HttpError(400, "Guest participants cannot be linked to a user account.");
    }
    if (kind === "GUEST" && clubId === null) {
      throw new HttpError(400, "Guest participants require a club.");
    }
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

  app.post("/api/v1/auth/enrollment-tokens", async (request) => {
    const admin = await requireAdminUser(request, database);
    const body = ensureObject(request.body, "Enrollment token");
    const userId = requireString(body.userId, "User ID");
    const targetUser = await requireUserRow(database, userId);
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const defaultClubId = admin.clubId ?? targetUser.clubId;

    await database.insertInto("EnrollmentToken").values({
      id: generateId(),
      userId,
      tokenHash,
      expiresAt,
      consumedAt: null,
      defaultClubId,
    }).execute();

    return {
      token,
      expiresAt,
      defaultClubId,
      defaultClubSlug: defaultClubId
        ? (await database.selectFrom("Club").selectAll().where("id", "=", defaultClubId).executeTakeFirst())?.slug ?? null
        : null,
    };
  });

  app.get("/api/v1/auth/enrollment-tokens/:token", async (request) => {
    const token = requireString(requirePathParam(request, "token"), "Enrollment token");
    const tokenHash = hashToken(token);
    const row = await database
      .selectFrom("EnrollmentToken")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .executeTakeFirst();
    if (!row) {
      throw new HttpError(404, "Enrollment token not found.");
    }

    const club = row.defaultClubId
      ? await database.selectFrom("Club").selectAll().where("id", "=", row.defaultClubId).executeTakeFirst()
      : null;
    return {
      token: row.tokenHash,
      defaultClubId: row.defaultClubId,
      defaultClubName: club?.name ?? null,
      defaultClubSlug: club?.slug ?? null,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    };
  });

  app.post("/api/v1/auth/register", async (request) => {
    const body = ensureObject(request.body, "Registration");
    const password = requireString(body.password, "Password");
    const email = optionalString(body.email);
    const enrollmentToken = optionalString(body.enrollmentToken);
    const emailHash = email ? hashEmail(email) : null;

    if (enrollmentToken) {
      const tokenHash = hashToken(enrollmentToken);
      const tokenRow = await database
        .selectFrom("EnrollmentToken")
        .selectAll()
        .where("tokenHash", "=", tokenHash)
        .executeTakeFirst();
      if (!tokenRow) {
        throw new HttpError(404, "Enrollment token not found.");
      }
      if (tokenRow.consumedAt !== null) {
        throw new HttpError(409, "Enrollment token has already been used.");
      }
      if (new Date(tokenRow.expiresAt).getTime() <= Date.now()) {
        throw new HttpError(409, "Enrollment token has expired.");
      }

      const user = await requireUserRow(database, tokenRow.userId);
      const passwordHash = hashPassword(password);
      const updates: Partial<BackendDatabase["User"]> = {
        passwordHash,
        status: "ACTIVE",
      };
      const requestedClubSlug = optionalString(body.clubSlug);
      const requestedClubId = optionalString(body.clubId);
      if (requestedClubSlug || requestedClubId) {
        const club = requestedClubId
          ? await database.selectFrom("Club").selectAll().where("id", "=", requestedClubId).executeTakeFirst()
          : await database.selectFrom("Club").selectAll().where("slug", "=", requestedClubSlug ?? "").executeTakeFirst();
        if (!club) {
          throw new HttpError(404, "Selected club not found.");
        }
        updates.clubId = club.id;
      }
      if (emailHash) {
        updates.emailHash = emailHash;
      }

      await database.updateTable("User").set(updates).where("id", "=", user.id).execute();
      await database.updateTable("EnrollmentToken").set({ consumedAt: new Date().toISOString() }).where("id", "=", tokenRow.id).execute();

      const account = await requireUserApi(database, user.id);
      const tokens = createAuthTokenPair(
        { sub: user.id, role: user.role as "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN", clubId: user.clubId },
        loginRefreshTtlSeconds,
      );
      await database.insertInto("UserSession").values({
        id: generateId(),
        userId: user.id,
        refreshTokenHash: tokens.refreshTokenHash,
        expiresAt: tokens.refreshTokenExpiresAt,
        revokedAt: null,
        rememberMe: 1,
      }).execute();

      return {
        user: account,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    }

    const clubSlug = requireString(body.clubSlug, "Club slug");
    const username = requireString(body.username, "Username");
    const club = await database.selectFrom("Club").selectAll().where("slug", "=", clubSlug).executeTakeFirst();
    if (!club) {
      throw new HttpError(404, `Club "${clubSlug}" not found.`);
    }

    const existingUser = await database
      .selectFrom("User")
      .selectAll()
      .where("clubId", "=", club.id)
      .where("username", "=", username)
      .executeTakeFirst();
    if (existingUser) {
      throw new HttpError(409, `Username "${username}" is already taken in club "${clubSlug}".`);
    }

    const userId = generateId();
    const passwordHash = hashPassword(password);
    await database.insertInto("User").values({
      id: userId,
      clubId: club.id,
      username,
      passwordHash,
      emailHash,
      role: "USER",
      status: "ACTIVE",
      judgeVolunteer: 0,
      juryVolunteer: 0,
      tableVolunteer: 0,
      otherVolunteer: 0,
    }).execute();

    const account = await requireUserApi(database, userId);
    const tokens = createAuthTokenPair(
      { sub: userId, role: "USER", clubId: club.id },
      loginRefreshTtlSeconds,
    );
    await database.insertInto("UserSession").values({
      id: generateId(),
      userId,
      refreshTokenHash: tokens.refreshTokenHash,
      expiresAt: tokens.refreshTokenExpiresAt,
      revokedAt: null,
      rememberMe: 1,
    }).execute();

    return {
      user: account,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  });

  app.post("/api/v1/auth/login", async (request) => {
    const body = ensureObject(request.body, "Login");
    const clubSlug = requireString(body.clubSlug, "Club slug");
    const username = requireString(body.username, "Username");
    const password = requireString(body.password, "Password");
    const rememberMe = body.rememberMe === undefined ? true : requireBoolean(body.rememberMe, "Remember me");

    const club = await database.selectFrom("Club").selectAll().where("slug", "=", clubSlug).executeTakeFirst();
    if (!club) {
      throw new HttpError(404, `Club "${clubSlug}" not found.`);
    }

    const user = await database
      .selectFrom("User")
      .selectAll()
      .where("clubId", "=", club.id)
      .where("username", "=", username)
      .executeTakeFirst();
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, "Invalid credentials.");
    }
    if (user.status !== "ACTIVE") {
      throw new HttpError(403, "User account is not active.");
    }

    const tokens = createAuthTokenPair(
      { sub: user.id, role: user.role as "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN", clubId: user.clubId },
      rememberMe ? 30 * 24 * 60 * 60 : loginRefreshTtlSeconds,
    );

    await database.insertInto("UserSession").values({
      id: generateId(),
      userId: user.id,
      refreshTokenHash: tokens.refreshTokenHash,
      expiresAt: tokens.refreshTokenExpiresAt,
      revokedAt: null,
      rememberMe: toSqliteBoolean(rememberMe),
    }).execute();

    return {
      user: await requireUserApi(database, user.id),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  });

  app.post("/api/v1/auth/refresh", async (request) => {
    const body = ensureObject(request.body, "Refresh token");
    const refreshToken = requireString(body.refreshToken, "Refresh token");
    const claims = verifyJwt(refreshToken, "refresh");
    const tokenHash = hashToken(refreshToken);

    const session = await database
      .selectFrom("UserSession")
      .selectAll()
      .where("refreshTokenHash", "=", tokenHash)
      .where("revokedAt", "is", null)
      .executeTakeFirst();
    if (!session) {
      throw new HttpError(401, "Refresh token is not active.");
    }

    const user = await requireUserRow(database, session.userId);
    if (user.status !== "ACTIVE") {
      throw new HttpError(403, "User account is not active.");
    }
    if (claims.sub !== user.id) {
      throw new HttpError(401, "Refresh token does not match the user.");
    }

    const nextTokens = createAuthTokenPair(
      { sub: user.id, role: user.role as "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN", clubId: user.clubId },
      session.rememberMe ? 30 * 24 * 60 * 60 : loginRefreshTtlSeconds,
    );

    await database.updateTable("UserSession").set({
      refreshTokenHash: nextTokens.refreshTokenHash,
      expiresAt: nextTokens.refreshTokenExpiresAt,
    }).where("id", "=", session.id).execute();

    return {
      user: await requireUserApi(database, user.id),
      accessToken: nextTokens.accessToken,
      refreshToken: nextTokens.refreshToken,
    };
  });

  app.post("/api/v1/auth/logout", async (request) => {
    const body = ensureObject(request.body, "Logout");
    const refreshToken = requireString(body.refreshToken, "Refresh token");
    const tokenHash = hashToken(refreshToken);
    const session = await database
      .selectFrom("UserSession")
      .selectAll()
      .where("refreshTokenHash", "=", tokenHash)
      .where("revokedAt", "is", null)
      .executeTakeFirst();
    if (!session) {
      throw new HttpError(404, "Session not found.");
    }

    await database.updateTable("UserSession").set({ revokedAt: new Date().toISOString() }).where("id", "=", session.id).execute();
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request) => {
    const user = await resolveAccessUser(request, database);
    if (!user) {
      throw new HttpError(401, "Not authenticated.");
    }
    return requireUserApi(database, user.id);
  });

  app.post("/api/v1/auth/password-reset/request", async (request) => {
    const body = ensureObject(request.body, "Password reset request");
    const email = requireString(body.email, "Email");
    const emailHash = hashEmail(email);
    const user = await database.selectFrom("User").selectAll().where("emailHash", "=", emailHash).executeTakeFirst();
    if (!user) {
      throw new HttpError(404, "No account found for that e-mail address.");
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await database.insertInto("PasswordResetToken").values({
      id: generateId(),
      userId: user.id,
      emailHash,
      tokenHash,
      expiresAt,
      consumedAt: null,
    }).execute();

    return { resetToken: token, expiresAt };
  });

  app.post("/api/v1/auth/password-reset/confirm", async (request) => {
    const body = ensureObject(request.body, "Password reset confirmation");
    const email = requireString(body.email, "Email");
    const token = requireString(body.token, "Reset token");
    const password = requireString(body.password, "Password");
    const emailHash = hashEmail(email);
    const tokenHash = hashToken(token);

    const resetToken = await database
      .selectFrom("PasswordResetToken")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("emailHash", "=", emailHash)
      .executeTakeFirst();
    if (!resetToken) {
      throw new HttpError(404, "Reset token not found.");
    }
    if (resetToken.consumedAt !== null) {
      throw new HttpError(409, "Reset token has already been used.");
    }
    if (new Date(resetToken.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(409, "Reset token has expired.");
    }

    const newPasswordHash = hashPassword(password);
    await database.updateTable("User").set({
      passwordHash: newPasswordHash,
      status: "ACTIVE",
    }).where("id", "=", resetToken.userId).execute();
    await database.updateTable("PasswordResetToken").set({ consumedAt: new Date().toISOString() }).where("id", "=", resetToken.id).execute();

    return { ok: true };
  });

  app.patch("/api/v1/users/:id", async (request) => {
    await requireAdminUser(request, database);
    const id = requirePathParam(request, "id");
    await requireUserRow(database, id);
    const body = ensureObject(request.body, "User");
    const changes: Partial<BackendDatabase["User"]> = {};

    if (body.clubId !== undefined) {
      changes.clubId = body.clubId === null ? null : requireString(body.clubId, "Club ID");
    }
    if (body.username !== undefined) {
      changes.username = requireString(body.username, "Username");
    }
    if (body.passwordHash !== undefined) {
      changes.passwordHash = body.passwordHash === null ? null : requireString(body.passwordHash, "Password hash");
    }
    if (body.emailHash !== undefined) {
      changes.emailHash = body.emailHash === null ? null : requireString(body.emailHash, "Email hash");
    }
    if (body.role !== undefined) {
      changes.role = requireAccountRole(body.role, "Role");
    }
    if (body.status !== undefined) {
      changes.status = requireString(body.status, "Status");
    }
    if (body.judgeVolunteer !== undefined) {
      changes.judgeVolunteer = toSqliteBoolean(requireBoolean(body.judgeVolunteer, "Judge volunteer"));
    }
    if (body.juryVolunteer !== undefined) {
      changes.juryVolunteer = toSqliteBoolean(requireBoolean(body.juryVolunteer, "Jury volunteer"));
    }
    if (body.tableVolunteer !== undefined) {
      changes.tableVolunteer = toSqliteBoolean(requireBoolean(body.tableVolunteer, "Table volunteer"));
    }
    if (body.otherVolunteer !== undefined) {
      changes.otherVolunteer = toSqliteBoolean(requireBoolean(body.otherVolunteer, "Other volunteer"));
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("User").set(changes).where("id", "=", id).execute();
    }
    return requireUserApi(database, id);
  });

  app.post("/api/v1/skills", async (request) => {
    const body = ensureObject(request.body, "Skill");
    const userId = requireString(body.userId, "User ID");
    await requireUserRow(database, userId);
    const id = generateId();
    await database.insertInto("Skill").values({
      id,
      userId,
      skillName: requireString(body.skillName, "Skill name"),
      skillLevel: requirePositiveInteger(body.skillLevel, "Skill level"),
    }).execute();
    return requireSkillApi(database, id);
  });

  app.patch("/api/v1/skills/:id", async (request) => {
    const id = requirePathParam(request, "id");
    await requireSkillRow(database, id);
    const body = ensureObject(request.body, "Skill");
    const changes: Partial<BackendDatabase["Skill"]> = {};

    if (body.userId !== undefined) {
      const userId = requireString(body.userId, "User ID");
      await requireUserRow(database, userId);
      changes.userId = userId;
    }
    if (body.skillName !== undefined) {
      changes.skillName = requireString(body.skillName, "Skill name");
    }
    if (body.skillLevel !== undefined) {
      changes.skillLevel = requirePositiveInteger(body.skillLevel, "Skill level");
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Skill").set(changes).where("id", "=", id).execute();
    }
    return requireSkillApi(database, id);
  });

  app.delete("/api/v1/skills/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireSkillRow(database, id);
    await database.deleteFrom("Skill").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.get("/api/v1/events", async () => {
    await syncAllPlannerArtifacts(database);
    return loadEvents(database);
  });

  app.post("/api/v1/events", async (request) => {
    const body = ensureObject(request.body, "Event");
    if (body.rulesetId !== undefined && body.rulesetId !== null) {
      throw new HttpError(400, "Event ruleset can only be selected after the event has been created.");
    }

    const id = generateId();
    await database.insertInto("Event").values({
      id,
      eventName: requireString(body.eventName, "Event name"),
      rulesetId: null,
      allFightersAreVolunteers: body.allFightersAreVolunteers === undefined
        ? 0
        : toSqliteBoolean(requireBoolean(body.allFightersAreVolunteers, "All fighters are volunteers")),
    }).execute();
    return toEventMutationResult(await requireEventApi(database, id));
  });

  app.patch("/api/v1/events/:id", async (request) => {
    const id = requirePathParam(request, "id");
    await requireEventRow(database, id);
    const body = ensureObject(request.body, "Event");
    const changes: Partial<BackendDatabase["Event"]> = {};

    if (body.eventName !== undefined) {
      changes.eventName = requireString(body.eventName, "Event name");
    }
    if (body.rulesetId !== undefined) {
      changes.rulesetId = body.rulesetId === null
        ? null
        : (await requireRulesetForEvent(database, requireString(body.rulesetId, "Ruleset ID"), id, "Event ruleset")).id;
    }
    if (body.allFightersAreVolunteers !== undefined) {
      changes.allFightersAreVolunteers = toSqliteBoolean(
        requireBoolean(body.allFightersAreVolunteers, "All fighters are volunteers"),
      );
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Event").set(changes).where("id", "=", id).execute();
    }
    return toEventMutationResult(await requireEventApi(database, id));
  });

  app.delete("/api/v1/events/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireEventRow(database, id);
    await database.deleteFrom("Event").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.get("/api/v1/events/:id/rulesets", async (request) =>
    listRulesetDetails(database, requirePathParam(request, "id")));

  app.post("/api/v1/events/:id/rulesets", async (request) => {
    const eventId = requirePathParam(request, "id");
    await requireEventRow(database, eventId);
    const body = ensureObject(request.body, "Ruleset");
    const sourceRulesetId = body.baseRulesetId === undefined ? undefined : optionalString(body.baseRulesetId);
    const source = sourceRulesetId
      ? await requireRulesetForEvent(database, sourceRulesetId, eventId, "Ruleset template")
      : undefined;
    const name = body.name !== undefined
      ? requireString(body.name, "Ruleset name")
      : source?.name ?? "Nieuwe ruleset";
    const version = await nextRulesetVersion(database, eventId, name);
    const definition = body.definition === undefined
      ? ensureJsonValue(parseExistingRulesetDefinition(source?.definition))
      : body.definition === null
        ? null
        : ensureJsonValue(body.definition);
    const id = generateId();

    await database.insertInto("Ruleset").values({
      id,
      eventId,
      name,
      version,
      definition: definition === null ? null : JSON.stringify(definition),
    }).execute();
    return requireRulesetDetail(database, id);
  });

  app.get("/api/v1/rulesets/:id", async (request) =>
    requireRulesetDetail(database, requirePathParam(request, "id")));

  app.patch("/api/v1/rulesets/:id", async (request) => {
    const id = requirePathParam(request, "id");
    const existing = await requireRulesetDetail(database, id);
    if (existing.locked) {
      throw new HttpError(409, "A ruleset that is already used in a match cannot be altered.");
    }

    const body = ensureObject(request.body, "Ruleset");
    const changes: Partial<BackendDatabase["Ruleset"]> = {};

    if (body.name !== undefined) {
      const name = requireString(body.name, "Ruleset name");
      if (name !== existing.name) {
        const conflict = await database.selectFrom("Ruleset")
          .select(["id"])
          .where("eventId", "=", existing.eventId)
          .where("name", "=", name)
          .where("version", "=", existing.version)
          .where("id", "!=", id)
          .executeTakeFirst();
        if (conflict) {
          throw new HttpError(409, "A ruleset with this name and version already exists in this event.");
        }
      }
      changes.name = name;
    }
    if (body.definition !== undefined) {
      const definition = body.definition === null ? null : ensureJsonValue(body.definition);
      changes.definition = definition === null ? null : JSON.stringify(definition);
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Ruleset").set(changes).where("id", "=", id).execute();
    }
    return requireRulesetDetail(database, id);
  });

  app.get("/api/v1/events/:id/schedule", async (request) => {
    const eventId = requirePathParam(request, "id");
    await syncEventArtifacts(database, eventId);
    return requireEventScheduleResponse(database, eventId);
  });

  app.patch("/api/v1/events/:id/schedule", async (request) => {
    const eventId = requirePathParam(request, "id");
    const body = ensureObject(request.body, "Event schedule");
    const schedule = await ensureSchedule(database, eventId);
    const changes: Partial<BackendDatabase["EventSchedule"]> = {};

    if (body.startTimeMinutes !== undefined) {
      changes.startTimeMinutes = requireTimeOfDay(body.startTimeMinutes);
    }
    if (body.currentTimeSlotId !== undefined) {
      if (body.currentTimeSlotId === null) {
        changes.currentTimeSlotId = null;
      } else {
        const timeSlot = await requireScheduleTimeSlotRow(
          database,
          requireString(body.currentTimeSlotId, "Current time slot ID"),
        );
        if (timeSlot.scheduleId !== schedule.id) {
          throw new HttpError(400, "Current time slot must belong to the same event schedule.");
        }
        changes.currentTimeSlotId = timeSlot.id;
      }
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("EventSchedule").set(changes).where("id", "=", schedule.id).execute();
    }
    return (await requireEventScheduleResponse(database, eventId)).schedule;
  });

  app.post("/api/v1/events/:id/schedule/slots", async (request) => {
    const eventId = requirePathParam(request, "id");
    const body = ensureObject(request.body, "Schedule time slot");
    const schedule = await ensureSchedule(database, eventId);
    const lastSlot = await database
      .selectFrom("ScheduleTimeSlot")
      .select(["order"])
      .where("scheduleId", "=", schedule.id)
      .orderBy("order desc")
      .executeTakeFirst();
    const id = generateId();
    await database.insertInto("ScheduleTimeSlot").values({
      id,
      scheduleId: schedule.id,
      order: (lastSlot?.order ?? -1) + 1,
      durationMinutes: requireTimeSlotDuration(body.durationMinutes),
      label: requireString(body.label, "Time slot label"),
      color: body.color === undefined || body.color === null ? null : requireString(body.color, "Time slot color"),
      isBreak: body.isBreak === undefined ? 0 : toSqliteBoolean(requireBoolean(body.isBreak, "Time slot break flag")),
    }).execute();
    return requireScheduleTimeSlotApi(database, id);
  });

  app.patch("/api/v1/schedule-time-slots/:id", async (request) => {
    const id = requirePathParam(request, "id");
    const timeSlot = await requireScheduleTimeSlotRow(database, id);
    const body = ensureObject(request.body, "Schedule time slot");
    const changes: Partial<BackendDatabase["ScheduleTimeSlot"]> = {};

    if (body.durationMinutes !== undefined) {
      changes.durationMinutes = requireTimeSlotDuration(body.durationMinutes);
    }
    if (body.label !== undefined) {
      changes.label = requireString(body.label, "Time slot label");
    }
    if (body.color !== undefined) {
      changes.color = body.color === null ? null : requireString(body.color, "Time slot color");
    }
    if (body.isBreak !== undefined) {
      const isBreak = requireBoolean(body.isBreak, "Time slot break flag");
      const phaseCount = await database
        .selectFrom("ScheduledPhase")
        .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
        .where("timeSlotId", "=", timeSlot.id)
        .executeTakeFirst();
      if (isBreak && (phaseCount?.count ?? 0) > 0) {
        throw new HttpError(409, "A time slot with phase assignments cannot become a break.");
      }
      changes.isBreak = toSqliteBoolean(isBreak);
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("ScheduleTimeSlot").set(changes).where("id", "=", id).execute();
    }
    return requireScheduleTimeSlotApi(database, id);
  });

  app.delete("/api/v1/schedule-time-slots/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireScheduleTimeSlotRow(database, id);
    const phaseCount = await database
      .selectFrom("ScheduledPhase")
      .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
      .where("timeSlotId", "=", id)
      .executeTakeFirst();
    if ((phaseCount?.count ?? 0) > 0) {
      throw new HttpError(409, "Remove phase assignments before deleting this time slot.");
    }
    await database.deleteFrom("ScheduleTimeSlot").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.post("/api/v1/scheduled-phases", async (request) => {
    const body = ensureObject(request.body, "Scheduled phase");
    const stageId = requireString(body.stageId, "Stage ID");
    const arenaId = requireString(body.arenaId, "Arena ID");
    const timeSlotId = requireString(body.timeSlotId, "Time slot ID");
    await validateScheduledPhase(database, stageId, arenaId, timeSlotId);
    const id = generateId();
    await database.insertInto("ScheduledPhase").values({ id, stageId, arenaId, timeSlotId }).execute();
    await syncStageArtifacts(database, [stageId]);
    return requireScheduledPhaseApi(database, id);
  });

  app.patch("/api/v1/scheduled-phases/:id", async (request) => {
    const id = requirePathParam(request, "id");
    const existing = await requireScheduledPhaseRow(database, id);
    const body = ensureObject(request.body, "Scheduled phase");
    const stageId = body.stageId === undefined ? existing.stageId : requireString(body.stageId, "Stage ID");
    const arenaId = body.arenaId === undefined ? existing.arenaId : requireString(body.arenaId, "Arena ID");
    const timeSlotId = body.timeSlotId === undefined ? existing.timeSlotId : requireString(body.timeSlotId, "Time slot ID");
    await validateScheduledPhase(database, stageId, arenaId, timeSlotId, id);
    await database.updateTable("ScheduledPhase").set({ stageId, arenaId, timeSlotId }).where("id", "=", id).execute();
    await syncStageArtifacts(database, [existing.stageId, stageId]);
    return requireScheduledPhaseApi(database, id);
  });

  app.delete("/api/v1/scheduled-phases/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    const existing = await requireScheduledPhaseRow(database, id);
    await database.deleteFrom("ScheduledPhase").where("id", "=", id).execute();
    await syncStageArtifacts(database, [existing.stageId]);
    reply.status(204).send();
  });

  app.post("/api/v1/scheduled-phases/:id/assignments", async (request) => {
    const scheduledPhaseId = requirePathParam(request, "id");
    const body = ensureObject(request.body, "Scheduled assignment");
    const scheduledPhase = await requireScheduledPhaseRow(database, scheduledPhaseId);
    const stage = await requireStageRow(database, scheduledPhase.stageId);
    const tournament = await requireTournamentRow(database, stage.tournamentId);
    const arena = await requireArenaRow(database, scheduledPhase.arenaId);
    const userId = requireString(body.userId, "User ID");
    const role = parseScheduleRole(body.role);
    const user = await requireUserRow(database, userId);
    const allowedKinds: EntryKind[] = role === "FIGHTER"
      ? ["FIGHTER", "BOTH"]
      : ["VOLUNTEER", "BOTH"];
    const eligible = await database.selectFrom("Entry")
      .innerJoin("Tournament", "Tournament.id", "Entry.tournamentId")
      .select(["Entry.id as id", "Entry.tournamentId as tournamentId"])
      .where("Entry.userId", "=", userId)
      .where("Tournament.eventId", "=", arena.eventId)
      .where("Entry.kind", "in", allowedKinds)
      .executeTakeFirst();
    if (!eligible) {
      throw new HttpError(400, role === "FIGHTER"
        ? `${user.username} is not registered as a fighter for this event.`
        : `${user.username} is not a volunteer for this event.`);
    }
    if (role === "FIGHTER" && eligible.tournamentId !== tournament.id) {
      throw new HttpError(400, `${user.username} is not registered for this tournament.`);
    }

    const conflict = await database.selectFrom("ScheduledAssignment")
      .innerJoin("ScheduledPhase", "ScheduledPhase.id", "ScheduledAssignment.scheduledPhaseId")
      .select(["ScheduledAssignment.id as id"])
      .where("ScheduledAssignment.userId", "=", userId)
      .where("ScheduledPhase.timeSlotId", "=", scheduledPhase.timeSlotId)
      .executeTakeFirst();
    if (conflict) {
      throw new HttpError(409, `${user.username} is already assigned in this time slot.`);
    }

    const assignedRoleCount = await database.selectFrom("ScheduledAssignment")
      .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
      .where("scheduledPhaseId", "=", scheduledPhase.id)
      .where("role", "=", role)
      .executeTakeFirst();
    const roleLimit = role === "JURY"
      ? 4
      : role === "FIGHTER"
        ? Math.max(1, stage.maxPoolSize ?? stage.preferredPoolSize ?? 6)
        : 1;
    if ((assignedRoleCount?.count ?? 0) >= roleLimit) {
      throw new HttpError(409, `${role} already has the maximum of ${roleLimit} assignment${roleLimit === 1 ? "" : "s"}.`);
    }

    const id = generateId();
    await database.insertInto("ScheduledAssignment").values({
      id,
      scheduledPhaseId: scheduledPhase.id,
      userId,
      role,
    }).execute();
    await syncStageArtifacts(database, [stage.id]);
    return requireScheduledAssignmentApi(database, id);
  });

  app.delete("/api/v1/scheduled-assignments/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    const assignment = await requireScheduledAssignmentRow(database, id);
    const phase = await requireScheduledPhaseRow(database, assignment.scheduledPhaseId);
    await database.deleteFrom("ScheduledAssignment").where("id", "=", id).execute();
    await syncStageArtifacts(database, [phase.stageId]);
    reply.status(204).send();
  });

  app.post("/api/v1/tournaments", async (request) => {
    const body = ensureObject(request.body, "Tournament");
    const eventId = requireString(body.eventId, "Event ID");
    await requireEventRow(database, eventId);
    const rulesetId = body.rulesetId === undefined
      ? undefined
      : body.rulesetId === null
        ? null
        : (await requireRulesetForEvent(database, requireString(body.rulesetId, "Ruleset ID"), eventId, "Tournament ruleset")).id;
    const order = body.order === undefined ? 0 : requirePositiveInteger(body.order, "Tournament order");
    const usedColors = await database.selectFrom("Tournament").select(["color"]).where("eventId", "=", eventId).execute();
    const used = new Set(usedColors.map((row) => row.color));
    const color = tournamentColors.find((candidate) => !used.has(candidate))
      ?? tournamentColors[usedColors.length % tournamentColors.length]
      ?? "#5B8CFF";

    const tournamentId = generateId();
    const poolStageId = generateId();
    await database.transaction().execute(async (trx) => {
      await trx.insertInto("Tournament").values({
        id: tournamentId,
        eventId,
        name: requireString(body.name, "Tournament name"),
        rulesetId: rulesetId ?? null,
        currentStageId: null,
        order,
        color,
      }).execute();

      await trx.insertInto("Stage").values([
        {
          id: poolStageId,
          tournamentId,
          type: "POOL",
          name: null,
          rulesetId: null,
          minPoolSize: 4,
          maxPoolSize: 6,
          preferredPoolSize: 5,
          eliminationParticipantCount: null,
          timeBetweenMatchesMinutes: 2,
        },
        {
          id: generateId(),
          tournamentId,
          type: "ELIMINATION",
          name: null,
          rulesetId: null,
          minPoolSize: null,
          maxPoolSize: null,
          preferredPoolSize: null,
          eliminationParticipantCount: null,
          timeBetweenMatchesMinutes: 2,
        },
        {
          id: generateId(),
          tournamentId,
          type: "SEMI_FINAL",
          name: null,
          rulesetId: null,
          minPoolSize: null,
          maxPoolSize: null,
          preferredPoolSize: null,
          eliminationParticipantCount: null,
          timeBetweenMatchesMinutes: 2,
        },
        {
          id: generateId(),
          tournamentId,
          type: "FINAL",
          name: null,
          rulesetId: null,
          minPoolSize: null,
          maxPoolSize: null,
          preferredPoolSize: null,
          eliminationParticipantCount: null,
          timeBetweenMatchesMinutes: 2,
        },
      ]).execute();

      await trx.updateTable("Tournament").set({ currentStageId: poolStageId }).where("id", "=", tournamentId).execute();
    });
    return requireTournamentApi(database, tournamentId);
  });

  app.patch("/api/v1/tournaments/:id", async (request) => {
    const id = requirePathParam(request, "id");
    const currentTournament = await requireTournamentRow(database, id);
    const body = ensureObject(request.body, "Tournament");
    const changes: Partial<BackendDatabase["Tournament"]> = {};

    if (body.eventId !== undefined) {
      const eventId = requireString(body.eventId, "Event ID");
      await requireEventRow(database, eventId);
      changes.eventId = eventId;
    }
    if (body.name !== undefined) {
      changes.name = requireString(body.name, "Tournament name");
    }
    if (body.rulesetId !== undefined) {
      if (body.rulesetId === null) {
        changes.rulesetId = null;
      } else {
        const eventId = changes.eventId ?? currentTournament.eventId;
        changes.rulesetId = (await requireRulesetForEvent(
          database,
          requireString(body.rulesetId, "Ruleset ID"),
          eventId,
          "Tournament ruleset",
        )).id;
      }
    }
    if (body.order !== undefined) {
      changes.order = requirePositiveInteger(body.order, "Tournament order");
    }
    if (body.currentStageId !== undefined) {
      if (body.currentStageId === null) {
        changes.currentStageId = null;
      } else {
        const currentStage = await requireStageRow(database, requireString(body.currentStageId, "Current stage ID"));
        if (currentStage.tournamentId !== id) {
          throw new HttpError(400, "Current stage must belong to the same tournament.");
        }
        changes.currentStageId = currentStage.id;
      }
    }

    const nextEventId = changes.eventId ?? currentTournament.eventId;
    const nextRulesetId = changes.rulesetId === undefined ? currentTournament.rulesetId : changes.rulesetId;
    if (nextRulesetId) {
      await requireRulesetForEvent(database, nextRulesetId, nextEventId, "Tournament ruleset");
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Tournament").set(changes).where("id", "=", id).execute();
    }
    return requireTournamentApi(database, id);
  });

  app.delete("/api/v1/tournaments/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireTournamentRow(database, id);
    await database.deleteFrom("Tournament").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.post("/api/v1/arenas", async (request) => {
    const body = ensureObject(request.body, "Arena");
    const eventId = requireString(body.eventId, "Event ID");
    await requireEventRow(database, eventId);
    const id = generateId();
    await database.insertInto("Arena").values({
      id,
      eventId,
      name: requireString(body.name, "Arena name"),
      order: body.order === undefined ? 0 : requirePositiveInteger(body.order, "Arena order"),
      leftColor: body.leftColor === undefined ? "#21c15b" : requireString(body.leftColor, "Left arena color"),
      rightColor: body.rightColor === undefined ? "#2f7dfa" : requireString(body.rightColor, "Right arena color"),
    }).execute();
    return requireArenaApi(database, id);
  });

  app.patch("/api/v1/arenas/:id", async (request) => {
    const id = requirePathParam(request, "id");
    await requireArenaRow(database, id);
    const body = ensureObject(request.body, "Arena");
    const changes: Partial<BackendDatabase["Arena"]> = {};

    if (body.eventId !== undefined) {
      const eventId = requireString(body.eventId, "Event ID");
      await requireEventRow(database, eventId);
      changes.eventId = eventId;
    }
    if (body.name !== undefined) {
      changes.name = requireString(body.name, "Arena name");
    }
    if (body.order !== undefined) {
      changes.order = requirePositiveInteger(body.order, "Arena order");
    }
    if (body.leftColor !== undefined) {
      changes.leftColor = requireString(body.leftColor, "Left arena color");
    }
    if (body.rightColor !== undefined) {
      changes.rightColor = requireString(body.rightColor, "Right arena color");
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Arena").set(changes).where("id", "=", id).execute();
    }
    return requireArenaApi(database, id);
  });

  app.delete("/api/v1/arenas/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireArenaRow(database, id);
    await database.deleteFrom("Arena").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.post("/api/v1/entries", async (request) => {
    const body = ensureObject(request.body, "Entry");
    const tournamentId = requireString(body.tournamentId, "Tournament ID");
    const userId = requireString(body.userId, "User ID");
    const requestedKind = body.kind === undefined ? undefined : parseEntryKind(body.kind);
    const seed = body.seed === undefined ? undefined : requirePositiveInteger(body.seed, "Seed");
    const tournament = await requireTournamentRow(database, tournamentId);
    const event = await requireEventRow(database, tournament.eventId);
    await requireUserRow(database, userId);
    const kind = requestedKind === "FIGHTER" && event.allFightersAreVolunteers === 1 ? "BOTH" : requestedKind;
    const id = generateId();
    await database.insertInto("Entry").values({
      id,
      tournamentId,
      userId,
      kind: kind ?? "FIGHTER",
      seed: seed ?? null,
    }).execute();
    return requireEntryApi(database, id);
  });

  app.patch("/api/v1/entries/:id", async (request) => {
    const id = requirePathParam(request, "id");
    await requireEntryRow(database, id);
    const body = ensureObject(request.body, "Entry");
    const changes: Partial<BackendDatabase["Entry"]> = {};

    if (body.tournamentId !== undefined) {
      const tournamentId = requireString(body.tournamentId, "Tournament ID");
      await requireTournamentRow(database, tournamentId);
      changes.tournamentId = tournamentId;
    }
    if (body.userId !== undefined) {
      const userId = requireString(body.userId, "User ID");
      await requireUserRow(database, userId);
      changes.userId = userId;
    }
    if (body.kind !== undefined) {
      changes.kind = parseEntryKind(body.kind);
    }
    if (body.seed !== undefined) {
      changes.seed = body.seed === null ? null : requirePositiveInteger(body.seed, "Seed");
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Entry").set(changes).where("id", "=", id).execute();
    }
    return requireEntryApi(database, id);
  });

  app.delete("/api/v1/entries/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireEntryRow(database, id);
    await database.deleteFrom("Entry").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.post("/api/v1/stages", async (request) => {
    const body = ensureObject(request.body, "Stage");
    const tournamentId = requireString(body.tournamentId, "Tournament ID");
    const type = parseStageType(body.type);
    const tournament = await requireTournamentRow(database, tournamentId);
    const event = await requireEventRow(database, tournament.eventId);
    const rulesetId = body.rulesetId === undefined
      ? tournament.rulesetId ?? event.rulesetId ?? null
      : body.rulesetId === null
        ? null
        : (await requireRulesetForEvent(database, requireString(body.rulesetId, "Ruleset ID"), tournament.eventId, "Stage ruleset")).id;
    const timeBetweenMatchesMinutes = body.timeBetweenMatchesMinutes === undefined || body.timeBetweenMatchesMinutes === null
      ? 2
      : requirePositiveInteger(body.timeBetweenMatchesMinutes, "Time between matches");

    let minPoolSize: number | null = null;
    let maxPoolSize: number | null = null;
    let preferredPoolSize: number | null = null;
    if (type === "POOL") {
      minPoolSize = body.minPoolSize === undefined || body.minPoolSize === null ? 4 : requireStagePoolSize(body.minPoolSize, "Minimum pool size");
      maxPoolSize = body.maxPoolSize === undefined || body.maxPoolSize === null ? 6 : requireStagePoolSize(body.maxPoolSize, "Maximum pool size");
      preferredPoolSize = body.preferredPoolSize === undefined || body.preferredPoolSize === null ? 5 : requireStagePoolSize(body.preferredPoolSize, "Preferred pool size");
      validateStagePoolRange(minPoolSize, maxPoolSize, preferredPoolSize);
    }

    const tournamentView = await requireTournamentApi(database, tournamentId);
    const id = generateId();
    await database.insertInto("Stage").values({
      id,
      tournamentId,
      type,
      name: body.name === undefined ? null : optionalString(body.name) ?? null,
      rulesetId,
      minPoolSize,
      maxPoolSize,
      preferredPoolSize,
      eliminationParticipantCount: type === "ELIMINATION"
        ? body.eliminationParticipantCount === undefined || body.eliminationParticipantCount === null
          ? resolveEliminationParticipantCount(tournamentView)
          : requireStagePoolSize(body.eliminationParticipantCount, "Elimination participant count")
        : null,
      timeBetweenMatchesMinutes,
    }).execute();
    return requireStageApi(database, id);
  });

  app.patch("/api/v1/stages/:id", async (request) => {
    const id = requirePathParam(request, "id");
    const currentStage = await requireStageRow(database, id);
    const body = ensureObject(request.body, "Stage");
    const nextType = body.type === undefined ? currentStage.type : parseStageType(body.type);
    const nextTournamentId = body.tournamentId === undefined ? currentStage.tournamentId : requireString(body.tournamentId, "Tournament ID");
    const nextTournament = await requireTournamentRow(database, nextTournamentId);
    const nextTournamentView = await requireTournamentApi(database, nextTournamentId);
    const changes: Partial<BackendDatabase["Stage"]> = {};

    if (body.tournamentId !== undefined) {
      changes.tournamentId = nextTournamentId;
    }
    if (body.type !== undefined) {
      changes.type = nextType;
    }
    if (body.name !== undefined) {
      changes.name = optionalString(body.name) ?? null;
    }
    if (body.rulesetId !== undefined) {
      changes.rulesetId = body.rulesetId === null
        ? null
        : (await requireRulesetForEvent(
          database,
          requireString(body.rulesetId, "Ruleset ID"),
          nextTournament.eventId,
          "Stage ruleset",
        )).id;
    }
    changes.timeBetweenMatchesMinutes = body.timeBetweenMatchesMinutes === undefined
      ? currentStage.timeBetweenMatchesMinutes
      : body.timeBetweenMatchesMinutes === null
        ? 2
        : requirePositiveInteger(body.timeBetweenMatchesMinutes, "Time between matches");

    if (nextType === "POOL") {
      const minPoolSize = body.minPoolSize === undefined
        ? currentStage.type === "POOL" ? (currentStage.minPoolSize ?? 4) : 4
        : body.minPoolSize === null ? 4 : requireStagePoolSize(body.minPoolSize, "Minimum pool size");
      const maxPoolSize = body.maxPoolSize === undefined
        ? currentStage.type === "POOL" ? (currentStage.maxPoolSize ?? 6) : 6
        : body.maxPoolSize === null ? 6 : requireStagePoolSize(body.maxPoolSize, "Maximum pool size");
      const preferredPoolSize = body.preferredPoolSize === undefined
        ? currentStage.type === "POOL" ? (currentStage.preferredPoolSize ?? 5) : 5
        : body.preferredPoolSize === null ? 5 : requireStagePoolSize(body.preferredPoolSize, "Preferred pool size");
      validateStagePoolRange(minPoolSize, maxPoolSize, preferredPoolSize);
      changes.minPoolSize = minPoolSize;
      changes.maxPoolSize = maxPoolSize;
      changes.preferredPoolSize = preferredPoolSize;
      changes.eliminationParticipantCount = null;
    } else if (nextType === "ELIMINATION") {
      changes.minPoolSize = null;
      changes.maxPoolSize = null;
      changes.preferredPoolSize = null;
      changes.eliminationParticipantCount = body.eliminationParticipantCount === undefined
        ? currentStage.type === "ELIMINATION"
          ? currentStage.eliminationParticipantCount ?? resolveEliminationParticipantCount(nextTournamentView, currentStage)
          : resolveEliminationParticipantCount(nextTournamentView, currentStage)
        : body.eliminationParticipantCount === null
          ? resolveEliminationParticipantCount(nextTournamentView, currentStage)
          : requireStagePoolSize(body.eliminationParticipantCount, "Elimination participant count");
    } else {
      changes.minPoolSize = null;
      changes.maxPoolSize = null;
      changes.preferredPoolSize = null;
      changes.eliminationParticipantCount = null;
    }

    const nextRulesetId = changes.rulesetId === undefined ? currentStage.rulesetId : changes.rulesetId;
    if (nextRulesetId) {
      await requireRulesetForEvent(database, nextRulesetId, nextTournament.eventId, "Stage ruleset");
    }

    if (Object.keys(changes).length > 0) {
      await database.updateTable("Stage").set(changes).where("id", "=", id).execute();
    }
    return requireStageApi(database, id);
  });

  app.delete("/api/v1/stages/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    await requireStageRow(database, id);
    await database.deleteFrom("Stage").where("id", "=", id).execute();
    reply.status(204).send();
  });

  app.post("/api/v1/stages/:id/arenas", async (request) => {
    const stageId = requirePathParam(request, "id");
    const stage = await requireStageRow(database, stageId);
    const body = ensureObject(request.body, "Stage arena");
    const arenaId = requireString(body.arenaId, "Arena ID");
    const arena = await requireArenaRow(database, arenaId);
    const tournament = await requireTournamentRow(database, stage.tournamentId);
    if (arena.eventId !== tournament.eventId) {
      throw new HttpError(400, "Arena must belong to the same event as the stage.");
    }
    const id = generateId();
    await database.insertInto("StageArena").values({ id, stageId, arenaId }).execute();
    const updated = await requireStageApi(database, stageId);
    const result = updated.arenas.find((item) => item.id === id);
    if (!result) {
      throw new HttpError(500, `Stage arena "${id}" not found after creation.`);
    }
    return result;
  });

  app.delete("/api/v1/stages/:id/arenas/:arenaId", async (request, reply) => {
    const stageId = requirePathParam(request, "id");
    const arenaId = requirePathParam(request, "arenaId");
    const assignment = await database.selectFrom("StageArena")
      .select(["id"])
      .where("stageId", "=", stageId)
      .where("arenaId", "=", arenaId)
      .executeTakeFirst();
    if (!assignment) {
      throw new HttpError(404, `Stage arena assignment "${stageId}/${arenaId}" not found.`);
    }
    await database.deleteFrom("StageArena").where("id", "=", assignment.id).execute();
    reply.status(204).send();
  });

  app.post("/api/v1/stages/:id/officials", async (request) => {
    const stageId = requirePathParam(request, "id");
    const stage = await requireStageRow(database, stageId);
    const body = ensureObject(request.body, "Stage official");
    const entryId = requireString(body.entryId, "Entry ID");
    const entry = await requireEntryRow(database, entryId);
    if (entry.tournamentId !== stage.tournamentId) {
      throw new HttpError(400, "Official must belong to the same tournament as the stage.");
    }
    if (entry.kind === "FIGHTER") {
      throw new HttpError(400, "Only official or both-role entries can be assigned as stage officials.");
    }
    const id = generateId();
    await database.insertInto("StageOfficial").values({
      id,
      stageId,
      entryId,
      role: parseStageOfficialRole(body.role),
    }).execute();
    const updated = await requireStageApi(database, stageId);
    const result = updated.officials.find((item) => item.id === id);
    if (!result) {
      throw new HttpError(500, `Stage official "${id}" not found after creation.`);
    }
    return result;
  });

  app.delete("/api/v1/stage-officials/:id", async (request, reply) => {
    const id = requirePathParam(request, "id");
    const official = await requireStageOfficialRow(database, id);
    await database.deleteFrom("StageOfficial").where("id", "=", id).execute();
    await syncStageArtifacts(database, [official.stageId]);
    reply.status(204).send();
  });

  app.get("/api/v1/rounds", async () => listRounds(database));

  app.get("/api/v1/matches", async () => listMatches(database));

  app.post("/api/v1/matches/:id/complete", async (request) => {
    const matchId = requirePathParam(request, "id");
    const match = await requireMatchRow(database, matchId);
    const existingExchanges = await listExchangesForMatch(database, matchId);
    if (match.scoreA !== null || match.scoreB !== null || match.winnerEntryId !== null || existingExchanges.length > 0) {
      throw new HttpError(409, "This match has already been completed.");
    }

    const round = await database.selectFrom("Round").selectAll().where("id", "=", match.roundId).executeTakeFirst();
    if (!round) {
      throw new HttpError(500, `Round "${match.roundId}" not found.`);
    }
    const stage = await requireStageRow(database, round.stageId);
    const body = ensureObject(request.body, "Match completion");
    const scoreA = requireInteger(body.scoreA, "Score A");
    const scoreB = requireInteger(body.scoreB, "Score B");
    const exchangeInputs = Array.isArray(body.exchanges) ? body.exchanges : undefined;
    if (!exchangeInputs) {
      throw new HttpError(400, "Match completion exchanges must be an array.");
    }

    let winnerEntryId: string | null = null;
    if (body.winnerEntryId !== undefined) {
      if (body.winnerEntryId === null) {
        winnerEntryId = null;
      } else {
        winnerEntryId = requireString(body.winnerEntryId, "Winner entry ID");
        await requireEntryInTournament(database, winnerEntryId, stage.tournamentId, "Winner entry");
      }
    }

    const exchanges = exchangeInputs.map((item, index) => {
      const exchange = ensureObject(item, `Match exchange ${index + 1}`);
      return {
        scoreA: requireInteger(exchange.scoreA, `Match exchange ${index + 1} score A`),
        scoreB: requireInteger(exchange.scoreB, `Match exchange ${index + 1} score B`),
        details: exchange.details === undefined ? undefined : ensureJsonValue(exchange.details),
      };
    });

    if (exchanges.length > 0) {
      const lastExchange = exchanges[exchanges.length - 1];
      if (!lastExchange || lastExchange.scoreA !== scoreA || lastExchange.scoreB !== scoreB) {
        throw new HttpError(400, "Final scores must match the last saved exchange.");
      }
    }

    await database.transaction().execute(async (trx) => {
      for (const exchange of exchanges) {
        if (exchange.details === undefined) {
          throw new HttpError(400, "Match exchange details must be provided.");
        }
        await insertExchange(trx, matchId, exchange.scoreA, exchange.scoreB, exchange.details);
      }

      await trx.updateTable("Match").set({
        scoreA,
        scoreB,
        winnerEntryId,
      }).where("id", "=", matchId).execute();
    });

    return requireMatchApi(database, matchId);
  });

  return app;
}

function requirePathParam(request: FastifyRequest, key: string): string {
  const params = ensureObject(request.params ?? {}, "Route parameters");
  return requireString(params[key], key);
}

function parseExistingRulesetDefinition(definition: string | null | undefined): ApiRulesetDefinition {
  return definition
    ? (JSON.parse(definition) as ApiRulesetDefinition)
    : defaultRulesetDefinition();
}

function requireTimeSlotDuration(value: unknown): number {
  const durationMinutes = requirePositiveInteger(value, "Time slot duration");
  if (durationMinutes < 1 || durationMinutes > 24 * 60) {
    throw new HttpError(400, "Time slot duration must be between 1 and 1440 minutes.");
  }
  return durationMinutes;
}

function requireTimeOfDay(value: unknown): number {
  const minutes = requirePositiveInteger(value, "Schedule start time");
  if (minutes >= 24 * 60) {
    throw new HttpError(400, "Schedule start time must be between 00:00 and 23:59.");
  }
  return minutes;
}

function parseStageType(value: unknown): StageType {
  const type = requireString(value, "Stage type");
  if (!["POOL", "ELIMINATION", "SEMI_FINAL", "FINAL"].includes(type)) {
    throw new HttpError(400, "Stage type must be POOL, ELIMINATION, SEMI_FINAL, or FINAL.");
  }
  return type as StageType;
}

function parseEntryKind(value: unknown): EntryKind {
  const kind = requireString(value, "Entry kind");
  if (!["FIGHTER", "VOLUNTEER", "BOTH"].includes(kind)) {
    throw new HttpError(400, "Entry kind must be FIGHTER, VOLUNTEER, or BOTH.");
  }
  return kind as EntryKind;
}

function parseStageOfficialRole(value: unknown): StageOfficialRole {
  const role = requireString(value, "Stage official role");
  if (!["JUDGE", "JURY", "TABLE"].includes(role)) {
    throw new HttpError(400, "Stage official role must be JUDGE, JURY, or TABLE.");
  }
  return role as StageOfficialRole;
}

function parseScheduleRole(value: unknown): ScheduleRole {
  const role = requireString(value, "Schedule role");
  if (!["JUDGE", "JURY", "TABLE", "FIGHTER"].includes(role)) {
    throw new HttpError(400, "Schedule role must be JUDGE, JURY, TABLE, or FIGHTER.");
  }
  return role as ScheduleRole;
}

function requireStagePoolSize(value: unknown, label: string): number {
  const size = requirePositiveInteger(value, label);
  if (size < 1) {
    throw new HttpError(400, `${label} must be at least 1.`);
  }
  return size;
}

function validateStagePoolRange(minPoolSize: number, maxPoolSize: number, preferredPoolSize: number): void {
  if (minPoolSize > maxPoolSize) {
    throw new HttpError(400, "Minimum pool size cannot exceed maximum pool size.");
  }
  if (preferredPoolSize < minPoolSize || preferredPoolSize > maxPoolSize) {
    throw new HttpError(400, "Preferred pool size must be between the minimum and maximum pool size.");
  }
}

function resolveEliminationParticipantCount(
  tournament: { stages?: Array<{ type: string; preferredPoolSize: number | null }> },
  currentStage?: { type: string; preferredPoolSize: number | null; eliminationParticipantCount: number | null },
): number {
  if (currentStage?.type === "POOL" && currentStage.preferredPoolSize !== null) {
    return currentStage.preferredPoolSize;
  }
  const poolStage = tournament.stages?.find((stage) => stage.type === "POOL" && stage.preferredPoolSize !== null);
  if (poolStage?.preferredPoolSize !== null && poolStage?.preferredPoolSize !== undefined) {
    return poolStage.preferredPoolSize;
  }
  if (currentStage && currentStage.eliminationParticipantCount !== null) {
    return currentStage.eliminationParticipantCount;
  }
  return 5;
}

async function start(): Promise<void> {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`HEMA backend listening on http://localhost:${port}`);
}

void start();

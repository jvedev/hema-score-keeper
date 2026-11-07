import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam, type AccessUser } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, DbExecutor, LiveTarget } from "../db.js";
import { ensureObject, HttpError, optionalString, requireString } from "../http.js";
import { requireEventTournamentAdmin } from "../tournaments/access.js";
import { activateDatabaseTournament, projectDatabaseTournament } from "./database-mode.js";
import { rulesOf } from "./bout-display.js";
import { boutScores, ringBouts } from "./bout-routes.js";
import { XlsxCellSource } from "./cell-source.js";
import { backupPath } from "./data-dir.js";
import { GoogleCellSource, GoogleError, googleCredentials, sharedGoogleApi } from "./google-sheets.js";
import { applySchedulePlan, readSchedulePlan, tournamentLayout } from "./import.js";
import { activeExchanges, enqueueSync } from "./live-store.js";
import { scoreOf } from "./bout-score.js";
import { activeKeeperOf, publicRing } from "./ring-keeper.js";
import { withTournamentLock } from "./tournament-lock.js";
import { registerPushRoutes } from "./push-notifications.js";
import { isEventTournamentAdmin } from "../tournaments/access.js";

const IMPORT_BODY_LIMIT = 20 * 1024 * 1024;

export function registerLiveRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  // Encapsulated: the raw-body parser (and its route limit) applies to the live routes only.
  void app.register(async (scope) => registerLiveRoutesInScope(scope, database));
}

function registerLiveRoutesInScope(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  registerPushRoutes(app, database);
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.post("/api/v1/live-tournaments", async (request) => {
    const user = await requireUser(request, database);
    const body = ensureObject(request.body, "Tournament");
    const id = randomUUID();
    await database
      .insertInto("LiveTournament")
      .values({
        id,
        name: requireString(body.name, "Name"),
        mode: "SHEET",
        layoutVersion: "v3",
        googleSpreadsheetId: optionalString(body.googleSpreadsheetId) ?? null,
        createdByUserId: user.id,
        createdAt: app.now().toISOString(),
      })
      .execute();
    return { id };
  });

  app.post("/api/v1/tournaments/:id/live", async (request) => {
    const user = await requireUser(request, database);
    const sourceTournamentId = requirePathParam(request, "id");
    return database.transaction().execute(async (trx) => {
      await requireEventTournamentAdmin(trx, sourceTournamentId, user);
      return activateDatabaseTournament(trx, sourceTournamentId, user.id, app.now().toISOString());
    });
  });

  app.get("/api/v1/tournaments/:id/live", async (request) => {
    const user = await requireUser(request, database);
    const sourceTournamentId = requirePathParam(request, "id");
    await requireEventTournamentAdmin(database, sourceTournamentId, user);
    const liveTournament = await database.selectFrom("LiveTournament")
      .select(["id", "mode"])
      .where("sourceTournamentId", "=", sourceTournamentId)
      .executeTakeFirst();
    if (!liveTournament) {
      return { active: false, liveTournamentId: null, rings: 0, bouts: 0 };
    }
    if (liveTournament.mode !== "DATABASE") {
      throw new HttpError(409, "The source tournament is linked to a non-database live tournament.");
    }
    const [ringCount, boutCount] = await Promise.all([
      database.selectFrom("LiveRing")
        .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
        .where("tournamentId", "=", liveTournament.id)
        .executeTakeFirst(),
      database.selectFrom("LiveBout")
        .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
        .where("tournamentId", "=", liveTournament.id)
        .executeTakeFirst(),
    ]);
    return {
      active: true,
      liveTournamentId: liveTournament.id,
      rings: ringCount?.count ?? 0,
      bouts: boutCount?.count ?? 0,
    };
  });

  app.get("/api/v1/tournaments/:id/live/results", async (request) => {
    const user = await requireUser(request, database);
    const sourceTournamentId = requirePathParam(request, "id");
    await requireEventTournamentAdmin(database, sourceTournamentId, user);
    const liveTournament = await database.selectFrom("LiveTournament")
      .select(["id", "mode"])
      .where("sourceTournamentId", "=", sourceTournamentId)
      .executeTakeFirst();
    if (!liveTournament) return { results: [] };
    if (liveTournament.mode !== "DATABASE") {
      throw new HttpError(409, "The source tournament is linked to a non-database live tournament.");
    }

    const bouts = await database.selectFrom("LiveBout")
      .select(["id", "sourceMatchId", "label", "fighterLeft", "fighterRight"])
      .where("tournamentId", "=", liveTournament.id)
      .where("status", "=", "DONE")
      .where("sourceMatchId", "is not", null)
      .orderBy("ringId")
      .orderBy("order")
      .execute();
    return {
      results: await Promise.all(bouts.map(async (bout) => {
        if (bout.sourceMatchId === null) throw new HttpError(500, "A linked live bout is missing its source match.");
        const exchanges = await activeExchanges(database, bout.id);
        return {
          boutId: bout.id,
          sourceMatchId: bout.sourceMatchId,
          label: bout.label,
          fighterLeft: bout.fighterLeft,
          fighterRight: bout.fighterRight,
          score: scoreOf(exchanges),
          exchanges: exchanges.map(({ clientExchangeId, kind, leftPoints, rightPoints, isDouble, firstScorer, round }) => ({
            clientExchangeId,
            kind,
            leftPoints,
            rightPoints,
            isDouble: isDouble === 1,
            firstScorer,
            round,
          })),
        };
      })),
    };
  });

  app.post("/api/v1/live-tournaments/:id/project", async (request) => {
    const user = await requireUser(request, database);
    const liveTournamentId = requirePathParam(request, "id");
    return database.transaction().execute(async (trx) => {
      await requireTournamentAdmin(trx, liveTournamentId, user);
      return projectDatabaseTournament(trx, liveTournamentId, app.now().toISOString());
    });
  });

  // The laptop person's list: own tournaments (every tournament for a system admin), newest first.
  app.get("/api/v1/live-tournaments", async (request) => {
    const user = await requireUser(request, database);
    let query = database.selectFrom("LiveTournament").select(["id", "name", "googleSpreadsheetId", "createdAt"]);
    if (user.role !== "SYSTEM_ADMIN") {
      query = query.where("createdByUserId", "=", user.id);
    }
    return { tournaments: await query.orderBy("createdAt", "desc").orderBy("id", "desc").execute() };
  });

  app.post("/api/v1/live-tournaments/:id/import/xlsx", { bodyLimit: IMPORT_BODY_LIMIT }, async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    await requireSheetTournament(database, tournamentId);
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new HttpError(400, "Send the .xlsx file as the request body (application/octet-stream).");
    }
    let source: XlsxCellSource;
    try {
      source = await XlsxCellSource.fromBuffer(body);
    } catch {
      throw new HttpError(400, "The upload is not a valid .xlsx file.");
    }
    return withTournamentLock(tournamentId, () => importUpload(database, tournamentId, source, body));
  });

  app.post("/api/v1/live-tournaments/:id/import/google", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    await requireSheetTournament(database, tournamentId);
    const tournament = await database
      .selectFrom("LiveTournament")
      .select("googleSpreadsheetId")
      .where("id", "=", tournamentId)
      .executeTakeFirstOrThrow();
    if (!tournament.googleSpreadsheetId) throw new HttpError(400, "The tournament has no Google spreadsheet id.");
    const api = sharedGoogleApi();
    if (!api) throw new HttpError(503, "NOT_CONFIGURED: the Google service account is not set up on the server.");
    try {
      // All Google calls finish before the transaction opens; no network call runs inside it.
      const layout = await tournamentLayout(database, tournamentId);
      const plan = await readSchedulePlan(new GoogleCellSource(tournament.googleSpreadsheetId, api), layout);
      // Only the database apply takes the tournament lock; the network read above does not.
      return await withTournamentLock(tournamentId, () =>
        database.transaction().execute((trx) => applySchedulePlan(trx, tournamentId, plan)),
      );
    } catch (error) {
      if (error instanceof GoogleError) {
        throw new HttpError(error.code === "NOT_CONFIGURED" ? 503 : 502, `Google Sheets could not be read: ${error.message}`);
      }
      throw error;
    }
  });

  app.get("/api/v1/live-tournaments/:id/sync", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    await requireSheetTournament(database, tournamentId);
    return { targets: await syncStatus(database, tournamentId) };
  });

  app.get("/api/v1/live-tournaments/:id/fighters", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const rows = await database
      .selectFrom("LiveTournamentFighter as Fighter")
      .leftJoin("User as Account", "Account.id", "Fighter.userId")
      .select([
        "Fighter.id as id",
        "Fighter.name as name",
        "Fighter.nameKey as nameKey",
        "Fighter.userId as userId",
        "Fighter.active as active",
        "Fighter.ambiguous as ambiguous",
        "Account.name as linkedName",
        "Account.username as linkedUsername",
      ])
      .where("Fighter.tournamentId", "=", tournamentId)
      .orderBy("Fighter.active", "desc")
      .orderBy("Fighter.name")
      .orderBy("Fighter.id")
      .execute();
    const identityCounts = new Map<string, number>();
    return {
      fighters: rows.map((row) => {
        const identityNumber = (identityCounts.get(row.nameKey) ?? 0) + 1;
        identityCounts.set(row.nameKey, identityNumber);
        return {
        id: row.id,
        name: row.name,
        nameKey: row.nameKey,
        userId: row.userId,
        active: row.active === 1,
        ambiguous: row.ambiguous === 1,
        identityNumber,
        user: row.userId && row.linkedName && row.linkedUsername
          ? { id: row.userId, name: row.linkedName, username: row.linkedUsername }
          : null,
        };
      }),
    };
  });

  app.post("/api/v1/live-tournaments/:id/fighters/identities", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const body = ensureObject(request.body, "Fighter identity");
    const name = requireString(body.name, "Name").trim().replace(/\s+/g, " ");
    const nameKey = fighterNameKey(name);
    if (!nameKey) throw new HttpError(400, "Name is required.");
    const group = await database
      .selectFrom("LiveTournamentFighter")
      .select("id")
      .where("tournamentId", "=", tournamentId)
      .where("nameKey", "=", nameKey)
      .where("active", "=", 1)
      .where("ambiguous", "=", 1)
      .executeTakeFirst();
    if (!group) throw new HttpError(409, "This name does not need identity review.");
    const now = app.now().toISOString();
    const fighter = {
      id: randomUUID(),
      tournamentId,
      name,
      nameKey,
      userId: null,
      active: 1 as const,
      ambiguous: 1 as const,
      createdAt: now,
      updatedAt: now,
    };
    await database.insertInto("LiveTournamentFighter").values(fighter).execute();
    return { fighter: { ...fighter, active: true, ambiguous: true, user: null } };
  });

  app.get("/api/v1/live-tournaments/:id/ambiguous-bouts", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const ambiguousIdentities = await database
      .selectFrom("LiveTournamentFighter")
      .select(["id", "name", "nameKey", "userId"])
      .where("tournamentId", "=", tournamentId)
      .where("active", "=", 1)
      .where("ambiguous", "=", 1)
      .orderBy("name")
      .orderBy("id")
      .execute();
    const candidatesByName = new Map<string, typeof ambiguousIdentities>();
    for (const identity of ambiguousIdentities) {
      candidatesByName.set(identity.nameKey, [...(candidatesByName.get(identity.nameKey) ?? []), identity]);
    }
    const bouts = await database
      .selectFrom("LiveBout")
      .innerJoin("LiveRing", "LiveRing.id", "LiveBout.ringId")
      .select([
        "LiveBout.id as id",
        "LiveBout.label as label",
        "LiveBout.sheetName as sheetName",
        "LiveBout.order as order",
        "LiveRing.name as ringName",
        "LiveBout.fighterLeft as fighterLeft",
        "LiveBout.fighterLeftId as fighterLeftId",
        "LiveBout.fighterRight as fighterRight",
        "LiveBout.fighterRightId as fighterRightId",
      ])
      .where("LiveBout.tournamentId", "=", tournamentId)
      .orderBy("LiveRing.order")
      .orderBy("LiveBout.order")
      .execute();
    return {
      bouts: bouts.flatMap((bout) => {
        const side = (name: string, fighterId: string | null) => {
          const candidates = candidatesByName.get(fighterNameKey(name));
          return candidates
            ? { name, fighterId, candidates: candidates.map(({ id, name: candidateName, userId }) => ({ id, name: candidateName, linked: userId !== null })) }
            : null;
        };
        const left = side(bout.fighterLeft, bout.fighterLeftId);
        const right = side(bout.fighterRight, bout.fighterRightId);
        return left || right ? [{ id: bout.id, label: bout.label, sheetName: bout.sheetName, order: bout.order, ringName: bout.ringName, left, right }] : [];
      }),
    };
  });

  app.put("/api/v1/live-tournaments/:id/bouts/:boutId/sides/:side/identity", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    const boutId = requirePathParam(request, "boutId");
    const side = requirePathParam(request, "side");
    await requireTournamentAdmin(database, tournamentId, user);
    if (side !== "LEFT" && side !== "RIGHT") throw new HttpError(400, "Side must be LEFT or RIGHT.");
    const body = ensureObject(request.body, "Fighter identity assignment");
    if (!Object.hasOwn(body, "fighterId") || (body.fighterId !== null && typeof body.fighterId !== "string")) {
      throw new HttpError(400, "fighterId must be an identity id or null.");
    }
    const bout = await database
      .selectFrom("LiveBout")
      .select(["fighterLeft", "fighterRight"])
      .where("id", "=", boutId)
      .where("tournamentId", "=", tournamentId)
      .executeTakeFirst();
    if (!bout) throw new HttpError(404, "Tournament bout not found.");
    const name = side === "LEFT" ? bout.fighterLeft : bout.fighterRight;
    const nameKey = fighterNameKey(name);
    if (!nameKey) throw new HttpError(409, "This bout side has no imported fighter name.");
    const fighterId = body.fighterId as string | null;
    if (fighterId !== null) {
      const candidate = await database
        .selectFrom("LiveTournamentFighter")
        .select("id")
        .where("id", "=", fighterId)
        .where("tournamentId", "=", tournamentId)
        .where("nameKey", "=", nameKey)
        .where("active", "=", 1)
        .executeTakeFirst();
      if (!candidate) throw new HttpError(409, "Choose an identity with the same imported name.");
    }

    const now = app.now().toISOString();
    await database.transaction().execute(async (trx) => {
      const changes = side === "LEFT"
        ? { fighterLeftId: fighterId, fighterLeftManuallyAssigned: fighterId === null ? 0 : 1 }
        : { fighterRightId: fighterId, fighterRightManuallyAssigned: fighterId === null ? 0 : 1 };
      await trx.updateTable("LiveBout").set(changes).where("id", "=", boutId).execute();
      const rows = await trx
        .selectFrom("LiveBout")
        .select(["fighterLeft", "fighterLeftId", "fighterLeftManuallyAssigned", "fighterRight", "fighterRightId", "fighterRightManuallyAssigned"])
        .where("tournamentId", "=", tournamentId)
        .execute();
      const assigned = rows.flatMap((row) => [
        { name: row.fighterLeft, id: row.fighterLeftId, manual: row.fighterLeftManuallyAssigned },
        { name: row.fighterRight, id: row.fighterRightId, manual: row.fighterRightManuallyAssigned },
      ]).filter((entry) => fighterNameKey(entry.name) === nameKey);
      const resolved = assigned.every((entry) => entry.id !== null && entry.manual === 1);
      await trx
        .updateTable("LiveTournamentFighter")
        .set({ ambiguous: resolved ? 0 : 1, updatedAt: now })
        .where("tournamentId", "=", tournamentId)
        .where("nameKey", "=", nameKey)
        .execute();
    });
    return { fighterId, ambiguous: fighterId === null };
  });

  app.put("/api/v1/live-tournaments/:id/fighters/:fighterId/account", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    const fighterId = requirePathParam(request, "fighterId");
    await requireTournamentAdmin(database, tournamentId, user);
    const body = ensureObject(request.body, "Fighter account");
    if (body.userId !== null && (typeof body.userId !== "string" || body.userId.trim() === "")) {
      throw new HttpError(400, "userId must be an account id or null.");
    }
    const userId = body.userId as string | null;
    try {
      return await database.transaction().execute(async (trx) => {
        const fighter = await trx
          .selectFrom("LiveTournamentFighter")
          .select(["id", "name", "nameKey", "ambiguous", "active"])
          .where("id", "=", fighterId)
          .where("tournamentId", "=", tournamentId)
          .executeTakeFirst();
        if (!fighter) throw new HttpError(404, "Tournament fighter not found.");
        if (fighter.active !== 1) throw new HttpError(409, "Inactive identities cannot be linked.");
        if (fighter.ambiguous === 1 && userId !== null) {
          throw new HttpError(409, "Resolve all bout-side identities before linking an account.");
        }

        const account = userId === null
          ? null
          : await trx.selectFrom("User").select(["id", "name", "username", "status"]).where("id", "=", userId).executeTakeFirst();
        if (userId !== null && !account) throw new HttpError(404, "Account not found.");
        if (account && account.status !== "ACTIVE") throw new HttpError(409, "Only an active account can be linked.");
        if (userId !== null) {
          const alreadyLinked = await trx
            .selectFrom("LiveTournamentFighter")
            .select("id")
            .where("tournamentId", "=", tournamentId)
            .where("userId", "=", userId)
            .where("id", "!=", fighterId)
            .executeTakeFirst();
          if (alreadyLinked) throw new HttpError(409, "This account is already linked to another fighter in this tournament.");
        }

        await trx
          .updateTable("LiveTournamentFighter")
          .set({ userId, updatedAt: app.now().toISOString() })
          .where("id", "=", fighterId)
          .execute();
        const sameName = await trx
          .selectFrom("LiveTournamentFighter")
          .select("id")
          .where("tournamentId", "=", tournamentId)
          .where("nameKey", "=", fighter.nameKey)
          .orderBy("id")
          .execute();
        return {
          fighter: {
            id: fighter.id,
            name: fighter.name,
            nameKey: fighter.nameKey,
            userId,
            active: true,
            ambiguous: fighter.ambiguous === 1,
            identityNumber: sameName.findIndex((identity) => identity.id === fighter.id) + 1,
            user: account ? { id: account.id, name: account.name, username: account.username } : null,
          },
        };
      });
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: LiveTournamentFighter\./.test(error.message)) {
        throw new HttpError(409, "This account is already linked to another fighter in this tournament.");
      }
      throw error;
    }
  });

  // The ring links (with their secret keeper tokens) for the laptop person: tournament creator or system admin only.
  app.get("/api/v1/live-tournaments/:id/rings", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const rings = await database.selectFrom("LiveRing").selectAll().where("tournamentId", "=", tournamentId).orderBy("order").execute();
    return {
      rings: await Promise.all(
        rings.map(async (ring) => ({ ...publicRing(ring), keeperToken: ring.keeperToken, scoreboardToken: ring.scoreboardToken, activeKeeper: await activeKeeperOf(database, ring) })),
      ),
    };
  });

  app.get("/api/v1/live-tournaments/:id/backup.xlsx", async (request, reply) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    await requireSheetTournament(database, tournamentId);
    let bytes: Buffer;
    try {
      bytes = await readFile(backupPath(tournamentId));
    } catch {
      throw new HttpError(404, "There is no backup file for this tournament yet.");
    }
    return reply
      .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("content-disposition", `attachment; filename="tournament-${tournamentId}.xlsx"`)
      .send(bytes);
  });

  app.get("/api/v1/me/live-tournaments", async (request) => {
    const user = await requireUser(request, database);
    const rows = await database
      .selectFrom("LiveTournamentFighter as Fighter")
      .innerJoin("LiveTournament as Tournament", "Tournament.id", "Fighter.tournamentId")
      .select([
        "Tournament.id as id",
        "Tournament.name as name",
        "Fighter.id as fighterId",
        "Fighter.name as fighterName",
      ])
      .where("Fighter.userId", "=", user.id)
      .where("Fighter.active", "=", 1)
      .where("Fighter.ambiguous", "=", 0)
      .orderBy("Tournament.createdAt", "desc")
      .orderBy("Tournament.name")
      .execute();
    return { tournaments: rows };
  });

  app.get("/api/v1/live-tournaments/:id/fighter-view", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    const fighter = await database
      .selectFrom("LiveTournamentFighter")
      .select(["id", "name"])
      .where("tournamentId", "=", tournamentId)
      .where("userId", "=", user.id)
      .where("active", "=", 1)
      .where("ambiguous", "=", 0)
      .executeTakeFirst();
    if (!fighter) throw new HttpError(404, "Tournament fighter not found.");
    const tournament = await database
      .selectFrom("LiveTournament")
      .select(["id", "name"])
      .where("id", "=", tournamentId)
      .executeTakeFirst();
    if (!tournament) throw new HttpError(404, "Tournament not found.");

    const rings = await database
      .selectFrom("LiveRing")
      .select(["id", "name", "order"])
      .where("tournamentId", "=", tournamentId)
      .orderBy("order")
      .execute();
    const bouts = (await Promise.all(rings.map(async (ring) =>
      (await ringBouts(database, ring.id, app.now())).map((bout) => ({ ...bout, ringName: ring.name })),
    ))).flat();
    const onDeck = new Set(
      rings.flatMap((ring) => bouts.find((bout) => bout.ringId === ring.id && bout.status === "PENDING")?.id ?? []),
    );
    const fighterBouts = bouts.filter((bout) => bout.fighterLeftId === fighter.id || bout.fighterRightId === fighter.id);
    const schedule = fighterBouts.map((bout) => ({
      ...fighterBoutView(bout),
      mySide: bout.fighterLeftId === fighter.id ? "LEFT" as const : "RIGHT" as const,
      isOnDeck: onDeck.has(bout.id),
    }));
    const groups = new Map<string, typeof bouts>();
    for (const bout of bouts) {
      const group = groups.get(bout.sheetName) ?? [];
      group.push(bout);
      groups.set(bout.sheetName, group);
    }

    return {
      tournament,
      fighter,
      schedule,
      pools: [...groups.entries()].map(([name, poolBouts]) => ({
        name,
        bouts: poolBouts.sort((left, right) => left.order - right.order).map(fighterBoutView),
      })),
    };
  });

  // The ring rules (match parameters and bout format). Stored as sent after checking; read back leniently (`parseRingRules`).
  app.put("/api/v1/live-tournaments/:id/rules", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const body = ensureObject(request.body, "Rules");
    const rules = rulesOf(JSON.stringify(body));
    await database.updateTable("LiveTournament").set({ ruleset: JSON.stringify(rules) }).where("id", "=", tournamentId).execute();
    return { rules };
  });

  app.get("/api/v1/live-tournaments/:id", async (request) => {
    await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    const tournament = await database.selectFrom("LiveTournament").selectAll().where("id", "=", tournamentId).executeTakeFirst();
    if (!tournament) throw new HttpError(404, "Tournament not found.");
    const rings = await database
      .selectFrom("LiveRing")
      .select(["id", "name", "order"])
      .where("tournamentId", "=", tournamentId)
      .orderBy("order")
      .execute();
    const bouts = await database
      .selectFrom("LiveBout")
      .selectAll()
      .where("tournamentId", "=", tournamentId)
      .orderBy("ringId")
      .orderBy("order")
      .execute();
    // Same shape as GET /live-rings/:id/bouts: { left, right, doubles } from the active exchanges, null when unscored.
    const scores = await boutScores(database, bouts.map((bout) => bout.id));
    const { ruleset, ...rest } = tournament;
    return {
      ...rest,
      rules: rulesOf(ruleset),
      rings,
      bouts: bouts.map((bout) => ({ ...bout, score: scores.get(bout.id) ?? null })),
    };
  });
}

function fighterBoutView(bout: Awaited<ReturnType<typeof ringBouts>>[number] & { ringName: string }) {
  const { fighterLeftId: _fighterLeftId, fighterRightId: _fighterRightId, ...visible } = bout;
  return {
    id: visible.id,
    label: visible.label,
    sheetName: visible.sheetName,
    order: visible.order,
    status: visible.status,
    fighterLeft: visible.fighterLeft,
    fighterRight: visible.fighterRight,
    ringName: bout.ringName,
    score: visible.score,
    display: visible.display,
  };
}

function fighterNameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export async function requireTournamentAdmin(database: DbExecutor, tournamentId: string, user: AccessUser): Promise<void> {
  const tournament = await database
    .selectFrom("LiveTournament")
    .select(["createdByUserId", "mode", "sourceTournamentId"])
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  if (!tournament) throw new HttpError(404, "Tournament not found.");
  if (tournament.mode === "DATABASE" && tournament.sourceTournamentId !== null) {
    if (!(await isEventTournamentAdmin(database, tournament.sourceTournamentId, user))) {
      throw new HttpError(403, "Tournament admin access required.");
    }
    return;
  }
  if (user.role !== "SYSTEM_ADMIN" && tournament.createdByUserId !== user.id) {
    throw new HttpError(403, "Only the creator of the tournament or a system admin can do this.");
  }
}

async function requireSheetTournament(database: DbExecutor, tournamentId: string): Promise<void> {
  const tournament = await database
    .selectFrom("LiveTournament")
    .select("mode")
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  if (!tournament) throw new HttpError(404, "Tournament not found.");
  if (tournament.mode !== "SHEET") {
    throw new HttpError(409, "Spreadsheet imports and backups are unavailable for database-mode tournaments.");
  }
}

/**
 * The upload is staged as a tmp file first, the sheet is read with no transaction open, and only the
 * database writes run in the transaction. The same transaction queues a sync for every bout that has exchanges,
 * so their results are written into the new base file. After the commit the tmp file replaces backup.xlsx.
 *
 * The worker can't write those jobs into the old file in between: the caller holds the tournament lock until
 * after the rename, and the worker writes the backup only under that lock.
 */
async function importUpload(database: Kysely<BackendDatabase>, tournamentId: string, source: XlsxCellSource, bytes: Buffer) {
  const file = backupPath(tournamentId);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(tmp, bytes);
  let report;
  try {
    const plan = await readSchedulePlan(source, await tournamentLayout(database, tournamentId));
    report = await database.transaction().execute(async (trx) => {
      const applied = await applySchedulePlan(trx, tournamentId, plan);
      const withExchanges = await trx
        .selectFrom("LiveBout")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .where((eb) => eb.exists(eb.selectFrom("LiveExchange").select("LiveExchange.id").whereRef("LiveExchange.boutId", "=", "LiveBout.id")))
        .execute();
      for (const bout of withExchanges) await enqueueSync(trx, tournamentId, bout.id);
      return applied;
    });
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
  try {
    await rename(tmp, file);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    throw new HttpError(500, `The schedule was imported, but the backup file was not replaced: ${reason}`);
  }
  return report;
}

export type SyncTargetState = "OK" | "ERROR" | "NOT_CONFIGURED" | "NO_SPREADSHEET" | "NO_BACKUP_FILE";

export interface SyncTargetStatus {
  target: LiveTarget;
  state: SyncTargetState;
  lastSuccessAt: string | null;
  /** Only an error that still applies: newer than the last success, or a job is FAILED. */
  lastError: string | null;
  lastErrorAt: string | null;
  pending: number;
  failed: number;
}

/** Both targets, always: the local backup file and the Google spreadsheet. */
async function syncStatus(database: Kysely<BackendDatabase>, tournamentId: string): Promise<SyncTargetStatus[]> {
  const tournament = await database
    .selectFrom("LiveTournament")
    .select("googleSpreadsheetId")
    .where("id", "=", tournamentId)
    .executeTakeFirstOrThrow();
  const states = await database.selectFrom("LiveSyncState").selectAll().where("tournamentId", "=", tournamentId).execute();
  const jobs = await database
    .selectFrom("LiveSyncJob")
    .select(["target", "status", "lastError"])
    .where("tournamentId", "=", tournamentId)
    .where("status", "in", ["PENDING", "FAILED"])
    .execute();
  const backupExists = await access(backupPath(tournamentId)).then(
    () => true,
    () => false,
  );

  return (["LOCAL", "GOOGLE"] as const).map((target) => {
    const state = states.find((row) => row.target === target);
    const own = jobs.filter((job) => job.target === target);
    const pending = own.filter((job) => job.status === "PENDING").length;
    const failedJobs = own.filter((job) => job.status === "FAILED");
    const lastSuccessAt = state?.lastSuccessAt ?? null;
    const stateErrorIsCurrent = state?.lastErrorAt != null && (lastSuccessAt === null || state.lastErrorAt > lastSuccessAt);
    const errorIsCurrent = failedJobs.length > 0 || stateErrorIsCurrent;
    // The state's error only while it is newer than the last success; otherwise a FAILED job's own message.
    const lastError = stateErrorIsCurrent ? (state?.lastError ?? null) : (failedJobs[0]?.lastError ?? null);

    // FAILED jobs always win: the state is ERROR with their message, even if the target is also not configured,
    // has no spreadsheet or has no backup file.
    let targetState: SyncTargetState = errorIsCurrent ? "ERROR" : "OK";
    let shownError = errorIsCurrent ? lastError : null;
    if (failedJobs.length === 0) {
      if (target === "GOOGLE" && !tournament.googleSpreadsheetId) targetState = "NO_SPREADSHEET";
      else if (target === "GOOGLE" && !googleCredentials()) targetState = "NOT_CONFIGURED";
      else if (target === "LOCAL" && !backupExists) targetState = "NO_BACKUP_FILE";
      if (targetState !== "OK" && targetState !== "ERROR") shownError = null;
    }
    // A hidden error hides its time too (and a FAILED job message has no state time).
    const lastErrorAt = shownError !== null && stateErrorIsCurrent ? (state?.lastErrorAt ?? null) : null;
    return { target, state: targetState, lastSuccessAt, lastError: shownError, lastErrorAt, pending, failed: failedJobs.length };
  });
}

import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam, type AccessUser } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, LiveTarget } from "../db.js";
import { ensureObject, HttpError, optionalString, requireString } from "../http.js";
import { boutScores } from "./bout-routes.js";
import { XlsxCellSource } from "./cell-source.js";
import { backupPath } from "./data-dir.js";
import { GoogleCellSource, GoogleError, googleCredentials, sharedGoogleApi } from "./google-sheets.js";
import { applySchedulePlan, readSchedulePlan, tournamentLayout } from "./import.js";
import { enqueueSync } from "./live-store.js";
import { activeKeeperOf, publicRing } from "./ring-keeper.js";
import { withTournamentLock } from "./tournament-lock.js";

const IMPORT_BODY_LIMIT = 20 * 1024 * 1024;

export function registerLiveRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  // Encapsulated: the raw-body parser (and its route limit) applies to the live routes only.
  void app.register(async (scope) => registerLiveRoutesInScope(scope, database));
}

function registerLiveRoutesInScope(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
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
    return { targets: await syncStatus(database, tournamentId) };
  });

  // The ring links (with their secret keeper tokens) for the laptop person: tournament creator or system admin only.
  app.get("/api/v1/live-tournaments/:id/rings", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const rings = await database.selectFrom("LiveRing").selectAll().where("tournamentId", "=", tournamentId).orderBy("order").execute();
    return {
      rings: await Promise.all(
        rings.map(async (ring) => ({ ...publicRing(ring), keeperToken: ring.keeperToken, activeKeeper: await activeKeeperOf(database, ring) })),
      ),
    };
  });

  app.get("/api/v1/live-tournaments/:id/backup.xlsx", async (request, reply) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
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
    return {
      ...tournament,
      rings,
      bouts: bouts.map((bout) => ({ ...bout, score: scores.get(bout.id) ?? null })),
    };
  });
}

export async function requireTournamentAdmin(database: Kysely<BackendDatabase>, tournamentId: string, user: AccessUser): Promise<void> {
  const tournament = await database
    .selectFrom("LiveTournament")
    .select("createdByUserId")
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  if (!tournament) throw new HttpError(404, "Tournament not found.");
  if (user.role !== "SYSTEM_ADMIN" && tournament.createdByUserId !== user.id) {
    throw new HttpError(403, "Only the creator of the tournament or a system admin can do this.");
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

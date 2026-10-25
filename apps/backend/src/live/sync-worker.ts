import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { Kysely } from "kysely";
import type { BackendDatabase, DbExecutor, LiveTarget } from "../db.js";
import { GoogleCellSink, GoogleError, scrubSecrets, sharedGoogleApi } from "./google-sheets.js";
import { isWholeTargetError } from "./sync-errors.js";
import { tournamentLayout } from "./import.js";
import { backupPath, liveDataDir } from "./data-dir.js";
import { activeExchanges } from "./live-store.js";
import { exchangeRangeWrites, type CellWrite } from "./sheet-layout.js";
import { withTournamentLock } from "./tournament-lock.js";
import { XlsxFileSink, type CellSink } from "./xlsx-sink.js";

/** The sink for a tournament's target, or null when that target can't be written (the job is left as it is). */
export type SinkFactory = (tournamentId: string, target: LiveTarget) => CellSink | null;

export interface SyncWorkerOptions {
  intervalMs?: number;
  sinks?: SinkFactory;
  now?: () => Date;
}

export const SYNC_INTERVAL_MS = 2_000;
const BACKOFF_MS = [5_000, 15_000, 60_000];
const MAX_ERROR_LENGTH = 500;
const STALE_TMP = /^backup\.xlsx\..+\.tmp$/;

/** Wait before the next try, after the given number of failed attempts (1 = first failure): 5 s, 15 s, then 60 s. */
export function backoffMs(failedAttempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(failedAttempts, 1), BACKOFF_MS.length) - 1]!;
}

/**
 * LOCAL writes the tournament's backup.xlsx. GOOGLE writes the tournament's spreadsheet, and is skipped (jobs stay
 * pending; the status shows NOT_CONFIGURED) when the service account is not configured.
 */
export function createDefaultSinks(db: Kysely<BackendDatabase>, env: NodeJS.ProcessEnv = process.env): SinkFactory {
  return (tournamentId, target) => {
    if (target === "LOCAL") return new XlsxFileSink(backupPath(tournamentId));
    const api = sharedGoogleApi(env);
    if (!api) return null;
    return {
      async write(writes) {
        const tournament = await db
          .selectFrom("LiveTournament")
          .select("googleSpreadsheetId")
          .where("id", "=", tournamentId)
          .executeTakeFirst();
        if (!tournament?.googleSpreadsheetId) throw new GoogleError("The tournament has no Google spreadsheet.", true);
        await new GoogleCellSink(tournament.googleSpreadsheetId, api).write(writes);
      },
    };
  };
}

interface DueJob {
  id: string;
  tournamentId: string;
  boutId: string;
  target: LiveTarget;
  attempts: number;
  updatedAt: string;
}

/** A job whose cells are ready to write, with what it was built from (for the compare-and-set). */
interface PreparedJob {
  job: DueJob;
  writes: CellWrite[];
  exchangeIds: string[];
}

/**
 * Runs every due PENDING job once. Jobs of one tournament and target are written together (one load and save of
 * the backup file). A job is only marked DONE, FAILED or backed off if nobody re-queued it while it was written:
 * its `updatedAt` and its bout's active exchanges must still be what the worker read. Otherwise it stays PENDING
 * and runs again.
 */
export async function runSyncOnce(
  db: Kysely<BackendDatabase>,
  sinks: SinkFactory,
  now: Date,
): Promise<{ done: number; failed: number }> {
  const due = await db
    .selectFrom("LiveSyncJob")
    .select(["id", "tournamentId", "boutId", "target", "attempts", "updatedAt"])
    .where("status", "=", "PENDING")
    .where("nextAttemptAt", "<=", now.toISOString())
    .orderBy("tournamentId")
    .orderBy("target")
    .execute();

  const groups = new Map<string, DueJob[]>();
  for (const job of due) {
    const key = `${job.tournamentId}\u0000${job.target}`;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  // Every LOCAL group first: a slow or hanging Google (up to its timeout per call) must not delay the local backup.
  const ordered = [...groups.values()].sort((a, b) => targetRank(a[0]!.target) - targetRank(b[0]!.target));
  const totals = { done: 0, failed: 0 };
  for (const jobs of ordered) {
    const { tournamentId, target } = jobs[0]!;
    const sink = sinks(tournamentId, target);
    if (!sink) continue;
    const result = await syncGroup(db, sink, tournamentId, target, jobs, now);
    totals.done += result.done;
    totals.failed += result.failed;
  }
  return totals;
}

function targetRank(target: LiveTarget): number {
  return target === "LOCAL" ? 0 : 1;
}

async function syncGroup(
  db: Kysely<BackendDatabase>,
  sink: CellSink,
  tournamentId: string,
  target: LiveTarget,
  jobs: DueJob[],
  now: Date,
): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  const prepared: PreparedJob[] = [];

  try {
    const layout = await tournamentLayout(db, tournamentId);
    for (const job of jobs) {
      const bout = await db
        .selectFrom("LiveBout")
        .select(["sheetName", "headerCell"])
        .where("id", "=", job.boutId)
        .executeTakeFirstOrThrow();
      const exchanges = await activeExchanges(db, job.boutId);
      const exchangeIds = exchanges.map((exchange) => exchange.id);
      const range = exchangeRangeWrites(
        layout,
        bout.sheetName,
        bout.headerCell,
        exchanges.map((exchange) => ({ ...exchange, isDouble: exchange.isDouble === 1 })),
      );
      if ("error" in range) {
        const message = `RANGE_OVERFLOW: the bout has ${exchanges.length} exchanges, the sheet holds ${layout.maxExchanges}.`;
        if (await finishJob(db, job, exchangeIds, { status: "FAILED", lastError: message }, now)) failed += 1;
        await recordError(db, tournamentId, target, message, now);
        continue;
      }
      prepared.push({ job, writes: range.writes, exchangeIds });
    }
  } catch (error) {
    // Could not even build the writes (for example the layout is unknown): back off every job of the group.
    return { done, failed: failed + (await backOff(db, jobs.map((job) => ({ job, exchangeIds: null })), error, tournamentId, target, now)) };
  }
  if (prepared.length === 0) return { done, failed };

  const batch = await writeAndFinish(db, sink, tournamentId, target, prepared, now);
  return { done: done + batch.done, failed: failed + batch.failed };
}

/**
 * One write for all the entries. If it fails and there was more than one bout, each bout is tried on its own,
 * so one bad bout (for example a sheet missing from the file) does not hold back the rest of the tournament.
 */
async function writeAndFinish(
  db: Kysely<BackendDatabase>,
  sink: CellSink,
  tournamentId: string,
  target: LiveTarget,
  entries: PreparedJob[],
  now: Date,
): Promise<{ done: number; failed: number }> {
  const writes = entries.flatMap((entry) => entry.writes);
  try {
    // The backup file is read-modify-written: never while an import is replacing it.
    if (target === "LOCAL") await withTournamentLock(tournamentId, () => sink.write(writes));
    else await sink.write(writes);
  } catch (error) {
    // A problem with the whole target (file locked or missing, Google down) backs off the batch once. Trying
    // every bout alone would only repeat N full load/save cycles or N failing calls.
    if (entries.length === 1 || isWholeTargetError(error)) return { done: 0, failed: await backOff(db, entries, error, tournamentId, target, now) };
    const totals = { done: 0, failed: 0 };
    for (const entry of entries) {
      const single = await writeAndFinish(db, sink, tournamentId, target, [entry], now);
      totals.done += single.done;
      totals.failed += single.failed;
    }
    return totals;
  }

  let done = 0;
  for (const entry of entries) {
    if (await finishJob(db, entry.job, entry.exchangeIds, { status: "DONE", lastError: null, attempts: 0 }, now)) done += 1;
  }
  await db
    .insertInto("LiveSyncState")
    .values({ tournamentId, target, lastSuccessAt: now.toISOString(), lastError: null, lastErrorAt: null })
    .onConflict((conflict) => conflict.columns(["tournamentId", "target"]).doUpdateSet({ lastSuccessAt: now.toISOString() }))
    .execute();
  return { done, failed: 0 };
}

async function backOff(
  db: Kysely<BackendDatabase>,
  entries: { job: DueJob; exchangeIds: string[] | null }[],
  error: unknown,
  tournamentId: string,
  target: LiveTarget,
  now: Date,
): Promise<number> {
  const message = errorMessage(error);
  let failed = 0;
  for (const { job, exchangeIds } of entries) {
    const attempts = job.attempts + 1;
    const nextAttemptAt = new Date(now.getTime() + backoffMs(attempts)).toISOString();
    if (await finishJob(db, job, exchangeIds, { status: "PENDING", attempts, nextAttemptAt, lastError: message }, now)) failed += 1;
  }
  await recordError(db, tournamentId, target, message, now);
  return failed;
}

/**
 * Compare-and-set: applies `changes` only if the job was not re-queued since it was read (same `updatedAt`) and,
 * when given, the bout's active exchanges are still the ones that were written. The second check catches a
 * re-queue in the same millisecond, which `updatedAt` alone can't see. Returns whether the job was updated.
 */
async function finishJob(
  db: Kysely<BackendDatabase>,
  job: DueJob,
  exchangeIds: string[] | null,
  changes: { status: "DONE" | "FAILED" | "PENDING"; lastError: string | null; attempts?: number; nextAttemptAt?: string },
  now: Date,
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    if (exchangeIds && !sameIds(exchangeIds, await currentExchangeIds(trx, job.boutId))) return false;
    const result = await trx
      .updateTable("LiveSyncJob")
      .set({ ...changes, updatedAt: now.toISOString() })
      .where("id", "=", job.id)
      .where("updatedAt", "=", job.updatedAt)
      .where("status", "=", "PENDING")
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  });
}

async function currentExchangeIds(db: DbExecutor, boutId: string): Promise<string[]> {
  return (await activeExchanges(db, boutId)).map((exchange) => exchange.id);
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

async function recordError(db: Kysely<BackendDatabase>, tournamentId: string, target: LiveTarget, message: string, now: Date) {
  const at = now.toISOString();
  await db
    .insertInto("LiveSyncState")
    .values({ tournamentId, target, lastSuccessAt: null, lastError: message, lastErrorAt: at })
    .onConflict((conflict) => conflict.columns(["tournamentId", "target"]).doUpdateSet({ lastError: message, lastErrorAt: at }))
    .execute();
}

function errorMessage(error: unknown): string {
  const message = scrubSecrets(error instanceof Error ? error.message : String(error));
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}

/**
 * Run once when the worker starts. Jobs live in the database and survive a restart, so nothing is re-queued:
 * an import queues its syncs in its own transaction. Pending jobs that were backed off become due now (the
 * problem may be gone after a restart); their attempts and `updatedAt` are kept. Also removes
 * `backup.xlsx.*.tmp` files left behind by a crash during an import or a file write.
 */
export async function recoverSyncJobs(
  db: Kysely<BackendDatabase>,
  now: Date,
  dataDir: string = liveDataDir(),
): Promise<void> {
  await db
    .updateTable("LiveSyncJob")
    .set({ nextAttemptAt: now.toISOString() })
    .where("status", "=", "PENDING")
    .where("nextAttemptAt", ">", now.toISOString())
    .execute();

  const tournamentDirs = await readdir(dataDir, { withFileTypes: true }).catch(() => []);
  for (const dir of tournamentDirs) {
    if (!dir.isDirectory()) continue;
    await withTournamentLock(dir.name, async () => {
      const folder = path.join(dataDir, dir.name);
      for (const name of await readdir(folder).catch(() => [] as string[])) {
        if (STALE_TMP.test(name)) await unlink(path.join(folder, name)).catch(() => undefined);
      }
    });
  }
}

/** Starts the background sync: recovery once, then `runSyncOnce` every 2 s (never two runs at once). Returns stop. */
export function startSyncWorker(db: Kysely<BackendDatabase>, opts: SyncWorkerOptions = {}): () => void {
  const sinks = opts.sinks ?? createDefaultSinks(db);
  const now = opts.now ?? (() => new Date());
  let stopped = false;
  let running = false;
  const report = (error: unknown) => {
    if (!stopped) console.error("Sheet sync failed:", errorMessage(error));
  };
  const recovered = recoverSyncJobs(db, now()).catch(report);

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await recovered;
      if (!stopped) await runSyncOnce(db, sinks, now());
    } catch (error) {
      report(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), opts.intervalMs ?? SYNC_INTERVAL_MS);
  timer.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

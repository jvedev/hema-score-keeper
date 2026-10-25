import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor, LiveTarget } from "../db.js";

export type LiveExchangeRow = Selectable<BackendDatabase["LiveExchange"]>;

/** The exchanges that count for a bout (not undone), in the order they were scored. */
export async function activeExchanges(db: DbExecutor, boutId: string): Promise<LiveExchangeRow[]> {
  return db
    .selectFrom("LiveExchange")
    .selectAll()
    .where("boutId", "=", boutId)
    .where("undoneAt", "is", null)
    .orderBy("seq")
    .execute();
}

/**
 * Marks a bout as needing a sheet write. One coalesced job per bout per target: a repeat resets the
 * existing job to PENDING, due now, with attempts back at 0. GOOGLE is queued only when the tournament has a spreadsheet.
 *
 * Call this inside the same transaction as the write that triggers it, so the exchange change and both
 * jobs (LOCAL and GOOGLE) commit or roll back together.
 */
export async function enqueueSync(db: DbExecutor, tournamentId: string, boutId: string, now: Date = new Date()): Promise<void> {
  const tournament = await db
    .selectFrom("LiveTournament")
    .select("googleSpreadsheetId")
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  const targets: LiveTarget[] = ["LOCAL"];
  if (tournament?.googleSpreadsheetId) {
    targets.push("GOOGLE");
  }
  const timestamp = now.toISOString();
  for (const target of targets) {
    await db
      .insertInto("LiveSyncJob")
      .values({
        id: randomUUID(),
        tournamentId,
        boutId,
        target,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: timestamp,
        lastError: null,
        updatedAt: timestamp,
      })
      .onConflict((conflict) =>
        conflict.columns(["boutId", "target"]).doUpdateSet({
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: timestamp,
          updatedAt: timestamp,
        }),
      )
      .execute();
  }
}

import { settleBout, type BoutLifecycle, type BoutStatus } from "@hema/competition-domain";
import type { Selectable, Updateable } from "kysely";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { HttpError } from "../http.js";

export type BoutRow = Selectable<BackendDatabase["Bout"]>;

type LifecycleColumns = Required<
  Pick<
    Updateable<BackendDatabase["Bout"]>,
    "status" | "revision" | "windowStartedAt" | "fighterApprovedA" | "fighterApprovedB" | "objectionBy" | "objectionAt" | "voidReason"
  >
>;

export function toLifecycle(row: BoutRow): BoutLifecycle {
  return {
    status: row.status as BoutStatus,
    revision: row.revision,
    windowStartedAt: row.windowStartedAt,
    fighterApproved: { A: row.fighterApprovedA === 1, B: row.fighterApprovedB === 1 },
    objection: row.objectionBy !== null && row.objectionAt !== null ? { by: row.objectionBy, at: row.objectionAt } : null,
    voidReason: row.voidReason,
  };
}

export function lifecycleColumns(lifecycle: BoutLifecycle): LifecycleColumns {
  return {
    status: lifecycle.status,
    revision: lifecycle.revision,
    windowStartedAt: lifecycle.windowStartedAt,
    fighterApprovedA: lifecycle.fighterApproved.A ? 1 : 0,
    fighterApprovedB: lifecycle.fighterApproved.B ? 1 : 0,
    objectionBy: lifecycle.objection?.by ?? null,
    objectionAt: lifecycle.objection?.at ?? null,
    voidReason: lifecycle.voidReason,
  };
}

/** Loads a bout without settling it, for actions whose own rules check the objection window. */
export async function loadUnsettledBout(executor: DbExecutor, id: string): Promise<BoutRow> {
  const row = await executor.selectFrom("Bout").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) {
    throw new HttpError(404, `Bout "${id}" not found.`);
  }
  return row;
}

/** Loads a bout and, when its objection window has passed, makes it final first (there is no scheduler). */
export async function loadBout(executor: DbExecutor, id: string, now: Date): Promise<BoutRow> {
  const row = await loadUnsettledBout(executor, id);
  const settled = settleBout(toLifecycle(row), now);
  if (settled.status === row.status) {
    return row;
  }
  await saveLifecycle(executor, id, settled);
  return { ...row, ...lifecycleColumns(settled) };
}

export async function saveLifecycle(executor: DbExecutor, id: string, lifecycle: BoutLifecycle): Promise<void> {
  await executor.updateTable("Bout").set(lifecycleColumns(lifecycle)).where("id", "=", id).execute();
}

export async function boutCompetitionIds(executor: DbExecutor, boutId: string): Promise<string[]> {
  const rows = await executor
    .selectFrom("BoutCompetition")
    .select("competitionId")
    .where("boutId", "=", boutId)
    .orderBy("competitionId")
    .execute();
  return rows.map((row) => row.competitionId);
}

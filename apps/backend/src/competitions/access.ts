import type { AccessUser } from "../access-user.js";
import type { DbExecutor } from "../db.js";
import { HttpError } from "../http.js";

export type CompetitionAdminRole = "OWNER" | "CO_ADMIN";

/** The caller's role on one competition: their admin row, SYSTEM_ADMIN for system admins, or null. */
export async function competitionAdminRole(
  executor: DbExecutor,
  user: AccessUser,
  competitionId: string,
): Promise<CompetitionAdminRole | "SYSTEM_ADMIN" | null> {
  if (user.role === "SYSTEM_ADMIN") {
    return "SYSTEM_ADMIN";
  }
  const row = await executor
    .selectFrom("CompetitionAdmin")
    .select("role")
    .where("competitionId", "=", competitionId)
    .where("userId", "=", user.id)
    .executeTakeFirst();
  return row?.role ?? null;
}

export async function requireCompetitionAdmin(
  executor: DbExecutor,
  user: AccessUser,
  competitionId: string,
): Promise<CompetitionAdminRole | "SYSTEM_ADMIN"> {
  const role = await competitionAdminRole(executor, user, competitionId);
  if (role === null) {
    throw new HttpError(403, "You don't manage this competition.");
  }
  return role;
}

export async function listManagedCompetitionIds(executor: DbExecutor, user: AccessUser): Promise<string[] | "ALL"> {
  if (user.role === "SYSTEM_ADMIN") {
    return "ALL";
  }
  const rows = await executor.selectFrom("CompetitionAdmin").select("competitionId").where("userId", "=", user.id).execute();
  return rows.map((row) => row.competitionId);
}

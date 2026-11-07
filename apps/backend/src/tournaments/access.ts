import type { DbExecutor } from "../db.js";
import type { AccessUser } from "../access-user.js";
import { HttpError } from "../http.js";

export async function isEventTournamentAdmin(
  executor: DbExecutor,
  tournamentId: string,
  user: AccessUser,
): Promise<boolean> {
  if (user.role === "SYSTEM_ADMIN") {
    return true;
  }
  const membership = await executor
    .selectFrom("TournamentAdmin")
    .select("userId")
    .where("tournamentId", "=", tournamentId)
    .where("userId", "=", user.id)
    .executeTakeFirst();
  return membership !== undefined;
}

export async function requireEventTournamentAdmin(
  executor: DbExecutor,
  tournamentId: string,
  user: AccessUser,
): Promise<void> {
  const tournament = await executor
    .selectFrom("Tournament")
    .select("id")
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  if (!tournament) {
    throw new HttpError(404, "Tournament not found.");
  }
  if (!(await isEventTournamentAdmin(executor, tournamentId, user))) {
    throw new HttpError(403, "Tournament admin access required.");
  }
}

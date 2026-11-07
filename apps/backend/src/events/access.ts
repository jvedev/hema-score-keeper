import type { DbExecutor } from "../db.js";
import type { AccessUser } from "../access-user.js";
import { HttpError } from "../http.js";
import { isEventTournamentAdmin } from "../tournaments/access.js";

export async function isEventAdmin(
  executor: DbExecutor,
  eventId: string,
  user: AccessUser,
): Promise<boolean> {
  if (user.role === "SYSTEM_ADMIN") {
    return true;
  }
  const membership = await executor
    .selectFrom("EventAdmin")
    .select("userId")
    .where("eventId", "=", eventId)
    .where("userId", "=", user.id)
    .executeTakeFirst();
  return membership !== undefined;
}

export async function requireEventAdmin(
  executor: DbExecutor,
  eventId: string,
  user: AccessUser,
): Promise<void> {
  const event = await executor
    .selectFrom("Event")
    .select("id")
    .where("id", "=", eventId)
    .executeTakeFirst();
  if (!event) {
    throw new HttpError(404, "Event not found.");
  }
  if (!(await isEventAdmin(executor, eventId, user))) {
    throw new HttpError(403, "Event admin access required.");
  }
}

export async function requireEventOrTournamentAdmin(
  executor: DbExecutor,
  tournamentId: string,
  user: AccessUser,
): Promise<void> {
  const tournament = await executor
    .selectFrom("Tournament")
    .select(["id", "eventId"])
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  if (!tournament) {
    throw new HttpError(404, "Tournament not found.");
  }
  if (
    !(await isEventAdmin(executor, tournament.eventId, user))
    && !(await isEventTournamentAdmin(executor, tournamentId, user))
  ) {
    throw new HttpError(403, "Event or tournament admin access required.");
  }
}

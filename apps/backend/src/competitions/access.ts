import type { AccessUser } from "../access-user.js";
import type { DbExecutor } from "../db.js";
import { HttpError } from "../http.js";

interface VisibilityFacts {
  id: string;
  visibility: string;
  clubId: string | null;
}

/** The rules that need no lookup: everyone when public, otherwise signed-in admins and members of its club. */
function visibleWithoutParticipation(user: AccessUser | null, competition: VisibilityFacts): boolean {
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

/**
 * Who may see a competition: everyone when public, otherwise signed-in admins, members of its club and
 * anyone with a participant row in it (in any status), such as an outsider who joined through an invite.
 */
export async function canAccessCompetition(executor: DbExecutor, user: AccessUser | null, competition: VisibilityFacts): Promise<boolean> {
  if (visibleWithoutParticipation(user, competition)) {
    return true;
  }
  if (!user) {
    return false;
  }
  const row = await executor
    .selectFrom("CompetitionParticipant")
    .select("id")
    .where("competitionId", "=", competition.id)
    .where("userId", "=", user.id)
    .executeTakeFirst();
  return row !== undefined;
}

/** `canAccessCompetition` for many competitions at once: one lookup of the user's participant rows. */
export async function competitionAccessFilter(
  executor: DbExecutor,
  user: AccessUser | null,
): Promise<(competition: VisibilityFacts) => boolean> {
  const participating = new Set(
    user === null
      ? []
      : (await executor.selectFrom("CompetitionParticipant").select("competitionId").where("userId", "=", user.id).execute()).map(
          (row) => row.competitionId,
        ),
  );
  return (competition) => visibleWithoutParticipation(user, competition) || participating.has(competition.id);
}

/** 404 unless `user` may see the competition: a competition you may not see doesn't exist for you. */
export async function requireCompetitionAccess(executor: DbExecutor, user: AccessUser | null, competition: VisibilityFacts): Promise<void> {
  if (!(await canAccessCompetition(executor, user, competition))) {
    throw new HttpError(404, `Competition "${competition.id}" not found.`);
  }
}

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

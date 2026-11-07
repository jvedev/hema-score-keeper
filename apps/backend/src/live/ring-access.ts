import type { AccessUser } from "../access-user.js";
import type { DbExecutor } from "../db.js";
import { HttpError } from "../http.js";
import { isEventTournamentAdmin } from "../tournaments/access.js";

const SCORING_ROLES = ["TABLE", "JUDGE", "JURY"] as const;

export async function requireLiveRingAccess(
  executor: DbExecutor,
  ringId: string,
  user: AccessUser,
  scheduledPhaseId?: string | null,
): Promise<string[] | null> {
  const ring = await executor
    .selectFrom("LiveRing")
    .innerJoin("LiveTournament", "LiveTournament.id", "LiveRing.tournamentId")
    .select([
      "LiveRing.id",
      "LiveRing.sourceArenaId",
      "LiveTournament.mode",
      "LiveTournament.sourceTournamentId",
    ])
    .where("LiveRing.id", "=", ringId)
    .executeTakeFirst();
  if (!ring) throw new HttpError(404, "Ring not found.");
  if (ring.mode === "SHEET") return null;
  if (!ring.sourceTournamentId || !ring.sourceArenaId) {
    throw new HttpError(409, "This database-mode ring is missing its source schedule.");
  }
  if (await isEventTournamentAdmin(executor, ring.sourceTournamentId, user)) return null;

  let assignments = executor
    .selectFrom("ScheduledAssignment")
    .innerJoin("ScheduledPhase", "ScheduledPhase.id", "ScheduledAssignment.scheduledPhaseId")
    .innerJoin("Stage", "Stage.id", "ScheduledPhase.stageId")
    .select("ScheduledPhase.id as scheduledPhaseId")
    .where("ScheduledAssignment.userId", "=", user.id)
    .where("ScheduledAssignment.role", "in", [...SCORING_ROLES])
    .where("ScheduledPhase.arenaId", "=", ring.sourceArenaId)
    .where("Stage.tournamentId", "=", ring.sourceTournamentId);

  if (scheduledPhaseId !== undefined) {
    if (scheduledPhaseId === null) throw new HttpError(403, "Scoring access for this bout is not assigned.");
    assignments = assignments.where("ScheduledPhase.id", "=", scheduledPhaseId);
  }

  const rows = await assignments.execute();
  if (rows.length === 0) {
    throw new HttpError(403, "Scoring access for this ring is not assigned.");
  }
  return [...new Set(rows.map((row) => row.scheduledPhaseId))];
}

import type { AccessUser } from "../access-user.js";
import type { DbExecutor } from "../db.js";
import { listManagedCompetitionIds } from "./access.js";

export interface ObjectionItem {
  boutId: string;
  competitionId: string;
  competitionName: string;
  fighterA: string;
  fighterB: string;
  scoreA: number;
  scoreB: number;
  objectedBy: "A" | "B";
  reason: string | null;
  objectedAt: string;
}

export interface AwaitingRefereeItem {
  boutId: string;
  competitionId: string;
  competitionName: string;
  fighterA: string;
  fighterB: string;
  scoreA: number;
  scoreB: number;
  refereeName: string;
  recordedAt: string;
}

export interface NeedsYou {
  objections: ObjectionItem[];
  awaitingReferee: AwaitingRefereeItem[];
}

/** Bouts in competitions this admin manages that wait for someone: open objections and missing referee approvals. */
export async function needsYou(executor: DbExecutor, user: AccessUser): Promise<NeedsYou> {
  const managed = await listManagedCompetitionIds(executor, user);
  if (managed !== "ALL" && managed.length === 0) {
    return { objections: [], awaitingReferee: [] };
  }

  let query = executor
    .selectFrom("Bout")
    .innerJoin("BoutCompetition", "BoutCompetition.boutId", "Bout.id")
    .innerJoin("Competition", "Competition.id", "BoutCompetition.competitionId")
    .innerJoin("User as FighterA", "FighterA.id", "Bout.fighterAUserId")
    .innerJoin("User as FighterB", "FighterB.id", "Bout.fighterBUserId")
    .innerJoin("User as Referee", "Referee.id", "Bout.refereeUserId")
    .select([
      "Bout.id as boutId",
      "Bout.status as status",
      "Bout.scoreA as scoreA",
      "Bout.scoreB as scoreB",
      "Bout.startedAt as startedAt",
      "Bout.objectionBy as objectionBy",
      "Bout.objectionAt as objectionAt",
      "Bout.objectionReason as objectionReason",
      "Competition.id as competitionId",
      "Competition.name as competitionName",
      "FighterA.name as fighterA",
      "FighterB.name as fighterB",
      "Referee.name as refereeName",
    ])
    .where("Bout.status", "in", ["OBJECTED", "SCORED"])
    .orderBy("Competition.name");
  if (managed !== "ALL") {
    query = query.where("BoutCompetition.competitionId", "in", managed);
  }
  const rows = await query.execute();

  // A bout can count in several competitions this admin manages; list it once.
  const seen = new Set<string>();
  const result: NeedsYou = { objections: [], awaitingReferee: [] };
  for (const row of rows) {
    if (seen.has(row.boutId)) {
      continue;
    }
    seen.add(row.boutId);
    const common = {
      boutId: row.boutId,
      competitionId: row.competitionId,
      competitionName: row.competitionName,
      fighterA: row.fighterA,
      fighterB: row.fighterB,
      scoreA: row.scoreA,
      scoreB: row.scoreB,
    };
    if (row.status === "OBJECTED" && row.objectionBy !== null && row.objectionAt !== null) {
      result.objections.push({ ...common, objectedBy: row.objectionBy, reason: row.objectionReason, objectedAt: row.objectionAt });
    } else if (row.status === "SCORED") {
      result.awaitingReferee.push({ ...common, refereeName: row.refereeName, recordedAt: row.startedAt });
    }
  }
  result.objections.sort((a, b) => a.objectedAt.localeCompare(b.objectedAt));
  result.awaitingReferee.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return result;
}

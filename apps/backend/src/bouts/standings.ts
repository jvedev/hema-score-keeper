import {
  boutCounts,
  buildParticipantRows,
  replayRatings,
  settleBout,
  type BoutStatus,
  type ParticipantRow,
  type RatingChange,
  type StatsBout,
} from "@hema/competition-domain";
import type { DbExecutor } from "../db.js";
import { toLifecycle } from "./bout-store.js";

export interface StandingRow extends ParticipantRow {
  name: string;
  clubId: string | null;
  userId: string | null;
}

export interface HistoryBout {
  id: string;
  source: "LEGACY" | "BOUT";
  foughtAt: string;
  fighterAParticipantId: string;
  fighterBParticipantId: string;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  status: BoutStatus;
  ratingChange: RatingChange | null;
  approvals: { referee: boolean; A: boolean; B: boolean };
  ring: string | null;
  startedInCompetitionId: string | null;
}

interface CompetitionBouts {
  participants: Array<{ id: string; name: string; clubId: string | null; userId: string | null }>;
  bouts: Array<StatsBout & Omit<HistoryBout, "ratingChange" | "fighterAParticipantId" | "fighterBParticipantId">>;
}

export async function competitionStandings(executor: DbExecutor, competitionId: string, now: Date): Promise<StandingRow[]> {
  const { participants, bouts } = await loadCompetitionBouts(executor, competitionId, now);
  const rows = buildParticipantRows(
    participants.map((participant) => participant.id),
    bouts,
    replayRatings(bouts),
  );
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  return rows.map((row) => {
    const participant = byId.get(row.participantId)!;
    return { ...row, name: participant.name, clubId: participant.clubId, userId: participant.userId };
  });
}

/** Newest first. */
export async function competitionBoutHistory(executor: DbExecutor, competitionId: string, now: Date): Promise<HistoryBout[]> {
  const { bouts } = await loadCompetitionBouts(executor, competitionId, now);
  const { changes } = replayRatings(bouts);
  return bouts
    .map((bout) => ({
      id: bout.id,
      source: bout.source,
      foughtAt: bout.foughtAt,
      fighterAParticipantId: bout.fighterAId,
      fighterBParticipantId: bout.fighterBId,
      scoreA: bout.scoreA,
      scoreB: bout.scoreB,
      winnerSide: bout.winnerSide,
      status: bout.status,
      ratingChange: changes.get(bout.id) ?? null,
      approvals: bout.approvals,
      ring: bout.ring,
      startedInCompetitionId: bout.startedInCompetitionId,
    }))
    .sort((a, b) => Date.parse(b.foughtAt) - Date.parse(a.foughtAt) || (a.id < b.id ? 1 : -1));
}

/**
 * Every bout that belongs to the competition, with fighters as this competition's participant ids:
 * legacy published CompetitionBout rows (always final) and new bouts linked through BoutCompetition.
 */
async function loadCompetitionBouts(executor: DbExecutor, competitionId: string, now: Date): Promise<CompetitionBouts> {
  const participants = await executor
    .selectFrom("CompetitionParticipant")
    .select(["id", "name", "clubId", "userId"])
    .where("competitionId", "=", competitionId)
    .orderBy("name")
    .execute();
  const participantByUser = new Map(
    participants.filter((participant) => participant.userId !== null).map((participant) => [participant.userId!, participant.id]),
  );

  const legacy = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("published", "=", 1)
    .execute();

  const linked = await executor
    .selectFrom("Bout")
    .innerJoin("BoutCompetition", "BoutCompetition.boutId", "Bout.id")
    .selectAll("Bout")
    .where("BoutCompetition.competitionId", "=", competitionId)
    .execute();

  const bouts: CompetitionBouts["bouts"] = legacy.map((row) => {
    const winnerSide = row.winnerParticipantId === null ? null : row.winnerParticipantId === row.fighterAId ? "A" : "B";
    return {
      id: row.id,
      source: "LEGACY",
      foughtAt: row.date,
      fighterAId: row.fighterAId,
      fighterBId: row.fighterBId,
      winnerId: row.winnerParticipantId,
      scoreA: row.scoreA,
      scoreB: row.scoreB,
      winnerSide,
      warningsA: 0,
      warningsB: 0,
      status: "FINAL",
      counts: true,
      // Legacy bouts were published by both sides before approvals existed.
      approvals: { referee: true, A: true, B: true },
      ring: null,
      startedInCompetitionId: row.competitionId,
    };
  });

  for (const row of linked) {
    const fighterAId = participantByUser.get(row.fighterAUserId);
    const fighterBId = participantByUser.get(row.fighterBUserId);
    if (fighterAId === undefined || fighterBId === undefined) {
      // A fighter left the competition after the bout; it no longer has anyone to count for here.
      continue;
    }
    const status = settleBout(toLifecycle(row), now).status;
    bouts.push({
      id: row.id,
      source: "BOUT",
      foughtAt: row.startedAt,
      fighterAId,
      fighterBId,
      winnerId: row.winnerSide === "A" ? fighterAId : row.winnerSide === "B" ? fighterBId : null,
      scoreA: row.scoreA,
      scoreB: row.scoreB,
      winnerSide: row.winnerSide,
      warningsA: row.warningsA,
      warningsB: row.warningsB,
      status,
      counts: boutCounts({ status }),
      approvals: {
        referee: row.windowStartedAt !== null,
        A: row.fighterApprovedA === 1,
        B: row.fighterApprovedB === 1,
      },
      ring: row.ring,
      startedInCompetitionId: row.startedInCompetitionId,
    });
  }

  return { participants, bouts };
}

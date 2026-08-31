import { applyEloBout, buildRanking, DEFAULT_ELO_RATING } from "@hema/ranking";
import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor } from "./db.js";
import { HttpError, parseJsonValue } from "./http.js";

type CompetitionRow = Selectable<BackendDatabase["Competition"]>;
type CompetitionParticipantRow = Selectable<BackendDatabase["CompetitionParticipant"]>;
type CompetitionBoutRow = Selectable<BackendDatabase["CompetitionBout"]>;

export interface CompetitionSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  startDate: string;
  endDate: string;
}

export interface CompetitionDetail extends CompetitionSummary {
  rulesetJson: unknown;
}

export interface CompetitionParticipant {
  id: string;
  competitionId: string;
  name: string;
  linkedUserEmail: string | null;
}

export interface CompetitionBout {
  id: string;
  competitionId: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  published: boolean;
  details: unknown;
}

export interface CompetitionBoutInput {
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  details: unknown;
}

export interface CompetitionRankingEntry {
  participantId: string;
  position: number;
  name: string;
  rating: number;
}

function toSummary(row: CompetitionRow): CompetitionSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    date: row.date,
    startDate: row.date,
    endDate: row.date,
  };
}

export async function listCompetitions(executor: DbExecutor): Promise<CompetitionSummary[]> {
  const rows = await executor
    .selectFrom("Competition")
    .selectAll()
    .orderBy("status")
    .orderBy("date")
    .orderBy("name")
    .execute();
  return rows.map(toSummary);
}

export async function requireCompetition(executor: DbExecutor, id: string): Promise<CompetitionDetail> {
  const row = await executor.selectFrom("Competition").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) {
    throw new HttpError(404, `Competition "${id}" not found.`);
  }

  return {
    ...toSummary(row),
    rulesetJson: parseJsonValue(row.rulesetJson),
  };
}

async function requireParticipant(
  executor: DbExecutor,
  competitionId: string,
  participantId: string,
): Promise<CompetitionParticipant> {
  const row = await executor
    .selectFrom("CompetitionParticipant")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("id", "=", participantId)
    .executeTakeFirst();
  if (!row) {
    throw new HttpError(404, `Participant "${participantId}" not found in competition "${competitionId}".`);
  }
  return toParticipant(row);
}

export async function listParticipants(executor: DbExecutor, competitionId: string): Promise<CompetitionParticipant[]> {
  await requireCompetition(executor, competitionId);
  const rows = await executor
    .selectFrom("CompetitionParticipant")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .orderBy("name")
    .orderBy("id")
    .execute();
  return rows.map(toParticipant);
}

export async function listBouts(executor: DbExecutor, competitionId: string): Promise<CompetitionBout[]> {
  await requireCompetition(executor, competitionId);
  const rows = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("published", "=", 1)
    .orderBy("date")
    .orderBy("id")
    .execute();
  return rows.map(toBout);
}

export async function requireBout(
  executor: DbExecutor,
  competitionId: string,
  boutId: string,
): Promise<CompetitionBout> {
  const row = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("id", "=", boutId)
    .executeTakeFirst();
  if (!row) {
    throw new HttpError(404, `Bout "${boutId}" not found.`);
  }
  return toBout(row);
}

export async function listRanking(executor: DbExecutor, competitionId: string): Promise<CompetitionRankingEntry[]> {
  await requireCompetition(executor, competitionId);
  const participants = await listParticipants(executor, competitionId);
  const bouts = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("published", "=", 1)
    .orderBy("date")
    .orderBy("id")
    .execute();

  let ratings = new Map<string, number>(participants.map((participant) => [participant.id, DEFAULT_ELO_RATING]));
  for (const bout of bouts) {
    ratings = applyEloBout(ratings, {
      fighterAId: bout.fighterAId,
      fighterBId: bout.fighterBId,
      winnerParticipantId: bout.winnerParticipantId,
    });
  }

  return buildRanking(
    participants.map((participant) => ({ id: participant.id, name: participant.name })),
    ratings,
  );
}

export async function createBout(
  executor: DbExecutor,
  competitionId: string,
  id: string,
  input: CompetitionBoutInput,
): Promise<CompetitionBout> {
  await requireCompetition(executor, competitionId);
  await requireParticipant(executor, competitionId, input.fighterAId);
  await requireParticipant(executor, competitionId, input.fighterBId);
  assertDistinctFighters(input.fighterAId, input.fighterBId);
  if (input.winnerParticipantId !== null) {
    await requireParticipant(executor, competitionId, input.winnerParticipantId);
  }

  await executor
    .insertInto("CompetitionBout")
    .values({
      id,
      competitionId,
      fighterAId: input.fighterAId,
      fighterBId: input.fighterBId,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      winnerParticipantId: input.winnerParticipantId,
      date: input.date,
      published: 0,
      details: JSON.stringify(input.details),
    })
    .execute();

  return requireBout(executor, competitionId, id);
}

export async function publishBout(
  executor: DbExecutor,
  competitionId: string,
  boutId: string,
  input: CompetitionBoutInput,
): Promise<CompetitionBout> {
  await requireCompetition(executor, competitionId);
  const existing = await requireBout(executor, competitionId, boutId);
  await requireParticipant(executor, competitionId, input.fighterAId);
  await requireParticipant(executor, competitionId, input.fighterBId);
  assertDistinctFighters(input.fighterAId, input.fighterBId);
  if (input.winnerParticipantId !== null) {
    await requireParticipant(executor, competitionId, input.winnerParticipantId);
  }

  await executor
    .updateTable("CompetitionBout")
    .set({
      fighterAId: input.fighterAId,
      fighterBId: input.fighterBId,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      winnerParticipantId: input.winnerParticipantId,
      date: input.date,
      published: 1,
      details: JSON.stringify(input.details),
    })
    .where("competitionId", "=", competitionId)
    .where("id", "=", boutId)
    .execute();

  return {
    ...existing,
    fighterAId: input.fighterAId,
    fighterBId: input.fighterBId,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    winnerParticipantId: input.winnerParticipantId,
    date: input.date,
    published: true,
    details: input.details,
  };
}

export async function declineBout(
  executor: DbExecutor,
  competitionId: string,
  boutId: string,
): Promise<CompetitionBout> {
  await requireCompetition(executor, competitionId);
  const existing = await requireBout(executor, competitionId, boutId);
  if (existing.published) {
    throw new HttpError(400, "Published bouts cannot be declined.");
  }
  await executor.deleteFrom("CompetitionBout").where("competitionId", "=", competitionId).where("id", "=", boutId).execute();
  return existing;
}

function toParticipant(row: CompetitionParticipantRow): CompetitionParticipant {
  return {
    id: row.id,
    competitionId: row.competitionId,
    name: row.name,
    linkedUserEmail: row.linkedUserEmail,
  };
}

function assertDistinctFighters(fighterAId: string, fighterBId: string): void {
  if (fighterAId === fighterBId) {
    throw new HttpError(400, "A bout requires two different participants.");
  }
}

function toBout(row: CompetitionBoutRow): CompetitionBout {
  return {
    id: row.id,
    competitionId: row.competitionId,
    fighterAId: row.fighterAId,
    fighterBId: row.fighterBId,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    winnerParticipantId: row.winnerParticipantId,
    date: row.date,
    published: row.published === 1,
    details: parseJsonValue(row.details),
  };
}

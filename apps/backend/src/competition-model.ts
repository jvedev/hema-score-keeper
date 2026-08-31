import { applyEloBout, buildRanking, DEFAULT_ELO_RATING } from "@hema/ranking";
import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor } from "./db.js";
import { HttpError, parseJsonValue } from "./http.js";

type CompetitionRow = Selectable<BackendDatabase["Competition"]>;
type CompetitionParticipantRow = Selectable<BackendDatabase["CompetitionParticipant"]>;
type CompetitionMatchRow = Selectable<BackendDatabase["CompetitionBout"]>;

type MatchEvent =
  | {
      type: "exchange";
      scoreA: number;
      scoreB: number;
      details?: unknown;
    }
  | {
      type: "warning";
      fighterId: string;
      elapsedTimeSeconds: number;
      description: string;
      pointsDeducted?: number;
    }
  | {
      type: "timeout";
      fighterId: string;
      elapsedTimeSeconds: number;
      details?: unknown;
    }
  | {
      type: "disqualification";
      fighterId: string;
      elapsedTimeSeconds: number;
      description: string;
    };

interface MatchDetails {
  events?: readonly MatchEvent[];
  [key: string]: unknown;
}

export interface CompetitionSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  startDate: string;
  endDate: string;
  visibility: string;
  clubId: string | null;
}

export interface CompetitionDetail extends CompetitionSummary {
  rulesetJson: unknown;
}

export interface CompetitionParticipant {
  id: string;
  competitionId: string;
  name: string;
  displayName: string | null;
  linkedUserEmail: string | null;
  linkedUserEmailHash: string | null;
  clubId: string | null;
  userId: string | null;
  kind: "MEMBER" | "GUEST";
}

export interface CompetitionMatch {
  id: string;
  competitionId: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  published: boolean;
  details: MatchDetails;
}

export type CompetitionBout = CompetitionMatch;

export interface CompetitionMatchInput {
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  details: MatchDetails;
}

export type CompetitionBoutInput = CompetitionMatchInput;

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
    visibility: row.visibility,
    clubId: row.clubId,
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

export async function listMatches(executor: DbExecutor, competitionId: string): Promise<CompetitionMatch[]> {
  await requireCompetition(executor, competitionId);
  const rows = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("published", "=", 1)
    .orderBy("date")
    .orderBy("id")
    .execute();
  return rows.map(toMatch);
}

export const listBouts = listMatches;

export async function requireMatch(
  executor: DbExecutor,
  competitionId: string,
  matchId: string,
): Promise<CompetitionMatch> {
  const row = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("id", "=", matchId)
    .executeTakeFirst();
  if (!row) {
    throw new HttpError(404, `Match "${matchId}" not found.`);
  }
  return toMatch(row);
}

export const requireBout = requireMatch;

export async function listRanking(executor: DbExecutor, competitionId: string): Promise<CompetitionRankingEntry[]> {
  await requireCompetition(executor, competitionId);
  const participants = await listParticipants(executor, competitionId);
  const matches = await executor
    .selectFrom("CompetitionBout")
    .selectAll()
    .where("competitionId", "=", competitionId)
    .where("published", "=", 1)
    .orderBy("date")
    .orderBy("id")
    .execute();

  let ratings = new Map<string, number>(participants.map((participant) => [participant.id, DEFAULT_ELO_RATING]));
  for (const match of matches) {
    ratings = applyEloBout(ratings, {
      fighterAId: match.fighterAId,
      fighterBId: match.fighterBId,
      winnerParticipantId: match.winnerParticipantId,
    });
  }

  return buildRanking(
    participants.map((participant) => ({ id: participant.id, name: participant.name })),
    ratings,
  );
}

export async function createMatch(
  executor: DbExecutor,
  competitionId: string,
  id: string,
  input: CompetitionMatchInput,
): Promise<CompetitionMatch> {
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

  return requireMatch(executor, competitionId, id);
}

export const createBout = createMatch;

export async function publishMatch(
  executor: DbExecutor,
  competitionId: string,
  matchId: string,
  input: CompetitionMatchInput,
): Promise<CompetitionMatch> {
  await requireCompetition(executor, competitionId);
  const existing = await requireMatch(executor, competitionId, matchId);
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
    .where("id", "=", matchId)
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

export const publishBout = publishMatch;

export async function declineMatch(
  executor: DbExecutor,
  competitionId: string,
  matchId: string,
): Promise<CompetitionMatch> {
  await requireCompetition(executor, competitionId);
  const existing = await requireMatch(executor, competitionId, matchId);
  if (existing.published) {
    throw new HttpError(400, "Published matches cannot be declined.");
  }
  await executor.deleteFrom("CompetitionBout").where("competitionId", "=", competitionId).where("id", "=", matchId).execute();
  return existing;
}

export const declineBout = declineMatch;

function toParticipant(row: CompetitionParticipantRow): CompetitionParticipant {
  return {
    id: row.id,
    competitionId: row.competitionId,
    name: row.name,
    linkedUserEmail: row.linkedUserEmail,
    displayName: row.displayName,
    linkedUserEmailHash: row.linkedUserEmailHash,
    clubId: row.clubId,
    userId: row.userId,
    kind: row.kind === "GUEST" ? "GUEST" : "MEMBER",
  };
}

function assertDistinctFighters(fighterAId: string, fighterBId: string): void {
  if (fighterAId === fighterBId) {
    throw new HttpError(400, "A match requires two different participants.");
  }
}

function toMatch(row: CompetitionMatchRow): CompetitionMatch {
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
    details: parseJsonValue(row.details) as MatchDetails,
  };
}

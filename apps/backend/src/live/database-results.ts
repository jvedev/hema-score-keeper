import { createHash, randomUUID } from "node:crypto";
import type { DbExecutor } from "../db.js";
import { HttpError, type JsonValue, stringifyJsonValue } from "../http.js";
import { requireMatchRow } from "../read-model.js";
import { displayOf, rulesOf, type RoundExchange } from "./bout-display.js";
import { scoreOf } from "./bout-score.js";
import type { ExchangeInput } from "./bout-routes.js";

type SourceRoundExchange = RoundExchange & {
  isDouble: number;
  firstScorer: "LEFT" | "RIGHT" | null;
};

function resultSignature(
  bout: { id: string; sourceMatchId: string | null; round: number },
  ruleset: string | null,
  match: { entryAId: string | null; entryBId: string | null },
  exchanges: readonly SourceRoundExchange[],
): string {
  const content = {
    matchId: bout.sourceMatchId,
    round: bout.round,
    ruleset,
    entryAId: match.entryAId,
    entryBId: match.entryBId,
    exchanges: exchanges.map(({ kind, leftPoints, rightPoints, isDouble, firstScorer, round }) => ({
      kind,
      leftPoints,
      rightPoints,
      isDouble,
      firstScorer,
      round,
    })),
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function winnerEntryId(
  ruleset: string | null,
  bout: Parameters<typeof displayOf>[1],
  match: { entryAId: string | null; entryBId: string | null },
  exchanges: readonly RoundExchange[],
  score: { left: number; right: number },
): string | null {
  const rules = rulesOf(ruleset);
  if (rules.format.rounds > 1) {
    const outcome = displayOf(rules, bout, exchanges, new Date(0)).roundsWon;
    if (!outcome || outcome.left === outcome.right) return null;
    return outcome.left > outcome.right ? match.entryAId : match.entryBId;
  }
  if (score.left === score.right) return null;
  return score.left > score.right ? match.entryAId : match.entryBId;
}

function requireLiveProjection(details: string | null, boutId: string): void {
  let value: unknown;
  try {
    value = JSON.parse(details ?? "");
  } catch {
    throw new HttpError(409, "Event-admin exchanges changed outside live scoring; correction was not applied.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("source" in value) ||
    value.source !== "LIVE" ||
    !("liveBoutId" in value) ||
    value.liveBoutId !== boutId
  ) {
    throw new HttpError(409, "Event-admin exchanges changed outside live scoring; correction was not applied.");
  }
}

async function writeMatchResult(
  executor: DbExecutor,
  boutId: string,
  replaceExisting: boolean,
): Promise<void> {
  const bout = await executor.selectFrom("LiveBout").selectAll().where("id", "=", boutId).executeTakeFirst();
  if (!bout) throw new HttpError(404, "Bout not found.");
  const tournament = await executor
    .selectFrom("LiveTournament")
    .select(["mode", "sourceTournamentId", "ruleset"])
    .where("id", "=", bout.tournamentId)
    .executeTakeFirstOrThrow();
  if (tournament.mode !== "DATABASE") return;
  if (!tournament.sourceTournamentId || !bout.sourceMatchId) {
    throw new HttpError(409, "This database-mode bout is missing its source match.");
  }

  const match = await requireMatchRow(executor, bout.sourceMatchId);
  const liveExchanges = await executor
    .selectFrom("LiveExchange")
    .selectAll()
    .where("boutId", "=", bout.id)
    .where("undoneAt", "is", null)
    .orderBy("seq")
    .execute();
  const roundExchanges: SourceRoundExchange[] = liveExchanges.map((exchange) => ({
    kind: exchange.kind,
    leftPoints: exchange.leftPoints,
    rightPoints: exchange.rightPoints,
    round: exchange.round,
    isDouble: exchange.isDouble,
    firstScorer: exchange.firstScorer,
  }));
  const signature = resultSignature(bout, tournament.ruleset, match, roundExchanges);
  if (bout.sourceResultSignature === signature && !replaceExisting) return;
  if (replaceExisting && bout.sourceResultSignature === null) {
    throw new HttpError(409, "This live result has not been projected and cannot be corrected.");
  }

  const existingExchanges = await executor
    .selectFrom("Exchange")
    .select(["id", "details"])
    .where("matchId", "=", match.id)
    .execute();
  if (bout.sourceResultSignature === null) {
    if (match.scoreA !== null || match.scoreB !== null || match.winnerEntryId !== null || existingExchanges.length > 0) {
      throw new HttpError(409, "The Event-admin match already has a result outside live scoring.");
    }
  } else if (!replaceExisting) {
    throw new HttpError(409, "The live result changed after projection; an admin correction is required.");
  } else {
    for (const exchange of existingExchanges) {
      requireLiveProjection(exchange.details, bout.id);
    }
  }

  const score = scoreOf(roundExchanges);
  const winner = winnerEntryId(tournament.ruleset, bout, match, roundExchanges, score);

  if (replaceExisting) {
    await executor.deleteFrom("Exchange").where("matchId", "=", match.id).execute();
  }
  const runningScore = { left: 0, right: 0 };
  for (const exchange of liveExchanges) {
    if (!(exchange.kind === "EXCHANGE" && exchange.leftPoints > 0 && exchange.rightPoints > 0)) {
      runningScore.left += exchange.leftPoints;
      runningScore.right += exchange.rightPoints;
    }
    const details: JsonValue = {
      source: "LIVE",
      liveBoutId: bout.id,
      liveExchangeId: exchange.id,
      seq: exchange.seq,
      round: exchange.round,
      kind: exchange.kind,
      leftPoints: exchange.leftPoints,
      rightPoints: exchange.rightPoints,
      isDouble: exchange.isDouble === 1,
      firstScorer: exchange.firstScorer,
    };
    await executor.insertInto("Exchange").values({
      id: randomUUID(),
      matchId: match.id,
      scoreA: runningScore.left,
      scoreB: runningScore.right,
      details: stringifyJsonValue(details),
    }).execute();
  }

  await executor.updateTable("Match").set({
    scoreA: score.left,
    scoreB: score.right,
    winnerEntryId: winner,
  }).where("id", "=", match.id).execute();
  await executor.updateTable("LiveBout")
    .set({ sourceResultSignature: signature })
    .where("id", "=", bout.id)
    .execute();
}

export async function projectDatabaseBoutResult(executor: DbExecutor, boutId: string): Promise<void> {
  await writeMatchResult(executor, boutId, false);
}

export async function correctDatabaseBoutResult(
  executor: DbExecutor,
  boutId: string,
  userId: string,
  exchanges: readonly ExchangeInput[],
  now: string,
): Promise<number> {
  const bout = await executor.selectFrom("LiveBout").selectAll().where("id", "=", boutId).executeTakeFirst();
  if (!bout) throw new HttpError(404, "Bout not found.");
  const tournament = await executor.selectFrom("LiveTournament")
    .select(["mode", "sourceTournamentId"])
    .where("id", "=", bout.tournamentId)
    .executeTakeFirstOrThrow();
  if (tournament.mode !== "DATABASE" || !tournament.sourceTournamentId || !bout.sourceMatchId) {
    throw new HttpError(409, "Only a linked database-mode bout can be corrected.");
  }
  if (bout.status !== "DONE") throw new HttpError(409, "Only a completed bout can be corrected.");
  if (bout.sourceResultSignature === null) {
    throw new HttpError(409, "This live result has not been projected and cannot be corrected.");
  }

  const previousExchanges = await executor.selectFrom("LiveExchange")
    .selectAll()
    .where("boutId", "=", bout.id)
    .orderBy("seq")
    .execute();
  const previousRevision = await executor.selectFrom("LiveBoutRevision")
    .select((expressionBuilder) => expressionBuilder.fn.max("revision").as("revision"))
    .where("boutId", "=", bout.id)
    .executeTakeFirst();
  const alreadyApplied = previousExchanges.length === exchanges.length &&
    previousExchanges.every((current, index) => {
      const corrected = exchanges[index];
      return current.undoneAt === null &&
        current.seq === index + 1 &&
        corrected !== undefined &&
        current.clientExchangeId === corrected.clientExchangeId &&
        current.kind === corrected.kind &&
        current.leftPoints === corrected.leftPoints &&
        current.rightPoints === corrected.rightPoints &&
        current.isDouble === (corrected.isDouble ? 1 : 0) &&
        current.firstScorer === corrected.firstScorer &&
        current.round === corrected.round;
    });
  if (alreadyApplied) return previousRevision?.revision ?? 0;

  const revision = (previousRevision?.revision ?? 0) + 1;
  await executor.insertInto("LiveBoutRevision").values({
    id: randomUUID(),
    boutId: bout.id,
    revision,
    boutStateJson: JSON.stringify(bout),
    exchangesJson: JSON.stringify(previousExchanges),
    replacedAt: now,
    replacedByUserId: userId,
  }).execute();
  await executor.deleteFrom("LiveExchange").where("boutId", "=", bout.id).execute();

  for (const [index, exchange] of exchanges.entries()) {
    await executor.insertInto("LiveExchange").values({
      id: randomUUID(),
      boutId: bout.id,
      seq: index + 1,
      kind: exchange.kind,
      leftPoints: exchange.leftPoints,
      rightPoints: exchange.rightPoints,
      isDouble: exchange.isDouble ? 1 : 0,
      firstScorer: exchange.firstScorer,
      round: exchange.round,
      clientExchangeId: exchange.clientExchangeId,
      createdByUserId: userId,
      createdAt: now,
      undoneAt: null,
    }).execute();
  }

  await writeMatchResult(executor, bout.id, true);
  return revision;
}

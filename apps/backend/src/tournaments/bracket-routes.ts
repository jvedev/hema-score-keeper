import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import {
  bracketSettings,
  groupPools,
  PAIRING_RULES,
  planBracket,
  poolMatchFinished,
  poolStandings,
  SEEDING_RULES,
  type BracketSettings,
} from "@hema/ranking";
import { requirePathParam } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { ApiStage } from "../api-types.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { HttpError } from "../http.js";
import { compareStageRows, generateId, requireEventRow, requireStageApi, requireStageRow, requireTournamentRow } from "../read-model.js";
import { requireEventTournamentAdmin } from "./access.js";

/**
 * Elimination brackets. `POST /api/v1/stages/:id/bracket` fills an elimination stage from the finished pool
 * stage before it: pool standings (the same ranking the pool results screen shows), the ruleset's seeding and
 * pairing rules, byes for the top seeds, and empty later rounds (plus the bronze match) that advancing fills.
 * Filling again replaces the bracket, as long as none of its matches has a result or has gone live.
 */
export function registerBracketRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.post("/api/v1/stages/:id/bracket", async (request): Promise<ApiStage> => {
    const user = await requireUser(request, database);
    const stageId = requirePathParam(request, "id");
    const stage = await requireStageRow(database, stageId);
    await requireEventTournamentAdmin(database, stage.tournamentId, user);
    await database.transaction().execute((trx) => fillBracket(trx, stageId));
    return requireStageApi(database, stageId);
  });
}

async function fillBracket(executor: DbExecutor, stageId: string): Promise<void> {
  const stage = await requireStageRow(executor, stageId);
  if (stage.type !== "ELIMINATION") {
    throw new HttpError(409, "Only an elimination stage holds a bracket.");
  }
  const tournament = await requireTournamentRow(executor, stage.tournamentId);
  const event = await requireEventRow(executor, tournament.eventId);
  const stages = (await executor.selectFrom("Stage").selectAll().where("tournamentId", "=", tournament.id).execute()).sort(compareStageRows);
  const position = stages.findIndex((item) => item.id === stage.id);

  // The pools this bracket is seeded from: the last pool stage before it.
  const poolStage = stages.slice(0, position).reverse().find((item) => item.type === "POOL");
  if (!poolStage) {
    throw new HttpError(409, "There is no pool stage before this bracket to seed it from.");
  }
  const poolMatches = await executor
    .selectFrom("Match")
    .innerJoin("Round", "Round.id", "Match.roundId")
    .selectAll("Match")
    .where("Round.stageId", "=", poolStage.id)
    .execute();
  if (poolMatches.length === 0) {
    throw new HttpError(409, "The pools have no matches yet.");
  }
  const played = poolMatches.filter(poolMatchFinished).length;
  if (played < poolMatches.length) {
    throw new HttpError(409, `The pools are not finished yet: ${played} of ${poolMatches.length} matches fought.`);
  }

  const settings = await bracketSettingsFor(executor, stage.rulesetId ?? tournament.rulesetId ?? event.rulesetId);
  const later = stages.slice(position + 1);
  const finalStage = settings.separateFinalStages ? later.find((item) => item.type === "FINAL") : undefined;
  const bronzeStage = settings.separateFinalStages && settings.bronzeMatch ? later.find((item) => item.type === "BRONZE_FINAL") : undefined;
  if (settings.separateFinalStages && !finalStage) {
    throw new HttpError(409, "The ruleset puts the final in its own stage, but this tournament has no Final stage after the bracket.");
  }
  if (settings.separateFinalStages && settings.bronzeMatch && !bronzeStage) {
    throw new HttpError(409, "The ruleset puts the bronze match in its own stage, but this tournament has no Bronze final stage after the bracket.");
  }
  const bracketStageIds = [stage.id, finalStage?.id, bronzeStage?.id].filter((id): id is string => id !== undefined);
  await requireBracketUntouched(executor, bracketStageIds);

  // Seeds: standings per pool (pools in arena order), then the ruleset's seeding and pairing rules.
  const entries = await executor.selectFrom("Entry").select(["id", "seed"]).where("tournamentId", "=", tournament.id).execute();
  const seedOf = new Map(entries.map((entry) => [entry.id, entry.seed] as const));
  const arenas = await executor.selectFrom("Arena").select(["id", "order"]).where("eventId", "=", event.id).execute();
  const pools = groupPools(poolMatches, new Map(arenas.map((arena) => [arena.id, arena.order] as const))).map((pool) => {
    const fighterIds = new Set(pool.matches.flatMap((match) => [match.entryAId, match.entryBId]).filter((id): id is string => id !== null));
    return {
      number: pool.number,
      standings: poolStandings(
        [...fighterIds].map((entryId) => ({ entryId, seed: seedOf.get(entryId) ?? null })),
        pool.matches,
      ),
    };
  });
  const seeds = SEEDING_RULES[settings.seeding]!(pools);
  const wanted = stage.eliminationParticipantCount ?? seeds.length;
  const qualified = seeds.slice(0, Math.min(wanted, seeds.length));
  if (qualified.length < 2) {
    throw new HttpError(409, "A bracket needs at least two fighters.");
  }
  const firstRound = PAIRING_RULES[settings.pairing]!(qualified);
  const plan = planBracket(firstRound, settings.bronzeMatch);
  const lastRound = Math.log2(firstRound.size) - 1;

  // Replace what was there: rounds of the bracket's stages (their matches and schedule go with them).
  await executor.deleteFrom("Round").where("stageId", "in", bracketStageIds).execute();
  const roundIds = new Map<string, string>();
  const roundFor = async (targetStageId: string, roundNumber: number) => {
    const key = `${targetStageId}:${roundNumber}`;
    let id = roundIds.get(key);
    if (!id) {
      id = generateId();
      roundIds.set(key, id);
      await executor.insertInto("Round").values({ id, stageId: targetStageId, roundNumber }).execute();
    }
    return id;
  };
  for (const match of plan) {
    const inOwnStage = match.round === lastRound && (match.kind === "MAIN" ? finalStage : bronzeStage);
    const targetStageId = inOwnStage ? inOwnStage.id : stage.id;
    await executor
      .insertInto("Match")
      .values({
        id: generateId(),
        roundId: await roundFor(targetStageId, inOwnStage ? 0 : match.round),
        arenaId: null,
        entryAId: match.entryAId,
        entryBId: match.entryBId,
        winnerEntryId: null,
        scoreA: null,
        scoreB: null,
        rulesetId: stage.rulesetId,
        bracketRound: match.round,
        bracketPosition: match.position,
        bracketKind: match.kind,
      })
      .execute();
  }
}

async function bracketSettingsFor(executor: DbExecutor, rulesetId: string | null): Promise<BracketSettings> {
  const ruleset = rulesetId ? await executor.selectFrom("Ruleset").select("definition").where("id", "=", rulesetId).executeTakeFirst() : undefined;
  let definition: unknown = null;
  try {
    definition = ruleset?.definition ? JSON.parse(ruleset.definition) : null;
  } catch {
    throw new HttpError(409, "The ruleset's definition is not valid JSON.");
  }
  try {
    return bracketSettings(definition);
  } catch (error) {
    throw new HttpError(409, error instanceof Error ? error.message : String(error));
  }
}

/** Refuses when any match in these stages has a result, exchanges, or a live bout: refilling would lose it. */
async function requireBracketUntouched(executor: DbExecutor, stageIds: string[]): Promise<void> {
  const matches = await executor
    .selectFrom("Match")
    .innerJoin("Round", "Round.id", "Match.roundId")
    .select(["Match.id", "Match.scoreA", "Match.scoreB", "Match.winnerEntryId"])
    .where("Round.stageId", "in", stageIds)
    .execute();
  if (matches.length === 0) return;
  const withResult = matches.some((match) => match.scoreA !== null || match.scoreB !== null || match.winnerEntryId !== null);
  const ids = matches.map((match) => match.id);
  const exchange = await executor.selectFrom("Exchange").select("id").where("matchId", "in", ids).executeTakeFirst();
  const live = await executor.selectFrom("LiveBout").select("id").where("sourceMatchId", "in", ids).executeTakeFirst();
  if (withResult || exchange || live) {
    throw new HttpError(409, "This bracket has started: a match has a result or is on a ring. It can no longer be filled again.");
  }
}

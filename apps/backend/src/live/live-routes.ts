import { ringRulesProblems } from "@hema/competition-domain";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam, type AccessUser } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { ensureObject, HttpError } from "../http.js";
import { isEventTournamentAdmin, requireEventTournamentAdmin } from "../tournaments/access.js";
import { rulesOf } from "./bout-display.js";
import { groupBoutsByPool, poolNameIn, poolNamesOf, type PoolNames } from "./bout-pools.js";
import { boutScores, ringBouts } from "./bout-routes.js";
import { scoreOf } from "./bout-score.js";
import { activateDatabaseTournament, projectDatabaseTournament } from "./database-mode.js";
import { activeExchanges } from "./live-store.js";
import { registerPushRoutes } from "./push-notifications.js";
import { activeKeeperOf, publicRing } from "./ring-keeper.js";

export function registerLiveRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  registerPushRoutes(app, database);

  app.post("/api/v1/tournaments/:id/live", async (request) => {
    const user = await requireUser(request, database);
    const sourceTournamentId = requirePathParam(request, "id");
    return database.transaction().execute(async (trx) => {
      await requireEventTournamentAdmin(trx, sourceTournamentId, user);
      return activateDatabaseTournament(trx, sourceTournamentId, user.id, app.now().toISOString());
    });
  });

  app.get("/api/v1/tournaments/:id/live", async (request) => {
    const user = await requireUser(request, database);
    const sourceTournamentId = requirePathParam(request, "id");
    await requireEventTournamentAdmin(database, sourceTournamentId, user);
    const liveTournament = await database.selectFrom("LiveTournament")
      .select("id")
      .where("sourceTournamentId", "=", sourceTournamentId)
      .executeTakeFirst();
    if (!liveTournament) {
      return { active: false, liveTournamentId: null, rings: 0, bouts: 0 };
    }
    const [ringCount, boutCount] = await Promise.all([
      database.selectFrom("LiveRing")
        .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
        .where("tournamentId", "=", liveTournament.id)
        .executeTakeFirst(),
      database.selectFrom("LiveBout")
        .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("count"))
        .where("tournamentId", "=", liveTournament.id)
        .executeTakeFirst(),
    ]);
    return {
      active: true,
      liveTournamentId: liveTournament.id,
      rings: ringCount?.count ?? 0,
      bouts: boutCount?.count ?? 0,
    };
  });

  app.get("/api/v1/tournaments/:id/live/results", async (request) => {
    const user = await requireUser(request, database);
    const sourceTournamentId = requirePathParam(request, "id");
    await requireEventTournamentAdmin(database, sourceTournamentId, user);
    const liveTournament = await database.selectFrom("LiveTournament")
      .select("id")
      .where("sourceTournamentId", "=", sourceTournamentId)
      .executeTakeFirst();
    if (!liveTournament) return { results: [] };

    const bouts = await database.selectFrom("LiveBout")
      .select(["id", "sourceMatchId", "label", "fighterLeft", "fighterRight"])
      .where("tournamentId", "=", liveTournament.id)
      .where("status", "=", "DONE")
      .orderBy("ringId")
      .orderBy("order")
      .execute();
    return {
      results: await Promise.all(bouts.map(async (bout) => {
        const exchanges = await activeExchanges(database, bout.id);
        return {
          boutId: bout.id,
          sourceMatchId: bout.sourceMatchId,
          label: bout.label,
          fighterLeft: bout.fighterLeft,
          fighterRight: bout.fighterRight,
          score: scoreOf(exchanges),
          exchanges: exchanges.map(({ clientExchangeId, kind, leftPoints, rightPoints, isDouble, firstScorer, round }) => ({
            clientExchangeId,
            kind,
            leftPoints,
            rightPoints,
            isDouble: isDouble === 1,
            firstScorer,
            round,
          })),
        };
      })),
    };
  });

  app.post("/api/v1/live-tournaments/:id/project", async (request) => {
    const user = await requireUser(request, database);
    const liveTournamentId = requirePathParam(request, "id");
    return database.transaction().execute(async (trx) => {
      await requireTournamentAdmin(trx, liveTournamentId, user);
      return projectDatabaseTournament(trx, liveTournamentId, app.now().toISOString());
    });
  });

  // The ring links (with their secret keeper tokens) for the tournament admins of the source tournament.
  app.get("/api/v1/live-tournaments/:id/rings", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const rings = await database.selectFrom("LiveRing").selectAll().where("tournamentId", "=", tournamentId).orderBy("order").execute();
    return {
      rings: await Promise.all(
        rings.map(async (ring) => ({ ...publicRing(ring), keeperToken: ring.keeperToken, scoreboardToken: ring.scoreboardToken, activeKeeper: await activeKeeperOf(database, ring) })),
      ),
    };
  });

  app.get("/api/v1/me/live-tournaments", async (request) => {
    const user = await requireUser(request, database);
    const rows = await database
      .selectFrom("LiveTournamentFighter as Fighter")
      .innerJoin("LiveTournament as Tournament", "Tournament.id", "Fighter.tournamentId")
      .select([
        "Tournament.id as id",
        "Tournament.name as name",
        "Fighter.id as fighterId",
        "Fighter.name as fighterName",
      ])
      .where("Fighter.userId", "=", user.id)
      .orderBy("Tournament.createdAt", "desc")
      .orderBy("Tournament.name")
      .execute();
    return { tournaments: rows };
  });

  app.get("/api/v1/live-tournaments/:id/fighter-view", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    const fighter = await database
      .selectFrom("LiveTournamentFighter")
      .select(["id", "name"])
      .where("tournamentId", "=", tournamentId)
      .where("userId", "=", user.id)
      .executeTakeFirst();
    if (!fighter) throw new HttpError(404, "Tournament fighter not found.");
    const tournament = await database
      .selectFrom("LiveTournament")
      .select(["id", "name"])
      .where("id", "=", tournamentId)
      .executeTakeFirst();
    if (!tournament) throw new HttpError(404, "Tournament not found.");

    const rings = await database
      .selectFrom("LiveRing")
      .select(["id", "name", "order"])
      .where("tournamentId", "=", tournamentId)
      .orderBy("order")
      .execute();
    const bouts = (await Promise.all(rings.map(async (ring) =>
      (await ringBouts(database, ring.id, app.now())).map((bout) => ({ ...bout, ringName: ring.name })),
    ))).flat();
    const onDeck = new Set(
      rings.flatMap((ring) => bouts.find((bout) => bout.ringId === ring.id && bout.status === "PENDING")?.id ?? []),
    );
    const poolNames = await poolNamesOf(database, bouts);
    const fighterBouts = bouts.filter((bout) => bout.fighterLeftId === fighter.id || bout.fighterRightId === fighter.id);
    const schedule = fighterBouts.map((bout) => ({
      ...fighterBoutView(poolNames, bout),
      mySide: bout.fighterLeftId === fighter.id ? "LEFT" as const : "RIGHT" as const,
      isOnDeck: onDeck.has(bout.id),
    }));

    return {
      tournament,
      fighter,
      schedule,
      pools: groupBoutsByPool(poolNames, bouts).map((pool) => ({
        name: pool.name,
        bouts: [...pool.bouts].sort((left, right) => left.order - right.order).map((bout) => fighterBoutView(poolNames, bout)),
      })),
    };
  });

  // The ring rules (match parameters and bout format). Stored as sent after checking; read back leniently (`parseRingRules`).
  app.put("/api/v1/live-tournaments/:id/rules", async (request) => {
    const user = await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    await requireTournamentAdmin(database, tournamentId, user);
    const body = ensureObject(request.body, "Rules");
    // Refuse invalid values instead of silently storing defaults for them.
    const problems = ringRulesProblems(body);
    if (problems.length > 0) throw new HttpError(400, problems.join(" "));
    const rules = rulesOf(JSON.stringify(body));
    await database.updateTable("LiveTournament").set({ ruleset: JSON.stringify(rules) }).where("id", "=", tournamentId).execute();
    return { rules };
  });

  app.get("/api/v1/live-tournaments/:id", async (request) => {
    await requireUser(request, database);
    const tournamentId = requirePathParam(request, "id");
    const tournament = await database.selectFrom("LiveTournament").selectAll().where("id", "=", tournamentId).executeTakeFirst();
    if (!tournament) throw new HttpError(404, "Tournament not found.");
    const rings = await database
      .selectFrom("LiveRing")
      .select(["id", "name", "order"])
      .where("tournamentId", "=", tournamentId)
      .orderBy("order")
      .execute();
    const bouts = await database
      .selectFrom("LiveBout")
      .selectAll()
      .where("tournamentId", "=", tournamentId)
      .orderBy("ringId")
      .orderBy("order")
      .execute();
    // Same shape as GET /live-rings/:id/bouts: { left, right, doubles } from the active exchanges, null when unscored.
    const scores = await boutScores(database, bouts.map((bout) => bout.id));
    const { ruleset, ...rest } = tournament;
    return {
      ...rest,
      rules: rulesOf(ruleset),
      rings,
      bouts: bouts.map((bout) => ({ ...bout, score: scores.get(bout.id) ?? null })),
    };
  });
}

function fighterBoutView(poolNames: PoolNames, bout: Awaited<ReturnType<typeof ringBouts>>[number] & { ringName: string }) {
  return {
    id: bout.id,
    label: bout.label,
    poolName: poolNameIn(poolNames, bout),
    order: bout.order,
    status: bout.status,
    fighterLeft: bout.fighterLeft,
    fighterRight: bout.fighterRight,
    ringName: bout.ringName,
    score: bout.score,
    display: bout.display,
  };
}

/** Tournament admins of the live tournament's source Event-admin Tournament, and system admins. */
export async function requireTournamentAdmin(database: DbExecutor, tournamentId: string, user: AccessUser): Promise<void> {
  const tournament = await database
    .selectFrom("LiveTournament")
    .select("sourceTournamentId")
    .where("id", "=", tournamentId)
    .executeTakeFirst();
  if (!tournament) throw new HttpError(404, "Tournament not found.");
  if (!(await isEventTournamentAdmin(database, tournament.sourceTournamentId, user))) {
    throw new HttpError(403, "Tournament admin access required.");
  }
}

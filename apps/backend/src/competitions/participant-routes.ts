import { OBJECTION_WINDOW_MS, settleBout, type BoutStatus } from "@hema/competition-domain";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requirePathParam, resolveAccessUser } from "../access-user.js";
import { maySeePrivateBoutDetails, requireUser } from "../bouts/bout-routes.js";
import { loadBout, toLifecycle, boutCompetitionIds, type BoutRow } from "../bouts/bout-store.js";
import { toBoutView, toOutsiderView, type BoutView, type OutsiderBoutView, type PersonRef } from "../bouts/bout-view.js";
import { competitionStandings } from "../bouts/standings.js";
import { requireCompetition } from "../competition-model.js";
import type { BackendDatabase, DbExecutor, ParticipantStatus } from "../db.js";
import { HttpError, requireString } from "../http.js";
import { competitionAccessFilter, requireCompetitionAccess } from "./access.js";
import { checkJoin, PLACE_HOLDING_STATUSES } from "./joining.js";
import { scopeFromRow, type CompetitionScope } from "./scope.js";

/** A bout waiting for the viewer. `side` is the viewer's side when they fight in it, null when they referee. */
export interface TodoBout {
  boutId: string;
  competitionId: string | null;
  competitionName: string | null;
  startedAt: string;
  ring: string | null;
  side: "A" | "B" | null;
  fighterA: PersonRef;
  fighterB: PersonRef;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  /** End of the three-day objection window; null while the referee hasn't approved. */
  windowEndsAt: string | null;
}

/** One of the viewer's competitions. Rank, rating and change come from the standings; null while they aren't in them (pending). */
export interface MyCompetition {
  id: string;
  name: string;
  status: string;
  date: string;
  myStatus: ParticipantStatus;
  rank: number | null;
  rating: number | null;
  lastChange: number | null;
  bouts: number;
}

/** `GET /me/home`. Every to-do list is oldest first. */
export interface MeHome {
  todo: {
    /** Bouts in their three days that the viewer hasn't approved (they can approve or object). */
    toApprove: TodoBout[];
    /** The viewer's own open objections (they can withdraw). */
    myObjections: TodoBout[];
    /** Bouts the viewer refereed and hasn't approved yet. */
    toReferee: TodoBout[];
  };
  competitions: MyCompetition[];
}

/** `GET /me/joinable`: a competition the viewer may sign up for right now. */
export interface JoinableCompetition {
  id: string;
  name: string;
  status: string;
  date: string;
  scope: CompetitionScope;
  signupsNeedApproval: boolean;
  placeLimit: number | null;
  /** Null when there is no limit. */
  placesLeft: number | null;
}

/** `GET /competitions/:id/bouts/:boutId/view`: the full bout for people involved in it, the redacted one for everyone else. */
export type FighterBoutView = BoutView | OutsiderBoutView;

export function registerParticipantRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.get("/api/v1/me/home", async (request): Promise<MeHome> => {
    const user = await requireUser(request, database);
    return { todo: await todoFor(database, user.id, app.now()), competitions: await myCompetitions(database, user.id, app.now()) };
  });

  app.get("/api/v1/me/joinable", async (request): Promise<JoinableCompetition[]> => {
    const user = await requireUser(request, database);
    const candidates = await database
      .selectFrom("Competition")
      .select(["id", "visibility", "clubId"])
      .where("status", "in", ["REGISTRATION_OPEN", "RUNNING"])
      .orderBy("date", "desc")
      .orderBy("name")
      .execute();
    const joinable: JoinableCompetition[] = [];
    const mayAccess = await competitionAccessFilter(database, user);
    for (const candidate of candidates) {
      if (!mayAccess(candidate)) {
        continue;
      }
      // The one joinable rule, shared with sign-up.
      const check = await checkJoin(database, candidate.id, user.id);
      if (check.refusal !== null) {
        continue;
      }
      const competition = check.competition;
      const placesTaken = await placesTakenIn(database, competition.id);
      joinable.push({
        id: competition.id,
        name: competition.name,
        status: competition.status,
        date: competition.date,
        scope: scopeFromRow(competition),
        signupsNeedApproval: competition.signupsNeedApproval === 1,
        placeLimit: competition.placeLimit,
        placesLeft: competition.placeLimit === null ? null : Math.max(0, competition.placeLimit - placesTaken),
      });
    }
    return joinable;
  });

  app.get("/api/v1/competitions/:id/bouts/:boutId/view", async (request): Promise<FighterBoutView> => {
    const user = await resolveAccessUser(request, database);
    const competition = await requireCompetition(database, requirePathParam(request, "id"));
    await requireCompetitionAccess(database, user, competition);
    const boutId = requireString(requestParam(request, "boutId"), "Bout ID");
    const row = await database.selectFrom("Bout").select("id").where("id", "=", boutId).executeTakeFirst();
    if (!row || !(await boutCompetitionIds(database, boutId)).includes(competition.id)) {
      throw new HttpError(404, `Bout "${boutId}" not found in this competition.`);
    }
    const bout = await loadBout(database, boutId, app.now());
    const view = await toBoutView(database, bout);
    return user !== null && (await maySeePrivateBoutDetails(database, user, bout)) ? view : toOutsiderView(view);
  });
}

function requestParam(request: { params?: unknown }, key: string): unknown {
  return (request.params as Record<string, unknown> | undefined)?.[key];
}

async function placesTakenIn(executor: DbExecutor, competitionId: string): Promise<number> {
  const row = await executor
    .selectFrom("CompetitionParticipant")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("competitionId", "=", competitionId)
    .where("status", "in", PLACE_HOLDING_STATUSES)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function myCompetitions(executor: DbExecutor, userId: string, now: Date): Promise<MyCompetition[]> {
  const rows = await executor
    .selectFrom("CompetitionParticipant")
    .innerJoin("Competition", "Competition.id", "CompetitionParticipant.competitionId")
    .select([
      "Competition.id as id",
      "Competition.name as name",
      "Competition.status as competitionStatus",
      "Competition.date as date",
      "CompetitionParticipant.id as participantId",
      "CompetitionParticipant.status as myStatus",
    ])
    .where("CompetitionParticipant.userId", "=", userId)
    .execute();

  // One row per competition; a row that holds a place wins over an old LEFT one.
  const chosen = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = chosen.get(row.id);
    if (!current || (current.myStatus === "LEFT" && row.myStatus !== "LEFT")) {
      chosen.set(row.id, row);
    }
  }

  const result: MyCompetition[] = [];
  for (const row of chosen.values()) {
    const standing = (await competitionStandings(executor, row.id, now)).find((entry) => entry.participantId === row.participantId);
    result.push({
      id: row.id,
      name: row.name,
      status: row.competitionStatus,
      date: row.date,
      myStatus: row.myStatus,
      rank: standing?.position ?? null,
      rating: standing?.rating ?? null,
      lastChange: standing?.lastChange ?? null,
      bouts: standing?.bouts ?? 0,
    });
  }
  // Competitions I'm in first, those I left last; newest first within each.
  return result.sort(
    (a, b) => Number(a.myStatus === "LEFT") - Number(b.myStatus === "LEFT") || b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
  );
}

/** The open bouts (not yet final) the user fights in or referees, sorted into the three to-do lists. */
async function todoFor(executor: DbExecutor, userId: string, now: Date): Promise<MeHome["todo"]> {
  const rows = await executor
    .selectFrom("Bout")
    .selectAll()
    .where((eb) => eb.or([eb("fighterAUserId", "=", userId), eb("fighterBUserId", "=", userId), eb("refereeUserId", "=", userId)]))
    .where("status", "in", ["SCORED", "COUNTED", "OBJECTED"])
    .orderBy("startedAt")
    .orderBy("id")
    .execute();

  const todo: MeHome["todo"] = { toApprove: [], myObjections: [], toReferee: [] };
  const wanted: Array<{ list: TodoBout[]; row: BoutRow; side: "A" | "B" | null }> = [];
  for (const row of rows) {
    // Nothing runs in the background, so a bout whose three days have passed is settled here (without saving).
    const lifecycle = settleBout(toLifecycle(row), now);
    const status: BoutStatus = lifecycle.status;
    const side = row.fighterAUserId === userId ? "A" : row.fighterBUserId === userId ? "B" : null;
    if (side !== null && status === "COUNTED" && !lifecycle.fighterApproved[side]) {
      wanted.push({ list: todo.toApprove, row, side });
    } else if (side !== null && status === "OBJECTED" && lifecycle.objection?.by === side) {
      wanted.push({ list: todo.myObjections, row, side });
    }
    if (row.refereeUserId === userId && status === "SCORED") {
      wanted.push({ list: todo.toReferee, row, side: null });
    }
  }
  if (wanted.length === 0) {
    return todo;
  }

  const userIds = [...new Set(wanted.flatMap(({ row }) => [row.fighterAUserId, row.fighterBUserId]))];
  const names = new Map(
    (await executor.selectFrom("User").select(["id", "name"]).where("id", "in", userIds).execute()).map((user) => [user.id, user.name]),
  );
  const competitionIds = [...new Set(wanted.flatMap(({ row }) => (row.startedInCompetitionId === null ? [] : [row.startedInCompetitionId])))];
  const competitionNames = new Map(
    competitionIds.length === 0
      ? []
      : (await executor.selectFrom("Competition").select(["id", "name"]).where("id", "in", competitionIds).execute()).map((competition) => [
          competition.id,
          competition.name,
        ]),
  );
  const person = (id: string): PersonRef => ({ userId: id, name: names.get(id) ?? id });

  for (const { list, row, side } of wanted) {
    const windowEndsAt = settledWindowEnd(row);
    list.push({
      boutId: row.id,
      competitionId: row.startedInCompetitionId,
      competitionName: row.startedInCompetitionId === null ? null : (competitionNames.get(row.startedInCompetitionId) ?? null),
      startedAt: row.startedAt,
      ring: row.ring,
      side,
      fighterA: person(row.fighterAUserId),
      fighterB: person(row.fighterBUserId),
      scoreA: row.scoreA,
      scoreB: row.scoreB,
      winnerSide: row.winnerSide,
      windowEndsAt,
    });
  }
  return todo;
}

function settledWindowEnd(row: BoutRow): string | null {
  return row.windowStartedAt === null ? null : new Date(Date.parse(row.windowStartedAt) + OBJECTION_WINDOW_MS).toISOString();
}

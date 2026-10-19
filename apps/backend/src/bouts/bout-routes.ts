import {
  approveByFighter,
  approveByReferee,
  BoutTransitionError,
  competitionsForBout,
  settleBout,
  createScoredBout,
  objectToBout,
  resolveObjection,
  voidBout,
  withdrawObjection,
  type BoutLifecycle,
  type ObjectionResolution,
  type CompetitionStatus,
  type FighterSide,
} from "@hema/competition-domain";
import type { FastifyInstance } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { requirePathParam, resolveAccessUser, type AccessUser } from "../access-user.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { ensureObject, HttpError, requireBoolean, requireString } from "../http.js";
import { generateId } from "../read-model.js";
import { parseBoutInput, parseBoutResult, type BoutInput, type ExchangeInput } from "./bout-input.js";
import { boutCompetitionIds, lifecycleColumns, loadBout, loadUnsettledBout, toLifecycle, type BoutRow } from "./bout-store.js";
import { toBoutView } from "./bout-view.js";

export function registerBoutRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.post("/api/v1/bouts", async (request) => {
    const user = await requireUser(request, database);
    const input = parseBoutInput(request.body, app.now());
    await requireUsersExist(database, input);
    if (user.id !== input.refereeUserId && user.id !== input.tableUserId) {
      throw new HttpError(403, "Only the referee or the table official can record a bout.");
    }

    const competitionIds = await sharedRunningCompetitions(database, input.fighterAUserId, input.fighterBUserId);
    if (competitionIds.length === 0) {
      throw new HttpError(409, "These fighters share no running competition.");
    }
    if (input.startedInCompetitionId !== null && !competitionIds.includes(input.startedInCompetitionId)) {
      throw new HttpError(400, "The bout doesn't count in the competition it says it started in.");
    }

    const id = generateId();
    await database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("Bout")
        .values({
          id,
          fighterAUserId: input.fighterAUserId,
          fighterBUserId: input.fighterBUserId,
          refereeUserId: input.refereeUserId,
          tableUserId: input.tableUserId,
          ring: input.ring,
          startedAt: input.startedAt,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          winnerSide: input.winnerSide,
          warningsA: input.warningsA,
          warningsB: input.warningsB,
          exchangesJson: JSON.stringify(input.exchanges),
          startedInCompetitionId: input.startedInCompetitionId,
          createdByUserId: user.id,
          objectionReason: null,
          ...lifecycleColumns(createScoredBout()),
        })
        .execute();
      if (input.juryUserIds.length > 0) {
        await transaction
          .insertInto("BoutJury")
          .values(input.juryUserIds.map((userId, index) => ({ boutId: id, seat: index + 1, userId })))
          .execute();
      }
      await transaction
        .insertInto("BoutCompetition")
        .values(competitionIds.map((competitionId) => ({ boutId: id, competitionId })))
        .execute();
    });

    return toBoutView(database, await loadBout(database, id, app.now()));
  });

  app.get("/api/v1/bouts/:id", async (request) => {
    const user = await requireUser(request, database);
    const row = await loadBout(database, requirePathParam(request, "id"), app.now());
    await requireCanSeeBout(database, user, row);
    return toBoutView(database, row);
  });

  /**
   * Loads the bout, applies one rule and writes the result inside a single transaction, so two
   * requests on the same bout (an objection racing an approval) can't overwrite each other.
   * When a rule refuses, the bout is still settled afterwards so it reads as final if it is.
   */
  async function withBout<T>(boutId: string, action: (row: BoutRow, executor: Transaction<BackendDatabase>) => Promise<T>): Promise<T> {
    try {
      return await database.transaction().execute(async (transaction) => action(await loadUnsettledBout(transaction, boutId), transaction));
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 409) {
        await loadBout(database, boutId, app.now());
      }
      throw error;
    }
  }

  app.post("/api/v1/bouts/:id/referee-approval", async (request) => {
    const user = await requireUser(request, database);
    const onSpot = ensureObject(ensureObject(request.body, "Approval").fightersApprovedOnSpot, "Fighters approved on the spot");
    const fightersApprovedOnSpot = {
      A: requireBoolean(onSpot.A, "Fighter A approved"),
      B: requireBoolean(onSpot.B, "Fighter B approved"),
    };
    return withBout(requirePathParam(request, "id"), async (row, transaction) => {
      requireReferee(user, row);
      const now = app.now();
      return applyTransition(transaction, row, (bout) => approveByReferee(bout, now, fightersApprovedOnSpot), now);
    });
  });

  app.post("/api/v1/bouts/:id/approval", async (request) => {
    const user = await requireUser(request, database);
    return withBout(requirePathParam(request, "id"), async (row, transaction) => {
      const side = requireFighterSide(user, row);
      const now = app.now();
      return applyTransition(transaction, row, (bout) => approveByFighter(bout, side, now), now);
    });
  });

  app.post("/api/v1/bouts/:id/objection", async (request) => {
    const user = await requireUser(request, database);
    const reason = requireString(ensureObject(request.body, "Objection").reason, "Reason");
    return withBout(requirePathParam(request, "id"), async (row, transaction) => {
      const side = requireFighterSide(user, row);
      const now = app.now();
      return applyTransition(transaction, row, (bout) => objectToBout(bout, side, now), now, { objectionReason: reason });
    });
  });

  app.post("/api/v1/bouts/:id/objection/withdrawal", async (request) => {
    const user = await requireUser(request, database);
    return withBout(requirePathParam(request, "id"), async (row, transaction) => {
      const side = requireFighterSide(user, row);
      const now = app.now();
      return applyTransition(transaction, row, (bout) => withdrawObjection(bout, side, now), now);
    });
  });

  app.post("/api/v1/bouts/:id/resolution", async (request) => {
    const user = await requireUser(request, database);
    const body = ensureObject(request.body, "Resolution");
    return withBout(requirePathParam(request, "id"), async (row, transaction) => {
      if (!(await isAdminOfBout(transaction, user, row.id))) {
        throw new HttpError(403, "Only an admin of a competition this bout counts in can resolve it.");
      }
      const kind = requireString(body.kind, "Resolution kind");
      const now = app.now();

      if (kind === "restore" || kind === "void") {
        const resolution: ObjectionResolution =
          kind === "restore" ? { kind } : { kind, reason: requireString(body.reason, "Reason") };
        return applyTransition(transaction, row, (bout) => resolveObjection(bout, resolution, now), now);
      }
      if (kind !== "correct") {
        throw new HttpError(400, "Resolution kind must be restore, correct or void.");
      }

      const result = parseBoutResult(body.result);
      if (row.status !== "OBJECTED") {
        throw new HttpError(409, `Cannot resolve a bout that is ${row.status}.`, { code: "INVALID_STATE" });
      }
      // Keep the replaced result so the correction stays visible.
      await transaction
        .insertInto("BoutRevision")
        .values({
          boutId: row.id,
          revision: row.revision,
          scoreA: row.scoreA,
          scoreB: row.scoreB,
          winnerSide: row.winnerSide,
          warningsA: row.warningsA,
          warningsB: row.warningsB,
          exchangesJson: row.exchangesJson,
          replacedAt: now.toISOString(),
          replacedByUserId: user.id,
        })
        .execute();
      await transaction
        .updateTable("Bout")
        .set({
          scoreA: result.scoreA,
          scoreB: result.scoreB,
          winnerSide: result.winnerSide,
          warningsA: result.warningsA,
          warningsB: result.warningsB,
          exchangesJson: JSON.stringify(result.exchanges),
        })
        .where("id", "=", row.id)
        .execute();
      const corrected = await loadUnsettledBout(transaction, row.id);
      return applyTransition(transaction, corrected, (bout) => resolveObjection(bout, { kind: "correct" }, now), now);
    });
  });

  app.get("/api/v1/bouts/:id/revisions", async (request) => {
    const user = await requireUser(request, database);
    const row = await loadBout(database, requirePathParam(request, "id"), app.now());
    await requireCanSeeBout(database, user, row);
    const revisions = await database
      .selectFrom("BoutRevision")
      .innerJoin("User", "User.id", "BoutRevision.replacedByUserId")
      .selectAll("BoutRevision")
      .select("User.name as replacedByName")
      .where("BoutRevision.boutId", "=", row.id)
      .orderBy("BoutRevision.revision")
      .execute();
    return revisions.map((revision) => ({
      revision: revision.revision,
      scoreA: revision.scoreA,
      scoreB: revision.scoreB,
      winnerSide: revision.winnerSide,
      warningsA: revision.warningsA,
      warningsB: revision.warningsB,
      exchanges: JSON.parse(revision.exchangesJson) as ExchangeInput[],
      replacedAt: revision.replacedAt,
      replacedBy: { userId: revision.replacedByUserId, name: revision.replacedByName },
    }));
  });

  app.post("/api/v1/bouts/:id/void", async (request) => {
    const user = await requireUser(request, database);
    const reason = requireString(ensureObject(request.body, "Void").reason, "Reason");
    return withBout(requirePathParam(request, "id"), async (row, transaction) => {
      requireReferee(user, row);
      const now = app.now();
      // Settle first: voiding has no window rule of its own, and a final bout never changes.
      return applyTransition(transaction, row, (bout) => voidBout(settleBout(bout, now), reason), now);
    });
  });
}

/** Runs a domain transition, turning rule violations into 409s that carry the rule's code. */
export async function applyTransition(
  database: Kysely<BackendDatabase>,
  row: BoutRow,
  transition: (bout: BoutLifecycle) => BoutLifecycle,
  now: Date,
  extra: { objectionReason?: string } = {},
) {
  // The rule runs on the bout as stored, so a late objection reports WINDOW_CLOSED rather than
  // "already final".
  let next: BoutLifecycle;
  try {
    next = settleBout(transition(toLifecycle(row)), now);
  } catch (error) {
    if (error instanceof BoutTransitionError) {
      throw new HttpError(409, error.message, { code: error.code });
    }
    throw error;
  }
  const columns = lifecycleColumns(next);
  const objectionReason = next.objection === null ? null : (extra.objectionReason ?? row.objectionReason);
  await database.updateTable("Bout").set({ ...columns, objectionReason }).where("id", "=", row.id).execute();
  return toBoutView(database, { ...row, ...columns, objectionReason });
}

function requireReferee(user: AccessUser, row: BoutRow): void {
  if (user.id !== row.refereeUserId) {
    throw new HttpError(403, "Only the referee of this bout can do that.");
  }
}

function requireFighterSide(user: AccessUser, row: BoutRow): FighterSide {
  if (user.id === row.fighterAUserId) {
    return "A";
  }
  if (user.id === row.fighterBUserId) {
    return "B";
  }
  throw new HttpError(403, "Only the fighters of this bout can do that.");
}

/** Fighters, officials, admins of a competition the bout counts in, and system admins. */
export async function requireCanSeeBout(executor: DbExecutor, user: AccessUser, row: BoutRow): Promise<void> {
  if (user.role === "SYSTEM_ADMIN") {
    return;
  }
  const involved = [row.fighterAUserId, row.fighterBUserId, row.refereeUserId, row.tableUserId];
  if (involved.includes(user.id)) {
    return;
  }
  const jury = await executor
    .selectFrom("BoutJury")
    .select("userId")
    .where("boutId", "=", row.id)
    .where("userId", "=", user.id)
    .executeTakeFirst();
  if (jury) {
    return;
  }
  if (await isAdminOfBout(executor, user, row.id)) {
    return;
  }
  throw new HttpError(403, "You're not involved in this bout.");
}

export async function isAdminOfBout(executor: DbExecutor, user: AccessUser, boutId: string): Promise<boolean> {
  if (user.role === "SYSTEM_ADMIN") {
    return true;
  }
  const competitionIds = await boutCompetitionIds(executor, boutId);
  if (competitionIds.length === 0) {
    return false;
  }
  const admin = await executor
    .selectFrom("CompetitionAdmin")
    .select("competitionId")
    .where("userId", "=", user.id)
    .where("competitionId", "in", competitionIds)
    .executeTakeFirst();
  return admin !== undefined;
}

export async function requireUser(request: Parameters<typeof resolveAccessUser>[0], database: Kysely<BackendDatabase>): Promise<AccessUser> {
  const user = await resolveAccessUser(request, database);
  if (!user) {
    throw new HttpError(401, "Not authenticated.");
  }
  return user;
}

async function requireUsersExist(executor: DbExecutor, input: BoutInput): Promise<void> {
  const wanted = [input.fighterAUserId, input.fighterBUserId, input.refereeUserId, ...input.juryUserIds];
  if (input.tableUserId !== null) {
    wanted.push(input.tableUserId);
  }
  const found = new Set((await executor.selectFrom("User").select("id").where("id", "in", wanted).execute()).map((row) => row.id));
  const missing = wanted.find((userId) => !found.has(userId));
  if (missing !== undefined) {
    throw new HttpError(404, `User "${missing}" not found.`);
  }
}

async function sharedRunningCompetitions(executor: DbExecutor, userAId: string, userBId: string): Promise<string[]> {
  const rows = await executor
    .selectFrom("CompetitionParticipant")
    .innerJoin("Competition", "Competition.id", "CompetitionParticipant.competitionId")
    .select(["Competition.id as competitionId", "Competition.status as status", "CompetitionParticipant.userId as userId"])
    .where("CompetitionParticipant.userId", "in", [userAId, userBId])
    .execute();

  const enrolments = new Map<string, { competitionId: string; status: CompetitionStatus; enrolledUserIds: Set<string> }>();
  for (const row of rows) {
    const enrolment = enrolments.get(row.competitionId) ?? {
      competitionId: row.competitionId,
      status: row.status as CompetitionStatus,
      enrolledUserIds: new Set<string>(),
    };
    if (row.userId !== null) {
      enrolment.enrolledUserIds.add(row.userId);
    }
    enrolments.set(row.competitionId, enrolment);
  }
  return competitionsForBout(userAId, userBId, [...enrolments.values()]).sort();
}

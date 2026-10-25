import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Kysely, Selectable } from "kysely";
import { requirePathParam } from "../access-user.js";
import { requireUser } from "../bouts/bout-routes.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { ensureObject, HttpError, requireString } from "../http.js";
import { scoreOf, type BoutScore } from "./bout-score.js";
import { activeExchanges, enqueueSync, type LiveExchangeRow } from "./live-store.js";

type LiveBoutRow = Selectable<BackendDatabase["LiveBout"]>;

const MAX_POINTS = 10;
const MAX_SEQ_ATTEMPTS = 5;

interface ExchangeInput {
  clientExchangeId: string;
  kind: "EXCHANGE" | "DEDUCTION";
  leftPoints: number;
  rightPoints: number;
  isDouble: boolean;
  firstScorer: "LEFT" | "RIGHT" | null;
}

function requirePoints(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -MAX_POINTS || value > MAX_POINTS) {
    throw new HttpError(400, `${label} must be a whole number from -${MAX_POINTS} to ${MAX_POINTS}.`);
  }
  return value === 0 ? 0 : value; // normalises -0
}

/** Validates the request body. Anything that could end up as a wrong score is rejected here. */
export function parseExchangeInput(raw: unknown): ExchangeInput {
  const body = ensureObject(raw, "Exchange");
  const clientExchangeId = requireString(body.clientExchangeId, "clientExchangeId");
  if (clientExchangeId.length > 100) throw new HttpError(400, "clientExchangeId is too long.");
  if (body.kind !== "EXCHANGE" && body.kind !== "DEDUCTION") {
    throw new HttpError(400, "kind must be EXCHANGE or DEDUCTION.");
  }
  const kind = body.kind;
  const leftPoints = requirePoints(body.leftPoints, "leftPoints");
  const rightPoints = requirePoints(body.rightPoints, "rightPoints");
  if (kind === "DEDUCTION") {
    const oneNegative = (leftPoints < 0 && rightPoints === 0) || (rightPoints < 0 && leftPoints === 0);
    if (!oneNegative) {
      throw new HttpError(400, "A deduction needs exactly one negative side; the other side must be 0.");
    }
  } else if (leftPoints < 0 || rightPoints < 0) {
    throw new HttpError(400, "An exchange cannot have negative points; use a deduction.");
  } else if (leftPoints === 0 && rightPoints === 0) {
    throw new HttpError(400, "An exchange needs points for at least one fighter.");
  }
  const isDouble = kind === "EXCHANGE" && leftPoints > 0 && rightPoints > 0;
  if (body.isDouble !== undefined && body.isDouble !== null && body.isDouble !== isDouble) {
    throw new HttpError(400, "isDouble does not match the points (a double is both fighters scoring).");
  }
  let firstScorer: "LEFT" | "RIGHT" | null = null;
  if (body.firstScorer !== undefined && body.firstScorer !== null) {
    if (body.firstScorer !== "LEFT" && body.firstScorer !== "RIGHT") {
      throw new HttpError(400, "firstScorer must be LEFT, RIGHT or null.");
    }
    firstScorer = body.firstScorer;
  }
  return { clientExchangeId, kind, leftPoints, rightPoints, isDouble, firstScorer };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

async function getBout(db: DbExecutor, boutId: string): Promise<LiveBoutRow> {
  const bout = await db.selectFrom("LiveBout").selectAll().where("id", "=", boutId).executeTakeFirst();
  if (!bout) throw new HttpError(404, "Bout not found.");
  return bout;
}

function publicExchange(row: LiveExchangeRow) {
  return { ...row, isDouble: row.isDouble === 1 };
}

async function scoreFor(db: DbExecutor, boutId: string): Promise<BoutScore> {
  return scoreOf(await activeExchanges(db, boutId));
}

export function registerBoutRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.get("/api/v1/live-rings/:ringId/bouts", async (request) => {
    await requireUser(request, database);
    const ringId = requirePathParam(request, "ringId");
    const ring = await database.selectFrom("LiveRing").select("id").where("id", "=", ringId).executeTakeFirst();
    if (!ring) throw new HttpError(404, "Ring not found.");
    const bouts = await database.selectFrom("LiveBout").selectAll().where("ringId", "=", ringId).orderBy("order").execute();
    const scores = await boutScores(database, bouts.map((bout) => bout.id));
    return { bouts: bouts.map((bout) => ({ ...bout, score: scores.get(bout.id) ?? null })) };
  });

  app.get("/api/v1/live-bouts/:id", async (request) => {
    await requireUser(request, database);
    const bout = await getBout(database, requirePathParam(request, "id"));
    const exchanges = await activeExchanges(database, bout.id);
    return { bout, exchanges: exchanges.map(publicExchange), score: scoreOf(exchanges) };
  });

  // Start and finish change the bout's state only. They queue no sheet write: the sheet's content depends only on
  // the exchanges, and a write here would blank a bout range someone typed by hand.
  app.post("/api/v1/live-bouts/:id/start", async (request) => {
    await requireUser(request, database);
    const boutId = requirePathParam(request, "id");
    return database.transaction().execute(async (trx) => {
      const bout = await getBout(trx, boutId);
      if (bout.status === "DONE") throw new HttpError(409, "This bout is finished.");
      if (bout.status === "PENDING") {
        await trx
          .updateTable("LiveBout")
          .set({ status: "RUNNING", startedAt: app.now().toISOString() })
          .where("id", "=", boutId)
          .execute();
      }
      return { bout: await getBout(trx, boutId) };
    });
  });

  app.post("/api/v1/live-bouts/:id/exchanges", async (request, reply) => {
    const user = await requireUser(request, database);
    const boutId = requirePathParam(request, "id");
    const input = parseExchangeInput(request.body);
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await database.transaction().execute(async (trx) => {
          const bout = await getBout(trx, boutId);
          // A resend of an exchange we already stored returns it, whatever the bout's state is now.
          const existing = await trx
            .selectFrom("LiveExchange")
            .selectAll()
            .where("boutId", "=", boutId)
            .where("clientExchangeId", "=", input.clientExchangeId)
            .executeTakeFirst();
          if (existing) {
            const same =
              existing.kind === input.kind &&
              existing.leftPoints === input.leftPoints &&
              existing.rightPoints === input.rightPoints &&
              existing.isDouble === (input.isDouble ? 1 : 0) &&
              existing.firstScorer === input.firstScorer;
            if (!same) throw new HttpError(409, "clientExchangeId already used with different values");
            return { exchange: existing, score: await scoreFor(trx, boutId) };
          }
          if (bout.status === "DONE") throw new HttpError(409, "This bout is finished.");
          const now = app.now().toISOString();
          if (bout.status === "PENDING") {
            await trx.updateTable("LiveBout").set({ status: "RUNNING", startedAt: now }).where("id", "=", boutId).execute();
          }
          const last = await trx
            .selectFrom("LiveExchange")
            .select((eb) => eb.fn.max("seq").as("maxSeq"))
            .where("boutId", "=", boutId)
            .executeTakeFirst();
          const exchange: LiveExchangeRow = {
            id: randomUUID(),
            boutId,
            seq: (last?.maxSeq ?? 0) + 1,
            kind: input.kind,
            leftPoints: input.leftPoints,
            rightPoints: input.rightPoints,
            isDouble: input.isDouble ? 1 : 0,
            firstScorer: input.firstScorer,
            clientExchangeId: input.clientExchangeId,
            createdByUserId: user.id,
            createdAt: now,
            undoneAt: null,
          };
          await trx.insertInto("LiveExchange").values(exchange).execute();
          await enqueueSync(trx, bout.tournamentId, boutId, app.now());
          return { exchange, score: await scoreFor(trx, boutId) };
        });
        reply.code(200);
        return { exchange: publicExchange(result.exchange), score: result.score };
      } catch (error) {
        // Another request took this seq (or stored this clientExchangeId) first: re-read and try again.
        if (isUniqueViolation(error) && attempt < MAX_SEQ_ATTEMPTS) continue;
        throw error;
      }
    }
  });

  app.post("/api/v1/live-bouts/:id/undo", async (request) => {
    await requireUser(request, database);
    const boutId = requirePathParam(request, "id");
    // The client names the exchange it means to undo, so a retry after a timeout can't undo a second one.
    const body = ensureObject(request.body ?? {}, "Undo");
    if (typeof body.expectedExchangeId !== "string" || body.expectedExchangeId === "") {
      throw new HttpError(400, "expectedExchangeId is required: the id of the exchange to undo.");
    }
    const expectedExchangeId = body.expectedExchangeId;
    return database.transaction().execute(async (trx) => {
      const bout = await getBout(trx, boutId);
      // A retry of an undo that already happened answers again, whatever the bout's state is now.
      const expected = await trx
        .selectFrom("LiveExchange")
        .selectAll()
        .where("boutId", "=", boutId)
        .where("id", "=", expectedExchangeId)
        .executeTakeFirst();
      if (expected && expected.undoneAt !== null) {
        return { undone: publicExchange(expected), score: await scoreFor(trx, boutId) };
      }
      if (bout.status === "DONE") throw new HttpError(409, "This bout is finished.");
      const newest = await trx
        .selectFrom("LiveExchange")
        .selectAll()
        .where("boutId", "=", boutId)
        .where("undoneAt", "is", null)
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      if (!newest) throw new HttpError(409, "There is nothing to undo.");
      if (newest.id !== expectedExchangeId) {
        throw new HttpError(409, "The newest exchange is not the one you expected; nothing was undone.");
      }
      const undoneAt = app.now().toISOString();
      const updated = await trx
        .updateTable("LiveExchange")
        .set({ undoneAt })
        .where("id", "=", newest.id)
        .where("undoneAt", "is", null)
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) !== 1) throw new HttpError(409, "There is nothing to undo.");
      await enqueueSync(trx, bout.tournamentId, boutId, app.now());
      return { undone: publicExchange({ ...newest, undoneAt }), score: await scoreFor(trx, boutId) };
    });
  });

  app.post("/api/v1/live-bouts/:id/finish", async (request) => {
    await requireUser(request, database);
    const boutId = requirePathParam(request, "id");
    return database.transaction().execute(async (trx) => {
      const bout = await getBout(trx, boutId);
      if (bout.status !== "DONE") {
        const now = app.now().toISOString();
        await trx
          .updateTable("LiveBout")
          .set({ status: "DONE", startedAt: bout.startedAt ?? now, finishedAt: now })
          .where("id", "=", boutId)
          .execute();
      }
      return { bout: await getBout(trx, boutId), score: await scoreFor(trx, boutId) };
    });
  });
}

/** Scores for many bouts from their active exchanges, in one query. Bouts without exchanges are absent. */
export async function boutScores(db: DbExecutor, boutIds: string[]): Promise<Map<string, BoutScore>> {
  const scores = new Map<string, BoutScore>();
  if (boutIds.length === 0) return scores;
  const rows = await db
    .selectFrom("LiveExchange")
    .select(["boutId", "kind", "leftPoints", "rightPoints"])
    .where("boutId", "in", boutIds)
    .where("undoneAt", "is", null)
    .execute();
  const byBout = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byBout.get(row.boutId) ?? [];
    list.push(row);
    byBout.set(row.boutId, list);
  }
  for (const [boutId, list] of byBout) scores.set(boutId, scoreOf(list));
  return scores;
}

import { bearer, createTestContext, insertCompetition, insertUser, TestClock, type TestContext, type TestUser } from "./helpers.js";

export interface BoutWorld {
  ctx: TestContext;
  clock: TestClock;
  users: Record<string, TestUser>;
}

/**
 * Users f1–f3 (fighters), ref, jury1, table, outsider; admins ownerX, ownerY, ownerW, coY, sys.
 * X (RUNNING): f1, f2, f3 — owned by ownerX. Y (RUNNING): f1, f2 — owned by ownerY, co-admin coY.
 * W (RUNNING): nobody fighting — owned by ownerW.
 */
export async function createBoutWorld(): Promise<BoutWorld> {
  const clock = new TestClock();
  const ctx = await createTestContext({ now: () => clock.now() });
  const users: Record<string, TestUser> = {};
  for (const id of ["f1", "f2", "f3", "ref", "jury1", "table", "outsider"]) {
    users[id] = await insertUser(ctx.database, { id, role: "USER", name: id.toUpperCase() });
  }
  for (const id of ["ownerX", "ownerY", "ownerW", "coY"]) {
    users[id] = await insertUser(ctx.database, { id, role: "COMPETITION_ADMIN" });
  }
  users.sys = await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" });

  await insertCompetition(ctx.database, { id: "X", status: "RUNNING", userIds: ["f1", "f2", "f3"], adminUserId: "ownerX" });
  await insertCompetition(ctx.database, { id: "Y", status: "RUNNING", userIds: ["f1", "f2"], adminUserId: "ownerY" });
  await ctx.database.insertInto("CompetitionAdmin").values({ competitionId: "Y", userId: "coY", role: "CO_ADMIN" }).execute();
  await insertCompetition(ctx.database, { id: "W", status: "RUNNING", userIds: [], adminUserId: "ownerW" });
  return { ctx, clock, users };
}

/** Records a bout as the referee (5–3 to A by default) and returns its id. */
export async function recordBout(world: BoutWorld, overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await world.ctx.app.inject({
    method: "POST",
    url: "/api/v1/bouts",
    headers: bearer(world.users.ref!),
    payload: {
      fighterAUserId: "f1",
      fighterBUserId: "f2",
      refereeUserId: "ref",
      juryUserIds: ["jury1"],
      tableUserId: "table",
      startedAt: world.clock.now().toISOString(),
      scoreA: 5,
      scoreB: 3,
      winnerSide: "A",
      ...overrides,
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(`recordBout failed: ${response.statusCode} ${response.body}`);
  }
  return (response.json() as { id: string }).id;
}

export function boutAction(world: BoutWorld, as: string, boutId: string, path: string, payload?: Record<string, unknown>) {
  return world.ctx.app.inject({
    method: "POST",
    url: `/api/v1/bouts/${boutId}/${path}`,
    headers: bearer(world.users[as]!),
    payload: payload ?? {},
  });
}

export function getBout(world: BoutWorld, as: string, boutId: string) {
  return world.ctx.app.inject({ method: "GET", url: `/api/v1/bouts/${boutId}`, headers: bearer(world.users[as]!) });
}

/** Records a bout and has the referee approve it without on-the-spot fighter approval. */
export async function countedBout(world: BoutWorld, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = await recordBout(world, overrides);
  const response = await boutAction(world, "ref", id, "referee-approval", { fightersApprovedOnSpot: { A: false, B: false } });
  if (response.statusCode !== 200) {
    throw new Error(`referee approval failed: ${response.statusCode} ${response.body}`);
  }
  return id;
}

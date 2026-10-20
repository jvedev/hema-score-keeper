import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertCompetition, insertUser, TestClock, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
const users: Record<string, TestUser> = {};

function boutBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fighterAUserId: "f1",
    fighterBUserId: "f2",
    refereeUserId: "ref",
    juryUserIds: ["jury1", "jury2"],
    tableUserIds: ["table"],
    ring: "Ring 2",
    startedAt: "2026-10-15T20:40:00.000Z",
    scoreA: 5,
    scoreB: 3,
    winnerSide: "A",
    warningsA: 0,
    warningsB: 1,
    exchanges: [
      { atSeconds: 12, kind: "SCORE", side: "A", points: 2, reason: null },
      { atSeconds: 82, kind: "WARNING", side: "B", points: 0, reason: "grappling after halt" },
    ],
    startedInCompetitionId: "X",
    alsoCountIn: ["Y"],
    ...overrides,
  };
}

function record(body: Record<string, unknown>, as: TestUser | null = users.ref!) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/v1/bouts",
    ...(as ? { headers: bearer(as) } : {}),
    payload: body,
  });
}

beforeEach(async () => {
  const clock = new TestClock();
  clock.set("2026-10-15T21:00:00.000Z");
  ctx = await createTestContext({ now: () => clock.now() });
  for (const id of ["f1", "f2", "f3", "ref", "jury1", "jury2", "jury3", "jury4", "jury5", "table"]) {
    users[id] = await insertUser(ctx.database, { id, role: "USER", name: id.toUpperCase() });
  }
  await insertCompetition(ctx.database, { id: "X", status: "RUNNING", userIds: ["f1", "f2", "f3"] });
  await insertCompetition(ctx.database, { id: "Y", status: "RUNNING", userIds: ["f1", "f2"] });
  await insertCompetition(ctx.database, { id: "Z", status: "CLOSED", userIds: ["f1", "f2"] });
});

describe("POST /api/v1/bouts", () => {
  it("records a scored bout in every shared running competition", async () => {
    const response = await record(boutBody());
    expect(response.statusCode).toBe(200);
    const bout = response.json() as Record<string, unknown>;
    expect(bout).toMatchObject({
      status: "SCORED",
      revision: 1,
      ring: "Ring 2",
      fighterA: { userId: "f1", name: "F1" },
      fighterB: { userId: "f2", name: "F2" },
      referee: { userId: "ref", name: "REF" },
      table: [{ userId: "table", name: "TABLE" }],
      jury: [
        { seat: 1, userId: "jury1", name: "JURY1" },
        { seat: 2, userId: "jury2", name: "JURY2" },
      ],
      scoreA: 5,
      scoreB: 3,
      winnerSide: "A",
      windowEndsAt: null,
      objection: null,
    });
    expect((bout.competitionIds as string[]).sort()).toEqual(["X", "Y"]);
    expect(bout.exchanges).toHaveLength(2);
  });

  it("links only shared running competitions", async () => {
    const response = await record(boutBody({ fighterBUserId: "f3", alsoCountIn: [] }));
    expect((response.json() as { competitionIds: string[] }).competitionIds).toEqual(["X"]);
  });

  it("refuses fighters who share no running competition", async () => {
    await ctx.database.updateTable("Competition").set({ status: "CLOSED" }).execute();
    expect((await record(boutBody())).statusCode).toBe(400);
  });

  it("can be recorded by the table official", async () => {
    expect((await record(boutBody(), users.table!)).statusCode).toBe(200);
  });

  it("lets anyone who is logged in record the bout", async () => {
    const response = await record(boutBody(), users.f3!);
    expect(response.statusCode).toBe(200);
    const stored = await ctx.database.selectFrom("Bout").select("createdByUserId").executeTakeFirstOrThrow();
    expect(stored.createdByUserId).toBe("f3");
    expect((await record(boutBody(), null)).statusCode).toBe(401);
  });

  it("accepts zero or two table officials", async () => {
    expect((await record(boutBody({ tableUserIds: [] }))).statusCode).toBe(200);
    const two = await record(boutBody({ tableUserIds: ["table", "jury3"] }));
    expect(two.statusCode).toBe(200);
    expect((two.json() as { table: Array<{ userId: string }> }).table.map((person) => person.userId)).toEqual(["table", "jury3"]);
  });

  it.each([
    ["the same fighter twice", { fighterBUserId: "f1" }],
    ["a referee who is fighting", { refereeUserId: "f1" }],
    ["five jury members", { juryUserIds: ["jury1", "jury2", "jury3", "jury4", "jury5"] }],
    ["the same jury member twice", { juryUserIds: ["jury1", "jury1"] }],
    ["a jury member who is fighting", { juryUserIds: ["f2"] }],
    ["a winner with the lower score", { scoreA: 2, scoreB: 3, winnerSide: "A" }],
    ["a draw with unequal scores", { scoreA: 2, scoreB: 3, winnerSide: null }],
    ["an unknown exchange kind", { exchanges: [{ atSeconds: 1, kind: "PARRY", side: "A", points: 1, reason: null }] }],
    ["a start competition the bout isn't in", { startedInCompetitionId: "Z" }],
    ["a fighter as table official", { tableUserIds: ["f1"] }],
    ["the referee as table official", { tableUserIds: ["ref"] }],
    ["a jury member as table official", { tableUserIds: ["jury1"] }],
    ["three table officials", { tableUserIds: ["table", "jury3", "jury4"] }],
    ["the same table official twice", { tableUserIds: ["table", "table"] }],
    ["a start time years ago", { startedAt: "2020-01-01T10:00:00.000Z" }],
    ["a start time more than a day ago", { startedAt: "2026-10-14T20:00:00.000Z" }],
    ["a start time in the future", { startedAt: "2026-10-15T22:00:00.000Z" }],
  ])("rejects %s", async (_label, overrides) => {
    expect((await record(boutBody(overrides))).statusCode).toBe(400);
  });

  it("answers 404 for an unknown user", async () => {
    expect((await record(boutBody({ juryUserIds: ["ghost"] }))).statusCode).toBe(404);
  });
});

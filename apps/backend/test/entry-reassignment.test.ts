import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

/**
 * Safe tournament reassignment for `PATCH /api/v1/entries/:id`.
 *
 * A move is only a small correction when it cannot corrupt other records: it must require
 * tournament-admin rights on both tournaments, never duplicate the participant in the
 * destination, and leave the old tournament's history (matches, stage officials) consistent.
 */
describe("Entry tournament reassignment", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let outsider: TestUser;
  let fighter: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    admin = await insertUser(ctx.database, { id: "admin", role: "USER", name: "Tournament admin" });
    outsider = await insertUser(ctx.database, { id: "outsider", role: "USER", name: "Outsider" });
    fighter = await insertUser(ctx.database, { id: "fighter", role: "USER", name: "Fighter" });
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Tournament day",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
    for (const id of ["t1", "t2"]) {
      await ctx.database.insertInto("Tournament").values({
        id,
        eventId: "event",
        createdByUserId: admin.id,
        name: id === "t1" ? "Open longsword" : "Open sabre",
        rulesetId: null,
        currentStageId: null,
        order: 0,
        color: "#5B8CFF",
      }).execute();
      await ctx.database.insertInto("TournamentAdmin").values({
        tournamentId: id,
        userId: admin.id,
        addedByUserId: admin.id,
        createdAt: "2026-11-19T10:00:00.000Z",
      }).execute();
    }
    await ctx.database.insertInto("Entry").values([
      { id: "entry-1", tournamentId: "t1", userId: fighter.id, kind: "FIGHTER", seed: null },
      { id: "entry-2", tournamentId: "t2", userId: outsider.id, kind: "FIGHTER", seed: null },
    ]).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function patchEntry(user: TestUser, body: Record<string, unknown>): Promise<{ statusCode: number; json: () => any }> {
    const response = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/entries/entry-1",
      headers: bearer(user),
      payload: body,
    });
    return { statusCode: response.statusCode, json: () => response.json() };
  }

  async function entryRow(id: string): Promise<{ tournamentId: string; kind: string; seed: number | null } | undefined> {
    return await ctx.database.selectFrom("Entry")
      .select(["tournamentId", "kind", "seed"])
      .where("id", "=", id)
      .executeTakeFirst();
  }

  it("moves an entry to the destination tournament when the admin has rights to both", async () => {
    const response = await patchEntry(admin, { tournamentId: "t2" });
    expect(response.statusCode).toBe(200);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t2" });
  });

  it("keeps kind and seed updates working without a move", async () => {
    const response = await patchEntry(admin, { kind: "BOTH", seed: 3 });
    expect(response.statusCode).toBe(200);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t1", kind: "BOTH", seed: 3 });
  });

  it("applies a move with other field updates transactionally", async () => {
    const response = await patchEntry(admin, { tournamentId: "t2", kind: "VOLUNTEER", seed: 7 });
    expect(response.statusCode).toBe(200);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t2", kind: "VOLUNTEER", seed: 7 });
  });

  it("rejects a move without rights to the destination tournament and leaves data unchanged", async () => {
    // outsider manages nothing; also grant rights to the source so only the destination check can fail.
    await ctx.database.insertInto("TournamentAdmin").values({
      tournamentId: "t1",
      userId: outsider.id,
      addedByUserId: admin.id,
      createdAt: "2026-11-19T10:00:00.000Z",
    }).execute();
    const response = await patchEntry(outsider, { tournamentId: "t2" });
    expect(response.statusCode).toBe(403);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t1" });
  });

  it("rejects a move to an unknown tournament and leaves data unchanged", async () => {
    const response = await patchEntry(admin, { tournamentId: "missing" });
    expect(response.statusCode).toBe(404);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t1" });
  });

  it("rejects a move when the participant already has an entry in the destination", async () => {
    await ctx.database.insertInto("Entry").values({
      id: "entry-3",
      tournamentId: "t2",
      userId: fighter.id,
      kind: "FIGHTER",
      seed: null,
    }).execute();
    const response = await patchEntry(admin, { tournamentId: "t2" });
    expect(response.statusCode).toBe(409);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t1" });
    expect(await entryRow("entry-3")).toMatchObject({ tournamentId: "t2" });
  });

  it("rejects a move when a match in the old tournament still references the entry", async () => {
    await ctx.database.insertInto("Stage").values({
      id: "stage-1",
      tournamentId: "t1",
      type: "POOL",
      name: "Poules",
      rulesetId: null,
      minPoolSize: null,
      maxPoolSize: null,
      preferredPoolSize: null,
      eliminationParticipantCount: null,
      timeBetweenMatchesMinutes: 2,
    }).execute();
    await ctx.database.insertInto("Round").values({ id: "round-1", stageId: "stage-1", roundNumber: 1 }).execute();
    await ctx.database.insertInto("Match").values({
      id: "match-1",
      roundId: "round-1",
      arenaId: null,
      entryAId: "entry-1",
      entryBId: null,
      winnerEntryId: null,
      scoreA: null,
      scoreB: null,
      rulesetId: null,
    }).execute();
    const response = await patchEntry(admin, { tournamentId: "t2" });
    expect(response.statusCode).toBe(409);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t1" });
    const match = await ctx.database.selectFrom("Match").selectAll().where("id", "=", "match-1").executeTakeFirstOrThrow();
    expect(match.entryAId).toBe("entry-1");
  });

  it("rejects a move when a stage official assignment in the old tournament still references the entry", async () => {
    await ctx.database.insertInto("Stage").values({
      id: "stage-1",
      tournamentId: "t1",
      type: "POOL",
      name: "Poules",
      rulesetId: null,
      minPoolSize: null,
      maxPoolSize: null,
      preferredPoolSize: null,
      eliminationParticipantCount: null,
      timeBetweenMatchesMinutes: 2,
    }).execute();
    await ctx.database.insertInto("StageOfficial").values({
      id: "official-1",
      stageId: "stage-1",
      entryId: "entry-1",
      role: "JUDGE",
    }).execute();
    const response = await patchEntry(admin, { tournamentId: "t2" });
    expect(response.statusCode).toBe(409);
    expect(await entryRow("entry-1")).toMatchObject({ tournamentId: "t1" });
    const official = await ctx.database.selectFrom("StageOfficial").selectAll().where("id", "=", "official-1").executeTakeFirstOrThrow();
    expect(official.entryId).toBe("entry-1");
  });
});

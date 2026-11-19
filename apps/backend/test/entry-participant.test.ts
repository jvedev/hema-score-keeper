import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

/**
 * Scoped participant details for `PATCH /api/v1/entries/:id/participant`.
 *
 * The shared-person editor for a tournament workspace: a tournament admin may correct
 * the person's username, volunteer preferences and JUDGE/JURY skill ratings, but must
 * not receive unrestricted user-administration rights. The whole save is one
 * transaction so a failed save cannot leave half-updated details or duplicate skills.
 */
describe("Entry participant details", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let outsider: TestUser;
  let fighter: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    admin = await insertUser(ctx.database, { id: "admin", role: "USER", name: "Tournament admin" });
    outsider = await insertUser(ctx.database, { id: "outsider", role: "USER", name: "Outsider" });
    fighter = await insertUser(ctx.database, { id: "fighter", role: "USER", name: "Fighter Original" });
    await ctx.database.updateTable("User").set({ username: "fighter-original" }).where("id", "=", fighter.id).execute();
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Tournament day",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
    await ctx.database.insertInto("Tournament").values({
      id: "t1",
      eventId: "event",
      createdByUserId: admin.id,
      name: "Open longsword",
      rulesetId: null,
      currentStageId: null,
      order: 0,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("TournamentAdmin").values({
      tournamentId: "t1",
      userId: admin.id,
      addedByUserId: admin.id,
      createdAt: "2026-11-19T10:00:00.000Z",
    }).execute();
    await ctx.database.insertInto("Entry").values({
      id: "entry-1",
      tournamentId: "t1",
      userId: fighter.id,
      kind: "FIGHTER",
      seed: null,
    }).execute();
    await ctx.database.insertInto("Skill").values([
      { id: "skill-judge", userId: fighter.id, skillName: "JUDGE", skillLevel: 3 },
      { id: "skill-other", userId: fighter.id, skillName: "FIRST_AID", skillLevel: 2 },
    ]).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function patchParticipant(user: TestUser, body: Record<string, unknown>): Promise<{ statusCode: number; json: () => any }> {
    const response = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/entries/entry-1/participant",
      headers: bearer(user),
      payload: body,
    });
    return { statusCode: response.statusCode, json: () => response.json() };
  }

  async function userRow(id: string): Promise<{ username: string; judgeVolunteer: number; tableVolunteer: number }> {
    return await ctx.database.selectFrom("User")
      .select(["username", "judgeVolunteer", "tableVolunteer"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  async function skillRows(): Promise<Array<{ skillName: string; skillLevel: number }>> {
    return await ctx.database.selectFrom("Skill")
      .select(["skillName", "skillLevel"])
      .where("userId", "=", fighter.id)
      .orderBy("skillName")
      .execute();
  }

  it("rejects a tournament admin without access to the entry", async () => {
    const response = await patchParticipant(outsider, { username: "Fighter Other" });
    expect(response.statusCode).toBe(403);
    expect((await userRow(fighter.id)).username).toBe("fighter-original");
  });

  it("updates username, volunteer preferences and skills in one save", async () => {
    const response = await patchParticipant(admin, {
      username: "Fighter Renamed",
      judgeVolunteer: true,
      juryVolunteer: false,
      tableVolunteer: true,
      otherVolunteer: false,
      skills: [
        { skillName: "JUDGE", skillLevel: 4 },
        { skillName: "JURY", skillLevel: 2 },
      ],
    });
    expect(response.statusCode).toBe(200);
    const entry = response.json();
    expect(entry.user.username).toBe("Fighter Renamed");
    expect(entry.user.judgeVolunteer).toBe(true);
    expect(entry.user.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillName: "JUDGE", skillLevel: 4 }),
      expect.objectContaining({ skillName: "JURY", skillLevel: 2 }),
    ]));
    expect((await userRow(fighter.id)).tableVolunteer).toBeTruthy();
    expect(await skillRows()).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillName: "JUDGE", skillLevel: 4 }),
      expect.objectContaining({ skillName: "JURY", skillLevel: 2 }),
      expect.objectContaining({ skillName: "FIRST_AID", skillLevel: 2 }),
    ]));
  });

  it("separates the login username from the account name", async () => {
    const response = await patchParticipant(admin, { username: "Fighter Renamed" });
    expect(response.statusCode).toBe(200);
    const row = await ctx.database.selectFrom("User")
      .select(["name", "username"])
      .where("id", "=", fighter.id)
      .executeTakeFirstOrThrow();
    expect(row.username).toBe("Fighter Renamed");
    expect(row.name).toBe("Fighter Original");
  });

  it("rolls back the whole save when the username is already taken", async () => {
    await insertUser(ctx.database, { id: "taken", role: "USER", name: "Taken" });
    await ctx.database.updateTable("User").set({ username: "taken-username" }).where("id", "=", "taken").execute();
    const response = await patchParticipant(admin, {
      username: "taken-username",
      tableVolunteer: true,
      skills: [{ skillName: "JUDGE", skillLevel: 5 }],
    });
    expect(response.statusCode).toBe(409);
    expect((await userRow(fighter.id)).tableVolunteer).toBeFalsy();
    expect(await skillRows()).toEqual(expect.arrayContaining([expect.objectContaining({ skillName: "JUDGE", skillLevel: 3 })]));
  });

  it("clears a skill and keeps unrelated skills", async () => {
    const response = await patchParticipant(admin, { skills: [{ skillName: "JUDGE", skillLevel: null }] });
    expect(response.statusCode).toBe(200);
    const rows = await skillRows();
    expect(rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ skillName: "JUDGE" })]));
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ skillName: "FIRST_AID", skillLevel: 2 })]));
  });

  it("collapses duplicate existing skill rows into the desired level", async () => {
    await ctx.database.insertInto("Skill").values({
      id: "skill-judge-duplicate",
      userId: fighter.id,
      skillName: "JUDGE",
      skillLevel: 1,
    }).execute();
    const response = await patchParticipant(admin, { skills: [{ skillName: "JUDGE", skillLevel: 2 }] });
    expect(response.statusCode).toBe(200);
    const judgeRows = (await skillRows()).filter((row) => row.skillName === "JUDGE");
    expect(judgeRows).toEqual([{ skillName: "JUDGE", skillLevel: 2 }]);
  });

  it("rejects an empty or unknown skill name", async () => {
    const response = await patchParticipant(admin, { skills: [{ skillName: " ", skillLevel: 2 }] });
    expect(response.statusCode).toBe(400);
  });

  it("leaves all details untouched when the body is empty", async () => {
    const response = await patchParticipant(admin, {});
    expect(response.statusCode).toBe(200);
    expect((await userRow(fighter.id)).username).toBe("fighter-original");
    expect(await skillRows()).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillName: "JUDGE", skillLevel: 3 }),
    ]));
  });

  it("updates the entry kind, seed and tournament in the same save", async () => {
    await ctx.database.insertInto("Tournament").values({
      id: "t2",
      eventId: "event",
      createdByUserId: admin.id,
      name: "Open sabre",
      rulesetId: null,
      currentStageId: null,
      order: 1,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("TournamentAdmin").values({
      tournamentId: "t2",
      userId: admin.id,
      addedByUserId: admin.id,
      createdAt: "2026-11-19T10:00:00.000Z",
    }).execute();
    const response = await patchParticipant(admin, {
      kind: "BOTH",
      seed: 4,
      tournamentId: "t2",
    });
    expect(response.statusCode).toBe(200);
    const row = await ctx.database.selectFrom("Entry")
      .select(["tournamentId", "kind", "seed"])
      .where("id", "=", "entry-1")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ tournamentId: "t2", kind: "BOTH", seed: 4 });
  });

  it("refuses an unsafe move in the same save without changing person details", async () => {
    await ctx.database.insertInto("Tournament").values({
      id: "t2",
      eventId: "event",
      createdByUserId: admin.id,
      name: "Open sabre",
      rulesetId: null,
      currentStageId: null,
      order: 1,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("TournamentAdmin").values({
      tournamentId: "t2",
      userId: admin.id,
      addedByUserId: admin.id,
      createdAt: "2026-11-19T10:00:00.000Z",
    }).execute();
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
    const response = await patchParticipant(admin, {
      username: "Fighter Renamed",
      tournamentId: "t2",
    });
    expect(response.statusCode).toBe(409);
    expect((await userRow(fighter.id)).username).toBe("fighter-original");
  });
});

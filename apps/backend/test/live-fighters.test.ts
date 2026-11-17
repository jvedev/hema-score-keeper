import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";
import { createLiveTournament, type LiveFixture } from "./live-fixtures.js";

describe("live tournament fighters", () => {
  let ctx: TestContext;
  let anna: TestUser;
  let outsider: TestUser;
  let live: LiveFixture;

  beforeEach(async () => {
    ctx = await createTestContext();
    const owner = await insertUser(ctx.database, { id: "owner", role: "USER" });
    outsider = await insertUser(ctx.database, { id: "outsider", role: "USER" });
    anna = await insertUser(ctx.database, { id: "anna-account", role: "USER", name: "Anna" });
    const bea = await insertUser(ctx.database, { id: "bea-account", role: "USER", name: "Bea" });
    const otherA = await insertUser(ctx.database, { id: "other-a", role: "USER", name: "Other A" });
    const otherB = await insertUser(ctx.database, { id: "other-b", role: "USER", name: "Other B" });
    live = await createLiveTournament(ctx, {
      admin: owner,
      name: "Open",
      rings: [{ key: "a", name: "Ring A" }],
      bouts: [
        { key: "now", ring: "a", left: otherA, right: otherB },
        { key: "anna", ring: "a", left: anna, right: bea },
      ],
    });
    await ctx.database.updateTable("LiveBout")
      .set({ status: "RUNNING", startedAt: "2026-10-28T10:00:00.000Z" })
      .where("id", "=", live.boutId("now"))
      .execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("takes each fighter's account from the source tournament's entries", async () => {
    const fighters = await ctx.database.selectFrom("LiveTournamentFighter")
      .select(["name", "userId"])
      .where("tournamentId", "=", live.liveTournamentId)
      .orderBy("name")
      .execute();
    expect(fighters).toEqual([
      { name: "Anna", userId: anna.id },
      { name: "Bea", userId: "bea-account" },
      { name: "Other A", userId: "other-a" },
      { name: "Other B", userId: "other-b" },
    ]);
  });

  it("returns the signed-in fighter's schedule and on-deck status without accepting an account id from the client", async () => {
    const annaFighter = await ctx.database.selectFrom("LiveTournamentFighter")
      .select("id")
      .where("userId", "=", anna.id)
      .executeTakeFirstOrThrow();

    const list = await ctx.app.inject({ method: "GET", url: "/api/v1/me/live-tournaments", headers: bearer(anna) });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({
      tournaments: [{ id: live.liveTournamentId, name: "Open", fighterId: annaFighter.id, fighterName: "Anna" }],
    });

    const view = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${live.liveTournamentId}/fighter-view`,
      headers: bearer(anna),
    });
    expect(view.statusCode).toBe(200);
    const viewBody = view.json() as {
      fighter: { id: string; name: string };
      schedule: Array<{ id: string; mySide: string; isOnDeck: boolean; ringName: string; poolName: string }>;
      pools: Array<{ name: string; bouts: Array<{ id: string; status: string }> }>;
    };
    const annaBout = live.boutId("anna");
    expect(viewBody.fighter).toEqual({ id: annaFighter.id, name: "Anna" });
    expect(viewBody.schedule).toEqual([
      expect.objectContaining({ id: annaBout, mySide: "LEFT", isOnDeck: true, ringName: "Ring A", poolName: "Bracket · Slot 1" }),
    ]);
    expect(viewBody.schedule[0]).not.toHaveProperty("sheetName");
    expect(viewBody.pools).toEqual([
      {
        name: "Bracket · Slot 1",
        bouts: [
          expect.objectContaining({ id: live.boutId("now"), status: "RUNNING" }),
          expect.objectContaining({ id: annaBout, status: "PENDING" }),
        ],
      },
    ]);

    const otherAccount = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${live.liveTournamentId}/fighter-view?userId=${anna.id}`,
      headers: bearer(outsider),
    });
    expect(otherAccount.statusCode).toBe(404);
    const outsiderList = await ctx.app.inject({ method: "GET", url: "/api/v1/me/live-tournaments", headers: bearer(outsider) });
    expect(outsiderList.json()).toEqual({ tournaments: [] });
  });
});

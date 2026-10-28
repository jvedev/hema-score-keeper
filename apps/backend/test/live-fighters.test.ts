import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

describe("live tournament fighters", () => {
  let ctx: TestContext;
  let owner: TestUser;
  let outsider: TestUser;
  let tournamentId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    owner = await insertUser(ctx.database, { id: "owner", role: "USER" });
    outsider = await insertUser(ctx.database, { id: "outsider", role: "USER" });
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/live-tournaments",
      headers: bearer(owner),
      payload: { name: "Open" },
    });
    expect(response.statusCode).toBe(200);
    tournamentId = (response.json() as { id: string }).id;
    await ctx.database
      .insertInto("LiveTournamentFighter")
      .values([
        { id: "fighter-1", tournamentId, name: "Anna", nameKey: "anna", userId: null, active: 1, ambiguous: 0, createdAt: "now", updatedAt: "now" },
        { id: "fighter-2", tournamentId, name: "Bea", nameKey: "bea", userId: null, active: 1, ambiguous: 0, createdAt: "now", updatedAt: "now" },
      ])
      .execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("lets the tournament owner link and unlink accounts, but rejects duplicate links", async () => {
    const account = await insertUser(ctx.database, { id: "anna-account", role: "USER", name: "Anna A" });
    const get = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters`,
      headers: bearer(owner),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({
      fighters: [
        { id: "fighter-1", name: "Anna", userId: null, user: null },
        { id: "fighter-2", name: "Bea", userId: null, user: null },
      ],
    });

    const linked = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters/fighter-1/account`,
      headers: bearer(owner),
      payload: { userId: account.id },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toMatchObject({ fighter: { id: "fighter-1", userId: account.id } });

    const duplicate = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters/fighter-2/account`,
      headers: bearer(owner),
      payload: { userId: account.id },
    });
    expect(duplicate.statusCode).toBe(409);

    const unlinked = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters/fighter-1/account`,
      headers: bearer(owner),
      payload: { userId: null },
    });
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json()).toMatchObject({ fighter: { id: "fighter-1", userId: null } });
  });

  it("restricts roster management to the tournament owner or system admins", async () => {
    const deniedList = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters`,
      headers: bearer(outsider),
    });
    expect(deniedList.statusCode).toBe(403);

    const deniedLink = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters/fighter-1/account`,
      headers: bearer(outsider),
      payload: { userId: outsider.id },
    });
    expect(deniedLink.statusCode).toBe(403);
  });

  it("requires explicit identity assignments for repeated names before account linking", async () => {
    const annaOne = await insertUser(ctx.database, { id: "anna-one", role: "USER" });
    const annaTwo = await insertUser(ctx.database, { id: "anna-two", role: "USER" });
    await ctx.database.insertInto("LiveRing").values({
      id: "identity-ring",
      tournamentId,
      name: "Ring A",
      order: 1,
      keeperToken: "identity-keeper",
      activeDeviceId: null,
      activeUserId: null,
      activeSince: null,
      scoreboardToken: "identity-scoreboard",
      leftColor: "#21c15b",
      rightColor: "#2f7dfa",
    }).execute();
    await ctx.database.insertInto("LiveBout").values([
      {
        id: "identity-bout-1", tournamentId, ringId: "identity-ring", order: 1, label: "Bout 1", sheetName: "Pool_1", headerCell: "B25",
        fighterLeft: "Anna", fighterRight: "Other 1", fighterLeftId: null, fighterRightId: null, status: "PENDING", startedAt: null, finishedAt: null,
      },
      {
        id: "identity-bout-2", tournamentId, ringId: "identity-ring", order: 2, label: "Bout 2", sheetName: "Pool_1", headerCell: "H25",
        fighterLeft: "Anna", fighterRight: "Other 2", fighterLeftId: null, fighterRightId: null, status: "PENDING", startedAt: null, finishedAt: null,
      },
    ]).execute();
    await ctx.database.updateTable("LiveTournamentFighter").set({ ambiguous: 1 }).where("id", "=", "fighter-1").execute();

    const blockedLink = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters/fighter-1/account`,
      headers: bearer(owner),
      payload: { userId: annaOne.id },
    });
    expect(blockedLink.statusCode).toBe(409);

    const created = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-tournaments/${tournamentId}/fighters/identities`,
      headers: bearer(owner),
      payload: { name: "Anna" },
    });
    expect(created.statusCode).toBe(200);
    const secondIdentity = (created.json() as { fighter: { id: string } }).fighter.id;

    const unresolved = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${tournamentId}/ambiguous-bouts`,
      headers: bearer(owner),
    });
    const unresolvedBouts = (unresolved.json() as { bouts: Array<{ id: string; left: { candidates: Array<{ id: string }> } }> }).bouts;
    expect(unresolvedBouts.map((bout) => bout.id)).toEqual(["identity-bout-1", "identity-bout-2"]);
    for (const bout of unresolvedBouts) {
      expect(bout.left.candidates.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(["fighter-1", secondIdentity]));
    }

    for (const [boutId, fighterId] of [["identity-bout-1", "fighter-1"], ["identity-bout-2", secondIdentity]]) {
      const assigned = await ctx.app.inject({
        method: "PUT",
        url: `/api/v1/live-tournaments/${tournamentId}/bouts/${boutId}/sides/LEFT/identity`,
        headers: bearer(owner),
        payload: { fighterId },
      });
      expect(assigned.statusCode).toBe(200);
    }

    const linkedOne = await ctx.app.inject({
      method: "PUT", url: `/api/v1/live-tournaments/${tournamentId}/fighters/fighter-1/account`, headers: bearer(owner), payload: { userId: annaOne.id },
    });
    const linkedTwo = await ctx.app.inject({
      method: "PUT", url: `/api/v1/live-tournaments/${tournamentId}/fighters/${secondIdentity}/account`, headers: bearer(owner), payload: { userId: annaTwo.id },
    });
    expect(linkedOne.statusCode).toBe(200);
    expect(linkedTwo.statusCode).toBe(200);
    const resolved = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${tournamentId}/ambiguous-bouts`,
      headers: bearer(owner),
    });
    expect((resolved.json() as { bouts: unknown[] }).bouts).toHaveLength(0);
  });

  it("returns a linked fighter's schedule and on-deck status without accepting an account id from the client", async () => {
    const fighterAccount = await insertUser(ctx.database, { id: "anna-account", role: "USER", name: "Anna A" });
    await ctx.database.updateTable("LiveTournamentFighter").set({ userId: fighterAccount.id }).where("id", "=", "fighter-1").execute();
    await ctx.database
      .insertInto("LiveRing")
      .values({
        id: "ring-1",
        tournamentId,
        name: "Ring A",
        order: 1,
        keeperToken: "keeper-token",
        activeDeviceId: null,
        activeUserId: null,
        activeSince: null,
        scoreboardToken: "scoreboard-token",
        leftColor: "#21c15b",
        rightColor: "#2f7dfa",
      })
      .execute();
    await ctx.database
      .insertInto("LiveBout")
      .values([
        {
          id: "bout-now",
          tournamentId,
          ringId: "ring-1",
          order: 1,
          label: "Match 1",
          sheetName: "Pool_1",
          headerCell: "B25",
          fighterLeft: "Other A",
          fighterRight: "Other B",
          fighterLeftId: null,
          fighterRightId: null,
          status: "RUNNING",
          startedAt: "2026-10-28T10:00:00.000Z",
          finishedAt: null,
        },
        {
          id: "bout-anna",
          tournamentId,
          ringId: "ring-1",
          order: 2,
          label: "Match 2",
          sheetName: "Pool_1",
          headerCell: "H25",
          fighterLeft: "Anna",
          fighterRight: "Bea",
          fighterLeftId: "fighter-1",
          fighterRightId: "fighter-2",
          status: "PENDING",
          startedAt: null,
          finishedAt: null,
        },
      ])
      .execute();

    const list = await ctx.app.inject({ method: "GET", url: "/api/v1/me/live-tournaments", headers: bearer(fighterAccount) });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      tournaments: [{ id: tournamentId, name: "Open", fighterId: "fighter-1", fighterName: "Anna" }],
    });

    const view = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${tournamentId}/fighter-view`,
      headers: bearer(fighterAccount),
    });
    expect(view.statusCode).toBe(200);
    const viewBody = view.json() as {
      fighter: { id: string; name: string };
      schedule: Array<{ id: string; mySide: string; isOnDeck: boolean; ringName: string }>;
      pools: Array<{ name: string; bouts: Array<{ id: string; status: string }> }>;
    };
    expect(viewBody.fighter).toEqual({ id: "fighter-1", name: "Anna" });
    expect(viewBody.schedule).toContainEqual(expect.objectContaining({ id: "bout-anna", mySide: "LEFT", isOnDeck: true, ringName: "Ring A" }));
    expect(viewBody.pools.find((pool) => pool.name === "Pool_1")?.bouts).toContainEqual(expect.objectContaining({ id: "bout-anna", status: "PENDING" }));

    const otherAccount = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/live-tournaments/${tournamentId}/fighter-view?userId=${fighterAccount.id}`,
      headers: bearer(outsider),
    });
    expect(otherAccount.statusCode).toBe(404);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

describe("Event-admin tournament administrators", () => {
  let ctx: TestContext;
  let creator: TestUser;
  let other: TestUser;
  let systemAdmin: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    creator = await insertUser(ctx.database, { id: "creator", role: "USER", name: "Creator" });
    other = await insertUser(ctx.database, { id: "other", role: "USER", name: "Other" });
    systemAdmin = await insertUser(ctx.database, { id: "system", role: "SYSTEM_ADMIN", name: "System admin" });
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Tournament day",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function createTournament(user = creator): Promise<string> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/tournaments",
      headers: bearer(user),
      payload: { eventId: "event", name: "Open" },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { id: string }).id;
  }

  it("requires sign-in and makes the authenticated creator an admin atomically", async () => {
    const anonymous = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/tournaments",
      payload: { eventId: "event", name: "Open" },
    });
    expect(anonymous.statusCode).toBe(401);

    const tournamentId = await createTournament();
    const tournament = await ctx.database.selectFrom("Tournament")
      .select("createdByUserId")
      .where("id", "=", tournamentId)
      .executeTakeFirstOrThrow();
    expect(tournament.createdByUserId).toBe(creator.id);

    const response = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/tournaments/${tournamentId}/admins`,
      headers: bearer(creator),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      admins: [{ userId: creator.id, user: { id: creator.id, name: "Creator" } }],
    });

    const candidates = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/tournaments/${tournamentId}/admin-candidates`,
      headers: bearer(creator),
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().candidates).toEqual(expect.arrayContaining([
      { id: other.id, name: "Other", username: other.id },
    ]));
  });

  it("lets a tournament admin add and remove admins without duplicates or lockout", async () => {
    const tournamentId = await createTournament();
    const add = () => ctx.app.inject({
      method: "POST",
      url: `/api/v1/tournaments/${tournamentId}/admins`,
      headers: bearer(creator),
      payload: { userId: other.id },
    });
    expect((await add()).statusCode).toBe(200);
    expect((await add()).json().admins).toHaveLength(2);

    const removeOther = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/tournaments/${tournamentId}/admins/${other.id}`,
      headers: bearer(creator),
    });
    expect(removeOther.statusCode).toBe(204);

    const removeLast = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/tournaments/${tournamentId}/admins/${creator.id}`,
      headers: bearer(creator),
    });
    expect(removeLast.statusCode).toBe(409);
  });

  it("keeps legacy tournaments unowned until a system admin explicitly assigns the first admin", async () => {
    await ctx.database.insertInto("Tournament").values({
      id: "legacy",
      eventId: "event",
      createdByUserId: null,
      name: "Legacy",
      rulesetId: null,
      currentStageId: null,
      order: 0,
      color: "#5B8CFF",
    }).execute();

    const refused = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/tournaments/legacy/admins",
      headers: bearer(creator),
      payload: { userId: other.id },
    });
    expect(refused.statusCode).toBe(403);

    const assigned = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/tournaments/legacy/admins",
      headers: bearer(systemAdmin),
      payload: { userId: other.id },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().admins).toMatchObject([{ userId: other.id }]);
  });

  it("does not allow unrelated signed-in users to inspect or change the admin list", async () => {
    const tournamentId = await createTournament();
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/tournaments/${tournamentId}/admins`,
      headers: bearer(other),
      payload: { userId: systemAdmin.id },
    });
    expect(response.statusCode).toBe(403);

    const list = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/tournaments/${tournamentId}/admins`,
      headers: bearer(other),
    });
    expect(list.statusCode).toBe(403);

    const candidates = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/tournaments/${tournamentId}/admin-candidates`,
      headers: bearer(other),
    });
    expect(candidates.statusCode).toBe(403);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertClub, insertCompetition, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
const users: Record<string, TestUser> = {};

/**
 * Club c1 runs H, a CLUB_ONLY competition (open scope, registration open) managed by owner.
 * u1 is a member of c1; u2 and u3 are outsiders from club c2.
 */
beforeEach(async () => {
  ctx = await createTestContext();
  await insertClub(ctx.database, { id: "c1" });
  await insertClub(ctx.database, { id: "c2" });
  users.u1 = await insertUser(ctx.database, { id: "u1", role: "USER", clubId: "c1" });
  users.u2 = await insertUser(ctx.database, { id: "u2", role: "USER", clubId: "c2" });
  users.u3 = await insertUser(ctx.database, { id: "u3", role: "USER", clubId: "c2" });
  users.owner = await insertUser(ctx.database, { id: "owner", role: "COMPETITION_ADMIN" });
  await insertCompetition(ctx.database, { id: "H", status: "REGISTRATION_OPEN", userIds: [], adminUserId: "owner" });
  await ctx.database.updateTable("Competition").set({ visibility: "CLUB_ONLY", clubId: "c1" }).where("id", "=", "H").execute();
});

function get(as: string, url: string) {
  return ctx.app.inject({ method: "GET", url, headers: bearer(users[as]!) });
}

function signup(as: string, payload: Record<string, unknown> = {}) {
  return ctx.app.inject({ method: "POST", url: "/api/v1/competitions/H/signup", headers: bearer(users[as]!), payload });
}

async function newInvite(): Promise<string> {
  const response = await ctx.app.inject({ method: "POST", url: "/api/v1/competitions/H/invite", headers: bearer(users.owner!) });
  expect(response.statusCode).toBe(200);
  return (response.json() as { inviteCode: string }).inviteCode;
}

const READS = ["/api/v1/competitions/H", "/api/v1/competitions/H/standings", "/api/v1/competitions/H/bout-history", "/api/v1/competitions/H/participants"];

describe("a club-only competition", () => {
  it("an invited outsider can read it after joining", async () => {
    for (const url of READS) {
      expect((await get("u2", url)).statusCode).toBe(404);
    }
    expect((await signup("u2", { inviteCode: await newInvite() })).statusCode).toBe(200);

    for (const url of READS) {
      expect((await get("u2", url)).statusCode, url).toBe(200);
    }
    const list = (await get("u2", "/api/v1/competitions")).json() as Array<{ id: string }>;
    expect(list.map((competition) => competition.id)).toContain("H");
    const home = (await get("u2", "/api/v1/me/home")).json() as { competitions: Array<{ id: string }> };
    expect(home.competitions.map((competition) => competition.id)).toEqual(["H"]);

    // Other outsiders still can't.
    expect((await get("u3", "/api/v1/competitions/H")).statusCode).toBe(404);
    expect(((await get("u3", "/api/v1/competitions")).json() as Array<{ id: string }>).map((competition) => competition.id)).not.toContain("H");
  });

  it("a fighter who left can still read it", async () => {
    expect((await signup("u2", { inviteCode: await newInvite() })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "DELETE", url: "/api/v1/competitions/H/signup", headers: bearer(users.u2!) })).statusCode).toBe(200);
    expect((await get("u2", "/api/v1/competitions/H/standings")).statusCode).toBe(200);
  });

  it("refuses an outsider's sign-up without an invite as not found", async () => {
    const refused = await signup("u2");
    expect(refused.statusCode).toBe(404);
    expect((await signup("u2", { inviteCode: "not-a-real-code" })).statusCode).toBe(404);
    expect((await get("owner", "/api/v1/competitions/H/participants")).json()).toEqual([]);
  });

  it("club members still sign up without a code", async () => {
    expect((await signup("u1")).statusCode).toBe(200);
  });
});

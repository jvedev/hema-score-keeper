import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertClub, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

describe("old bout routes", () => {
  it.each([
    ["POST", "/api/v1/competitions/competition-1/bouts"],
    ["PUT", "/api/v1/competitions/competition-1/bouts/bout-1"],
    ["DELETE", "/api/v1/competitions/competition-1/bouts/bout-1"],
  ] as const)("%s %s is gone", async (method, url) => {
    const response = await ctx.app.inject({ method, url, payload: {} });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: "Recording bouts moved to the score-keeper." });
  });

  it("still lists legacy bouts", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/competition-1/bouts" });
    expect(response.statusCode).toBe(200);
    expect((response.json() as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("old bout reads", () => {
  const WARNING = { type: "warning", fighterId: "participant-2", elapsedTimeSeconds: 12, description: "Strike to the back of the head" };
  const EXCHANGE = { type: "exchange", scoreA: 1, scoreB: 0 };
  let users: Record<string, TestUser>;

  beforeEach(async () => {
    await insertClub(ctx.database, { id: "c1" });
    await insertClub(ctx.database, { id: "c2" });
    users = {
      owner: await insertUser(ctx.database, { id: "owner", role: "COMPETITION_ADMIN" }),
      other: await insertUser(ctx.database, { id: "other", role: "COMPETITION_ADMIN" }),
      sys: await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" }),
      member: await insertUser(ctx.database, { id: "member", role: "USER", clubId: "c1" }),
      outsider: await insertUser(ctx.database, { id: "outsider", role: "USER", clubId: "c2" }),
    };
    await ctx.database.insertInto("CompetitionAdmin").values({ competitionId: "competition-1", userId: "owner", role: "OWNER" }).execute();
    await ctx.database
      .updateTable("CompetitionBout")
      .set({ details: JSON.stringify({ note: "Pool match 1", events: [EXCHANGE, WARNING] }) })
      .where("id", "=", "bout-1")
      .execute();
  });

  function get(as: string | null, url: string) {
    return ctx.app.inject({ method: "GET", url, headers: as === null ? {} : bearer(users[as]!) });
  }

  type LegacyBout = { id: string; details: { events: Array<{ type: string }> } };

  it("hides warnings from everyone but the competition's admins", async () => {
    for (const as of [null, "member", "other"]) {
      const list = await get(as, "/api/v1/competitions/competition-1/bouts");
      expect(list.statusCode).toBe(200);
      expect(list.body).not.toContain("back of the head");
      const one = await get(as, "/api/v1/competitions/competition-1/bouts/bout-1");
      expect(one.statusCode).toBe(200);
      expect((one.json() as LegacyBout).details.events).toEqual([EXCHANGE]);
      expect(one.body).not.toContain("back of the head");
    }
    for (const as of ["owner", "sys"]) {
      const list = (await get(as, "/api/v1/competitions/competition-1/bouts")).json() as LegacyBout[];
      expect(list.find((bout) => bout.id === "bout-1")!.details.events).toEqual([EXCHANGE, WARNING]);
      expect(((await get(as, "/api/v1/competitions/competition-1/bouts/bout-1")).json() as LegacyBout).details.events).toEqual([EXCHANGE, WARNING]);
    }
  });

  it("an unpublished bout is not found", async () => {
    await ctx.database.updateTable("CompetitionBout").set({ published: 0 }).where("id", "=", "bout-1").execute();
    expect((await get(null, "/api/v1/competitions/competition-1/bouts/bout-1")).statusCode).toBe(404);
    expect((await get("owner", "/api/v1/competitions/competition-1/bouts/bout-1")).statusCode).toBe(404);
  });

  it("a bout of a competition you may not see is not found", async () => {
    await ctx.database.updateTable("Competition").set({ visibility: "CLUB_ONLY", clubId: "c1" }).where("id", "=", "competition-1").execute();
    expect((await get("outsider", "/api/v1/competitions/competition-1/bouts/bout-1")).statusCode).toBe(404);
    expect((await get(null, "/api/v1/competitions/competition-1/bouts/bout-1")).statusCode).toBe(404);
    expect((await get("member", "/api/v1/competitions/competition-1/bouts/bout-1")).statusCode).toBe(200);
  });
});

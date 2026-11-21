import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

describe("skill routes need an admin", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let plain: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    admin = await insertUser(ctx.database, { id: "admin", role: "COMPETITION_ADMIN" });
    plain = await insertUser(ctx.database, { id: "plain", role: "USER" });
    await ctx.database.insertInto("Skill").values({ id: "sk", userId: "plain", skillName: "JUDGE", skillLevel: 2 }).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const requests = [
    { method: "POST" as const, url: "/api/v1/skills", payload: { userId: "plain", skillName: "JURY", skillLevel: 3 } },
    { method: "PATCH" as const, url: "/api/v1/skills/sk", payload: { skillLevel: 5 } },
    { method: "DELETE" as const, url: "/api/v1/skills/sk" },
  ];

  it("refuses anonymous callers and plain users, and changes nothing", async () => {
    for (const request of requests) {
      expect((await ctx.app.inject(request)).statusCode, `${request.method} anonymous`).toBe(403);
      expect((await ctx.app.inject({ ...request, headers: bearer(plain) })).statusCode, `${request.method} plain`).toBe(403);
    }
    const skills = await ctx.database.selectFrom("Skill").selectAll().execute();
    expect(skills).toEqual([{ id: "sk", userId: "plain", skillName: "JUDGE", skillLevel: 2 }]);
  });

  it("lets an admin create, change and delete skills", async () => {
    expect((await ctx.app.inject({ ...requests[0]!, headers: bearer(admin) })).statusCode).toBe(200);
    expect((await ctx.app.inject({ ...requests[1]!, headers: bearer(admin) })).statusCode).toBe(200);
    expect((await ctx.app.inject({ ...requests[2]!, headers: bearer(admin) })).statusCode).toBe(204);
  });
});

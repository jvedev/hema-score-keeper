import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertClub, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
let me: TestUser;

function search(q: string, as: TestUser | null = me) {
  return ctx.app.inject({
    method: "GET",
    url: `/api/v1/people?q=${encodeURIComponent(q)}`,
    ...(as ? { headers: bearer(as) } : {}),
  });
}

beforeEach(async () => {
  ctx = await createTestContext();
  await insertClub(ctx.database, { id: "ochs", name: "Ochs Utrecht" });
  me = await insertUser(ctx.database, { id: "me", role: "USER", name: "Maren de Vries" });
  await insertUser(ctx.database, { id: "daan", role: "USER", name: "Daan Mulder", clubId: "ochs" });
  await insertUser(ctx.database, { id: "sanne", role: "COMPETITION_ADMIN", name: "Sanne Visser" });
  await insertUser(ctx.database, { id: "tomas", role: "USER", name: "Tomas Kuiper" });
});

describe("GET /api/v1/people", () => {
  it("finds people by name, without roles or emails", async () => {
    const response = await search("AN");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { userId: "daan", name: "Daan Mulder", username: "daan", clubName: "Ochs Utrecht" },
      { userId: "sanne", name: "Sanne Visser", username: "sanne", clubName: null },
    ]);
  });

  it("finds people by username", async () => {
    const response = await search("tom");
    expect((response.json() as Array<{ userId: string }>).map((person) => person.userId)).toEqual(["tomas"]);
  });

  it("treats % and _ as ordinary characters", async () => {
    await insertUser(ctx.database, { id: "odd", role: "USER", name: "Max 50%_Club" });
    expect((await search("50%_")).json()).toEqual([{ userId: "odd", name: "Max 50%_Club", username: "odd", clubName: null }]);
    expect((await search("%%")).json()).toEqual([]);
  });

  it("needs at least two characters", async () => {
    expect((await search("a")).statusCode).toBe(400);
  });

  it("needs a login", async () => {
    expect((await search("an", null)).statusCode).toBe(401);
  });
});

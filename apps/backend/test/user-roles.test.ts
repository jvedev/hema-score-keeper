import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertClub, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
let competitionAdmin: TestUser;
let systemAdmin: TestUser;
let member: TestUser;

function createUser(as: TestUser, payload: Record<string, unknown>) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/v1/users",
    headers: bearer(as),
    payload: { name: "New", username: `new-${Math.random().toString(36).slice(2)}`, ...payload },
  });
}

function patchUser(as: TestUser, id: string, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: "PATCH", url: `/api/v1/users/${id}`, headers: bearer(as), payload });
}

beforeEach(async () => {
  ctx = await createTestContext();
  await insertClub(ctx.database, { id: "club-1" });
  await insertClub(ctx.database, { id: "club-2" });
  competitionAdmin = await insertUser(ctx.database, { id: "comp-admin", role: "COMPETITION_ADMIN", clubId: "club-1" });
  systemAdmin = await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" });
  member = await insertUser(ctx.database, { id: "member", role: "USER", clubId: "club-1" });
});

describe("role changes", () => {
  it("stops a competition admin creating a system admin", async () => {
    expect((await createUser(competitionAdmin, { role: "SYSTEM_ADMIN" })).statusCode).toBe(403);
    expect((await createUser(competitionAdmin, { role: "COMPETITION_ADMIN" })).statusCode).toBe(200);
  });

  it("stops a competition admin promoting anyone to system admin", async () => {
    expect((await patchUser(competitionAdmin, "comp-admin", { role: "SYSTEM_ADMIN" })).statusCode).toBe(403);
    expect((await patchUser(competitionAdmin, "member", { role: "SYSTEM_ADMIN" })).statusCode).toBe(403);
  });

  it("stops a competition admin moving themselves to another club", async () => {
    expect((await patchUser(competitionAdmin, "comp-admin", { clubId: "club-2" })).statusCode).toBe(403);
  });

  it("stops a competition admin changing a system admin", async () => {
    expect((await patchUser(competitionAdmin, "sys", { role: "USER" })).statusCode).toBe(403);
  });

  it("still lets a competition admin manage ordinary users", async () => {
    expect((await patchUser(competitionAdmin, "member", { role: "COMPETITION_ADMIN" })).statusCode).toBe(200);
  });

  it("lets a system admin do all of it", async () => {
    expect((await createUser(systemAdmin, { role: "SYSTEM_ADMIN" })).statusCode).toBe(200);
    expect((await patchUser(systemAdmin, "comp-admin", { clubId: "club-2", role: "SYSTEM_ADMIN" })).statusCode).toBe(200);
  });
});

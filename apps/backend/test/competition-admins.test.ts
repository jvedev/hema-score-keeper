import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
let owner: TestUser;
let adminB: TestUser;
let adminC: TestUser;
let outsider: TestUser;
let plainUser: TestUser;
let systemAdmin: TestUser;
let competitionId: string;

function admins(user: TestUser = owner) {
  return ctx.app.inject({ method: "GET", url: `/api/v1/competitions/${competitionId}/admins`, headers: bearer(user) });
}

function addAdmin(userId: string, as: TestUser = owner) {
  return ctx.app.inject({
    method: "POST",
    url: `/api/v1/competitions/${competitionId}/admins`,
    headers: bearer(as),
    payload: { userId },
  });
}

function removeAdmin(userId: string, as: TestUser = owner) {
  return ctx.app.inject({
    method: "DELETE",
    url: `/api/v1/competitions/${competitionId}/admins/${userId}`,
    headers: bearer(as),
  });
}

function transferOwnership(userId: string, as: TestUser = owner) {
  return ctx.app.inject({
    method: "POST",
    url: `/api/v1/competitions/${competitionId}/owner`,
    headers: bearer(as),
    payload: { userId },
  });
}

async function roles(): Promise<Record<string, string>> {
  const rows = await ctx.database
    .selectFrom("CompetitionAdmin")
    .select(["userId", "role"])
    .where("competitionId", "=", competitionId)
    .execute();
  return Object.fromEntries(rows.map((row) => [row.userId, row.role]));
}

beforeEach(async () => {
  ctx = await createTestContext();
  owner = await insertUser(ctx.database, { id: "owner", role: "COMPETITION_ADMIN", name: "Maren" });
  adminB = await insertUser(ctx.database, { id: "admin-b", role: "COMPETITION_ADMIN", name: "Daan" });
  adminC = await insertUser(ctx.database, { id: "admin-c", role: "COMPETITION_ADMIN" });
  outsider = await insertUser(ctx.database, { id: "outsider", role: "COMPETITION_ADMIN" });
  plainUser = await insertUser(ctx.database, { id: "plain", role: "USER" });
  systemAdmin = await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" });
  const created = await ctx.app.inject({
    method: "POST",
    url: "/api/v1/competitions",
    headers: bearer(owner),
    payload: { name: "Ladder", slug: "ladder", date: "2027-01-10" },
  });
  competitionId = (created.json() as { id: string }).id;
});

describe("co-admins", () => {
  it("lets the owner add a co-admin, who then sees the competition", async () => {
    expect((await addAdmin("admin-b")).statusCode).toBe(200);

    const list = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/admin", headers: bearer(adminB) });
    expect((list.json() as Array<{ id: string }>).map((competition) => competition.id)).toEqual([competitionId]);

    const response = await admins(adminB);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { userId: "admin-b", name: "Daan", username: "admin-b", role: "CO_ADMIN" },
      { userId: "owner", name: "Maren", username: "owner", role: "OWNER" },
    ]);
  });

  it("only lets the owner add co-admins", async () => {
    await addAdmin("admin-b");
    expect((await addAdmin("admin-c", adminB)).statusCode).toBe(403);
  });

  it("validates who can be added", async () => {
    expect((await addAdmin("plain")).statusCode).toBe(400);
    expect((await addAdmin("nobody")).statusCode).toBe(404);
    expect((await addAdmin("admin-b")).statusCode).toBe(200);
    expect((await addAdmin("admin-b")).statusCode).toBe(409);
  });

  it("cannot remove the owner", async () => {
    expect((await removeAdmin("owner")).statusCode).toBe(409);
    expect((await removeAdmin("owner", systemAdmin)).statusCode).toBe(409);
  });

  it("lets a co-admin remove themselves but not others", async () => {
    await addAdmin("admin-b");
    await addAdmin("admin-c");
    expect((await removeAdmin("admin-c", adminB)).statusCode).toBe(403);
    expect((await removeAdmin("admin-b", adminB)).statusCode).toBe(200);
    expect(await roles()).toEqual({ owner: "OWNER", "admin-c": "CO_ADMIN" });
  });

  it("transfers ownership to an existing co-admin", async () => {
    await addAdmin("admin-b");
    expect((await transferOwnership("admin-c")).statusCode).toBe(400);
    expect((await transferOwnership("admin-b")).statusCode).toBe(200);
    expect(await roles()).toEqual({ owner: "CO_ADMIN", "admin-b": "OWNER" });
    expect((await transferOwnership("owner")).statusCode).toBe(403);
  });

  it("lets a system admin give an owner-less competition an owner", async () => {
    await addAdmin("admin-b");
    await ctx.database.deleteFrom("CompetitionAdmin").where("userId", "=", "owner").execute();

    expect((await transferOwnership("admin-b", adminB)).statusCode).toBe(403);
    expect((await transferOwnership("admin-b", systemAdmin)).statusCode).toBe(200);
    expect(await roles()).toEqual({ "admin-b": "OWNER" });
  });

  it("forbids a non-admin", async () => {
    const responses = await Promise.all([
      admins(outsider),
      addAdmin("admin-c", outsider),
      removeAdmin("owner", outsider),
      transferOwnership("outsider", outsider),
      admins(plainUser),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403, 403]);
  });
});

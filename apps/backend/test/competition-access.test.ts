import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertClub, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
let adminA: TestUser;
let adminB: TestUser;
let systemAdmin: TestUser;
let plainUser: TestUser;

async function createCompetition(user: TestUser, body: Record<string, unknown> = {}) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/v1/competitions",
    headers: bearer(user),
    payload: { name: "Ladder", slug: `ladder-${Math.random().toString(36).slice(2)}`, date: "2027-01-10", ...body },
  });
}

async function adminCompetitionIds(user: TestUser): Promise<string[]> {
  const response = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/admin", headers: bearer(user) });
  expect(response.statusCode).toBe(200);
  return (response.json() as Array<{ id: string }>).map((competition) => competition.id);
}

beforeEach(async () => {
  ctx = await createTestContext();
  // Seeded competitions predate owners; drop them so each test starts clean.
  await ctx.database.deleteFrom("Competition").execute();
  await insertClub(ctx.database, { id: "club-1" });
  adminA = await insertUser(ctx.database, { id: "admin-a", role: "COMPETITION_ADMIN", clubId: "club-1" });
  adminB = await insertUser(ctx.database, { id: "admin-b", role: "COMPETITION_ADMIN", clubId: "club-1" });
  systemAdmin = await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" });
  plainUser = await insertUser(ctx.database, { id: "user", role: "USER", clubId: "club-1" });
});

describe("competition access", () => {
  it("creates a draft owned by its creator, whatever status is sent", async () => {
    const response = await createCompetition(adminA, { status: "RUNNING" });
    expect(response.statusCode).toBe(200);
    const competition = response.json() as { id: string; status: string };
    expect(competition.status).toBe("DRAFT");

    const admins = await ctx.database.selectFrom("CompetitionAdmin").selectAll().execute();
    expect(admins).toEqual([{ competitionId: competition.id, userId: "admin-a", role: "OWNER" }]);
  });

  it("only lists competitions the admin manages, even within the same club", async () => {
    const { id } = (await createCompetition(adminA, { clubId: "club-1" })).json() as { id: string };
    expect(await adminCompetitionIds(adminA)).toEqual([id]);
    expect(await adminCompetitionIds(adminB)).toEqual([]);
  });

  it("forbids a non-admin", async () => {
    const { id } = (await createCompetition(adminA, { clubId: "club-1" })).json() as { id: string };

    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/competitions/${id}`,
      headers: bearer(adminB),
      payload: { name: "Taken over" },
    });
    const participant = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${id}/participants`,
      headers: bearer(adminB),
      payload: { name: "Someone" },
    });

    expect(patch.statusCode).toBe(403);
    expect(participant.statusCode).toBe(403);
  });

  it("lets a system admin see and change everything", async () => {
    const { id } = (await createCompetition(adminA)).json() as { id: string };
    expect(await adminCompetitionIds(systemAdmin)).toContain(id);

    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/competitions/${id}`,
      headers: bearer(systemAdmin),
      payload: { name: "Renamed" },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { name: string }).name).toBe("Renamed");
  });

  it("refuses plain users on every admin route", async () => {
    const { id } = (await createCompetition(adminA)).json() as { id: string };
    const responses = await Promise.all([
      ctx.app.inject({ method: "GET", url: "/api/v1/competitions/admin", headers: bearer(plainUser) }),
      createCompetition(plainUser),
      ctx.app.inject({ method: "PATCH", url: `/api/v1/competitions/${id}`, headers: bearer(plainUser), payload: { name: "x" } }),
      ctx.app.inject({
        method: "POST",
        url: `/api/v1/competitions/${id}/participants`,
        headers: bearer(plainUser),
        payload: { name: "x" },
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403]);
  });
});

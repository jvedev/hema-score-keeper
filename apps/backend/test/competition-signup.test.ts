import { beforeEach, describe, expect, it } from "vitest";
import type { KyselyPlugin } from "kysely";
import {
  bearer,
  createTestContext,
  insertClub,
  insertCompetition,
  insertUser,
  YieldAfterEachQuery,
  type TestContext,
  type TestUser,
} from "./helpers.js";

let ctx: TestContext;
const users: Record<string, TestUser> = {};

interface Participant {
  id: string;
  userId: string | null;
  status: string;
  joinedAt: string | null;
}

/**
 * Clubs c1 (Utrecht, NL) and c2 (Antwerpen, BE). Users u1 (c1), u2 (c2), u3 (no club); owner manages S, other doesn't.
 * S: registration open, scoped to club c1, nobody in yet.
 */
beforeEach(async () => {
  await createWorld();
});

async function createWorld(plugins: KyselyPlugin[] = []): Promise<void> {
  ctx = await createTestContext({ plugins });
  await insertClub(ctx.database, { id: "c1" });
  await insertClub(ctx.database, { id: "c2" });
  await ctx.database.updateTable("Club").set({ area: "Utrecht", countryCode: "NL" }).where("id", "=", "c1").execute();
  await ctx.database.updateTable("Club").set({ area: "Antwerpen", countryCode: "BE" }).where("id", "=", "c2").execute();
  users.u1 = await insertUser(ctx.database, { id: "u1", role: "USER", clubId: "c1", name: "U One" });
  users.u2 = await insertUser(ctx.database, { id: "u2", role: "USER", clubId: "c2", name: "U Two" });
  users.u3 = await insertUser(ctx.database, { id: "u3", role: "USER", name: "U Three" });
  users.owner = await insertUser(ctx.database, { id: "owner", role: "COMPETITION_ADMIN" });
  users.other = await insertUser(ctx.database, { id: "other", role: "COMPETITION_ADMIN" });
  users.sys = await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" });
  await insertCompetition(ctx.database, { id: "S", status: "REGISTRATION_OPEN", userIds: [], adminUserId: "owner" });
  await setScope("S", "CLUB", ["c1"]);
}

async function setScope(competitionId: string, kind: string, values: string[]): Promise<void> {
  await ctx.database
    .updateTable("Competition")
    .set({ scopeKind: kind, scopeValuesJson: JSON.stringify(values) })
    .where("id", "=", competitionId)
    .execute();
}

function signup(as: string, competitionId = "S", payload: Record<string, unknown> = {}) {
  return ctx.app.inject({ method: "POST", url: `/api/v1/competitions/${competitionId}/signup`, headers: bearer(users[as]!), payload });
}

function leave(as: string, competitionId = "S") {
  return ctx.app.inject({ method: "DELETE", url: `/api/v1/competitions/${competitionId}/signup`, headers: bearer(users[as]!) });
}

function patch(as: string, payload: Record<string, unknown>, competitionId = "S") {
  return ctx.app.inject({ method: "PATCH", url: `/api/v1/competitions/${competitionId}`, headers: bearer(users[as]!), payload });
}

async function newInvite(competitionId = "S"): Promise<string> {
  const response = await ctx.app.inject({ method: "POST", url: `/api/v1/competitions/${competitionId}/invite`, headers: bearer(users.owner!) });
  expect(response.statusCode).toBe(200);
  return (response.json() as { inviteCode: string }).inviteCode;
}

function decide(participantId: string, accept: boolean, as = "owner") {
  return ctx.app.inject({
    method: "POST",
    url: `/api/v1/competitions/S/participants/${encodeURIComponent(participantId)}/decision`,
    headers: bearer(users[as]!),
    payload: { accept },
  });
}

async function participants(competitionId = "S"): Promise<Participant[]> {
  const response = await ctx.app.inject({ method: "GET", url: `/api/v1/competitions/${competitionId}/participants` });
  return response.json() as Participant[];
}

async function participantOf(userId: string): Promise<Participant | undefined> {
  return (await participants()).find((participant) => participant.userId === userId);
}

describe("POST /api/v1/competitions/:id/signup", () => {
  it("enrols a fighter whose club fits the scope", async () => {
    const response = await signup("u1");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ACTIVE" });
    expect(await participantOf("u1")).toMatchObject({ status: "ACTIVE", joinedAt: expect.any(String) });
  });

  it("sign-up outside scope is refused unless invited", async () => {
    const refused = await signup("u2");
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ details: { reason: "OUT_OF_SCOPE" } });
    expect((await signup("u2", "S", { inviteCode: "not-a-real-code" })).statusCode).toBe(403);

    const code = await newInvite();
    const invited = await signup("u2", "S", { inviteCode: code });
    expect(invited.statusCode).toBe(200);
    expect(invited.json()).toEqual({ status: "ACTIVE" });
  });

  it("lets fighters without a club join only open competitions", async () => {
    expect((await signup("u3")).statusCode).toBe(403);
    await setScope("S", "OPEN", []);
    expect((await signup("u3")).statusCode).toBe(200);
  });

  it("matches area and country scopes", async () => {
    await setScope("S", "COUNTRY", ["nl"]);
    expect((await signup("u1")).statusCode).toBe(200);
    expect((await signup("u2")).statusCode).toBe(403);
  });

  it("joins running competitions and refuses the others", async () => {
    await ctx.database.updateTable("Competition").set({ status: "RUNNING" }).where("id", "=", "S").execute();
    expect((await signup("u1")).statusCode).toBe(200);
    for (const status of ["DRAFT", "CLOSED", "ARCHIVED"]) {
      await insertCompetition(ctx.database, { id: status, status, userIds: [] });
      const response = await signup("u1", status);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ details: { reason: "NOT_OPEN" } });
    }
  });

  it("refuses joining twice", async () => {
    await signup("u1");
    const again = await signup("u1");
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ details: { reason: "ALREADY_IN" } });
    expect(await participants()).toHaveLength(1);
  });

  it("needs a login and an existing competition", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/v1/competitions/S/signup", payload: {} })).statusCode).toBe(401);
    expect((await signup("u1", "nope")).statusCode).toBe(404);
  });
});

describe("approval of sign-ups", () => {
  beforeEach(async () => {
    await setScope("S", "OPEN", []);
    expect((await patch("owner", { signupsNeedApproval: true })).statusCode).toBe(200);
  });

  it("makes sign-ups wait when approval is on", async () => {
    expect((await signup("u1")).json()).toEqual({ status: "PENDING" });
    expect(await participantOf("u1")).toMatchObject({ status: "PENDING" });
  });

  it("enrols right away when approval is off again", async () => {
    await patch("owner", { signupsNeedApproval: false });
    expect((await signup("u1")).json()).toEqual({ status: "ACTIVE" });
  });

  it("accepting makes the fighter active", async () => {
    await signup("u1");
    const pending = (await participantOf("u1"))!;
    const response = await decide(pending.id, true);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ participantId: pending.id, status: "ACTIVE" });
    expect(await participantOf("u1")).toMatchObject({ status: "ACTIVE" });
  });

  it("declining removes the sign-up and the fighter can try again", async () => {
    await signup("u1");
    const pending = (await participantOf("u1"))!;
    const response = await decide(pending.id, false);
    expect(response.json()).toEqual({ participantId: pending.id, status: null });
    expect(await participantOf("u1")).toBeUndefined();
    expect((await signup("u1")).json()).toEqual({ status: "PENDING" });
  });

  it("decides only pending sign-ups, and only as an admin of the competition", async () => {
    await signup("u1");
    const pending = (await participantOf("u1"))!;
    expect((await decide(pending.id, true, "other")).statusCode).toBe(403);
    expect((await decide(pending.id, true, "u2")).statusCode).toBe(403);
    expect((await decide("missing", true)).statusCode).toBe(404);
    await decide(pending.id, true);
    expect((await decide(pending.id, false)).statusCode).toBe(409);
  });
});

describe("place limit", () => {
  beforeEach(async () => {
    await setScope("S", "OPEN", []);
  });

  it("refuses sign-ups once the competition is full, counting pending ones", async () => {
    await patch("owner", { placeLimit: 2, signupsNeedApproval: true });
    await signup("u1");
    await signup("u2");
    const full = await signup("u3");
    expect(full.statusCode).toBe(409);
    expect(full.json()).toMatchObject({ details: { reason: "FULL" } });
  });

  it("frees a place when someone leaves", async () => {
    await patch("owner", { placeLimit: 1 });
    await signup("u1");
    expect((await signup("u2")).statusCode).toBe(409);
    await leave("u1");
    expect((await signup("u2")).statusCode).toBe(200);
  });

  it("last place taken once", async () => {
    // Queries yield between each other here, so the three sign-ups really overlap.
    await createWorld([new YieldAfterEachQuery()]);
    await setScope("S", "OPEN", []);
    await patch("owner", { placeLimit: 1 });
    const responses = await Promise.all([signup("u1"), signup("u2"), signup("u3")]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409, 409]);
    expect(await participants()).toHaveLength(1);
  });

  it("one fighter signing up twice at once gets one row, waiting for approval", async () => {
    await createWorld([new YieldAfterEachQuery()]);
    await setScope("S", "OPEN", []);
    await patch("owner", { signupsNeedApproval: true });
    const responses = await Promise.all([signup("u1"), signup("u1")]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(await participants()).toEqual([expect.objectContaining({ userId: "u1", status: "PENDING" })]);
  });

  it("an invite doesn't get past a full competition", async () => {
    await patch("owner", { placeLimit: 1 });
    await signup("u1");
    expect((await signup("u2", "S", { inviteCode: await newInvite() })).statusCode).toBe(409);
  });
});

describe("leaving", () => {
  beforeEach(async () => {
    await setScope("S", "OPEN", []);
  });

  it("marks an active fighter as left and re-joining reuses the row", async () => {
    await signup("u1");
    const joined = (await participantOf("u1"))!;
    const response = await leave("u1");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "LEFT" });
    expect(await participantOf("u1")).toMatchObject({ id: joined.id, status: "LEFT" });

    expect((await signup("u1")).json()).toEqual({ status: "ACTIVE" });
    expect(await participants()).toEqual([expect.objectContaining({ id: joined.id, status: "ACTIVE" })]);
  });

  it("re-joining waits for approval when it is on", async () => {
    await signup("u1");
    await leave("u1");
    await patch("owner", { signupsNeedApproval: true });
    expect((await signup("u1")).json()).toEqual({ status: "PENDING" });
  });

  it("withdrawing a pending sign-up removes it", async () => {
    await patch("owner", { signupsNeedApproval: true });
    await signup("u1");
    expect((await leave("u1")).json()).toEqual({ status: null });
    expect(await participantOf("u1")).toBeUndefined();
  });

  it("can't leave a closed or archived competition, but may withdraw a pending sign-up", async () => {
    await signup("u1");
    await patch("owner", { signupsNeedApproval: true });
    await signup("u2");
    for (const status of ["CLOSED", "ARCHIVED"]) {
      await ctx.database.updateTable("Competition").set({ status }).where("id", "=", "S").execute();
      const refused = await leave("u1");
      expect(refused.statusCode).toBe(409);
      expect(await participantOf("u1")).toMatchObject({ status: "ACTIVE" });
    }
    expect((await leave("u2")).json()).toEqual({ status: null });
  });

  it("a closed or archived competition takes no sign-up decisions", async () => {
    await patch("owner", { signupsNeedApproval: true });
    await signup("u1");
    const pending = (await participantOf("u1"))!;
    for (const status of ["CLOSED", "ARCHIVED"]) {
      await ctx.database.updateTable("Competition").set({ status }).where("id", "=", "S").execute();
      expect((await decide(pending.id, true)).statusCode).toBe(409);
      expect((await decide(pending.id, false)).statusCode).toBe(409);
    }
    expect(await participantOf("u1")).toMatchObject({ status: "PENDING" });
  });

  it("can't leave what you're not in", async () => {
    expect((await leave("u1")).statusCode).toBe(404);
    await signup("u1");
    await leave("u1");
    expect((await leave("u1")).statusCode).toBe(404);
  });
});

describe("invite codes", () => {
  it("shows the competition behind a code without a login", async () => {
    const code = await newInvite();
    const response = await ctx.app.inject({ method: "GET", url: `/api/v1/invites/${code}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ competitionId: "S", name: "S", status: "REGISTRATION_OPEN", date: "2026-10-01", joinable: true });
  });

  it("says when the competition can't be joined", async () => {
    const code = await newInvite();
    await ctx.database.updateTable("Competition").set({ status: "CLOSED" }).where("id", "=", "S").execute();
    expect((await ctx.app.inject({ method: "GET", url: `/api/v1/invites/${code}` })).json()).toMatchObject({ joinable: false });
  });

  it("a new code stops the old link", async () => {
    const first = await newInvite();
    const second = await newInvite();
    expect(second).not.toBe(first);
    expect((await ctx.app.inject({ method: "GET", url: `/api/v1/invites/${first}` })).statusCode).toBe(404);
    expect((await signup("u2", "S", { inviteCode: first })).statusCode).toBe(403);
    expect((await signup("u2", "S", { inviteCode: second })).statusCode).toBe(200);
  });

  it("admins of the competition see the current code; nobody else does", async () => {
    const code = await newInvite();
    const read = (headers: Record<string, string> = {}) => ctx.app.inject({ method: "GET", url: "/api/v1/competitions/S", headers });
    for (const as of ["owner", "sys"]) {
      expect((await read(bearer(users[as]!))).json()).toMatchObject({ inviteCode: code });
    }
    expect((await patch("owner", { placeLimit: 5 })).json()).toMatchObject({ inviteCode: code });
    for (const response of [await read(bearer(users.other!)), await read(bearer(users.u1!)), await read()]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(code);
      expect(response.json()).not.toHaveProperty("inviteCode");
    }
    for (const url of ["/api/v1/competitions", "/api/v1/competitions/S/participants", "/api/v1/competitions/S/standings"]) {
      expect((await ctx.app.inject({ method: "GET", url, headers: bearer(users.u1!) })).body).not.toContain(code);
    }
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/admin", headers: bearer(users.other!) })).body).not.toContain(code);
  });

  it("admins see no code before one is made", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/S", headers: bearer(users.owner!) })).json()).toMatchObject({
      inviteCode: null,
    });
  });

  it("only admins of the competition make codes", async () => {
    for (const as of ["other", "u1"]) {
      const response = await ctx.app.inject({ method: "POST", url: "/api/v1/competitions/S/invite", headers: bearer(users[as]!) });
      expect(response.statusCode).toBe(403);
    }
  });
});

describe("sign-up settings", () => {
  it("are returned with the competition", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/S" })).json()).toMatchObject({
      signupsNeedApproval: false,
      placeLimit: null,
    });
    const response = await patch("owner", { signupsNeedApproval: true, placeLimit: 16 });
    expect(response.json()).toMatchObject({ signupsNeedApproval: true, placeLimit: 16 });
    expect((await patch("owner", { placeLimit: null })).json()).toMatchObject({ placeLimit: null });
  });

  it("are validated", async () => {
    expect((await patch("owner", { placeLimit: 0 })).statusCode).toBe(400);
    expect((await patch("owner", { placeLimit: 2.5 })).statusCode).toBe(400);
    expect((await patch("owner", { signupsNeedApproval: "yes" })).statusCode).toBe(400);
  });
});

describe("adding a fighter by hand", () => {
  function add(userId: string) {
    return ctx.app.inject({
      method: "POST",
      url: "/api/v1/competitions/S/participants",
      headers: bearer(users.owner!),
      payload: { name: userId, userId },
    });
  }

  beforeEach(async () => {
    await setScope("S", "OPEN", []);
  });

  it("brings back a fighter who left on their old row", async () => {
    await signup("u1");
    const joined = (await participantOf("u1"))!;
    await leave("u1");
    const response = await add("u1");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: joined.id, status: "ACTIVE" });
    expect(await participants()).toEqual([expect.objectContaining({ id: joined.id, status: "ACTIVE" })]);
  });

  it("lets a pending fighter in on their own row", async () => {
    await patch("owner", { signupsNeedApproval: true });
    await signup("u1");
    const pending = (await participantOf("u1"))!;
    expect((await add("u1")).json()).toMatchObject({ id: pending.id, status: "ACTIVE" });
    expect(await participants()).toHaveLength(1);
  });

  it("refuses someone who is already in", async () => {
    await signup("u1");
    expect((await add("u1")).statusCode).toBe(409);
    expect(await participants()).toHaveLength(1);
  });
});

describe("GET /api/v1/competitions/:id/participants", () => {
  beforeEach(async () => {
    expect((await signup("u1")).statusCode).toBe(200);
    await ctx.database
      .updateTable("CompetitionParticipant")
      .set({ linkedUserEmail: "u1@example.com", linkedUserEmailHash: "hash-of-u1" })
      .where("userId", "=", "u1")
      .execute();
  });

  function list(headers: Record<string, string> = {}) {
    return ctx.app.inject({ method: "GET", url: "/api/v1/competitions/S/participants", headers });
  }

  it("sends no email to anyone but the competition's admins", async () => {
    // A fighter in the competition, a plain user, an admin of other competitions, and nobody signed in.
    for (const response of [await list(bearer(users.u1!)), await list(bearer(users.u2!)), await list(bearer(users.other!)), await list()]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("u1@example.com");
      expect(response.body).not.toContain("hash-of-u1");
      const [row] = response.json() as Array<Record<string, unknown>>;
      expect(row).toMatchObject({ userId: "u1", name: "U One", status: "ACTIVE" });
      expect(row).not.toHaveProperty("linkedUserEmail");
      expect(row).not.toHaveProperty("linkedUserEmailHash");
    }
  });

  it("still gives the competition's admins the linked email", async () => {
    for (const as of ["owner", "sys"]) {
      const [row] = (await list(bearer(users[as]!))).json() as Array<Record<string, unknown>>;
      expect(row).toMatchObject({ userId: "u1", linkedUserEmail: "u1@example.com", linkedUserEmailHash: "hash-of-u1" });
    }
  });
});

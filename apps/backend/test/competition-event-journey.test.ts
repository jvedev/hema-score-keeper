import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertCompetition, insertUser, type TestContext, type TestUser } from "./helpers.js";

/**
 * Phase 5 journey through the real HTTP routes: an Event and its rating Competitions — create for the Event,
 * attach an existing standalone Competition, who may manage what while attached, and detaching again with the
 * Competition's data and own admins preserved.
 */
describe("Competition ↔ Event journey", () => {
  let ctx: TestContext;
  let eventOwner: TestUser;
  let competitionOwner: TestUser;
  let outsider: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    // Competition-admin screens need a COMPETITION_ADMIN or SYSTEM_ADMIN account (see the Phase 5 plan's open point).
    eventOwner = await insertUser(ctx.database, { id: "eva", role: "COMPETITION_ADMIN", name: "Eva" });
    competitionOwner = await insertUser(ctx.database, { id: "carl", role: "COMPETITION_ADMIN", name: "Carl" });
    outsider = await insertUser(ctx.database, { id: "otto", role: "COMPETITION_ADMIN", name: "Otto" });
    await insertCompetition(ctx.database, { id: "ladder", status: "RUNNING", userIds: ["eva", "otto"], adminUserId: "carl", adminRole: "OWNER" });
    await insertCompetition(ctx.database, { id: "unrelated", status: "RUNNING", userIds: [], adminUserId: "otto", adminRole: "OWNER" });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const call = (user: TestUser, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) =>
    ctx.app.inject({ method, url, headers: bearer(user), ...(payload === undefined ? {} : { payload: payload as object }) });

  it("creates, attaches, shares management, and detaches without losing data", async () => {
    // 1. Eva creates an Event and becomes its admin; she creates a Competition for it and owns that one.
    const event = await call(eventOwner, "POST", "/api/v1/events", { eventName: "Spring Gathering" });
    expect(event.statusCode).toBe(200);
    const eventId = event.json().id as string;
    const created = await call(eventOwner, "POST", `/api/v1/events/${eventId}/competitions`, { name: "Gathering Ladder", slug: "gathering-ladder", date: "2027-04-01" });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ eventId, eventName: "Spring Gathering" });

    // 2. Carl's standalone "ladder" cannot be attached by either side alone.
    expect((await call(competitionOwner, "PATCH", "/api/v1/competitions/ladder/event", { eventId })).statusCode).toBe(403);
    expect((await call(eventOwner, "PATCH", "/api/v1/competitions/ladder/event", { eventId })).statusCode).toBe(403);

    // 3. Once Carl is also an admin of the Event, he attaches it.
    expect((await call(eventOwner, "POST", `/api/v1/events/${eventId}/admins`, { userId: competitionOwner.id })).statusCode).toBe(200);
    const attached = await call(competitionOwner, "PATCH", "/api/v1/competitions/ladder/event", { eventId });
    expect(attached.statusCode).toBe(200);
    expect(attached.json().eventId).toBe(eventId);
    const listed = await call(eventOwner, "GET", `/api/v1/events/${eventId}/competitions`);
    expect((listed.json() as Array<{ id: string }>).map((competition) => competition.id).sort()).toEqual([created.json().id, "ladder"].sort());

    // 4. Eva, an Event admin without a Competition admin row, now manages "ladder"; Otto does not.
    expect((await call(eventOwner, "PATCH", "/api/v1/competitions/ladder", { name: "Ladder (at the Gathering)" })).statusCode).toBe(200);
    expect((await call(eventOwner, "GET", "/api/v1/competitions/ladder/admins")).statusCode).toBe(200);
    expect((await call(eventOwner, "GET", "/api/v1/competitions/ladder")).json()).toMatchObject({ eventName: "Spring Gathering" });
    expect((await call(outsider, "PATCH", "/api/v1/competitions/ladder", { name: "Hijacked" })).statusCode).toBe(403);

    // 5. Being an Event admin gives no rights over Competitions outside the Event.
    expect((await call(eventOwner, "PATCH", "/api/v1/competitions/unrelated", { name: "Hijacked" })).statusCode).toBe(403);
    expect((await call(eventOwner, "PATCH", "/api/v1/competitions/unrelated/event", { eventId })).statusCode).toBe(403);

    // 6. Eva detaches "ladder": she loses access, Carl keeps it, and its participants and admins are untouched.
    const detached = await call(eventOwner, "PATCH", "/api/v1/competitions/ladder/event", { eventId: null });
    expect(detached.statusCode).toBe(200);
    expect(detached.json().eventId).toBeNull();
    expect((await call(eventOwner, "PATCH", "/api/v1/competitions/ladder", { name: "Again" })).statusCode).toBe(403);
    const carlView = await call(competitionOwner, "GET", "/api/v1/competitions/ladder");
    expect(carlView.json()).toMatchObject({ name: "Ladder (at the Gathering)", eventId: null, eventName: null });
    const admins = await call(competitionOwner, "GET", "/api/v1/competitions/ladder/admins");
    expect((admins.json() as Array<{ userId: string; role: string }>).map(({ userId, role }) => ({ userId, role }))).toEqual([{ userId: "carl", role: "OWNER" }]);
    const participants = await ctx.database.selectFrom("CompetitionParticipant").select("userId").where("competitionId", "=", "ladder").execute();
    expect(participants.map((row) => row.userId).sort()).toEqual(["eva", "otto"]);
  });
});

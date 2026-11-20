import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createTestContext,
  insertEventAdmin,
  insertUser,
  type TestContext,
  type TestUser,
} from "./helpers.js";
import { competitionAdminRole, listManagedCompetitionIds } from "../src/competitions/access.js";

describe("Competition–Event link", () => {
  let ctx: TestContext;
  let eventAdmin: TestUser;
  let compAdmin: TestUser;
  let regularUser: TestUser;
  let systemAdmin: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    eventAdmin = await insertUser(ctx.database, { id: "event-admin", role: "USER", name: "Event Admin" });
    compAdmin = await insertUser(ctx.database, { id: "comp-admin", role: "COMPETITION_ADMIN", name: "Comp Admin" });
    regularUser = await insertUser(ctx.database, { id: "regular", role: "USER", name: "Regular" });
    systemAdmin = await insertUser(ctx.database, { id: "sys-admin", role: "SYSTEM_ADMIN", name: "System Admin" });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function createEvent(id: string) {
    await ctx.database.insertInto("Event").values({
      id,
      eventName: id,
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
  }

  async function createCompetition(id: string, eventId?: string | null) {
    await ctx.database.insertInto("Competition").values({
      id,
      name: id,
      slug: id,
      status: "OPEN",
      date: "2026-10-01",
      rulesetJson: "{}",
      visibility: "PUBLIC",
      clubId: null,
      eventId,
    }).execute();
  }

  async function addCompetitionAdmin(competitionId: string, userId: string, role: "OWNER" | "CO_ADMIN" = "OWNER") {
    await ctx.database.insertInto("CompetitionAdmin").values({
      competitionId,
      userId,
      role,
    }).execute();
  }

  describe("authorization union", () => {
    it("Event admin can manage attached Competition", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");

      const role = await competitionAdminRole(ctx.database, eventAdmin, "comp1");
      expect(role).toBe("EVENT_ADMIN");
    });

    it("Standalone Competition not affected by Event admin", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("standalone");

      const role = await competitionAdminRole(ctx.database, eventAdmin, "standalone");
      expect(role).toBeNull();
    });

    it("Wrong-Event admin cannot access attached Competition", async () => {
      await createEvent("event1");
      await createEvent("event2");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp2", "event2");

      const role = await competitionAdminRole(ctx.database, eventAdmin, "comp2");
      expect(role).toBeNull();
    });

    it("Competition OWNER takes precedence over Event admin", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");
      await addCompetitionAdmin("comp1", eventAdmin.id, "OWNER");

      const role = await competitionAdminRole(ctx.database, eventAdmin, "comp1");
      expect(role).toBe("OWNER");
    });

    it("SYSTEM_ADMIN is always authorized", async () => {
      await createCompetition("comp1");

      const role = await competitionAdminRole(ctx.database, systemAdmin, "comp1");
      expect(role).toBe("SYSTEM_ADMIN");
    });

    it("Non-admin cannot access Competition", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");

      const role = await competitionAdminRole(ctx.database, regularUser, "comp1");
      expect(role).toBeNull();
    });
  });

  describe("listManagedCompetitionIds", () => {
    it("includes Event-attached Competitions", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");
      await createCompetition("comp2", "event1");

      const ids = await listManagedCompetitionIds(ctx.database, eventAdmin);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain("comp1");
      expect(ids).toContain("comp2");
    });

    it("includes direct Competition admin IDs", async () => {
      await createCompetition("standalone");
      await addCompetitionAdmin("standalone", compAdmin.id, "OWNER");

      const ids = await listManagedCompetitionIds(ctx.database, compAdmin);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain("standalone");
    });

    it("SYSTEM_ADMIN returns ALL", async () => {
      const ids = await listManagedCompetitionIds(ctx.database, systemAdmin);
      expect(ids).toBe("ALL");
    });

    it("deduplicates when user is both Event admin and Competition admin", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: compAdmin.id });
      await createCompetition("comp1", "event1");
      await addCompetitionAdmin("comp1", compAdmin.id, "OWNER");

      const ids = await listManagedCompetitionIds(ctx.database, compAdmin);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.filter((id) => id === "comp1")).toHaveLength(1);
    });
  });

  describe("requireCompetitionAdmin via HTTP", () => {
    it("Event admin with COMPETITION_ADMIN role can PATCH attached Competition", async () => {
      // Event admins with USER role are blocked by requireAdminUser on admin routes.
      // Those with COMPETITION_ADMIN role pass the outer guard and then requireCompetitionAdmin
      // authorizes them via the Event admin check.
      const eventAdminWithRole = await insertUser(ctx.database, { id: "event-admin-role", role: "COMPETITION_ADMIN", name: "Event Admin Role" });
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdminWithRole.id });
      await createCompetition("comp1", "event1");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/comp1",
        headers: bearer(eventAdminWithRole),
        payload: { name: "Updated" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Updated");
    });

    it("Event admin with USER role is blocked by requireAdminUser on admin routes", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/comp1",
        headers: bearer(eventAdmin),
        payload: { name: "Updated" },
      });
      // Blocked by requireAdminUser — event admins with USER role should use Event-scoped routes (Step 3).
      expect(res.statusCode).toBe(403);
    });

    it("Event admin with COMPETITION_ADMIN role can list attached Competition admins", async () => {
      const eventAdminWithRole = await insertUser(ctx.database, { id: "event-admin-role2", role: "COMPETITION_ADMIN", name: "Event Admin Role 2" });
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdminWithRole.id });
      await createCompetition("comp1", "event1");
      await addCompetitionAdmin("comp1", compAdmin.id, "OWNER");

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/v1/competitions/comp1/admins",
        headers: bearer(eventAdminWithRole),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("Event deletion detaches Competition", () => {
    it("deleting Event sets Competition.eventId to null", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");

      await ctx.database.deleteFrom("Event").where("id", "=", "event1").execute();

      const comp = await ctx.database
        .selectFrom("Competition")
        .select("eventId")
        .where("id", "=", "comp1")
        .executeTakeFirst();
      expect(comp?.eventId).toBeNull();
    });
  });

  describe("POST /api/v1/events/:eventId/competitions", () => {
    it("Event admin can create Competition attached to Event", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });

      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/events/event1/competitions",
        headers: bearer(eventAdmin),
        payload: { name: "New Comp", slug: "new-comp", date: "2026-11-01" },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as { id: string; name: string; eventId: string };
      expect(json.name).toBe("New Comp");
      expect(json.eventId).toBe("event1");

      // Creator becomes Competition OWNER
      const adminRow = await ctx.database
        .selectFrom("CompetitionAdmin")
        .selectAll()
        .where("competitionId", "=", json.id)
        .executeTakeFirst();
      expect(adminRow).toMatchObject({ userId: eventAdmin.id, role: "OWNER" });
    });

    it("Non-Event admin cannot create Competition for Event", async () => {
      await createEvent("event1");

      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/events/event1/competitions",
        headers: bearer(regularUser),
        payload: { name: "New Comp", slug: "new-comp", date: "2026-11-01" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("Anonymous user cannot create Competition for Event", async () => {
      await createEvent("event1");

      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/events/event1/competitions",
        payload: { name: "New Comp", slug: "new-comp", date: "2026-11-01" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/events/:eventId/competitions", () => {
    it("lists attached Competitions", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");
      await createCompetition("comp2", "event1");
      await createCompetition("standalone");

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/v1/events/event1/competitions",
        headers: bearer(eventAdmin),
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as Array<{ id: string }>;
      expect(json).toHaveLength(2);
      const ids = json.map((c) => c.id).sort();
      expect(ids).toEqual(["comp1", "comp2"]);
    });

    it("requires Event admin", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/v1/events/event1/competitions",
        headers: bearer(regularUser),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("loadEvents includes competitions", () => {
    it("GET /api/v1/events returns attached Competitions in Event response", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");
      await createCompetition("comp2", "event1");
      await createCompetition("standalone");

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/v1/events",
        headers: bearer(eventAdmin),
      });
      expect(res.statusCode).toBe(200);
      const events = res.json() as Array<{ id: string; competitions: Array<{ id: string }> }>;
      const event = events.find((e) => e.id === "event1");
      expect(event).toBeDefined();
      const compIds = event!.competitions.map((c) => c.id).sort();
      expect(compIds).toEqual(["comp1", "comp2"]);
    });
  });

  describe("PATCH /api/v1/competitions/:id/event", () => {
    it("Event admin who also manages the Competition can attach it", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("standalone");
      await addCompetitionAdmin("standalone", eventAdmin.id, "CO_ADMIN");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/standalone/event",
        headers: bearer(eventAdmin),
        payload: { eventId: "event1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().eventId).toBe("event1");
    });

    it("Event admin cannot attach a Competition they don't manage", async () => {
      await createEvent("event1");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("standalone");
      await addCompetitionAdmin("standalone", compAdmin.id, "OWNER");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/standalone/event",
        headers: bearer(eventAdmin),
        payload: { eventId: "event1" },
      });
      expect(res.statusCode).toBe(403);
      const row = await ctx.database.selectFrom("Competition").select("eventId").where("id", "=", "standalone").executeTakeFirstOrThrow();
      expect(row.eventId).toBeNull();
    });

    it("Competition admin cannot attach to an Event they don't administer", async () => {
      await createEvent("event1");
      await createCompetition("standalone");
      await addCompetitionAdmin("standalone", compAdmin.id, "OWNER");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/standalone/event",
        headers: bearer(compAdmin),
        payload: { eventId: "event1" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("SYSTEM_ADMIN can attach any standalone Competition", async () => {
      await createEvent("event1");
      await createCompetition("standalone");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/standalone/event",
        headers: bearer(systemAdmin),
        payload: { eventId: "event1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().eventId).toBe("event1");
    });

    it("Competition admin can detach Competition", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");
      await addCompetitionAdmin("comp1", compAdmin.id, "OWNER");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/comp1/event",
        headers: bearer(compAdmin),
        payload: { eventId: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().eventId).toBeNull();
    });

    it("wrong-Event admin cannot attach Competition", async () => {
      await createEvent("event1");
      await createEvent("event2");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await createCompetition("standalone");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/standalone/event",
        headers: bearer(eventAdmin),
        payload: { eventId: "event2" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects attaching already-attached Competition to different Event", async () => {
      await createEvent("event1");
      await createEvent("event2");
      await insertEventAdmin(ctx.database, { eventId: "event1", userId: eventAdmin.id });
      await insertEventAdmin(ctx.database, { eventId: "event2", userId: eventAdmin.id });
      await createCompetition("comp1", "event1");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/comp1/event",
        headers: bearer(eventAdmin),
        payload: { eventId: "event2" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("non-admin cannot detach Competition", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/comp1/event",
        headers: bearer(regularUser),
        payload: { eventId: null },
      });
      expect(res.statusCode).toBe(403);
    });

    it("preserves child data on detach", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");
      await addCompetitionAdmin("comp1", compAdmin.id, "OWNER");

      // Add a participant
      await ctx.database.insertInto("CompetitionParticipant").values({
        id: "comp1:fighter1",
        competitionId: "comp1",
        name: "Fighter 1",
        displayName: "Fighter 1",
        linkedUserEmail: null,
        linkedUserEmailHash: null,
        clubId: null,
        userId: null,
        kind: "MEMBER",
      }).execute();

      const res = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/competitions/comp1/event",
        headers: bearer(compAdmin),
        payload: { eventId: null },
      });
      expect(res.statusCode).toBe(200);

      // Participant row should still exist
      const participant = await ctx.database
        .selectFrom("CompetitionParticipant")
        .select("id")
        .where("competitionId", "=", "comp1")
        .executeTakeFirst();
      expect(participant).toBeDefined();
    });
  });

  describe("GET /api/v1/competitions/:id shows the Event to admins", () => {
    it("gives the Competition's admins the Event name", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");
      await addCompetitionAdmin("comp1", compAdmin.id, "OWNER");

      const res = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/comp1", headers: bearer(compAdmin) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ eventId: "event1", eventName: "event1" });
    });

    it("gives null for a standalone Competition", async () => {
      await createCompetition("comp1");
      await addCompetitionAdmin("comp1", compAdmin.id, "OWNER");

      const res = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/comp1", headers: bearer(compAdmin) });
      expect(res.json()).toMatchObject({ eventId: null, eventName: null });
    });

    it("does not add the Event name for non-admins", async () => {
      await createEvent("event1");
      await createCompetition("comp1", "event1");

      const res = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/comp1", headers: bearer(regularUser) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).not.toHaveProperty("eventName");
    });
  });
});

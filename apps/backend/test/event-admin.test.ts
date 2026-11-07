import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createTestContext,
  insertEventAdmin,
  insertUser,
  type TestContext,
  type TestUser,
} from "./helpers.js";

describe("Event administrators", () => {
  let ctx: TestContext;
  let creator: TestUser;
  let other: TestUser;
  let systemAdmin: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    creator = await insertUser(ctx.database, { id: "event-creator", role: "USER", name: "Creator" });
    other = await insertUser(ctx.database, { id: "event-other", role: "USER", name: "Other" });
    systemAdmin = await insertUser(ctx.database, { id: "event-system", role: "SYSTEM_ADMIN", name: "System admin" });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("requires sign-in to create an Event and assigns its creator as first admin", async () => {
    const anonymous = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: { eventName: "Unowned" },
    });
    expect(anonymous.statusCode).toBe(401);

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: bearer(creator),
      payload: { eventName: "Owned" },
    });
    expect(created.statusCode).toBe(200);
    const eventId = (created.json() as { id: string }).id;
    expect(await ctx.database.selectFrom("EventAdmin").selectAll().where("eventId", "=", eventId).execute())
      .toMatchObject([{ eventId, userId: creator.id, addedByUserId: creator.id }]);

    const admins = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/events/${eventId}/admins`,
      headers: bearer(creator),
    });
    expect(admins.statusCode).toBe(200);
    expect(admins.json().admins).toEqual([
      expect.objectContaining({
        userId: creator.id,
        user: expect.objectContaining({ id: creator.id, name: "Creator" }),
      }),
    ]);

    const lastAdmin = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/events/${eventId}/admins/${creator.id}`,
      headers: bearer(creator),
    });
    expect(lastAdmin.statusCode).toBe(409);
  });

  it("allows only SYSTEM_ADMIN to bootstrap an existing unowned Event", async () => {
    await ctx.database.insertInto("Event").values({
      id: "legacy-event",
      eventName: "Legacy",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();

    const refused = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/legacy-event/admins",
      headers: bearer(creator),
      payload: { userId: other.id },
    });
    expect(refused.statusCode).toBe(403);

    const bootstrap = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/legacy-event/admins",
      headers: bearer(systemAdmin),
      payload: { userId: creator.id },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().admins).toMatchObject([{ userId: creator.id }]);

    const added = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/legacy-event/admins",
      headers: bearer(creator),
      payload: { userId: other.id },
    });
    expect(added.statusCode).toBe(200);
    expect(added.json().admins).toHaveLength(2);
  });

  it("keeps Event and Tournament administrator permissions separate", async () => {
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Event",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
    await insertEventAdmin(ctx.database, { eventId: "event", userId: creator.id });
    await ctx.database.insertInto("Tournament").values({
      id: "tournament",
      eventId: "event",
      createdByUserId: other.id,
      name: "Tournament",
      rulesetId: null,
      currentStageId: null,
      order: 0,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("TournamentAdmin").values({
      tournamentId: "tournament",
      userId: other.id,
      addedByUserId: other.id,
      createdAt: "2026-11-08T10:00:00.000Z",
    }).execute();
    await ctx.database.insertInto("Stage").values({
      id: "stage",
      tournamentId: "tournament",
      type: "FINAL",
      name: "Final",
      rulesetId: null,
      minPoolSize: null,
      maxPoolSize: null,
      preferredPoolSize: null,
      eliminationParticipantCount: null,
      timeBetweenMatchesMinutes: 2,
    }).execute();
    await ctx.database.insertInto("Arena").values({
      id: "arena",
      eventId: "event",
      name: "Ring",
      order: 0,
      leftColor: "#21c15b",
      rightColor: "#2f7dfa",
    }).execute();
    await ctx.database.insertInto("EventSchedule").values({
      id: "schedule",
      eventId: "event",
      startTimeMinutes: 540,
      currentTimeSlotId: null,
    }).execute();
    await ctx.database.insertInto("ScheduleTimeSlot").values({
      id: "slot",
      scheduleId: "schedule",
      order: 1,
      durationMinutes: 60,
      label: "Slot",
      color: null,
      isBreak: 0,
    }).execute();
    await ctx.database.insertInto("ScheduledPhase").values({
      id: "phase",
      stageId: "stage",
      arenaId: "arena",
      timeSlotId: "slot",
    }).execute();
    await ctx.database.insertInto("Round").values({
      id: "round",
      stageId: "stage",
      roundNumber: 1,
    }).execute();
    await ctx.database.insertInto("Match").values({
      id: "match",
      roundId: "round",
      arenaId: null,
      entryAId: null,
      entryBId: null,
      winnerEntryId: null,
      scoreA: null,
      scoreB: null,
      rulesetId: null,
    }).execute();

    const eventAdminEditingTournament = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/tournaments/tournament",
      headers: bearer(creator),
      payload: { name: "Unauthorized edit" },
    });
    expect(eventAdminEditingTournament.statusCode).toBe(403);

    const tournamentAdminEditingEvent = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/events/event",
      headers: bearer(other),
      payload: { eventName: "Unauthorized edit" },
    });
    expect(tournamentAdminEditingEvent.statusCode).toBe(403);

    const tournamentAdminEditingSchedule = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/events/event/schedule",
      headers: bearer(other),
      payload: { startTimeMinutes: 600 },
    });
    expect(tournamentAdminEditingSchedule.statusCode).toBe(403);

    const eventSchedule = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/events/event/schedule",
      headers: bearer(creator),
      payload: { startTimeMinutes: 600 },
    });
    expect(eventSchedule.statusCode).toBe(200);

    const eventAdminPlanningTournament = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/match/schedule",
      headers: bearer(creator),
      payload: { scheduledPhaseId: "phase", order: 1 },
    });
    expect(eventAdminPlanningTournament.statusCode).toBe(200);

    const tournamentAdminUpdate = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/tournaments/tournament",
      headers: bearer(other),
      payload: { name: "Authorized edit" },
    });
    expect(tournamentAdminUpdate.statusCode).toBe(200);
  });

  it("revokes Event access when membership is removed and prevents unrelated assignment", async () => {
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Event",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
    await insertEventAdmin(ctx.database, { eventId: "event", userId: creator.id });
    await insertEventAdmin(ctx.database, { eventId: "event", userId: systemAdmin.id });

    const denied = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events/event/admins",
      headers: bearer(other),
      payload: { userId: other.id },
    });
    expect(denied.statusCode).toBe(403);

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/events/event/admins/${creator.id}`,
      headers: bearer(systemAdmin),
    });
    expect(removed.statusCode).toBe(204);

    const revoked = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/events/event",
      headers: bearer(creator),
      payload: { eventName: "Revoked" },
    });
    expect(revoked.statusCode).toBe(403);
  });
});

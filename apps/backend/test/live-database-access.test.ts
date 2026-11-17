import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

const RING_TOKEN = "database-ring-token";
const DEVICE_ID = "table-device";

describe("database-mode ring access", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let table: TestUser;
  let judge: TestUser;
  let jury: TestUser;
  let fighter: TestUser;
  let otherPhaseOfficial: TestUser;
  let outsider: TestUser;
  let systemAdmin: TestUser;
  let ringId: string;
  let boutOne: string;
  let boutTwo: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    admin = await insertUser(ctx.database, { id: "event-admin", role: "USER" });
    table = await insertUser(ctx.database, { id: "table-user", role: "USER" });
    judge = await insertUser(ctx.database, { id: "judge-user", role: "USER" });
    jury = await insertUser(ctx.database, { id: "jury-user", role: "USER" });
    fighter = await insertUser(ctx.database, { id: "fighter-user", role: "USER" });
    otherPhaseOfficial = await insertUser(ctx.database, { id: "other-phase", role: "USER" });
    outsider = await insertUser(ctx.database, { id: "unassigned-user", role: "USER" });
    systemAdmin = await insertUser(ctx.database, { id: "system-admin", role: "SYSTEM_ADMIN" });

    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Scoring access",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
    await ctx.database.insertInto("Tournament").values({
      id: "source-tournament",
      eventId: "event",
      createdByUserId: admin.id,
      name: "Open",
      rulesetId: null,
      currentStageId: null,
      order: 0,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("TournamentAdmin").values({
      tournamentId: "source-tournament",
      userId: admin.id,
      addedByUserId: admin.id,
      createdAt: "2026-11-07T10:00:00.000Z",
    }).execute();
    await ctx.database.insertInto("Stage").values([
      {
        id: "stage-one",
        tournamentId: "source-tournament",
        type: "POOL",
        name: "Pool one",
        rulesetId: null,
        minPoolSize: 2,
        maxPoolSize: 4,
        preferredPoolSize: 3,
        eliminationParticipantCount: null,
        timeBetweenMatchesMinutes: 2,
      },
      {
        id: "stage-two",
        tournamentId: "source-tournament",
        type: "FINAL",
        name: "Final",
        rulesetId: null,
        minPoolSize: null,
        maxPoolSize: null,
        preferredPoolSize: null,
        eliminationParticipantCount: null,
        timeBetweenMatchesMinutes: 2,
      },
    ]).execute();
    await ctx.database.insertInto("Arena").values({
      id: "arena-one",
      eventId: "event",
      name: "Ring 1",
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
    await ctx.database.insertInto("ScheduledPhase").values([
      { id: "phase-one", stageId: "stage-one", arenaId: "arena-one", timeSlotId: "slot" },
      { id: "phase-two", stageId: "stage-two", arenaId: "arena-one", timeSlotId: "slot" },
    ]).execute();
    await ctx.database.insertInto("Round").values([
      { id: "round-one", stageId: "stage-one", roundNumber: 1 },
      { id: "round-two", stageId: "stage-two", roundNumber: 1 },
    ]).execute();
    await ctx.database.insertInto("Match").values([
      { id: "match-one", roundId: "round-one", arenaId: "arena-one", entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "match-two", roundId: "round-two", arenaId: "arena-one", entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
    ]).execute();

    await ctx.database.insertInto("ScheduledAssignment").values([
      { id: "assignment-table", scheduledPhaseId: "phase-one", userId: table.id, role: "TABLE" },
      { id: "assignment-judge", scheduledPhaseId: "phase-one", userId: judge.id, role: "JUDGE" },
      { id: "assignment-jury", scheduledPhaseId: "phase-one", userId: jury.id, role: "JURY" },
      { id: "assignment-fighter", scheduledPhaseId: "phase-one", userId: fighter.id, role: "FIGHTER" },
      { id: "assignment-other-phase", scheduledPhaseId: "phase-two", userId: otherPhaseOfficial.id, role: "TABLE" },
    ]).execute();

    await ctx.database.insertInto("ScheduledMatch").values({ matchId: "match-two", scheduledPhaseId: "phase-two", order: 2 }).execute();

    const activation = await post("/api/v1/tournaments/source-tournament/live", admin);
    expect(activation.statusCode, activation.body).toBe(200);
    await ctx.database.updateTable("LiveRing").set({ keeperToken: RING_TOKEN }).where("sourceArenaId", "=", "arena-one").execute();
    ringId = (await ctx.database.selectFrom("LiveRing").select("id").where("sourceArenaId", "=", "arena-one").executeTakeFirstOrThrow()).id;
    const boutIdOf = async (matchId: string) =>
      (await ctx.database.selectFrom("LiveBout").select("id").where("sourceMatchId", "=", matchId).executeTakeFirstOrThrow()).id;
    boutOne = await boutIdOf("match-one");
    boutTwo = await boutIdOf("match-two");
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  function get(url: string, user: TestUser) {
    return ctx.app.inject({ method: "GET", url, headers: bearer(user) });
  }

  function post(url: string, user: TestUser, payload?: unknown, includeKeeper = false) {
    const headers = {
      ...bearer(user),
      ...(includeKeeper ? { "x-ring-token": RING_TOKEN, "x-device-id": DEVICE_ID } : {}),
    };
    return ctx.app.inject({ method: "POST", url, payload: payload as object | undefined, headers });
  }

  it("allows TABLE, JUDGE, JURY, tournament admins and system admins, but not FIGHTER or unassigned users", async () => {
    for (const official of [table, judge, jury]) {
      const ring = await get(`/api/v1/live-rings/by-token/${RING_TOKEN}`, official);
      expect(ring.statusCode).toBe(200);
      expect((ring.json().bouts as { id: string }[]).map((bout) => bout.id)).toEqual([boutOne]);
      expect((await get(`/api/v1/live-rings/${ringId}/bouts`, official)).json().bouts).toHaveLength(1);
      expect((await get(`/api/v1/live-bouts/${boutOne}`, official)).statusCode).toBe(200);
      expect((await get(`/api/v1/live-bouts/${boutTwo}`, official)).statusCode).toBe(403);
    }

    expect((await get(`/api/v1/live-rings/by-token/${RING_TOKEN}`, fighter)).statusCode).toBe(403);
    expect((await post(`/api/v1/live-rings/by-token/${RING_TOKEN}/claim`, fighter, { deviceId: "fighter-device" })).statusCode).toBe(403);
    expect((await get(`/api/v1/live-rings/by-token/${RING_TOKEN}`, outsider)).statusCode).toBe(403);

    // otherPhaseOfficial is the TABLE official of phase two (assignment-other-phase).
    const phaseTwoRing = await get(`/api/v1/live-rings/by-token/${RING_TOKEN}`, otherPhaseOfficial);
    expect(phaseTwoRing.statusCode).toBe(200);
    expect((phaseTwoRing.json().bouts as { id: string }[]).map((bout) => bout.id)).toEqual([boutTwo]);
    expect((await get(`/api/v1/live-bouts/${boutTwo}`, otherPhaseOfficial)).statusCode).toBe(200);
    expect((await get(`/api/v1/live-bouts/${boutOne}`, otherPhaseOfficial)).statusCode).toBe(403);

    expect((await get(`/api/v1/live-bouts/${boutTwo}`, admin)).statusCode).toBe(200);
    expect((await get(`/api/v1/live-bouts/${boutTwo}`, systemAdmin)).statusCode).toBe(200);
  });

  it("rechecks live assignments before every scoring write and rejects role changes", async () => {
    expect((await post(`/api/v1/live-rings/by-token/${RING_TOKEN}/claim`, table, { deviceId: DEVICE_ID })).statusCode).toBe(200);
    const headers = { "x-ring-token": RING_TOKEN, "x-device-id": DEVICE_ID };
    const exchange = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${boutOne}/exchanges`,
      headers: { ...bearer(table), ...headers },
      payload: { clientExchangeId: "first", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 },
    });
    expect(exchange.statusCode).toBe(200);

    await ctx.database.updateTable("ScheduledAssignment").set({ role: "FIGHTER" }).where("id", "=", "assignment-table").execute();
    const revokedWrites = [
      [`/api/v1/live-bouts/${boutOne}/exchanges`, { clientExchangeId: "second", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 }],
      [`/api/v1/live-bouts/${boutOne}/undo`, { expectedExchangeId: exchange.json().exchange.id }],
      [`/api/v1/live-bouts/${boutOne}/start`, undefined],
      [`/api/v1/live-bouts/${boutOne}/finish`, undefined],
      [`/api/v1/live-bouts/${boutOne}/clock`, { seconds: 10, running: true }],
    ] as const;
    for (const [url, payload] of revokedWrites) {
      const response = await ctx.app.inject({
        method: "POST",
        url,
        headers: { ...bearer(table), ...headers },
        payload,
      });
      expect(response.statusCode, url).toBe(403);
    }
    expect((await ctx.database.selectFrom("LiveExchange").selectAll().where("boutId", "=", boutOne).execute())).toHaveLength(1);
  });

  it("allows tournament admins and system admins to claim and score any scheduled phase", async () => {
    for (const [user, deviceId, clientExchangeId] of [
      [admin, "admin-device", "admin-exchange"],
      [systemAdmin, "system-device", "system-exchange"],
    ] as const) {
      const claimed = await post(
        `/api/v1/live-rings/by-token/${RING_TOKEN}/claim`,
        user,
        { deviceId, confirm: true },
      );
      expect(claimed.statusCode).toBe(200);
      const response = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/live-bouts/${boutTwo}/exchanges`,
        headers: {
          ...bearer(user),
          "x-ring-token": RING_TOKEN,
          "x-device-id": deviceId,
        },
        payload: { clientExchangeId, kind: "EXCHANGE", leftPoints: 1, rightPoints: 0 },
      });
      expect(response.statusCode).toBe(200);
    }
  });
});

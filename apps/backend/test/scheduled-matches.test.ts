import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, insertUser, type TestContext } from "./helpers.js";

describe("bracket match scheduling", () => {
  let ctx: TestContext;
  const stageId = "final-stage";
  const semiStageId = "semi-stage";
  const eliminationStageId = "elimination-stage";
  const poolStageId = "pool-stage";
  const finalPhaseId = "final-ring-one-slot-one";
  const semiPhaseId = "semi-ring-one-slot-one";
  const otherRingPhaseId = "final-ring-two-slot-one";
  const laterPhaseId = "final-ring-one-slot-two";

  beforeEach(async () => {
    ctx = await createTestContext();
    const user = await insertUser(ctx.database, { id: "organizer", role: "USER" });
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Tournament day",
      rulesetId: null,
      allFightersAreVolunteers: 0,
    }).execute();
    await ctx.database.insertInto("Tournament").values({
      id: "tournament",
      eventId: "event",
      createdByUserId: user.id,
      name: "Open",
      rulesetId: null,
      currentStageId: null,
      order: 0,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("Stage").values([
      {
        id: stageId,
        tournamentId: "tournament",
        type: "FINAL",
        name: "Final",
        rulesetId: null,
        minPoolSize: null,
        maxPoolSize: null,
        preferredPoolSize: null,
        eliminationParticipantCount: null,
        timeBetweenMatchesMinutes: 2,
      },
      {
        id: semiStageId,
        tournamentId: "tournament",
        type: "SEMI_FINAL",
        name: "Semi-finals",
        rulesetId: null,
        minPoolSize: null,
        maxPoolSize: null,
        preferredPoolSize: null,
        eliminationParticipantCount: null,
        timeBetweenMatchesMinutes: 2,
      },
      {
        id: eliminationStageId,
        tournamentId: "tournament",
        type: "ELIMINATION",
        name: "Elimination",
        rulesetId: null,
        minPoolSize: null,
        maxPoolSize: null,
        preferredPoolSize: null,
        eliminationParticipantCount: 8,
        timeBetweenMatchesMinutes: 2,
      },
      {
        id: poolStageId,
        tournamentId: "tournament",
        type: "POOL",
        name: "Pools",
        rulesetId: null,
        minPoolSize: 4,
        maxPoolSize: 6,
        preferredPoolSize: 5,
        eliminationParticipantCount: null,
        timeBetweenMatchesMinutes: 2,
      },
    ]).execute();
    await ctx.database.insertInto("Arena").values([
      { id: "ring-one", eventId: "event", name: "Ring 1", order: 0, leftColor: "#21c15b", rightColor: "#2f7dfa" },
      { id: "ring-two", eventId: "event", name: "Ring 2", order: 1, leftColor: "#e06c75", rightColor: "#e5c07b" },
    ]).execute();
    await ctx.database.insertInto("EventSchedule").values({
      id: "schedule",
      eventId: "event",
      startTimeMinutes: 540,
      currentTimeSlotId: null,
    }).execute();
    await ctx.database.insertInto("ScheduleTimeSlot").values([
      { id: "slot-one", scheduleId: "schedule", order: 0, durationMinutes: 60, label: "Slot 1", color: null, isBreak: 0 },
      { id: "slot-two", scheduleId: "schedule", order: 1, durationMinutes: 60, label: "Slot 2", color: null, isBreak: 0 },
    ]).execute();
    await ctx.database.insertInto("ScheduledPhase").values([
      { id: finalPhaseId, stageId, arenaId: "ring-one", timeSlotId: "slot-one" },
      { id: semiPhaseId, stageId: semiStageId, arenaId: "ring-one", timeSlotId: "slot-one" },
      { id: otherRingPhaseId, stageId, arenaId: "ring-two", timeSlotId: "slot-one" },
      { id: laterPhaseId, stageId, arenaId: "ring-one", timeSlotId: "slot-two" },
    ]).execute();
    await ctx.database.insertInto("Round").values([
      { id: "final-round", stageId, roundNumber: 0 },
      { id: "semi-round", stageId: semiStageId, roundNumber: 0 },
      { id: "pool-round", stageId: poolStageId, roundNumber: 0 },
    ]).execute();
    await ctx.database.insertInto("Match").values([
      { id: "final-match", roundId: "final-round", arenaId: null, entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "final-match-two", roundId: "final-round", arenaId: null, entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "final-match-three", roundId: "final-round", arenaId: null, entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "semi-match", roundId: "semi-round", arenaId: null, entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "pool-match", roundId: "pool-round", arenaId: null, entryAId: null, entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
    ]).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("saves and clears an explicit bracket placement", async () => {
    const response = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match/schedule",
      payload: { scheduledPhaseId: finalPhaseId, order: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().scheduledMatch).toEqual({ scheduledPhaseId: finalPhaseId, order: 1 });
    expect(await ctx.database.selectFrom("ScheduledMatch").selectAll().execute()).toEqual([
      { matchId: "final-match", scheduledPhaseId: finalPhaseId, order: 1 },
    ]);

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: "/api/v1/matches/final-match/schedule",
    });
    expect(removed.statusCode).toBe(204);
    expect(await ctx.database.selectFrom("ScheduledMatch").selectAll().execute()).toEqual([]);
  });

  it("rejects pool matches, phases from another stage, and duplicate ring order across phases", async () => {
    const poolMatch = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/pool-match/schedule",
      payload: { scheduledPhaseId: finalPhaseId, order: 1 },
    });
    expect(poolMatch.statusCode).toBe(409);

    const wrongStage = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match/schedule",
      payload: { scheduledPhaseId: semiPhaseId, order: 1 },
    });
    expect(wrongStage.statusCode).toBe(400);

    const first = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match/schedule",
      payload: { scheduledPhaseId: finalPhaseId, order: 1 },
    });
    expect(first.statusCode).toBe(200);

    const collision = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/semi-match/schedule",
      payload: { scheduledPhaseId: semiPhaseId, order: 1 },
    });
    expect(collision.statusCode).toBe(409);
  });

  it("allows the same order on another ring or in a later time slot", async () => {
    const first = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match/schedule",
      payload: { scheduledPhaseId: finalPhaseId, order: 1 },
    });
    const otherRing = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match-two/schedule",
      payload: { scheduledPhaseId: otherRingPhaseId, order: 1 },
    });
    const laterSlot = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match-three/schedule",
      payload: { scheduledPhaseId: laterPhaseId, order: 1 },
    });

    expect(first.statusCode).toBe(200);
    expect(otherRing.statusCode).toBe(200);
    expect(laterSlot.statusCode).toBe(200);
  });

  it("allows multiple stages on the same ring and time slot", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/scheduled-phases",
      payload: {
        stageId: eliminationStageId,
        arenaId: "ring-one",
        timeSlotId: "slot-one",
      },
    });

    expect(response.statusCode).toBe(200);
    const phases = await ctx.database.selectFrom("ScheduledPhase")
      .select(["stageId", "arenaId", "timeSlotId"])
      .where("arenaId", "=", "ring-one")
      .where("timeSlotId", "=", "slot-one")
      .execute();
    expect(phases).toHaveLength(3);
  });

  it("prevents deleting a phase while bracket matches remain assigned", async () => {
    const scheduled = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/final-match/schedule",
      payload: { scheduledPhaseId: finalPhaseId, order: 1 },
    });
    expect(scheduled.statusCode).toBe(200);

    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/scheduled-phases/${finalPhaseId}`,
    });

    expect(response.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("ScheduledMatch").select("matchId").execute()).toEqual([
      { matchId: "final-match" },
    ]);
  });
});

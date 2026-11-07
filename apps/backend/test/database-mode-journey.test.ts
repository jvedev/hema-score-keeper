import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

describe("database-mode scoring journey", () => {
  let ctx: TestContext;
  let organizer: TestUser;
  let leftFighter: TestUser;
  let rightFighter: TestUser;

  beforeEach(async () => {
    ctx = await createTestContext();
    organizer = await insertUser(ctx.database, { id: "journey-organizer", role: "USER", name: "Organizer" });
    leftFighter = await insertUser(ctx.database, { id: "journey-left", role: "USER", name: "Left Fighter" });
    rightFighter = await insertUser(ctx.database, { id: "journey-right", role: "USER", name: "Right Fighter" });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("creates and schedules a tournament, scores a bout, projects it, and corrects it", async () => {
    const eventResponse = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: bearer(organizer),
      payload: { eventName: "Journey Event" },
    });
    expect(eventResponse.statusCode).toBe(200);
    const eventId = (eventResponse.json() as { id: string }).id;

    const tournamentResponse = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/tournaments",
      headers: bearer(organizer),
      payload: { eventId, name: "Journey Tournament" },
    });
    expect(tournamentResponse.statusCode).toBe(200);
    const tournament = tournamentResponse.json() as {
      id: string;
      stages: Array<{ id: string; type: string }>;
    };
    const tournamentId = tournament.id;
    const poolStage = tournament.stages.find((stage) => stage.type === "POOL");
    expect(poolStage).toBeDefined();
    const stageId = poolStage!.id;

    const adminResponse = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/tournaments/${tournamentId}/admins`,
      headers: bearer(organizer),
    });
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json().admins).toEqual([
      expect.objectContaining({ userId: organizer.id }),
    ]);

    await ctx.database.insertInto("Entry").values([
      { id: "journey-entry-left", tournamentId, userId: leftFighter.id, kind: "FIGHTER", seed: 1 },
      { id: "journey-entry-right", tournamentId, userId: rightFighter.id, kind: "FIGHTER", seed: 2 },
    ]).execute();
    await ctx.database.insertInto("Round").values({
      id: "journey-round",
      stageId,
      roundNumber: 1,
    }).execute();
    await ctx.database.insertInto("Match").values({
      id: "journey-match",
      roundId: "journey-round",
      arenaId: null,
      entryAId: "journey-entry-left",
      entryBId: "journey-entry-right",
      winnerEntryId: null,
      scoreA: null,
      scoreB: null,
      rulesetId: null,
    }).execute();

    const arenaResponse = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/arenas",
      headers: bearer(organizer),
      payload: { eventId, name: "Journey Ring", order: 1 },
    });
    expect(arenaResponse.statusCode).toBe(200);
    const arenaId = (arenaResponse.json() as { id: string }).id;
    await ctx.database.insertInto("StageArena").values({ id: "journey-stage-arena", stageId, arenaId }).execute();

    const openingSlot = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/events/${eventId}/schedule/slots`,
      headers: bearer(organizer),
      payload: { durationMinutes: 60, label: "Opening" },
    });
    expect(openingSlot.statusCode).toBe(200);
    const slotResponse = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/events/${eventId}/schedule/slots`,
      headers: bearer(organizer),
      payload: { durationMinutes: 60, label: "Scoring" },
    });
    expect(slotResponse.statusCode).toBe(200);
    const slotId = (slotResponse.json() as { id: string }).id;
    const phaseResponse = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/scheduled-phases",
      headers: bearer(organizer),
      payload: { stageId, arenaId, timeSlotId: slotId },
    });
    expect(phaseResponse.statusCode).toBe(200);
    const scheduledPhaseId = (phaseResponse.json() as { id: string }).id;

    await ctx.database.updateTable("Match").set({ arenaId: arenaId }).where("id", "=", "journey-match").execute();
    await ctx.database.insertInto("ScheduledMatch").values({
      matchId: "journey-match",
      scheduledPhaseId,
      order: 1,
    }).execute();

    const activation = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/tournaments/${tournamentId}/live`,
      headers: bearer(organizer),
    });
    expect(activation.statusCode, activation.body).toBe(200);
    expect(activation.json()).toMatchObject({ projection: { rings: 1, bouts: 1 } });

    const liveTournament = await ctx.database.selectFrom("LiveTournament")
      .select("id")
      .where("sourceTournamentId", "=", tournamentId)
      .executeTakeFirstOrThrow();
    const liveBout = await ctx.database.selectFrom("LiveBout")
      .select(["id", "ringId"])
      .where("sourceMatchId", "=", "journey-match")
      .executeTakeFirstOrThrow();
    const ring = await ctx.database.selectFrom("LiveRing")
      .select(["keeperToken"])
      .where("id", "=", liveBout.ringId)
      .executeTakeFirstOrThrow();
    const ringUrl = `/api/v1/live-rings/by-token/${ring.keeperToken}`;

    const ringRead = await ctx.app.inject({ method: "GET", url: ringUrl, headers: bearer(organizer) });
    expect(ringRead.statusCode).toBe(200);
    expect(ringRead.json().tournament).toMatchObject({ id: liveTournament.id, mode: "DATABASE" });

    const deviceId = "journey-device";
    const claim = await ctx.app.inject({
      method: "POST",
      url: `${ringUrl}/claim`,
      headers: bearer(organizer),
      payload: { deviceId },
    });
    expect(claim.statusCode).toBe(200);

    const scoringHeaders = {
      ...bearer(organizer),
      "x-ring-token": ring.keeperToken,
      "x-device-id": deviceId,
    };
    const exchange = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${liveBout.id}/exchanges`,
      headers: scoringHeaders,
      payload: {
        clientExchangeId: "journey-exchange",
        kind: "EXCHANGE",
        leftPoints: 2,
        rightPoints: 0,
      },
    });
    expect(exchange.statusCode).toBe(200);

    const finish = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${liveBout.id}/finish`,
      headers: scoringHeaders,
    });
    expect(finish.statusCode).toBe(200);
    expect(await ctx.database.selectFrom("Match")
      .select(["scoreA", "scoreB", "winnerEntryId"])
      .where("id", "=", "journey-match")
      .executeTakeFirst())
      .toEqual({ scoreA: 2, scoreB: 0, winnerEntryId: "journey-entry-left" });

    const resultsUrl = `/api/v1/tournaments/${tournamentId}/live/results`;
    const resultsBeforeCorrection = await ctx.app.inject({
      method: "GET",
      url: resultsUrl,
      headers: bearer(organizer),
    });
    expect(resultsBeforeCorrection.statusCode).toBe(200);
    expect(resultsBeforeCorrection.json().results).toEqual([
      expect.objectContaining({
        sourceMatchId: "journey-match",
        score: { left: 2, right: 0, doubles: 0 },
        exchanges: [expect.objectContaining({ clientExchangeId: "journey-exchange" })],
      }),
    ]);

    const correction = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${liveBout.id}/correction`,
      headers: bearer(organizer),
      payload: {
        exchanges: [{
          clientExchangeId: "journey-corrected-exchange",
          kind: "EXCHANGE",
          leftPoints: 0,
          rightPoints: 3,
          round: 1,
        }],
      },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json()).toMatchObject({ revision: 1, score: { left: 0, right: 3 } });
    expect(await ctx.database.selectFrom("Match")
      .select(["scoreA", "scoreB", "winnerEntryId"])
      .where("id", "=", "journey-match")
      .executeTakeFirst())
      .toEqual({ scoreA: 0, scoreB: 3, winnerEntryId: "journey-entry-right" });
    expect(await ctx.database.selectFrom("LiveBoutRevision")
      .select("revision")
      .where("boutId", "=", liveBout.id)
      .execute())
      .toEqual([{ revision: 1 }]);

    const resultsAfterCorrection = await ctx.app.inject({
      method: "GET",
      url: resultsUrl,
      headers: bearer(organizer),
    });
    expect(resultsAfterCorrection.statusCode).toBe(200);
    expect(resultsAfterCorrection.json().results).toEqual([
      expect.objectContaining({
        sourceMatchId: "journey-match",
        score: { left: 0, right: 3, doubles: 0 },
        exchanges: [expect.objectContaining({ clientExchangeId: "journey-corrected-exchange" })],
      }),
    ]);
  });
});

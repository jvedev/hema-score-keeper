import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { enqueueSync } from "../src/live/live-store.js";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

describe("database-mode tournament activation and projection", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let other: TestUser;
  let liveTournamentId: string | null;

  beforeEach(async () => {
    ctx = await createTestContext();
    liveTournamentId = null;
    admin = await insertUser(ctx.database, { id: "organizer", role: "USER", name: "Organizer" });
    other = await insertUser(ctx.database, { id: "other", role: "USER", name: "Other" });
    await ctx.database.insertInto("Event").values({
      id: "event",
      eventName: "Tournament day",
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
        id: "pool-stage",
        tournamentId: "source-tournament",
        type: "POOL",
        name: "Pools",
        rulesetId: null,
        minPoolSize: 2,
        maxPoolSize: 4,
        preferredPoolSize: 3,
        eliminationParticipantCount: null,
        timeBetweenMatchesMinutes: 2,
      },
      {
        id: "final-stage",
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
      { id: "slot-one", scheduleId: "schedule", order: 1, durationMinutes: 60, label: "Slot 1", color: null, isBreak: 0 },
      { id: "slot-two", scheduleId: "schedule", order: 2, durationMinutes: 60, label: "Slot 2", color: null, isBreak: 0 },
    ]).execute();
    await ctx.database.insertInto("ScheduledPhase").values([
      { id: "pool-phase", stageId: "pool-stage", arenaId: "ring-one", timeSlotId: "slot-one" },
      { id: "final-phase", stageId: "final-stage", arenaId: "ring-one", timeSlotId: "slot-one" },
      { id: "other-ring-phase", stageId: "pool-stage", arenaId: "ring-two", timeSlotId: "slot-two" },
    ]).execute();
    await ctx.database.insertInto("Entry").values([
      { id: "entry-a", tournamentId: "source-tournament", userId: admin.id, kind: "FIGHTER", seed: 1 },
      { id: "entry-b", tournamentId: "source-tournament", userId: other.id, kind: "FIGHTER", seed: 2 },
    ]).execute();
    await ctx.database.insertInto("Round").values([
      { id: "pool-round", stageId: "pool-stage", roundNumber: 1 },
      { id: "final-round", stageId: "final-stage", roundNumber: 1 },
    ]).execute();
    await ctx.database.insertInto("Match").values([
      { id: "pool-match-a", roundId: "pool-round", arenaId: "ring-one", entryAId: "entry-a", entryBId: "entry-b", winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "pool-match-b", roundId: "pool-round", arenaId: "ring-one", entryAId: "entry-a", entryBId: null, winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "pool-match-unscheduled", roundId: "pool-round", arenaId: null, entryAId: "entry-a", entryBId: "entry-b", winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
      { id: "final-match", roundId: "final-round", arenaId: null, entryAId: "entry-a", entryBId: "entry-b", winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null },
    ]).execute();
    await ctx.database.insertInto("ScheduledMatch").values({
      matchId: "final-match",
      scheduledPhaseId: "final-phase",
      order: 2,
    }).execute();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function activate(as: TestUser = admin) {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/tournaments/source-tournament/live",
      headers: bearer(as),
    });
    if (response.statusCode === 200) liveTournamentId = (response.json() as { id: string }).id;
    return response;
  }

  async function project(as: TestUser = admin) {
    if (!liveTournamentId) throw new Error("Activate the live tournament before projecting.");
    return ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-tournaments/${liveTournamentId}/project`,
      headers: bearer(as),
    });
  }

  async function scoreAndFinish(
    sourceMatchId: string,
    exchanges: Array<{ clientExchangeId: string; leftPoints: number; rightPoints: number; round?: number }>,
  ) {
    const bout = await ctx.database.selectFrom("LiveBout")
      .selectAll()
      .where("sourceMatchId", "=", sourceMatchId)
      .executeTakeFirstOrThrow();
    const ring = await ctx.database.selectFrom("LiveRing")
      .select("keeperToken")
      .where("id", "=", bout.ringId)
      .executeTakeFirstOrThrow();
    const deviceId = `device-${sourceMatchId}`;
    const headers = { ...bearer(admin), "x-ring-token": ring.keeperToken, "x-device-id": deviceId };
    const claim = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-rings/by-token/${ring.keeperToken}/claim`,
      headers: bearer(admin),
      payload: { deviceId },
    });
    expect(claim.statusCode).toBe(200);
    for (const exchange of exchanges) {
      const response = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/live-bouts/${bout.id}/exchanges`,
        headers,
        payload: { ...exchange, kind: "EXCHANGE" },
      });
      expect(response.statusCode).toBe(200);
    }
    return ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${bout.id}/finish`,
      headers,
    });
  }

  it("requires a tournament admin and creates live rings, bouts, identities and persistent pool order atomically", async () => {
    expect((await activate(other)).statusCode).toBe(403);
    const hiddenStatus = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/tournaments/source-tournament/live",
      headers: bearer(other),
    });
    expect(hiddenStatus.statusCode).toBe(403);
    const response = await activate();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projection: { rings: 2, bouts: 3, removedBouts: 0 },
    });
    const liveTournament = await ctx.database.selectFrom("LiveTournament").selectAll().executeTakeFirstOrThrow();
    expect(liveTournament).toMatchObject({
      mode: "DATABASE",
      sourceTournamentId: "source-tournament",
      googleSpreadsheetId: null,
    });
    const rings = await ctx.database.selectFrom("LiveRing").selectAll().where("tournamentId", "=", liveTournament.id).execute();
    expect(rings).toHaveLength(2);
    expect(rings.every((ring) => ring.keeperToken.length === 32 && ring.scoreboardToken.length === 32)).toBe(true);

    const bouts = await ctx.database.selectFrom("LiveBout").selectAll().where("tournamentId", "=", liveTournament.id).orderBy("order").execute();
    expect(bouts).toHaveLength(3);
    expect(bouts.map((bout) => [bout.sourceMatchId, bout.order, bout.fighterLeft, bout.fighterRight])).toEqual([
      ["pool-match-a", 1, "Organizer", "Other"],
      ["final-match", 2, "Organizer", "Other"],
      ["pool-match-b", 3, "Organizer", ""],
    ]);
    expect(await ctx.database.selectFrom("ScheduledMatch").selectAll().where("matchId", "in", ["pool-match-a", "pool-match-b"]).orderBy("order").execute())
      .toEqual([
        { matchId: "pool-match-a", scheduledPhaseId: "pool-phase", order: 1 },
        { matchId: "pool-match-b", scheduledPhaseId: "pool-phase", order: 3 },
      ]);
    expect(await ctx.database.selectFrom("LiveTournamentFighter").select("userId").where("tournamentId", "=", liveTournament.id).execute())
      .toHaveLength(2);
    expect(await ctx.database.selectFrom("LiveBout").select("id").where("sourceMatchId", "=", "pool-match-unscheduled").execute())
      .toEqual([]);
    const status = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/tournaments/source-tournament/live",
      headers: bearer(admin),
    });
    expect(status.json()).toMatchObject({ active: true, liveTournamentId: liveTournament.id, rings: 2, bouts: 3 });
  });

  it("rejects duplicate activation and makes repeated projection idempotent", async () => {
    expect((await activate()).statusCode).toBe(200);
    expect((await activate()).statusCode).toBe(409);

    const result = await project();
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ rings: 2, bouts: 3, removedBouts: 0 });
    expect(await ctx.database.selectFrom("LiveRing").select("id").where("tournamentId", "=", liveTournamentId!).execute())
      .toHaveLength(2);
    expect(await ctx.database.selectFrom("LiveBout").select("id").where("tournamentId", "=", liveTournamentId!).execute())
      .toHaveLength(3);
    expect(await ctx.database.selectFrom("LiveTournamentFighter").select("id").where("tournamentId", "=", liveTournamentId!).execute())
      .toHaveLength(2);
  });

  it("allows administrators to adjust automatically generated pool bout orders", async () => {
    await activate();
    const response = await ctx.app.inject({
      method: "PUT",
      url: "/api/v1/matches/pool-match-a/schedule",
      headers: bearer(admin),
      payload: { scheduledPhaseId: "pool-phase", order: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().scheduledMatch).toEqual({ scheduledPhaseId: "pool-phase", order: 4 });
    expect((await project()).statusCode).toBe(200);
    expect(await ctx.database.selectFrom("LiveBout").select("order").where("sourceMatchId", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ order: 4 });
  });

  it("keeps spreadsheet imports, backup and sync jobs disabled for database mode", async () => {
    await activate();
    const url = `/api/v1/live-tournaments/${liveTournamentId}`;
    const headers = bearer(admin);
    const xlsx = await ctx.app.inject({
      method: "POST",
      url: `${url}/import/xlsx`,
      headers: { ...headers, "content-type": "application/octet-stream" },
      payload: Buffer.from("not a workbook"),
    });
    const google = await ctx.app.inject({ method: "POST", url: `${url}/import/google`, headers });
    const sync = await ctx.app.inject({ method: "GET", url: `${url}/sync`, headers });
    const backup = await ctx.app.inject({ method: "GET", url: `${url}/backup.xlsx`, headers });
    expect([xlsx.statusCode, google.statusCode, sync.statusCode, backup.statusCode]).toEqual([409, 409, 409, 409]);

    await enqueueSync(ctx.database, liveTournamentId!, "live-bout");
    expect(await ctx.database.selectFrom("LiveSyncJob").select("id").execute()).toEqual([]);
  });

  it("updates unscored schedule changes but refuses to move a bout after scoring starts", async () => {
    expect((await activate()).statusCode).toBe(200);
    await ctx.database.updateTable("ScheduledMatch").set({ order: 4 }).where("matchId", "=", "pool-match-a").execute();
    expect((await project()).statusCode).toBe(200);
    expect(await ctx.database.selectFrom("LiveBout").select(["order"]).where("sourceMatchId", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ order: 4 });

    await ctx.database.updateTable("LiveBout").set({ status: "RUNNING" }).where("sourceMatchId", "=", "pool-match-a").execute();
    await ctx.database.updateTable("ScheduledMatch").set({ order: 5 }).where("matchId", "=", "pool-match-a").execute();
    const conflict = await project();
    expect(conflict.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("LiveBout").select(["order", "status"]).where("sourceMatchId", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ order: 4, status: "RUNNING" });
  });

  it("rolls back pool regeneration when it would remove a bout that has started live scoring", async () => {
    await activate();
    await ctx.database.insertInto("ScheduledAssignment").values([
      { id: "fighter-assignment-a", scheduledPhaseId: "pool-phase", userId: admin.id, role: "FIGHTER" },
      { id: "fighter-assignment-b", scheduledPhaseId: "pool-phase", userId: other.id, role: "FIGHTER" },
    ]).execute();
    await ctx.database.updateTable("LiveBout")
      .set({ status: "RUNNING" })
      .where("sourceMatchId", "=", "pool-match-b")
      .execute();

    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/events" });
    expect(response.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("Match").select("id").where("id", "in", ["pool-match-a", "pool-match-b"]).orderBy("id").execute())
      .toEqual([{ id: "pool-match-a" }, { id: "pool-match-b" }]);
    expect(await ctx.database.selectFrom("LiveBout").select(["sourceMatchId", "status"]).where("sourceMatchId", "=", "pool-match-b").executeTakeFirst())
      .toEqual({ sourceMatchId: "pool-match-b", status: "RUNNING" });
  });

  it("refuses activation when a pool bout with an arena has no matching scheduled phase", async () => {
    await ctx.database.deleteFrom("ScheduledPhase").where("id", "=", "pool-phase").execute();
    const response = await activate();
    expect(response.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("LiveTournament").select("id").execute()).toEqual([]);
  });

  it("rejects matches that reference an entry from another tournament", async () => {
    await ctx.database.insertInto("Tournament").values({
      id: "other-tournament",
      eventId: "event",
      createdByUserId: admin.id,
      name: "Other",
      rulesetId: null,
      currentStageId: null,
      order: 1,
      color: "#5B8CFF",
    }).execute();
    await ctx.database.insertInto("Entry").values({
      id: "foreign-entry",
      tournamentId: "other-tournament",
      userId: other.id,
      kind: "FIGHTER",
      seed: 1,
    }).execute();
    await ctx.database.updateTable("Match").set({ entryBId: "foreign-entry" }).where("id", "=", "pool-match-a").execute();

    const response = await activate();
    expect(response.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("LiveTournament").select("id").execute()).toEqual([]);
  });

  it("projects finished results and exchanges atomically, idempotently, and blocks manual completion", async () => {
    await activate();
    const manual = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/matches/pool-match-a/complete",
      payload: { scoreA: 1, scoreB: 0, exchanges: [] },
    });
    expect(manual.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("Match").select(["scoreA", "scoreB"]).where("id", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ scoreA: null, scoreB: null });

    const exchanges = [
      { clientExchangeId: "score-a", leftPoints: 2, rightPoints: 0 },
      { clientExchangeId: "score-b", leftPoints: 0, rightPoints: 1 },
    ];
    const finished = await scoreAndFinish("pool-match-a", exchanges);
    expect(finished.statusCode).toBe(200);
    const match = await ctx.database.selectFrom("Match").selectAll().where("id", "=", "pool-match-a").executeTakeFirstOrThrow();
    expect(match).toMatchObject({ scoreA: 2, scoreB: 1, winnerEntryId: "entry-a" });
    const eventExchanges = await ctx.database.selectFrom("Exchange").selectAll().where("matchId", "=", "pool-match-a").execute();
    expect(eventExchanges).toHaveLength(2);
    expect(eventExchanges.map((exchange) => [exchange.scoreA, exchange.scoreB])).toEqual([[2, 0], [2, 1]]);
    expect(JSON.parse(eventExchanges[0]!.details!)).toMatchObject({
      source: "LIVE",
      kind: "EXCHANGE",
      liveBoutId: expect.any(String),
      liveExchangeId: expect.any(String),
      seq: 1,
    });
    expect((await ctx.database.selectFrom("LiveBout").select("sourceResultSignature").where("sourceMatchId", "=", "pool-match-a").executeTakeFirst())
      ?.sourceResultSignature).toMatch(/^[a-f0-9]{64}$/);

    expect((await scoreAndFinish("pool-match-a", exchanges)).statusCode).toBe(200);
    expect(await ctx.database.selectFrom("Exchange").select("id").where("matchId", "=", "pool-match-a").execute())
      .toHaveLength(2);
  });

  it("lets only a tournament admin correct a completed result and preserves the prior version", async () => {
    await activate();
    expect((await scoreAndFinish("pool-match-a", [
      { clientExchangeId: "original-a", leftPoints: 1, rightPoints: 0 },
      { clientExchangeId: "original-b", leftPoints: 0, rightPoints: 1 },
    ])).statusCode).toBe(200);

    const bout = await ctx.database.selectFrom("LiveBout")
      .select("id")
      .where("sourceMatchId", "=", "pool-match-a")
      .executeTakeFirstOrThrow();
    const payload = {
      exchanges: [
        { clientExchangeId: "corrected-a", kind: "EXCHANGE", leftPoints: 0, rightPoints: 2 },
        { clientExchangeId: "corrected-b", kind: "DEDUCTION", leftPoints: -1, rightPoints: 0 },
      ],
    };
    const denied = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${bout.id}/correction`,
      headers: bearer(other),
      payload,
    });
    expect(denied.statusCode).toBe(403);

    const corrected = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${bout.id}/correction`,
      headers: bearer(admin),
      payload,
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json()).toMatchObject({ revision: 1, score: { left: -1, right: 2 } });
    expect(await ctx.database.selectFrom("Match").select(["scoreA", "scoreB", "winnerEntryId"]).where("id", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ scoreA: -1, scoreB: 2, winnerEntryId: "entry-b" });
    const revision = await ctx.database.selectFrom("LiveBoutRevision").selectAll().where("boutId", "=", bout.id).executeTakeFirstOrThrow();
    expect(revision).toMatchObject({ revision: 1, replacedByUserId: admin.id });
    expect(JSON.parse(revision.exchangesJson)).toHaveLength(2);
    const currentExchanges = await ctx.database.selectFrom("LiveExchange").select(["clientExchangeId", "undoneAt"]).where("boutId", "=", bout.id).orderBy("seq").execute();
    expect(currentExchanges).toEqual([
      { clientExchangeId: "corrected-a", undoneAt: null },
      { clientExchangeId: "corrected-b", undoneAt: null },
    ]);
    expect(await ctx.database.selectFrom("Exchange").select("id").where("matchId", "=", "pool-match-a").execute()).toHaveLength(2);
    const retried = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${bout.id}/correction`,
      headers: bearer(admin),
      payload,
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().revision).toBe(1);
    expect(await ctx.database.selectFrom("LiveBoutRevision").select("id").where("boutId", "=", bout.id).execute()).toHaveLength(1);
    expect(await ctx.database.selectFrom("Exchange").select("id").where("matchId", "=", "pool-match-a").execute()).toHaveLength(2);
  });

  it("rolls back a finish when the source match already has an external result", async () => {
    await activate();
    await ctx.database.updateTable("Match").set({ scoreA: 7, scoreB: 2 }).where("id", "=", "pool-match-a").execute();
    const finish = await scoreAndFinish("pool-match-a", [
      { clientExchangeId: "live-result", leftPoints: 1, rightPoints: 0 },
    ]);
    expect(finish.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("LiveBout").select(["status", "sourceResultSignature"])
      .where("sourceMatchId", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ status: "RUNNING", sourceResultSignature: null });
    expect(await ctx.database.selectFrom("Match").select(["scoreA", "scoreB"]).where("id", "=", "pool-match-a").executeTakeFirst())
      .toEqual({ scoreA: 7, scoreB: 2 });
    expect(await ctx.database.selectFrom("Exchange").select("id").where("matchId", "=", "pool-match-a").execute()).toEqual([]);
  });

  it("rolls back a correction if projecting the Event-admin exchange rows fails", async () => {
    await activate();
    expect((await scoreAndFinish("pool-match-a", [
      { clientExchangeId: "original", leftPoints: 2, rightPoints: 0 },
    ])).statusCode).toBe(200);
    const bout = await ctx.database.selectFrom("LiveBout")
      .select("id")
      .where("sourceMatchId", "=", "pool-match-a")
      .executeTakeFirstOrThrow();
    const matchBefore = await ctx.database.selectFrom("Match").selectAll().where("id", "=", "pool-match-a").executeTakeFirstOrThrow();
    const exchangeIdsBefore = await ctx.database.selectFrom("Exchange").select("id").where("matchId", "=", "pool-match-a").execute();
    await sql`CREATE TRIGGER fail_live_result_projection
      BEFORE INSERT ON Exchange
      BEGIN
        SELECT RAISE(ABORT, 'forced result projection failure');
      END`.execute(ctx.database);

    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-bouts/${bout.id}/correction`,
      headers: bearer(admin),
      payload: {
        exchanges: [{ clientExchangeId: "corrected", kind: "EXCHANGE", leftPoints: 0, rightPoints: 3 }],
      },
    });
    expect(response.statusCode).toBe(409);
    expect(await ctx.database.selectFrom("LiveBoutRevision").select("id").where("boutId", "=", bout.id).execute()).toEqual([]);
    expect(await ctx.database.selectFrom("LiveExchange").select("clientExchangeId").where("boutId", "=", bout.id).execute())
      .toEqual([{ clientExchangeId: "original" }]);
    expect(await ctx.database.selectFrom("Match").selectAll().where("id", "=", "pool-match-a").executeTakeFirst())
      .toEqual(matchBefore);
    expect(await ctx.database.selectFrom("Exchange").select("id").where("matchId", "=", "pool-match-a").execute())
      .toEqual(exchangeIdsBefore);
  });
});

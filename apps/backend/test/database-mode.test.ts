import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});

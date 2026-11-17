import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeExchanges } from "../src/live/live-store.js";
import { createTestContext, insertUser, type TestContext } from "./helpers.js";
import { createLiveTournament, type LiveFixture } from "./live-fixtures.js";

const NOW = "2026-10-25T10:00:00.000Z";

let ctx: TestContext;
let live: LiveFixture;
let boutId: string;

beforeEach(async () => {
  ctx = await createTestContext();
  const admin = await insertUser(ctx.database, { id: "u1", role: "SYSTEM_ADMIN" });
  const ann = await insertUser(ctx.database, { id: "ann", role: "USER", name: "Ann" });
  const bob = await insertUser(ctx.database, { id: "bob", role: "USER", name: "Bob" });
  live = await createLiveTournament(ctx, {
    admin,
    rings: [{ key: "one", name: "Ring 1" }],
    bouts: [{ key: "first", ring: "one", left: ann, right: bob }],
  });
  boutId = live.boutId("first");
});

afterEach(async () => {
  await ctx.app.close();
});

async function insertExchange(id: string, seq: number, undoneAt: string | null = null, clientExchangeId = id): Promise<void> {
  await ctx.database
    .insertInto("LiveExchange")
    .values({
      id,
      boutId,
      seq,
      kind: "EXCHANGE",
      leftPoints: 1,
      rightPoints: 0,
      isDouble: 0,
      firstScorer: null,
      clientExchangeId,
      createdByUserId: "u1",
      createdAt: NOW,
      undoneAt,
    })
    .execute();
}

async function columnNames(table: string): Promise<string[]> {
  const result = await sql<{ name: string }>`SELECT name FROM pragma_table_info(${table})`.execute(ctx.database);
  return result.rows.map((row) => row.name);
}

async function tableNames(): Promise<string[]> {
  const result = await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table'`.execute(ctx.database);
  return result.rows.map((row) => row.name);
}

describe("baseline schema creates live tables", () => {
  it("has the expected columns and no spreadsheet tables", async () => {
    expect(await columnNames("LiveTournament")).toEqual(["id", "name", "sourceTournamentId", "createdByUserId", "createdAt", "ruleset"]);
    expect(await columnNames("LiveRing")).toEqual([
      "id", "tournamentId", "sourceArenaId", "name", "order", "keeperToken", "activeDeviceId", "activeUserId", "activeSince",
      "scoreboardToken", "leftColor", "rightColor", "scoreboardMirrored", "scoreboardShowNext", "scoreboardTextSize", "scoreboardTheme",
    ]);
    expect(await columnNames("LiveBout")).toEqual([
      "id", "tournamentId", "sourceMatchId", "scheduledPhaseId", "sourceScheduleSignature", "sourceResultSignature",
      "ringId", "order", "label", "fighterLeft", "fighterRight", "fighterLeftId", "fighterRightId",
      "status", "startedAt", "finishedAt", "clockSeconds", "clockRunning", "clockUpdatedAt",
      "round", "period", "extension", "periodStartedAt", "warningsLeft", "warningsRight",
    ]);
    expect(await columnNames("LiveTournamentFighter")).toEqual(["id", "tournamentId", "name", "userId", "createdAt", "updatedAt"]);
    expect(await columnNames("LiveExchange")).toEqual([
      "id", "boutId", "seq", "kind", "leftPoints", "rightPoints", "isDouble",
      "firstScorer", "round", "clientExchangeId", "createdByUserId", "createdAt", "undoneAt",
    ]);
    expect(await tableNames()).not.toEqual(expect.arrayContaining(["LiveSyncJob"]));
    expect(await tableNames()).not.toEqual(expect.arrayContaining(["LiveSyncState"]));
  });

  it("rejects duplicates on the unique indexes", async () => {
    const ringId = live.ringId("one");
    await expect(
      ctx.database.insertInto("LiveRing").values({ id: "r2", tournamentId: live.liveTournamentId, name: "Ring 1", order: 2, keeperToken: "token-r2", scoreboardToken: "board-r2" }).execute(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      ctx.database.insertInto("LiveTournament").values({ id: "t2", name: "Again", sourceTournamentId: live.sourceTournamentId, createdByUserId: "u1", createdAt: NOW }).execute(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      ctx.database
        .insertInto("LiveBout")
        .values({
          id: "b2", tournamentId: live.liveTournamentId, sourceMatchId: live.matchId("first"), ringId, order: 2, label: "Bout 2",
          fighterLeft: "C", fighterRight: "D", status: "PENDING", startedAt: null, finishedAt: null,
        })
        .execute(),
    ).rejects.toThrow(/UNIQUE/);
    await insertExchange("e1", 1, null, "c1");
    await expect(insertExchange("e2", 2, null, "c1")).rejects.toThrow(/UNIQUE/);
    await expect(insertExchange("e3", 1, null, "c3")).rejects.toThrow(/UNIQUE/);
  });

  it("removes the live tournament with its source tournament", async () => {
    await ctx.database.deleteFrom("Tournament").where("id", "=", live.sourceTournamentId).execute();
    expect(await ctx.database.selectFrom("LiveTournament").selectAll().execute()).toEqual([]);
    expect(await ctx.database.selectFrom("LiveBout").selectAll().execute()).toEqual([]);
  });
});

describe("activeExchanges", () => {
  it("skips undone and orders by seq", async () => {
    await insertExchange("e3", 3);
    await insertExchange("e1", 1);
    await insertExchange("e2", 2, NOW);
    const rows = await activeExchanges(ctx.database, boutId);
    expect(rows.map((row) => row.id)).toEqual(["e1", "e3"]);
  });
});

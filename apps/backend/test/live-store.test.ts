import { sql, type Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type BackendDatabase } from "../src/db.js";
import { activeExchanges, enqueueSync } from "../src/live/live-store.js";
import { insertUser } from "./helpers.js";

let database: Kysely<BackendDatabase>;

const NOW = "2026-10-25T10:00:00.000Z";

async function seedTournament(googleSpreadsheetId: string | null = null): Promise<void> {
  await insertUser(database, { id: "u1", role: "SYSTEM_ADMIN" });
  await database
    .insertInto("LiveTournament")
    .values({ id: "t1", name: "Open", mode: "SHEET", layoutVersion: "v3", googleSpreadsheetId, createdByUserId: "u1", createdAt: NOW })
    .execute();
  await database.insertInto("LiveRing").values({ id: "r1", tournamentId: "t1", name: "Pool_1", order: 1 }).execute();
  await database
    .insertInto("LiveBout")
    .values({
      id: "b1",
      tournamentId: "t1",
      ringId: "r1",
      order: 1,
      label: "Match 1",
      sheetName: "Pool_1",
      headerCell: "B25",
      fighterLeft: "Ann",
      fighterRight: "Bob",
      status: "PENDING",
      startedAt: null,
      finishedAt: null,
    })
    .execute();
}

async function insertExchange(id: string, seq: number, undoneAt: string | null = null, clientExchangeId = id): Promise<void> {
  await database
    .insertInto("LiveExchange")
    .values({
      id,
      boutId: "b1",
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
  const result = await sql<{ name: string }>`SELECT name FROM pragma_table_info(${table})`.execute(database);
  return result.rows.map((row) => row.name);
}

beforeEach(() => {
  database = createDatabase("file::memory:");
});

describe("migration creates live tables", () => {
  it("has the expected columns", async () => {
    expect(await columnNames("LiveTournament")).toEqual(
      ["id", "name", "mode", "layoutVersion", "googleSpreadsheetId", "createdByUserId", "createdAt"],
    );
    expect(await columnNames("LiveRing")).toEqual(["id", "tournamentId", "name", "order"]);
    expect(await columnNames("LiveBout")).toEqual([
      "id", "tournamentId", "ringId", "order", "label", "sheetName", "headerCell",
      "fighterLeft", "fighterRight", "status", "startedAt", "finishedAt",
    ]);
    expect(await columnNames("LiveExchange")).toEqual([
      "id", "boutId", "seq", "kind", "leftPoints", "rightPoints", "isDouble",
      "firstScorer", "clientExchangeId", "createdByUserId", "createdAt", "undoneAt",
    ]);
    expect(await columnNames("LiveSyncJob")).toEqual([
      "id", "tournamentId", "boutId", "target", "status", "attempts", "nextAttemptAt", "lastError", "updatedAt",
    ]);
    expect(await columnNames("LiveSyncState")).toEqual(["tournamentId", "target", "lastSuccessAt", "lastError", "lastErrorAt"]);
  });

  it("rejects duplicates on the unique indexes", async () => {
    await seedTournament();
    await expect(
      database.insertInto("LiveRing").values({ id: "r2", tournamentId: "t1", name: "Pool_1", order: 2 }).execute(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      database
        .insertInto("LiveBout")
        .values({
          id: "b2", tournamentId: "t1", ringId: "r1", order: 2, label: "Match 1", sheetName: "Pool_1", headerCell: "B25",
          fighterLeft: "C", fighterRight: "D", status: "PENDING", startedAt: null, finishedAt: null,
        })
        .execute(),
    ).rejects.toThrow(/UNIQUE/);
    await insertExchange("e1", 1, null, "c1");
    await expect(insertExchange("e2", 2, null, "c1")).rejects.toThrow(/UNIQUE/);
    await expect(insertExchange("e3", 1, null, "c3")).rejects.toThrow(/UNIQUE/);
    await database
      .insertInto("LiveSyncJob")
      .values({ id: "j1", tournamentId: "t1", boutId: "b1", target: "LOCAL", status: "PENDING", attempts: 0, nextAttemptAt: NOW, lastError: null, updatedAt: NOW })
      .execute();
    await expect(
      database
        .insertInto("LiveSyncJob")
        .values({ id: "j2", tournamentId: "t1", boutId: "b1", target: "LOCAL", status: "PENDING", attempts: 0, nextAttemptAt: NOW, lastError: null, updatedAt: NOW })
        .execute(),
    ).rejects.toThrow(/UNIQUE/);
  });
});

describe("activeExchanges", () => {
  it("skips undone and orders by seq", async () => {
    await seedTournament();
    await insertExchange("e3", 3);
    await insertExchange("e1", 1);
    await insertExchange("e2", 2, NOW);
    const rows = await activeExchanges(database, "b1");
    expect(rows.map((row) => row.id)).toEqual(["e1", "e3"]);
  });
});

describe("enqueueSync", () => {
  it("coalesces to one job per target and resets attempts", async () => {
    await seedTournament("sheet-123");
    await enqueueSync(database, "t1", "b1");
    await database.updateTable("LiveSyncJob").set({ status: "FAILED", attempts: 4, lastError: "boom" }).execute();
    await enqueueSync(database, "t1", "b1");
    const jobs = await database.selectFrom("LiveSyncJob").selectAll().orderBy("target").execute();
    expect(jobs.map((job) => [job.target, job.status, job.attempts])).toEqual([
      ["GOOGLE", "PENDING", 0],
      ["LOCAL", "PENDING", 0],
    ]);
  });

  it("queues GOOGLE only when a spreadsheet id is set", async () => {
    await seedTournament(null);
    await enqueueSync(database, "t1", "b1");
    const jobs = await database.selectFrom("LiveSyncJob").selectAll().execute();
    expect(jobs.map((job) => job.target)).toEqual(["LOCAL"]);
  });
});

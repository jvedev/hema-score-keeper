import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BackendDatabase, LiveTarget } from "../src/db.js";
import { backupPath, liveDataDir } from "../src/live/data-dir.js";
import { enqueueSync } from "../src/live/live-store.js";
import type { CellWrite } from "../src/live/sheet-layout.js";
import { recoverSyncJobs, runSyncOnce, startSyncWorker, type SinkFactory } from "../src/live/sync-worker.js";
import { withTournamentLock } from "../src/live/tournament-lock.js";
import { XlsxFileSink, type CellSink } from "../src/live/xlsx-sink.js";
import { createTestContext, insertUser, type TestContext } from "./helpers.js";

const REAL_WORKBOOK = path.resolve(import.meta.dirname, "../../../DEVELOPMENT_TournamentPoolsV3_.xlsx");
const T0 = new Date("2026-10-25T10:00:00.000Z");
const TOURNAMENT = "t1";

function at(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

/** A small workbook in the v3 shape: header B25, points in D/E, a formula in C that reads them. */
async function smallWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const pool = wb.addWorksheet("Pool_1");
  pool.getCell("B25").value = "Match 1";
  pool.getCell("C25").value = "Ronald";
  pool.getCell("E25").value = "Diego";
  for (let row = 26; row <= 40; row++) {
    pool.getCell(`C${row}`).value = { formula: `IF(AND(D${row}>0,E${row}>0), 0, D${row})`, result: 0 };
  }
  pool.getCell("H25").value = "Match 6";
  const schedule = wb.addWorksheet("Schedule");
  schedule.addRow(["Ring", "Order", "Sheet", "Cell", "Label"]);
  schedule.addRow(["Ring A", 1, "Pool_1", "B25", null]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function readBack(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

class RecordingSink implements CellSink {
  calls: CellWrite[][] = [];
  constructor(private readonly onWrite: (writes: CellWrite[]) => Promise<void> = async () => undefined) {}
  async write(writes: CellWrite[]): Promise<void> {
    this.calls.push(writes);
    await this.onWrite(writes);
  }
}

describe("live sync worker", () => {
  let ctx: TestContext;
  let db: Kysely<BackendDatabase>;
  let dataDir: string;
  let xchg = 0;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "live-sync-"));
    process.env.LIVE_DATA_DIR = dataDir;
    ctx = await createTestContext();
    db = ctx.database;
    await insertUser(db, { id: "owner", role: "USER" });
    await db
      .insertInto("LiveTournament")
      .values({
        id: TOURNAMENT,
        name: "Open",
        mode: "SHEET",
        layoutVersion: "v3",
        googleSpreadsheetId: null,
        createdByUserId: "owner",
        createdAt: T0.toISOString(),
      })
      .execute();
    await db.insertInto("LiveRing").values({ id: "r1", tournamentId: TOURNAMENT, name: "Ring A", order: 1, keeperToken: "token-r1" }).execute();
    await addBout("b1", "B25");
  });

  afterEach(async () => {
    delete process.env.LIVE_DATA_DIR;
    await ctx.app.close();
  });

  async function addBout(id: string, headerCell: string, sheetName = "Pool_1"): Promise<void> {
    await db
      .insertInto("LiveBout")
      .values({
        id,
        tournamentId: TOURNAMENT,
        ringId: "r1",
        order: Number(id.slice(1)),
        label: id,
        sheetName,
        headerCell,
        fighterLeft: "L",
        fighterRight: "R",
        status: "RUNNING",
        startedAt: T0.toISOString(),
        finishedAt: null,
      })
      .execute();
  }

  async function addExchange(boutId: string, left: number, right: number): Promise<string> {
    xchg += 1;
    const last = await db.selectFrom("LiveExchange").select((eb) => eb.fn.max("seq").as("seq")).where("boutId", "=", boutId).executeTakeFirst();
    const id = `x${xchg}`;
    await db
      .insertInto("LiveExchange")
      .values({
        id,
        boutId,
        seq: Number(last?.seq ?? 0) + 1,
        kind: left < 0 || right < 0 ? "DEDUCTION" : "EXCHANGE",
        leftPoints: left,
        rightPoints: right,
        isDouble: left > 0 && right > 0 ? 1 : 0,
        firstScorer: null,
        clientExchangeId: id,
        createdByUserId: "owner",
        createdAt: T0.toISOString(),
        undoneAt: null,
      })
      .execute();
    return id;
  }

  async function job(boutId = "b1", target: LiveTarget = "LOCAL") {
    return db.selectFrom("LiveSyncJob").selectAll().where("boutId", "=", boutId).where("target", "=", target).executeTakeFirstOrThrow();
  }

  async function state(target: LiveTarget = "LOCAL") {
    return db
      .selectFrom("LiveSyncState")
      .selectAll()
      .where("tournamentId", "=", TOURNAMENT)
      .where("target", "=", target)
      .executeTakeFirst();
  }

  async function installBackup(buf: Buffer): Promise<string> {
    const file = backupPath(TOURNAMENT);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, buf);
    return file;
  }

  function fileSinks(file: string, now: Date): SinkFactory {
    return (_tournamentId, target) => (target === "LOCAL" ? new XlsxFileSink(file, { now: () => now }) : null);
  }

  it("writes the bout range into the backup file", async () => {
    const file = await installBackup(await smallWorkbook());
    await addExchange("b1", 3, 0);
    await addExchange("b1", 0, 1);
    await enqueueSync(db, TOURNAMENT, "b1", T0);

    const result = await runSyncOnce(db, fileSinks(file, at(1000)), at(1000));
    expect(result).toEqual({ done: 1, failed: 0 });

    const ws = (await readBack(file)).getWorksheet("Pool_1")!;
    expect(ws.getCell("D26").value).toBe(3);
    expect(ws.getCell("E26").value).toBeNull();
    expect(ws.getCell("D27").value).toBeNull();
    expect(ws.getCell("E27").value).toBe(1);
    expect(ws.getCell("C26").formula).toBe("IF(AND(D26>0,E26>0), 0, D26)");
    expect(ws.getCell("C25").value).toBe("Ronald");
    expect(readdirSync(path.dirname(file)).filter((name) => name.endsWith(".tmp"))).toEqual([]);

    expect(await job()).toMatchObject({ status: "DONE", lastError: null });
    expect(await state()).toMatchObject({ lastSuccessAt: at(1000).toISOString() });
  });

  it("writes the last sync time to Schedule!H1", async () => {
    const file = await installBackup(await smallWorkbook());
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    await runSyncOnce(db, fileSinks(file, at(2000)), at(2000));
    expect((await readBack(file)).getWorksheet("Schedule")!.getCell("H1").value).toBe(at(2000).toISOString());
  });

  it("undo clears the synced row", async () => {
    const file = await installBackup(await smallWorkbook());
    await addExchange("b1", 2, 0);
    const second = await addExchange("b1", 0, 4);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    await runSyncOnce(db, fileSinks(file, at(1000)), at(1000));
    expect((await readBack(file)).getWorksheet("Pool_1")!.getCell("E27").value).toBe(4);

    await db.updateTable("LiveExchange").set({ undoneAt: at(1500).toISOString() }).where("id", "=", second).execute();
    await enqueueSync(db, TOURNAMENT, "b1", at(1500));
    expect(await runSyncOnce(db, fileSinks(file, at(2000)), at(2000))).toEqual({ done: 1, failed: 0 });

    const ws = (await readBack(file)).getWorksheet("Pool_1")!;
    expect(ws.getCell("D26").value).toBe(2);
    expect(ws.getCell("D27").value).toBeNull();
    expect(ws.getCell("E27").value).toBeNull();
  });

  it("overflow is reported not written", async () => {
    const sink = new RecordingSink();
    for (let n = 0; n < 16; n++) await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);

    expect(await runSyncOnce(db, () => sink, at(1000))).toEqual({ done: 0, failed: 1 });
    expect(sink.calls).toEqual([]);
    const failed = await job();
    expect(failed.status).toBe("FAILED");
    expect(failed.lastError).toContain("RANGE_OVERFLOW");
    expect((await state())?.lastError).toContain("RANGE_OVERFLOW");

    // FAILED is not retried by time...
    expect(await runSyncOnce(db, () => sink, at(10 * 60_000))).toEqual({ done: 0, failed: 0 });
    // ...only a new write to the bout queues it again.
    await enqueueSync(db, TOURNAMENT, "b1", at(10 * 60_000));
    expect((await job()).status).toBe("PENDING");
  });

  it("failure backs off and records lastError", async () => {
    const sink = new RecordingSink(async () => {
      throw new Error("disk full");
    });
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);

    const expectedDelays = [5_000, 15_000, 60_000, 60_000];
    let now = T0;
    for (const [index, delay] of expectedDelays.entries()) {
      expect(await runSyncOnce(db, () => sink, now)).toEqual({ done: 0, failed: 1 });
      const failing = await job();
      expect(failing).toMatchObject({ status: "PENDING", attempts: index + 1, lastError: "disk full" });
      expect(failing.nextAttemptAt).toBe(new Date(now.getTime() + delay).toISOString());
      // Not due yet just before the back-off ends.
      expect(await runSyncOnce(db, () => sink, new Date(now.getTime() + delay - 1))).toEqual({ done: 0, failed: 0 });
      now = new Date(now.getTime() + delay);
    }
    expect(await state()).toMatchObject({ lastError: "disk full", lastErrorAt: at(80_000).toISOString(), lastSuccessAt: null });
    expect(sink.calls).toHaveLength(4);
  });

  it("real workbook keeps its formulas after a write", async () => {
    const copy = path.join(dataDir, "real.xlsx");
    copyFileSync(REAL_WORKBOOK, copy);
    const original = await readBack(copy);
    const before = formulaCounts(original);
    original.addWorksheet("Schedule").addRow(["Ring", "Order", "Sheet", "Cell", "Label"]);
    await original.xlsx.writeFile(copy);
    const file = await installBackup(readFileSync(copy));

    await addExchange("b1", 3, 0);
    await addExchange("b1", 2, 2);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    expect(await runSyncOnce(db, fileSinks(file, at(1000)), at(1000))).toEqual({ done: 1, failed: 0 });

    const written = await readBack(file);
    const after = formulaCounts(written);
    delete after.Schedule;
    expect(after).toEqual(before);
    // The Google export's array formulas survive (3 per pool sheet, 6 on Showcase).
    expect(before.Pool_1!.array).toBeGreaterThan(0);
    expect(before.Showcase!.array).toBeGreaterThan(0);
    const showcase = written.getWorksheet("Showcase")!.getCell("L3").value as ExcelJS.CellFormulaValue & { shareType?: string; ref?: string };
    expect(showcase).toMatchObject({ formula: "Pool_1!L3:O17", shareType: "array", ref: "L3:O17" });

    const pool = written.getWorksheet("Pool_1")!;
    expect(pool.getCell("D26").value).toBe(3);
    expect(pool.getCell("D27").value).toBe(2);
    expect(pool.getCell("E27").value).toBe(2);
    expect(pool.getCell("D28").value).toBeNull();
    expect(pool.getCell("C26").formula).toBe("IF(AND(D26>0,E26>0), 0, D26)");
  }, 30_000);

  it("a job reset by an enqueue during the write stays PENDING", async () => {
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    const sink = new RecordingSink(async () => {
      if (sink.calls.length === 1) await enqueueSync(db, TOURNAMENT, "b1", at(500));
    });

    expect(await runSyncOnce(db, () => sink, at(1000))).toEqual({ done: 0, failed: 0 });
    expect(await job()).toMatchObject({ status: "PENDING", attempts: 0, nextAttemptAt: at(500).toISOString() });

    expect(await runSyncOnce(db, () => sink, at(2000))).toEqual({ done: 1, failed: 0 });
    expect((await job()).status).toBe("DONE");
  });

  it("a failure during a concurrent enqueue does not back off the new job", async () => {
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    const sink = new RecordingSink(async () => {
      await enqueueSync(db, TOURNAMENT, "b1", at(500));
      throw new Error("boom");
    });
    await runSyncOnce(db, () => sink, at(1000));
    expect(await job()).toMatchObject({ status: "PENDING", attempts: 0, nextAttemptAt: at(500).toISOString() });
  });

  it("an exchange added during the write with the same timestamp is not lost", async () => {
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    const sink = new RecordingSink(async () => {
      if (sink.calls.length === 1) {
        await addExchange("b1", 0, 1);
        await enqueueSync(db, TOURNAMENT, "b1", T0); // same millisecond as the job the worker read
      }
    });
    await runSyncOnce(db, () => sink, at(1000));
    expect((await job()).status).toBe("PENDING");
    await runSyncOnce(db, () => sink, at(2000));
    expect((await job()).status).toBe("DONE");
    expect(sink.calls[1]!.find((write) => write.cell === "E27")?.value).toBe(1);
  });

  it("batches the bouts of one tournament into one write", async () => {
    await addBout("b2", "H25");
    await addExchange("b1", 1, 0);
    await addExchange("b2", 0, 2);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    await enqueueSync(db, TOURNAMENT, "b2", T0);
    const sink = new RecordingSink();

    expect(await runSyncOnce(db, () => sink, at(1000))).toEqual({ done: 2, failed: 0 });
    expect(sink.calls).toHaveLength(1);
    const cells = sink.calls[0]!.map((write) => `${write.sheet}!${write.cell}=${write.value}`);
    expect(cells).toContain("Pool_1!D26=1");
    expect(cells).toContain("Pool_1!K26=2");
  });

  it("a bout on a missing sheet does not hold back the other bouts", async () => {
    const file = await installBackup(await smallWorkbook());
    await addBout("b2", "B25", "Missing");
    await addExchange("b1", 3, 0);
    await addExchange("b2", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    await enqueueSync(db, TOURNAMENT, "b2", T0);

    expect(await runSyncOnce(db, fileSinks(file, at(1000)), at(1000))).toEqual({ done: 1, failed: 1 });
    expect((await readBack(file)).getWorksheet("Pool_1")!.getCell("D26").value).toBe(3);
    expect((await job("b1")).status).toBe("DONE");
    expect(await job("b2")).toMatchObject({ status: "PENDING", attempts: 1 });
    expect((await job("b2")).lastError).toContain("Missing");
  });

  it("skips a target with no sink and leaves its job pending", async () => {
    await db.updateTable("LiveTournament").set({ googleSpreadsheetId: "sheet-1" }).execute();
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    const sink = new RecordingSink();
    expect(await runSyncOnce(db, (_id, target) => (target === "LOCAL" ? sink : null), at(1000))).toEqual({ done: 1, failed: 0 });
    expect((await job("b1", "GOOGLE")).status).toBe("PENDING");
  });

  it("the local write waits for an import holding the tournament lock", async () => {
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    const sink = new RecordingSink();
    let release!: () => void;
    const importDone = withTournamentLock(TOURNAMENT, () => new Promise<void>((resolve) => (release = resolve)));

    const run = runSyncOnce(db, () => sink, at(1000));
    try {
      for (let n = 0; n < 20; n++) await new Promise((resolve) => setImmediate(resolve));
      expect(sink.calls).toHaveLength(0);
    } finally {
      // Always free the module-level lock, or later tests on this tournament would wait forever.
      release();
      await importDone;
    }
    expect(await run).toEqual({ done: 1, failed: 0 });
    expect(sink.calls).toHaveLength(1);
  });

  it("a failed file write leaves the backup unchanged and no tmp file", async () => {
    const buf = await smallWorkbook();
    const file = await installBackup(buf);
    await db.updateTable("LiveBout").set({ sheetName: "Missing" }).where("id", "=", "b1").execute();
    await addExchange("b1", 1, 0);
    await enqueueSync(db, TOURNAMENT, "b1", T0);

    expect(await runSyncOnce(db, fileSinks(file, at(1000)), at(1000))).toEqual({ done: 0, failed: 1 });
    expect((await job()).lastError).toContain("Missing");
    expect(readFileSync(file).equals(buf)).toBe(true);
    expect(readdirSync(path.dirname(file)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("start does not re-queue every bout; it makes backed-off jobs due and removes stale tmp files", async () => {
    await db.updateTable("LiveTournament").set({ googleSpreadsheetId: "sheet-1" }).execute();
    await addBout("b2", "H25");
    await addBout("b3", "N25");
    await addExchange("b1", 1, 0);
    await addExchange("b2", 1, 0);
    await addExchange("b3", 1, 0);
    // b2: synced long ago (DONE). b3: pending, backed off into the future. b1: no job at all.
    await enqueueSync(db, TOURNAMENT, "b2", T0);
    await db.updateTable("LiveSyncJob").set({ status: "DONE" }).where("boutId", "=", "b2").execute();
    await enqueueSync(db, TOURNAMENT, "b3", T0);
    await db.updateTable("LiveSyncJob").set({ attempts: 2, nextAttemptAt: at(60_000).toISOString() }).where("boutId", "=", "b3").execute();
    const b3Before = await job("b3", "LOCAL");
    const file = await installBackup(await smallWorkbook());
    const stale = `${file}.0f3c.tmp`;
    writeFileSync(stale, "half");
    writeFileSync(path.join(path.dirname(file), "notes.txt"), "keep");

    await recoverSyncJobs(db, at(1000));

    expect(await db.selectFrom("LiveSyncJob").select("id").where("boutId", "=", "b1").execute()).toEqual([]);
    expect((await job("b2", "LOCAL")).status).toBe("DONE");
    expect((await job("b2", "GOOGLE")).status).toBe("DONE");
    // Due now, attempts kept; updatedAt untouched so it is not mistaken for a new enqueue.
    expect(await job("b3", "LOCAL")).toMatchObject({ status: "PENDING", attempts: 2, nextAttemptAt: at(1000).toISOString(), updatedAt: b3Before.updatedAt });
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(path.join(path.dirname(file), "notes.txt"))).toBe(true);
  });

  it("a tick writes every LOCAL group before any GOOGLE group", async () => {
    await db.updateTable("LiveTournament").set({ googleSpreadsheetId: "sheet-1" }).execute();
    // A second tournament whose id sorts first, so ordering by tournament would put its GOOGLE group first.
    await db
      .insertInto("LiveTournament")
      .values({ id: "a0", name: "Other", mode: "SHEET", layoutVersion: "v3", googleSpreadsheetId: "sheet-2", createdByUserId: "owner", createdAt: T0.toISOString() })
      .execute();
    await db.insertInto("LiveRing").values({ id: "r0", tournamentId: "a0", name: "Ring", order: 1, keeperToken: "token-r0" }).execute();
    await db
      .insertInto("LiveBout")
      .values({
        id: "b9", tournamentId: "a0", ringId: "r0", order: 1, label: "b9", sheetName: "Pool_1", headerCell: "B25",
        fighterLeft: "L", fighterRight: "R", status: "RUNNING", startedAt: T0.toISOString(), finishedAt: null,
      })
      .execute();
    await addExchange("b1", 1, 0);
    await addExchange("b9", 0, 1);
    await enqueueSync(db, TOURNAMENT, "b1", T0);
    await enqueueSync(db, "a0", "b9", T0);

    const order: string[] = [];
    const sinks: SinkFactory = (tournamentId, target) => new RecordingSink(async () => void order.push(`${target}:${tournamentId}`));
    expect(await runSyncOnce(db, sinks, at(1000))).toEqual({ done: 4, failed: 0 });
    expect(order.slice(0, 2).sort()).toEqual(["LOCAL:a0", "LOCAL:t1"]);
    expect(order.slice(2).sort()).toEqual(["GOOGLE:a0", "GOOGLE:t1"]);
  });

  it("startSyncWorker runs on its interval and stops", async () => {
    await addExchange("b1", 1, 0);
    // The worker uses the real clock: queue the job in the past so it is due whatever the wall-clock time is.
    await enqueueSync(db, TOURNAMENT, "b1", new Date(0));
    const sink = new RecordingSink();
    const stop = startSyncWorker(db, { intervalMs: 10, sinks: () => sink });
    try {
      // Up to 5 s.
      for (let n = 0; n < 500 && (await job().catch(() => null))?.status !== "DONE"; n++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect((await job()).status).toBe("DONE");
    } finally {
      stop();
    }
  });
});

function formulaCounts(wb: ExcelJS.Workbook): Record<string, { formulas: number; array: number }> {
  const counts: Record<string, { formulas: number; array: number }> = {};
  wb.eachSheet((sheet) => {
    let formulas = 0;
    let array = 0;
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        const value = cell.value as { formula?: string; sharedFormula?: string; shareType?: string } | null;
        if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
          formulas += 1;
          if (value.shareType === "array") array += 1;
        }
      }),
    );
    counts[sheet.name] = { formulas, array };
  });
  return counts;
}

describe("LIVE_DATA_DIR", () => {
  const backendRoot = path.resolve(import.meta.dirname, "..");

  it("defaults to data/live under the backend app root, whatever the working directory", () => {
    const saved = process.env.LIVE_DATA_DIR;
    delete process.env.LIVE_DATA_DIR;
    try {
      expect(liveDataDir()).toBe(path.join(backendRoot, "data", "live"));
      expect(backupPath("T")).toBe(path.join(backendRoot, "data", "live", "T", "backup.xlsx"));
    } finally {
      if (saved !== undefined) process.env.LIVE_DATA_DIR = saved;
    }
  });

  it("uses LIVE_DATA_DIR when it is set", () => {
    const saved = process.env.LIVE_DATA_DIR;
    process.env.LIVE_DATA_DIR = path.join(tmpdir(), "custom-live");
    try {
      expect(backupPath("T")).toBe(path.join(tmpdir(), "custom-live", "T", "backup.xlsx"));
    } finally {
      if (saved === undefined) delete process.env.LIVE_DATA_DIR;
      else process.env.LIVE_DATA_DIR = saved;
    }
  });
});

import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XlsxCellSource } from "../src/live/cell-source.js";
import { importSchedule } from "../src/live/import.js";
import { createDefaultSinks, runSyncOnce } from "../src/live/sync-worker.js";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

type Fighters = [string | number | null, string | number | null];
interface PoolBout { header: string; fighters: Fighters; formula?: boolean }

const REAL_WORKBOOK = path.resolve(import.meta.dirname, "../../../DEVELOPMENT_TournamentPoolsV3_.xlsx");

/** Header at e.g. B25 holds the label; fighters at C25 / E25 (v3 layout). */
async function workbook(options: {
  pools?: Record<string, PoolBout[]>;
  schedule: (string | number | null)[][];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [sheetName, bouts] of Object.entries(options.pools ?? {})) {
    const ws = wb.addWorksheet(sheetName);
    for (const bout of bouts) {
      const header = ws.getCell(bout.header);
      header.value = `Match ${bout.header}`;
      setFighter(ws.getCell(Number(header.row), Number(header.col) + 1), bout.fighters[0], bout.formula);
      setFighter(ws.getCell(Number(header.row), Number(header.col) + 3), bout.fighters[1], bout.formula);
    }
  }
  const schedule = wb.addWorksheet("Schedule");
  schedule.addRow(["Ring", "Order", "Sheet", "Cell", "Label"]);
  for (const row of options.schedule) {
    schedule.addRow(row);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function setFighter(cell: ExcelJS.Cell, value: string | number | null, formula = false): void {
  if (value === null) return;
  cell.value = formula ? { formula: "T29", result: value } : value;
}

describe("live import", () => {
  let ctx: TestContext;
  let owner: TestUser;
  let tournamentId: string;

  beforeEach(async () => {
    process.env.LIVE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "live-data-"));
    ctx = await createTestContext();
    owner = await insertUser(ctx.database, { id: "owner", role: "USER" });
    tournamentId = await createTournament(owner);
  });

  afterEach(async () => {
    delete process.env.LIVE_DATA_DIR;
    await ctx.app.close();
  });

  async function createTournament(user: TestUser): Promise<string> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/live-tournaments",
      headers: bearer(user),
      payload: { name: "Open" },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { id: string }).id;
  }

  async function runImport(buf: Buffer) {
    return importSchedule(ctx.database, tournamentId, await XlsxCellSource.fromBuffer(buf));
  }

  async function bouts() {
    return ctx.database
      .selectFrom("LiveBout")
      .innerJoin("LiveRing", "LiveRing.id", "LiveBout.ringId")
      .select([
        "LiveRing.name as ring",
        "LiveBout.order",
        "LiveBout.label",
        "LiveBout.sheetName",
        "LiveBout.headerCell",
        "LiveBout.fighterLeft",
        "LiveBout.fighterRight",
      ])
      .orderBy("LiveRing.name")
      .orderBy("LiveBout.order")
      .execute();
  }

  async function addExchange(headerCell: string): Promise<void> {
    const bout = await ctx.database.selectFrom("LiveBout").select("id").where("headerCell", "=", headerCell).executeTakeFirstOrThrow();
    await ctx.database
      .insertInto("LiveExchange")
      .values({
        id: `x-${headerCell}`,
        boutId: bout.id,
        seq: 1,
        kind: "EXCHANGE",
        leftPoints: 1,
        rightPoints: 0,
        isDouble: 0,
        firstScorer: null,
        clientExchangeId: "c1",
        createdByUserId: owner.id,
        createdAt: "2026-10-25T10:00:00.000Z",
        undoneAt: null,
      })
      .execute();
  }

  it("imports rings and bouts from a Schedule sheet", async () => {
    const buf = await workbook({
      pools: {
        Pool_1: [
          { header: "B25", fighters: ["Ronald", "Diego"], formula: true },
          { header: "H25", fighters: ["Anna", "Bea"] },
        ],
        Pool_2: [{ header: "B5", fighters: ["Cor", "Dirk"] }],
      },
      schedule: [
        ["Ring A", 1, "Pool_1", "B25", null],
        ["Ring A", 2, "Pool_1", "H25", "Semi"],
        ["Ring B", 1, "Pool_2", "B5", null],
      ],
    });
    const report = await runImport(buf);
    expect(report).toEqual({ added: 3, updated: 0, skipped: [], errors: [] });
    expect(await bouts()).toEqual([
      { ring: "Ring A", order: 1, label: "Match B25", sheetName: "Pool_1", headerCell: "B25", fighterLeft: "Ronald", fighterRight: "Diego" },
      { ring: "Ring A", order: 2, label: "Semi", sheetName: "Pool_1", headerCell: "H25", fighterLeft: "Anna", fighterRight: "Bea" },
      { ring: "Ring B", order: 1, label: "Match B5", sheetName: "Pool_2", headerCell: "B5", fighterLeft: "Cor", fighterRight: "Dirk" },
    ]);
    const rings = await ctx.database.selectFrom("LiveRing").select(["name", "order"]).orderBy("order").execute();
    expect(rings).toEqual([{ name: "Ring A", order: 1 }, { name: "Ring B", order: 2 }]);
    // An imported ring gets its keeper token when it is created.
    const tokens = (await ctx.database.selectFrom("LiveRing").select("keeperToken").execute()).map((row) => row.keeperToken);
    expect(tokens.every((token) => /^[A-Za-z0-9_-]{32}$/.test(token))).toBe(true);
    expect(new Set(tokens).size).toBe(2);
  });

  it("blank fighters import as empty", async () => {
    const buf = await workbook({
      pools: { Elim: [{ header: "B27", fighters: [0, null] }, { header: "H27", fighters: [null, "Bea"] }] },
      schedule: [["Ring A", 1, "Elim", "B27", null], ["Ring A", 2, "Elim", "H27", null]],
    });
    await runImport(buf);
    const rows = await bouts();
    expect(rows.map((row) => [row.fighterLeft, row.fighterRight])).toEqual([["", ""], ["", "Bea"]]);
  });

  it("re-import updates a pending bout", async () => {
    await runImport(await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["Ronald", "Diego"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null]],
    }));
    const report = await runImport(await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["Ronald", "Eve"] }] },
      schedule: [["Ring B", 4, "Pool_1", "B25", "Final"]],
    }));
    expect(report).toEqual({ added: 0, updated: 1, skipped: [], errors: [] });
    expect(await bouts()).toEqual([
      { ring: "Ring B", order: 4, label: "Final", sheetName: "Pool_1", headerCell: "B25", fighterLeft: "Ronald", fighterRight: "Eve" },
    ]);
  });

  it("re-import skips a bout that has exchanges", async () => {
    await runImport(await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["Ronald", "Diego"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null]],
    }));
    await addExchange("B25");
    const report = await runImport(await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["Zed", "Yan"] }] },
      schedule: [["Ring B", 9, "Pool_1", "B25", "Other"]],
    }));
    expect(report.skipped).toEqual([{ label: "Match B25", reason: "HAS_EXCHANGES" }]);
    expect(report.updated).toBe(0);
    expect(await bouts()).toEqual([
      { ring: "Ring A", order: 1, label: "Match B25", sheetName: "Pool_1", headerCell: "B25", fighterLeft: "Ronald", fighterRight: "Diego" },
    ]);
  });

  it("re-import removes a dropped pending bout", async () => {
    const pools = {
      Pool_1: [
        { header: "B25", fighters: ["A", "B"] as Fighters },
        { header: "H25", fighters: ["C", "D"] as Fighters },
      ],
    };
    await runImport(await workbook({
      pools,
      schedule: [["Ring A", 1, "Pool_1", "B25", null], ["Ring A", 2, "Pool_1", "H25", null]],
    }));
    const report = await runImport(await workbook({ pools, schedule: [["Ring A", 1, "Pool_1", "B25", null]] }));
    expect(report.errors).toEqual([]);
    expect((await bouts()).map((row) => row.headerCell)).toEqual(["B25"]);
  });

  it("keeps a dropped bout that has exchanges and reports it", async () => {
    const pools = { Pool_1: [{ header: "B25", fighters: ["A", "B"] as Fighters }] };
    await runImport(await workbook({ pools, schedule: [["Ring A", 1, "Pool_1", "B25", null]] }));
    await addExchange("B25");
    const report = await runImport(await workbook({ pools, schedule: [] }));
    expect(report.skipped).toEqual([{ label: "Match B25", reason: "HAS_EXCHANGES" }]);
    expect((await bouts()).map((row) => row.headerCell)).toEqual(["B25"]);
  });

  it("schedule row with unknown sheet is an error, other rows still import", async () => {
    const report = await runImport(await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] },
      schedule: [
        ["Ring A", 1, "Nope", "B25", null],
        ["Ring A", 2, "Pool_1", "B25", null],
        ["Ring A", "x", "Pool_1", "H25", null],
      ],
    }));
    expect(report.added).toBe(1);
    expect(report.errors.map((error) => error.row)).toEqual([2, 4]);
    expect(report.errors[0]!.message).toContain("Nope");
  });

  it("a schedule row whose header cell is empty is an error", async () => {
    const buf = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] },
      schedule: [
        ["Ring A", 1, "Pool_1", "B25", null],
        ["Ring A", 2, "Pool_1", "N25", "Typo"],
      ],
    });
    const report = await runImport(buf);
    expect(report.added).toBe(1);
    expect(report.errors).toEqual([{ row: 3, message: expect.stringContaining("Pool_1!N25") }]);
    expect((await bouts()).map((bout) => bout.headerCell)).toEqual(["B25"]);
  });

  it("an existing bout whose header cell became empty is kept", async () => {
    const first = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }, { header: "H25", fighters: ["C", "D"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null], ["Ring A", 2, "Pool_1", "H25", null]],
    });
    await runImport(first);
    const second = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null], ["Ring A", 2, "Pool_1", "H25", null]],
    });
    const report = await runImport(second);
    expect(report.errors).toEqual([{ row: 3, message: expect.stringContaining("empty") }]);
    expect((await bouts()).map((bout) => [bout.headerCell, bout.fighterLeft])).toEqual([["B25", "A"], ["H25", "C"]]);
  });

  it("schedule rows whose exchange blocks overlap are errors and keep their existing bouts", async () => {
    const first = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }, { header: "H25", fighters: ["E", "F"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null], ["Ring A", 2, "Pool_1", "H25", null]],
    });
    await runImport(first);
    await addExchange("B25");
    // B39 is a typo: its block (D40:E54) overlaps B25's block (D26:E40) by one row. C26 (E27:F41) overlaps both.
    const second = await workbook({
      pools: {
        Pool_1: [
          { header: "B25", fighters: ["A2", "B2"] },
          { header: "H25", fighters: ["E", "F"] },
          { header: "B39", fighters: ["X", "Y"] },
          { header: "C26", fighters: ["P", "Q"] },
        ],
      },
      schedule: [
        ["Ring A", 1, "Pool_1", "B25", null],
        ["Ring A", 2, "Pool_1", "H25", null],
        ["Ring A", 3, "Pool_1", "B39", null],
        ["Ring B", 1, "Pool_1", "C26", null],
      ],
    });
    const report = await runImport(second);
    expect(report.errors.map((error) => error.row)).toEqual([2, 4, 5]);
    expect(report.errors[0]!.message).toMatch(/overlap/i);
    expect(report.added).toBe(0);
    // B25 keeps its fighters (it has exchanges and it errored); H25 is untouched; nothing new was added.
    expect((await bouts()).map((bout) => [bout.headerCell, bout.fighterLeft])).toEqual([["B25", "A"], ["H25", "E"]]);
  });

  it("only creator or system admin may import", async () => {
    const buf = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null]],
    });
    const post = (user?: TestUser) =>
      ctx.app.inject({
        method: "POST",
        url: `/api/v1/live-tournaments/${tournamentId}/import/xlsx`,
        headers: { "content-type": "application/octet-stream", ...(user ? bearer(user) : {}) },
        payload: buf,
      });
    const other = await insertUser(ctx.database, { id: "other", role: "COMPETITION_ADMIN" });
    const sys = await insertUser(ctx.database, { id: "sys", role: "SYSTEM_ADMIN" });
    expect((await post()).statusCode).toBe(401);
    expect((await post(other)).statusCode).toBe(403);
    const own = await post(owner);
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ added: 1 });
    expect((await post(sys)).statusCode).toBe(200);
  });

  it("stores the uploaded workbook as the backup base and serves the tournament", async () => {
    const dir = process.env.LIVE_DATA_DIR!;
    {
      const buf = await workbook({
        pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] },
        schedule: [["Ring A", 1, "Pool_1", "B25", null]],
      });
      const response = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/live-tournaments/${tournamentId}/import/xlsx`,
        headers: { "content-type": "application/octet-stream", ...bearer(owner) },
        payload: buf,
      });
      expect(response.statusCode).toBe(200);
      const backup = path.join(dir, tournamentId, "backup.xlsx");
      expect(existsSync(backup)).toBe(true);
      expect(readFileSync(backup).equals(buf)).toBe(true);

      const view = await ctx.app.inject({ method: "GET", url: `/api/v1/live-tournaments/${tournamentId}`, headers: bearer(owner) });
      expect(view.statusCode).toBe(200);
      const body = view.json() as { name: string; rings: { name: string }[]; bouts: { fighterLeft: string; score: unknown }[] };
      expect(body.name).toBe("Open");
      expect(body.rings.map((ring) => ring.name)).toEqual(["Ring A"]);
      expect(body.bouts).toHaveLength(1);
      expect(body.bouts[0]).toMatchObject({ fighterLeft: "A", score: null });
    }
  });

  it("rejects a body that is not an xlsx", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-tournaments/${tournamentId}/import/xlsx`,
      headers: { "content-type": "application/octet-stream", ...bearer(owner) },
      payload: Buffer.from("not a workbook"),
    });
    expect(response.statusCode).toBe(400);
  });

  async function postImport(buf: Buffer) {
    return ctx.app.inject({
      method: "POST",
      url: `/api/v1/live-tournaments/${tournamentId}/import/xlsx`,
      headers: { "content-type": "application/octet-stream", ...bearer(owner) },
      payload: buf,
    });
  }

  it("a failing import leaves the database and the existing backup unchanged", async () => {
    const good = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null]],
    });
    expect((await postImport(good)).statusCode).toBe(200);
    const dir = path.join(process.env.LIVE_DATA_DIR!, tournamentId);
    const before = await bouts();

    // A valid workbook without a Schedule sheet fails after the upload was parsed.
    const noSchedule = new ExcelJS.Workbook();
    noSchedule.addWorksheet("Pool_1");
    const response = await postImport(Buffer.from(await noSchedule.xlsx.writeBuffer()));
    expect(response.statusCode).toBe(400);
    expect(await bouts()).toEqual(before);
    expect(readFileSync(path.join(dir, "backup.xlsx")).equals(good)).toBe(true);
    expect(readdirSync(dir)).toEqual(["backup.xlsx"]);
  });

  it("a successful import replaces the backup and leaves no tmp file", async () => {
    const first = await workbook({ pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] }, schedule: [["Ring A", 1, "Pool_1", "B25", null]] });
    const second = await workbook({ pools: { Pool_1: [{ header: "B25", fighters: ["C", "D"] }] }, schedule: [["Ring A", 1, "Pool_1", "B25", null]] });
    await postImport(first);
    expect((await postImport(second)).statusCode).toBe(200);
    const dir = path.join(process.env.LIVE_DATA_DIR!, tournamentId);
    expect(readFileSync(path.join(dir, "backup.xlsx")).equals(second)).toBe(true);
    expect(readdirSync(dir)).toEqual(["backup.xlsx"]);
  });

  it("concurrent imports of one tournament are serialised", async () => {
    const make = (name: string) => workbook({ pools: { Pool_1: [{ header: "B25", fighters: [name, "Z"] }] }, schedule: [["Ring A", 1, "Pool_1", "B25", null]] });
    const [a, b] = [await make("A"), await make("B")];
    const [ra, rb] = await Promise.all([postImport(a), postImport(b)]);
    expect([ra.statusCode, rb.statusCode]).toEqual([200, 200]);
    const [bout] = await bouts();
    const backup = readFileSync(path.join(process.env.LIVE_DATA_DIR!, tournamentId, "backup.xlsx"));
    // The last import to finish wins in both places.
    expect(backup.equals(bout!.fighterLeft === "A" ? a : b)).toBe(true);
  });

  it("re-import through upload queues a sync for bouts with exchanges", async () => {
    const buf = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }, { header: "H25", fighters: ["C", "D"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null], ["Ring A", 2, "Pool_1", "H25", null]],
    });
    await postImport(buf);
    await addExchange("B25");
    await ctx.database.deleteFrom("LiveSyncJob").execute();
    expect((await postImport(buf)).statusCode).toBe(200);
    const jobs = await ctx.database
      .selectFrom("LiveSyncJob")
      .innerJoin("LiveBout", "LiveBout.id", "LiveSyncJob.boutId")
      .select(["LiveBout.headerCell", "LiveSyncJob.target", "LiveSyncJob.status"])
      .execute();
    expect(jobs).toEqual([{ headerCell: "B25", target: "LOCAL", status: "PENDING" }]);
  });

  it("the sync enqueue is part of the import transaction", async () => {
    const one = await workbook({ pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] }, schedule: [["Ring A", 1, "Pool_1", "B25", null]] });
    expect((await postImport(one)).statusCode).toBe(200);
    await addExchange("B25");
    const two = await workbook({
      pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }, { header: "H25", fighters: ["C", "D"] }] },
      schedule: [["Ring A", 1, "Pool_1", "B25", null], ["Ring A", 2, "Pool_1", "H25", null]],
    });
    // The enqueue fails: the whole import must roll back, and the backup must stay the old one.
    await sql`DROP TABLE LiveSyncJob`.execute(ctx.database);
    expect((await postImport(two)).statusCode).toBeGreaterThanOrEqual(500);
    expect((await bouts()).map((bout) => bout.headerCell)).toEqual(["B25"]);
    const dir = path.join(process.env.LIVE_DATA_DIR!, tournamentId);
    expect(readFileSync(path.join(dir, "backup.xlsx")).equals(one)).toBe(true);
    expect(readdirSync(dir)).toEqual(["backup.xlsx"]);
  });

  it("results are rewritten into a newly uploaded base", async () => {
    const buf = await workbook({ pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] }, schedule: [["Ring A", 1, "Pool_1", "B25", null]] });
    expect((await postImport(buf)).statusCode).toBe(200);
    await addExchange("B25");
    const sinks = createDefaultSinks(ctx.database, {});
    const sync = () => runSyncOnce(ctx.database, sinks, new Date(Date.now() + 1000));
    const backup = path.join(process.env.LIVE_DATA_DIR!, tournamentId, "backup.xlsx");
    const pointsInBackup = async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(backup);
      return wb.getWorksheet("Pool_1")!.getCell("D26").value;
    };
    // Nothing queued yet (the exchange was inserted directly), so queue it the way a re-upload does.
    expect((await postImport(buf)).statusCode).toBe(200);
    expect(await sync()).toEqual({ done: 1, failed: 0 });
    expect(await pointsInBackup()).toBe(1);
    // Uploading the clean base again replaces the file; the next sync writes the result back into it.
    expect((await postImport(buf)).statusCode).toBe(200);
    expect(await pointsInBackup()).toBeNull();
    expect(await sync()).toEqual({ done: 1, failed: 0 });
    expect(await pointsInBackup()).toBe(1);
  });

  it("an unchanged bout with exchanges is not reported as skipped", async () => {
    const buf = await workbook({ pools: { Pool_1: [{ header: "B25", fighters: ["A", "B"] }] }, schedule: [["Ring A", 1, "Pool_1", "B25", null]] });
    await runImport(buf);
    await addExchange("B25");
    expect(await runImport(buf)).toEqual({ added: 0, updated: 0, skipped: [], errors: [] });
  });

  it("the octet-stream parser does not apply to other routes", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: { "content-type": "application/octet-stream", ...bearer(owner) },
      payload: Buffer.alloc(2 * 1024 * 1024),
    });
    // The app error handler maps the framework 415 to a generic error; what matters is the body is refused.
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reads the real workbook", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "live-real-"));
    const copy = path.join(dir, "copy.xlsx");
    copyFileSync(REAL_WORKBOOK, copy);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(copy);
    const schedule = wb.addWorksheet("Schedule");
    schedule.addRow(["Ring", "Order", "Sheet", "Cell", "Label"]);
    schedule.addRow(["Ring A", 1, "Pool_1", "B25", null]);
    await wb.xlsx.writeFile(copy);

    const source = await XlsxCellSource.fromBuffer(readFileSync(copy));
    const cells = await source.read("Pool_1", ["C25", "E25"]);
    const expectedLeft = cells.get("Pool_1!C25");
    expect(typeof expectedLeft).toBe("string");

    const report = await runImport(readFileSync(copy));
    expect(report).toMatchObject({ added: 1, errors: [] });
    const [bout] = await bouts();
    expect(bout!.fighterLeft).toBe(expectedLeft);
    expect(bout!.fighterRight).toBe(cells.get("Pool_1!E25"));
    expect(bout!.label).toBe("Match 1");
  }, 30_000);
});

import { randomUUID } from "node:crypto";
import type { DbExecutor } from "../db.js";
import { HttpError } from "../http.js";
import type { CellSource, CellValue } from "./cell-source.js";
import { newKeeperToken } from "./ring-keeper.js";
import { isWholeTargetError } from "./sync-errors.js";
import { boutCells, LAYOUTS, parseA1, type SheetLayout } from "./sheet-layout.js";

export const SCHEDULE_SHEET = "Schedule";
/** Schedule rows 2..MAX_SCHEDULE_ROW are read; blank rows are skipped. */
const MAX_SCHEDULE_ROW = 500;

export interface ImportReport {
  added: number;
  updated: number;
  skipped: { label: string; reason: "HAS_EXCHANGES" }[];
  errors: { row: number; message: string }[];
}

export interface ScheduleRow {
  row: number;
  ring: string;
  order: number;
  sheetName: string;
  headerCell: string;
  label: string;
  fighterLeft: string;
  fighterRight: string;
}

/**
 * Reads the Schedule sheet and syncs the tournament's rings and bouts to it. Convenience for tests and
 * callers without their own transaction; routes call readSchedulePlan, then applySchedulePlan in a transaction.
 * Bouts are keyed by (sheetName, headerCell). A bout that has exchanges is never changed or removed.
 */
export async function importSchedule(db: DbExecutor, tournamentId: string, source: CellSource): Promise<ImportReport> {
  const plan = await readSchedulePlan(source, await tournamentLayout(db, tournamentId));
  return applySchedulePlan(db, tournamentId, plan);
}

export async function tournamentLayout(db: DbExecutor, tournamentId: string): Promise<SheetLayout> {
  const tournament = await db.selectFrom("LiveTournament").select("layoutVersion").where("id", "=", tournamentId).executeTakeFirst();
  if (!tournament) throw new HttpError(404, "Tournament not found.");
  const layout = LAYOUTS[tournament.layoutVersion];
  if (!layout) throw new HttpError(500, `Unknown layout version "${tournament.layoutVersion}".`);
  return layout;
}

/** Everything read from the sheet; no database access, so no connection is held during sheet I/O. */
export interface SchedulePlan {
  rows: ScheduleRow[];
  /** Keys ("Sheet!A1") of schedule rows that had a problem; their existing bouts are left alone. */
  erroredKeys: Set<string>;
  errors: { row: number; message: string }[];
}

/** Step 1: read the schedule and all fighter cells from the source. Reusable for any CellSource. */
export async function readSchedulePlan(source: CellSource, layout: SheetLayout): Promise<SchedulePlan> {
  const errors: ImportReport["errors"] = [];
  const { rows, erroredKeys } = await readScheduleRows(source, layout, errors);
  return { rows, erroredKeys, errors };
}

/** Step 2: apply a plan to the database. Database writes only; run it inside a transaction. */
export async function applySchedulePlan(db: DbExecutor, tournamentId: string, plan: SchedulePlan): Promise<ImportReport> {
  const { rows, erroredKeys } = plan;
  const report: ImportReport = { added: 0, updated: 0, skipped: [], errors: plan.errors };

  const existingBouts = await db.selectFrom("LiveBout").selectAll().where("tournamentId", "=", tournamentId).execute();
  const withExchanges = new Set(
    (
      await db
        .selectFrom("LiveExchange")
        .innerJoin("LiveBout", "LiveBout.id", "LiveExchange.boutId")
        .select("LiveExchange.boutId")
        .where("LiveBout.tournamentId", "=", tournamentId)
        .distinct()
        .execute()
    ).map((row) => row.boutId),
  );
  const existingByKey = new Map(existingBouts.map((bout) => [`${bout.sheetName}!${bout.headerCell}`, bout]));

  const rings = new Map((await db.selectFrom("LiveRing").select(["id", "name", "order"]).where("tournamentId", "=", tournamentId).execute()).map((ring) => [ring.name, ring]));
  const ringNameById = new Map([...rings.values()].map((ring) => [ring.id, ring.name]));
  let nextRingOrder = Math.max(0, ...[...rings.values()].map((ring) => ring.order)) + 1;
  const ringId = async (name: string): Promise<string> => {
    const known = rings.get(name);
    if (known) return known.id;
    const created = { id: randomUUID(), tournamentId, name, order: nextRingOrder++, keeperToken: newKeeperToken() };
    await db.insertInto("LiveRing").values(created).execute();
    rings.set(name, created);
    return created.id;
  };

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.sheetName}!${row.headerCell}`;
    seen.add(key);
    const existing = existingByKey.get(key);
    if (!existing) {
      await db
        .insertInto("LiveBout")
        .values({
          id: randomUUID(),
          tournamentId,
          ringId: await ringId(row.ring),
          order: row.order,
          label: row.label,
          sheetName: row.sheetName,
          headerCell: row.headerCell,
          fighterLeft: row.fighterLeft,
          fighterRight: row.fighterRight,
          status: "PENDING",
          startedAt: null,
          finishedAt: null,
        })
        .execute();
      report.added += 1;
      continue;
    }
    if (withExchanges.has(existing.id)) {
      const differs =
        ringNameById.get(existing.ringId) !== row.ring ||
        existing.order !== row.order ||
        existing.label !== row.label ||
        existing.fighterLeft !== row.fighterLeft ||
        existing.fighterRight !== row.fighterRight;
      if (differs) report.skipped.push({ label: existing.label, reason: "HAS_EXCHANGES" });
      continue;
    }
    const targetRingId = await ringId(row.ring);
    const unchanged =
      existing.ringId === targetRingId &&
      existing.order === row.order &&
      existing.label === row.label &&
      existing.fighterLeft === row.fighterLeft &&
      existing.fighterRight === row.fighterRight;
    if (unchanged) continue;
    await db
      .updateTable("LiveBout")
      .set({ ringId: targetRingId, order: row.order, label: row.label, fighterLeft: row.fighterLeft, fighterRight: row.fighterRight })
      .where("id", "=", existing.id)
      .execute();
    report.updated += 1;
  }

  // Bouts no longer on the schedule: remove if untouched, otherwise keep and report.
  // A key that failed to import (error row) is still "on the schedule", so it is left alone.
  for (const bout of existingBouts) {
    const key = `${bout.sheetName}!${bout.headerCell}`;
    if (seen.has(key) || erroredKeys.has(key)) continue;
    if (withExchanges.has(bout.id)) {
      report.skipped.push({ label: bout.label, reason: "HAS_EXCHANGES" });
    } else {
      await db.deleteFrom("LiveBout").where("id", "=", bout.id).execute();
    }
  }

  // Rings that no longer have bouts and are not on the schedule.
  const usedRingIds = new Set((await db.selectFrom("LiveBout").select("ringId").where("tournamentId", "=", tournamentId).execute()).map((row) => row.ringId));
  for (const ring of rings.values()) {
    if (!usedRingIds.has(ring.id)) {
      await db.deleteFrom("LiveRing").where("id", "=", ring.id).execute();
    }
  }
  return report;
}

function text(value: CellValue | undefined): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** Missing and 0 mean "not known yet" (elimination bouts before the pools finish). */
function fighterName(value: CellValue | undefined): string {
  const name = text(value);
  return name === "0" ? "" : name;
}

async function readScheduleRows(
  source: CellSource,
  layout: SheetLayout,
  errors: ImportReport["errors"],
): Promise<{ rows: ScheduleRow[]; erroredKeys: Set<string> }> {
  const cells: string[] = [];
  for (let row = 2; row <= MAX_SCHEDULE_ROW; row += 1) {
    for (const column of ["A", "B", "C", "D", "E"]) cells.push(`${column}${row}`);
  }
  let schedule: Map<string, CellValue>;
  try {
    schedule = await source.read(SCHEDULE_SHEET, cells);
  } catch (error) {
    // Google unreachable or not allowed is not a missing sheet.
    if (isWholeTargetError(error)) throw error;
    throw new HttpError(400, `The workbook has no "${SCHEDULE_SHEET}" sheet.`);
  }
  const at = (column: string, row: number) => schedule.get(`${SCHEDULE_SHEET}!${column}${row}`);

  const erroredKeys = new Set<string>();
  const pending: Omit<ScheduleRow, "fighterLeft" | "fighterRight">[] = [];
  const keys = new Set<string>();
  const fail = (row: number, message: string, key?: string) => {
    errors.push({ row, message });
    if (key) erroredKeys.add(key);
  };

  for (let row = 2; row <= MAX_SCHEDULE_ROW; row += 1) {
    const [ring, orderValue, sheetName, rawCell, label] = ["A", "B", "C", "D", "E"].map((column) => at(column, row));
    if ([ring, orderValue, sheetName, rawCell, label].every((value) => text(value) === "")) continue;
    const headerCell = text(rawCell).toUpperCase();
    const sheet = text(sheetName);
    const key = sheet && headerCell ? `${sheet}!${headerCell}` : undefined;
    if (!text(ring)) {
      fail(row, "Ring is empty.", key);
      continue;
    }
    const order = typeof orderValue === "number" ? orderValue : Number(text(orderValue));
    if (text(orderValue) === "" || !Number.isInteger(order)) {
      fail(row, `Order "${text(orderValue)}" is not a whole number.`, key);
      continue;
    }
    if (!sheet) {
      fail(row, "Sheet is empty.");
      continue;
    }
    try {
      parseA1(headerCell);
    } catch {
      fail(row, `Cell "${text(rawCell)}" is not a cell reference like B25.`, key);
      continue;
    }
    if (keys.has(key!)) {
      fail(row, `${key} is on the schedule more than once.`);
      continue;
    }
    keys.add(key!);
    pending.push({ row, ring: text(ring), order, sheetName: sheet, headerCell, label: text(label) });
  }

  // Two bouts whose exchange blocks share a cell would overwrite each other's results: almost always a typo in
  // the schedule. Neither row is imported (we can't tell which one is wrong), and their existing bouts are kept.
  const overlapping = overlappingRows(layout, pending);
  for (const item of pending) {
    const other = overlapping.get(item);
    if (!other) continue;
    const key = `${item.sheetName}!${item.headerCell}`;
    fail(item.row, `The exchange block of ${key} overlaps that of ${other.sheetName}!${other.headerCell} (row ${other.row}).`, key);
  }

  const bySheet = new Map<string, typeof pending>();
  for (const item of pending.filter((candidate) => !overlapping.has(candidate))) {
    bySheet.set(item.sheetName, [...(bySheet.get(item.sheetName) ?? []), item]);
  }
  const rows: ScheduleRow[] = [];
  for (const [sheetName, items] of bySheet) {
    let values: Map<string, CellValue>;
    try {
      const wanted = items.flatMap((item) => {
        const { fighterLeft, fighterRight } = boutCells(layout, item.headerCell);
        return [item.headerCell, fighterLeft, fighterRight];
      });
      values = await source.read(sheetName, wanted);
    } catch (error) {
      for (const item of items) {
        fail(item.row, error instanceof Error ? error.message : `Could not read sheet "${sheetName}".`, `${sheetName}!${item.headerCell}`);
      }
      continue;
    }
    for (const item of items) {
      const { fighterLeft, fighterRight } = boutCells(layout, item.headerCell);
      const get = (cell: string) => values.get(`${sheetName}!${cell}`);
      const header = text(get(item.headerCell));
      // Every match header in the sheet holds a label ("Match 1"); an empty one means the cell reference is wrong.
      if (header === "") {
        fail(item.row, `${sheetName}!${item.headerCell} is empty: the cell should hold the match label, for example "Match 1".`, `${sheetName}!${item.headerCell}`);
        continue;
      }
      rows.push({
        ...item,
        label: item.label || header,
        fighterLeft: fighterName(get(fighterLeft)),
        fighterRight: fighterName(get(fighterRight)),
      });
    }
  }
  rows.sort((a, b) => a.row - b.row);
  errors.sort((a, b) => a.row - b.row);
  return { rows, erroredKeys };
}

type PendingRow = { row: number; sheetName: string; headerCell: string };

/** The input cells (points, and double/first-scorer when the layout has them) of a bout's exchange block. */
function blockCells(layout: SheetLayout, headerCell: string): { cols: number[]; firstRow: number; lastRow: number } {
  const { col, row } = parseA1(headerCell);
  const offsets = [layout.leftPointsCol, layout.rightPointsCol, layout.doubleCol, layout.firstScorerCol].filter(
    (offset): offset is number => offset !== null,
  );
  const firstRow = row + layout.firstExchangeRowOffset;
  return { cols: offsets.map((offset) => col + offset), firstRow, lastRow: firstRow + layout.maxExchanges - 1 };
}

/** Each row whose exchange block shares a cell with another row's block on the same sheet, with that other row. */
function overlappingRows<T extends PendingRow>(layout: SheetLayout, items: T[]): Map<T, T> {
  const result = new Map<T, T>();
  const blocks = items.map((item) => ({ item, ...blockCells(layout, item.headerCell) }));
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      if (a.item.sheetName !== b.item.sheetName) continue;
      const rowsMeet = a.firstRow <= b.lastRow && b.firstRow <= a.lastRow;
      if (!rowsMeet || !a.cols.some((col) => b.cols.includes(col))) continue;
      if (!result.has(a.item)) result.set(a.item, b.item);
      if (!result.has(b.item)) result.set(b.item, a.item);
    }
  }
  return result;
}

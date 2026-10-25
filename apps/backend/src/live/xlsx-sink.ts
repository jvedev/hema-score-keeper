import { randomUUID } from "node:crypto";
import { rename, unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import type { CellWrite } from "./sheet-layout.js";

/** Writes cell values into a spreadsheet. Implemented by the xlsx file writer here and by the Google writer. */
export interface CellSink {
  write(writes: CellWrite[]): Promise<void>;
}

/** Where every successful write records its time, so whoever opens the sheet sees how fresh it is. */
export const LAST_SYNC_SHEET = "Schedule";
export const LAST_SYNC_CELL = "H1";

/**
 * Writes values into a local .xlsx file. Every other cell (formulas included) is kept. The workbook is saved to a
 * tmp file in the same directory and renamed over the original, so a crash never leaves a half-written file.
 *
 * Callers must hold the tournament lock (`withTournamentLock`): this is a read-modify-write of the whole file.
 */
export class XlsxFileSink implements CellSink {
  private readonly now: () => Date;

  constructor(
    private readonly path: string,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async write(writes: CellWrite[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.path);
    for (const write of writes) {
      const worksheet = workbook.getWorksheet(write.sheet);
      if (!worksheet) throw new Error(`Sheet "${write.sheet}" not found in the backup file.`);
      worksheet.getCell(write.cell).value = write.value;
    }
    const schedule = workbook.getWorksheet(LAST_SYNC_SHEET);
    if (schedule) schedule.getCell(LAST_SYNC_CELL).value = this.now().toISOString();
    // Cached formula results are stale now; have Excel recalculate when the file is opened.
    workbook.calcProperties.fullCalcOnLoad = true;

    const tmp = `${this.path}.${randomUUID()}.tmp`;
    try {
      await workbook.xlsx.writeFile(tmp);
      await rename(tmp, this.path);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  }
}

import ExcelJS from "exceljs";

export type CellValue = string | number | null;

/**
 * Reads calculated cell values from a spreadsheet. Keys of the result are "Sheet!A1".
 * Implemented by the xlsx reader here and by the Google reader.
 */
export interface CellSource {
  /** Throws if the sheet does not exist. */
  read(sheet: string, cells: string[]): Promise<Map<string, CellValue>>;
}

export class XlsxCellSource implements CellSource {
  private constructor(private readonly workbook: ExcelJS.Workbook) {}

  static async fromBuffer(buf: Buffer): Promise<XlsxCellSource> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf as unknown as ExcelJS.Buffer);
    return new XlsxCellSource(workbook);
  }

  async read(sheet: string, cells: string[]): Promise<Map<string, CellValue>> {
    const worksheet = this.workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet "${sheet}" not found.`);
    }
    const values = new Map<string, CellValue>();
    for (const cell of cells) {
      values.set(`${sheet}!${cell}`, calculatedValue(worksheet.getCell(cell).value));
    }
    return values;
  }
}

/** The value as Excel shows it: a formula yields its cached result (exceljs `result`). */
function calculatedValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("formula" in value || "sharedFormula" in value) {
    return calculatedValue((value as { result?: ExcelJS.CellValue }).result ?? null);
  }
  if ("text" in value) return String(value.text); // hyperlink
  return null; // error values such as #N/A
}

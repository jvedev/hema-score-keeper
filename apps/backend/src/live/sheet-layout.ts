export type SheetLayout = {
  version: string;
  /** Column offsets from the header column. */
  fighterLeftCol: number;
  fighterRightCol: number;
  firstExchangeRowOffset: number;
  maxExchanges: number;
  leftPointsCol: number;
  rightPointsCol: number;
  doubleCol: number | null;
  firstScorerCol: number | null;
};

export type CellWrite = { sheet: string; cell: string; value: number | string | null };

export type ExchangeForSheet = {
  kind: string;
  leftPoints: number;
  rightPoints: number;
  isDouble: boolean;
  firstScorer: string | null;
};

export const LAYOUTS: Record<string, SheetLayout> = {
  v3: {
    version: "v3",
    fighterLeftCol: 1,
    fighterRightCol: 3,
    firstExchangeRowOffset: 1,
    maxExchanges: 15,
    leftPointsCol: 2,
    rightPointsCol: 3,
    doubleCol: null,
    firstScorerCol: null,
  },
};

/** Parses an A1 cell reference into 1-based column and row numbers. */
export function parseA1(cell: string): { col: number; row: number } {
  const match = /^([A-Za-z]+)([1-9][0-9]*)$/.exec(cell.trim());
  if (!match) throw new Error(`Invalid A1 cell: ${cell}`);
  let col = 0;
  for (const letter of match[1]!.toUpperCase()) col = col * 26 + (letter.charCodeAt(0) - 64);
  return { col, row: Number(match[2]) };
}

export function toA1(col: number, row: number): string {
  if (!Number.isInteger(col) || col < 1 || !Number.isInteger(row) || row < 1) {
    throw new Error(`Invalid cell position: ${col},${row}`);
  }
  let letters = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return `${letters}${row}`;
}

export function boutCells(layout: SheetLayout, headerCell: string): { fighterLeft: string; fighterRight: string } {
  const { col, row } = parseA1(headerCell);
  return {
    fighterLeft: toA1(col + layout.fighterLeftCol, row),
    fighterRight: toA1(col + layout.fighterRightCol, row),
  };
}

/** A zero point is left blank, matching how the sheet is typed by hand. */
function points(value: number): number | null {
  return value === 0 ? null : value;
}

/**
 * Writes the whole exchange block (blank past the last exchange, so an undo
 * clears its row), or reports that the bout has more exchanges than the block holds.
 */
export function exchangeRangeWrites(
  layout: SheetLayout,
  sheet: string,
  headerCell: string,
  exchanges: ExchangeForSheet[],
): { writes: CellWrite[] } | { error: "RANGE_OVERFLOW" } {
  if (exchanges.length > layout.maxExchanges) return { error: "RANGE_OVERFLOW" };
  const { col, row } = parseA1(headerCell);
  const writes: CellWrite[] = [];
  for (let index = 0; index < layout.maxExchanges; index++) {
    const exchange = exchanges[index];
    const rowNumber = row + layout.firstExchangeRowOffset + index;
    writes.push({ sheet, cell: toA1(col + layout.leftPointsCol, rowNumber), value: exchange ? points(exchange.leftPoints) : null });
    writes.push({ sheet, cell: toA1(col + layout.rightPointsCol, rowNumber), value: exchange ? points(exchange.rightPoints) : null });
    if (layout.doubleCol !== null) {
      writes.push({ sheet, cell: toA1(col + layout.doubleCol, rowNumber), value: exchange?.isDouble ? 1 : null });
    }
    if (layout.firstScorerCol !== null) {
      writes.push({ sheet, cell: toA1(col + layout.firstScorerCol, rowNumber), value: exchange?.firstScorer ?? null });
    }
  }
  return { writes };
}

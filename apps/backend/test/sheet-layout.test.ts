import { describe, expect, it } from "vitest";
import {
  LAYOUTS,
  boutCells,
  exchangeRangeWrites,
  parseA1,
  toA1,
  type CellWrite,
  type ExchangeForSheet,
} from "../src/live/sheet-layout.js";

const v3 = LAYOUTS.v3!;

function ex(leftPoints: number, rightPoints: number, extra: Partial<ExchangeForSheet> = {}): ExchangeForSheet {
  return { kind: "EXCHANGE", leftPoints, rightPoints, isDouble: false, firstScorer: null, ...extra };
}

function writesFor(sheet: string, header: string, exchanges: ExchangeForSheet[]): CellWrite[] {
  const result = exchangeRangeWrites(v3, sheet, header, exchanges);
  if ("error" in result) throw new Error(result.error);
  return result.writes;
}

describe("sheet layout v3", () => {
  it("v3 cells for Pool_1!B25", () => {
    expect(boutCells(v3, "B25")).toEqual({ fighterLeft: "C25", fighterRight: "E25" });
    const writes = writesFor("Pool_1", "B25", [ex(1, 2), ...Array.from({ length: 14 }, () => ex(1, 1))]);
    expect(writes).toHaveLength(30);
    expect(writes[0]).toEqual({ sheet: "Pool_1", cell: "D26", value: 1 });
    expect(writes[1]).toEqual({ sheet: "Pool_1", cell: "E26", value: 2 });
    expect(writes[28]!.cell).toBe("D40");
    expect(writes[29]!.cell).toBe("E40");
  });

  it("v3 cells for H25", () => {
    expect(boutCells(v3, "H25")).toEqual({ fighterLeft: "I25", fighterRight: "K25" });
    const writes = writesFor("Pool_1", "H25", [ex(1, 2)]);
    expect(writes[0]!.cell).toBe("J26");
    expect(writes[1]!.cell).toBe("K26");
  });

  it("v3 cells for Eliminations!B27", () => {
    const writes = writesFor("Eliminations", "B27", [ex(3, 0)]);
    expect(writes[0]).toEqual({ sheet: "Eliminations", cell: "D28", value: 3 });
    expect(writes[1]).toEqual({ sheet: "Eliminations", cell: "E28", value: null });
  });

  it("blank rows after the last exchange", () => {
    const writes = writesFor("Pool_1", "B25", [ex(1, 0), ex(0, 2), ex(1, 1)]);
    expect(writes).toHaveLength(30);
    const blanks = writes.slice(6);
    expect(blanks.every((w) => w.value === null)).toBe(true);
    expect(blanks[0]!.cell).toBe("D29");
    expect(blanks[blanks.length - 1]!.cell).toBe("E40");
  });

  it("deduction is a negative entry for that fighter", () => {
    const writes = writesFor("Pool_1", "B25", [ex(-1, 0, { kind: "DEDUCTION" })]);
    expect(writes[0]).toEqual({ sheet: "Pool_1", cell: "D26", value: -1 });
    expect(writes[1]).toEqual({ sheet: "Pool_1", cell: "E26", value: null });
  });

  it("overflow is RANGE_OVERFLOW", () => {
    const result = exchangeRangeWrites(v3, "Pool_1", "B25", Array.from({ length: 16 }, () => ex(1, 1)));
    expect(result).toEqual({ error: "RANGE_OVERFLOW" });
  });

  it("A1 round-trip including AA/AI columns", () => {
    expect(parseA1("B25")).toEqual({ col: 2, row: 25 });
    expect(parseA1("AA1")).toEqual({ col: 27, row: 1 });
    expect(parseA1("AI40")).toEqual({ col: 35, row: 40 });
    for (const cell of ["A1", "Z9", "AA1", "AI40", "ZZ100", "AAA7"]) {
      const { col, row } = parseA1(cell);
      expect(toA1(col, row)).toBe(cell);
    }
    expect(() => parseA1("25B")).toThrow();
  });
});

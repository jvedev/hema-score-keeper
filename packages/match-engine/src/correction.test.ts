import { describe, expect, it } from "vitest";
import { correctionExchanges } from "./correction";

describe("correctionExchanges", () => {
  it("correction becomes adjustments", () => {
    expect(correctionExchanges({ scoreA: 4, scoreB: 6 }, { scoreA: 4, scoreB: 4 }, 180)).toEqual([
      { atSeconds: 180, kind: "ADJUSTMENT", side: "B", points: -2, reason: "Corrected after objection" },
    ]);
  });

  it("adjusts both fighters when both change", () => {
    expect(correctionExchanges({ scoreA: 4, scoreB: 6 }, { scoreA: 6, scoreB: 4 }, 90).map((exchange) => [exchange.side, exchange.points])).toEqual([
      ["A", 2],
      ["B", -2],
    ]);
  });

  it("adds nothing when the score stays", () => {
    expect(correctionExchanges({ scoreA: 3, scoreB: 3 }, { scoreA: 3, scoreB: 3 }, 0)).toEqual([]);
  });
});

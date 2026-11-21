import { describe, expect, it } from "vitest";
import type { ApiMatch, ApiTournament } from "@hema/event-admin-api";
import { bracketLayout } from "./bracket-view.js";

const match = (id: string, round: number, position: number, kind: "MAIN" | "BRONZE", a: string | null, b: string | null, result?: [number, number, string]): ApiMatch => ({
  id,
  roundId: "r",
  arenaId: null,
  entryAId: a,
  entryBId: b,
  winnerEntryId: result?.[2] ?? null,
  scoreA: result?.[0] ?? null,
  scoreB: result?.[1] ?? null,
  ruleset: null,
  scheduledMatch: null,
  bracketRound: round,
  bracketPosition: position,
  bracketKind: kind,
});

const tournament = (stages: ApiMatch[][]): ApiTournament =>
  ({
    entries: ["a", "b", "c", "d"].map((id) => ({ id, user: { username: id.toUpperCase() } })),
    stages: stages.map((matches, index) => ({ id: `s${index}`, rounds: [{ id: `r${index}`, matches }] })),
  }) as unknown as ApiTournament;

describe("bracket layout", () => {
  it("is null without bracket matches", () => {
    expect(bracketLayout(tournament([[{ ...match("p", 0, 0, "MAIN", "a", "b"), bracketKind: null, bracketRound: null, bracketPosition: null }]]))).toBeNull();
  });

  it("builds columns from the first round to the final, with names, winners and the bronze match", () => {
    const layout = bracketLayout(
      tournament([
        [match("q0", 0, 0, "MAIN", "a", "d", [5, 2, "a"]), match("q1", 0, 1, "MAIN", "b", "c")],
        [match("f", 1, 0, "MAIN", "a", null), match("br", 1, 0, "BRONZE", "d", null)],
      ]),
    )!;
    expect(layout.columns.map((column) => [column.round, column.fighters, column.cells.length])).toEqual([
      [0, 4, 2],
      [1, 2, 1],
    ]);
    expect(layout.columns[0]!.cells[0]).toMatchObject({ matchId: "q0", score: "5–2", played: true, a: { name: "A", winner: true }, b: { name: "D", winner: false } });
    expect(layout.columns[1]!.cells[0]).toMatchObject({ a: { name: "A" }, b: { name: null } });
    expect(layout.bronze).toMatchObject({ matchId: "br", a: { name: "D" } });
  });

  it("keeps an empty place for a first-round bye", () => {
    const layout = bracketLayout(tournament([[match("q1", 0, 1, "MAIN", "b", "c"), match("f", 1, 0, "MAIN", "a", null)]]))!;
    expect(layout.columns[0]!.cells.map((cell) => cell.matchId)).toEqual([null, "q1"]);
    expect(layout.bronze).toBeNull();
  });
});

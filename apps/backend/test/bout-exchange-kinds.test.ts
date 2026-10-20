import { beforeEach, describe, expect, it } from "vitest";
import { bearer } from "./helpers.js";
import { createBoutWorld, type BoutWorld } from "./bout-fixtures.js";

let world: BoutWorld;

function record(overrides: Record<string, unknown>) {
  return world.ctx.app.inject({
    method: "POST",
    url: "/api/v1/bouts",
    headers: bearer(world.users.ref!),
    payload: {
      fighterAUserId: "f1",
      fighterBUserId: "f2",
      refereeUserId: "ref",
      startedAt: world.clock.now().toISOString(),
      startedInCompetitionId: "X",
      scoreA: 5,
      scoreB: 3,
      winnerSide: "A",
      ...overrides,
    },
  });
}

const disqualifyA = [{ atSeconds: 90, kind: "DISQUALIFICATION", side: "A", points: 0, reason: "Unsafe conduct" }];

beforeEach(async () => {
  world = await createBoutWorld();
});

describe("exchange kinds", () => {
  it("disqualification decides the winner", async () => {
    expect((await record({ winnerSide: "B", exchanges: disqualifyA })).statusCode).toBe(200);
    expect((await record({ winnerSide: "A", exchanges: disqualifyA })).statusCode).toBe(400);
    expect((await record({ winnerSide: null, exchanges: disqualifyA })).statusCode).toBe(400);
  });

  it("allows a negative correction but no negative score", async () => {
    const adjustment = [{ atSeconds: 40, kind: "ADJUSTMENT", side: "B", points: -1, reason: null }];
    expect((await record({ exchanges: adjustment })).statusCode).toBe(200);
    const negativeScore = [{ atSeconds: 40, kind: "SCORE", side: "B", points: -1, reason: null }];
    expect((await record({ exchanges: negativeScore })).statusCode).toBe(400);
  });

  it("accepts a score below zero after a deduction", async () => {
    const response = await record({
      scoreA: 2,
      scoreB: -1,
      winnerSide: "A",
      exchanges: [
        { atSeconds: 10, kind: "SCORE", side: "A", points: 2, reason: null },
        { atSeconds: 20, kind: "WARNING", side: "B", points: 1, reason: "late hit" },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { scoreB: number }).scoreB).toBe(-1);
  });

  it("stores the new kinds", async () => {
    const response = await record({ winnerSide: "B", exchanges: disqualifyA });
    expect((response.json() as { exchanges: Array<{ kind: string }> }).exchanges.map((exchange) => exchange.kind)).toEqual(["DISQUALIFICATION"]);
  });
});

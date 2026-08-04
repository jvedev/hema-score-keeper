import { describe, expect, it } from "vitest";
import { MockArenaRepository } from "./mock-arena-repository";

describe("MockArenaRepository", () => {
  it("returns five fighters and every round-robin pairing", async () => {
    const arena = await new MockArenaRepository().getArena("arena-1");
    const pairings = new Set(
      arena.bouts.map((bout) =>
        [bout.fighterAId, bout.fighterBId].sort().join(":"),
      ),
    );

    expect(arena.fighters).toHaveLength(5);
    expect(arena.bouts).toHaveLength(10);
    expect(pairings).toHaveLength(10);
    expect(arena.bouts.every((bout) => bout.status === "expected")).toBe(true);
  });

  it("rejects an unknown arena id", async () => {
    await expect(
      new MockArenaRepository().getArena("missing"),
    ).rejects.toThrow('Mock arena "missing" does not exist.');
  });
});

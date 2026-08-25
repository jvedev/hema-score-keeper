import { describe, expect, it } from "vitest";
import { applyEloBout, DEFAULT_ELO_RATING } from "./elo";

describe("applyEloBout", () => {
  it("raises the winner and lowers the loser by equal amounts when ratings are equal", () => {
    const ratings = new Map([
      ["a", DEFAULT_ELO_RATING],
      ["b", DEFAULT_ELO_RATING],
    ]);

    const next = applyEloBout(ratings, { fighterAId: "a", fighterBId: "b", winnerParticipantId: "a" });

    expect(next.get("a")).toBe(1016);
    expect(next.get("b")).toBe(984);
  });

  it("leaves both ratings unchanged on a draw between equal opponents", () => {
    const ratings = new Map([
      ["a", DEFAULT_ELO_RATING],
      ["b", DEFAULT_ELO_RATING],
    ]);

    const next = applyEloBout(ratings, { fighterAId: "a", fighterBId: "b", winnerParticipantId: null });

    expect(next.get("a")).toBe(1000);
    expect(next.get("b")).toBe(1000);
  });

  it("defaults unseen participants to the starting rating", () => {
    const next = applyEloBout(new Map(), { fighterAId: "a", fighterBId: "b", winnerParticipantId: "a" });

    expect(next.get("a")).toBe(1016);
    expect(next.get("b")).toBe(984);
  });

  it("awards fewer points for an expected win against a much weaker opponent", () => {
    const ratings = new Map([
      ["a", 1400],
      ["b", 1000],
    ]);

    const next = applyEloBout(ratings, { fighterAId: "a", fighterBId: "b", winnerParticipantId: "a" });

    expect(next.get("a")! - 1400).toBeLessThan(16);
    expect(1000 - next.get("b")!).toBeLessThan(16);
  });

  it("does not mutate the input map", () => {
    const ratings = new Map([["a", DEFAULT_ELO_RATING]]);
    applyEloBout(ratings, { fighterAId: "a", fighterBId: "b", winnerParticipantId: "a" });
    expect(ratings.size).toBe(1);
  });
});

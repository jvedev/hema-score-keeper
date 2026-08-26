import { describe, expect, it } from "vitest";
import { buildRanking, publishBoutRanking } from "./ranking";
import { DEFAULT_ELO_RATING } from "./elo";

describe("buildRanking", () => {
  it("orders participants by rating, highest first", () => {
    const participants = [
      { id: "a", name: "Alex" },
      { id: "b", name: "Blake" },
    ];
    const ratings = new Map([
      ["a", 1000],
      ["b", 1050],
    ]);

    const ranking = buildRanking(participants, ratings);

    expect(ranking.map((entry) => entry.participantId)).toEqual(["b", "a"]);
    expect(ranking.map((entry) => entry.position)).toEqual([1, 2]);
  });

  it("defaults an unrated participant to the starting rating", () => {
    const ranking = buildRanking([{ id: "a", name: "Alex" }], new Map());
    expect(ranking[0]?.rating).toBe(DEFAULT_ELO_RATING);
  });

  it("collapses a duplicate participant row into a single ranking entry", () => {
    const participants = [
      { id: "a", name: "Alex" },
      { id: "b", name: "Blake" },
      { id: "a", name: "Alex" },
    ];
    const ratings = new Map([
      ["a", 1000],
      ["b", 1050],
    ]);

    const ranking = buildRanking(participants, ratings);

    expect(ranking).toHaveLength(2);
    expect(ranking.filter((entry) => entry.participantId === "a")).toHaveLength(1);
  });
});

describe("publishBoutRanking", () => {
  it("applies the bout's Elo result and returns the full sorted ranking", () => {
    const participants = [
      { id: "a", name: "Alex" },
      { id: "b", name: "Blake" },
    ];
    const currentRatings = new Map([
      ["a", DEFAULT_ELO_RATING],
      ["b", DEFAULT_ELO_RATING],
    ]);

    const ranking = publishBoutRanking(participants, currentRatings, {
      fighterAId: "a",
      fighterBId: "b",
      winnerParticipantId: "a",
    });

    expect(ranking[0]?.participantId).toBe("a");
    expect(ranking[0]!.rating).toBeGreaterThan(DEFAULT_ELO_RATING);
  });
});

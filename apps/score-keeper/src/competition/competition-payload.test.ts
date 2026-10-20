import type { BoutOutcome } from "@hema/match-engine";
import type { BoutSetupResult } from "@hema/ui";
import { describe, expect, it } from "vitest";
import { buildRecordBoutPayload, reconcileAlsoCountIn, ringLabel } from "./competition-payload";

const setup: BoutSetupResult = {
  competitionId: "X",
  fighterAUserId: "ilse",
  fighterBUserId: "tomas",
  refereeUserId: "joris",
  juryUserIds: ["sanne"],
  tableUserIds: [],
  ring: "Ring 2",
  alsoCountIn: ["Y"],
};

const outcome: BoutOutcome = {
  scoreA: 3,
  scoreB: 5,
  winnerSide: "B",
  warningsA: 1,
  warningsB: 0,
  exchanges: [{ atSeconds: 180, kind: "TIME", side: null, points: 0, reason: null }],
};

describe("buildRecordBoutPayload", () => {
  it("combines the setup, the outcome and the start time", () => {
    expect(buildRecordBoutPayload(setup, outcome, "2026-10-20T19:40:00.000Z")).toEqual({
      fighterAUserId: "ilse",
      fighterBUserId: "tomas",
      refereeUserId: "joris",
      juryUserIds: ["sanne"],
      tableUserIds: [],
      ring: "Ring 2",
      startedAt: "2026-10-20T19:40:00.000Z",
      startedInCompetitionId: "X",
      alsoCountIn: ["Y"],
      scoreA: 3,
      scoreB: 5,
      winnerSide: "B",
      warningsA: 1,
      warningsB: 0,
      exchanges: outcome.exchanges,
    });
  });
});

describe("ringLabel", () => {
  it("names the competition and the ring", () => {
    expect(ringLabel("Lowlands Ladder", "Ring 2")).toBe("Lowlands Ladder · Ring 2");
    expect(ringLabel("Lowlands Ladder", null)).toBe("Lowlands Ladder");
  });
});

describe("reconcileAlsoCountIn", () => {
  it("keeps only competitions the pair can still also count in", () => {
    expect(reconcileAlsoCountIn(["Y", "Z"], [{ id: "Y", name: "Ochs club ladder" }])).toEqual(["Y"]);
    expect(reconcileAlsoCountIn([], [{ id: "Y", name: "Ochs club ladder" }])).toEqual([]);
  });
});

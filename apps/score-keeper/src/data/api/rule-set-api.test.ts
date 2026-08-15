import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api-client";
import { RuleSetApi } from "./rule-set-api";

describe("RuleSetApi", () => {
  it("maps the backend ruleset detail definition into the scorekeeper model", async () => {
    const client = new ApiClient("http://localhost");
    vi.spyOn(client, "get").mockResolvedValue({
      id: "ruleset-1",
      name: "Longsword",
      version: 3,
      definition: {
        weaponClass: "LONGSWORD",
        matchParameters: {
          maxDurationSeconds: 180,
          stopOnTimeOut: true,
          maxPointsCap: 10,
          pointSpreadVictory: 5,
          scores: [1, 2, 3, 4],
          maxDoubles: 3,
          allowAfterBlow: true,
          countDoubles: true,
          useNetScore: true,
          penalties: [],
        },
      },
      matchCount: 0,
      locked: false,
    });

    const ruleSet = await new RuleSetApi(client).getRuleSet("ruleset-1");

    expect(ruleSet).toEqual({
      id: "ruleset-1",
      name: "Longsword",
      version: "3",
      weaponClass: "LONGSWORD",
      matchParameters: {
        maxDurationSeconds: 180,
        stopOnTimeOut: true,
        maxPointsCap: 10,
        pointSpreadVictory: 5,
        scores: [1, 2, 3, 4],
        maxDoubles: 3,
        allowAfterBlow: true,
        countDoubles: true,
        useNetScore: true,
        penalties: [],
      },
    });
  });
});

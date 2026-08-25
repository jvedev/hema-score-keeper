import type { RuleSet } from "@hema/match-engine";

export const mockRuleSet: RuleSet = {
  id: "mock-ruleset",
  name: "Mock competition ruleset",
  version: "1.0",
  weaponClass: "Longsword",
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
    penalties: [
      { description: "Late in ring", penalties: [0], disqualify: true },
      { description: "Unsportsmanlike conduct", penalties: [0, 1, 2, 3], disqualify: true },
      { description: "Illegal target", penalties: [0, 1, 2, 3], disqualify: false },
      { description: "Bull rushing", penalties: [0, 1], disqualify: false },
      { description: "Illegal technique", penalties: [], disqualify: true },
      { description: "Influence jury", penalties: [0, 3], disqualify: true },
      { description: "Ring out", penalties: [1], disqualify: false },
      { description: "Other", penalties: [1, 2, 3, 4, 5], disqualify: true },
    ],
  },
};

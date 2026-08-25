import type { ScoreMatchEventDetail } from "@hema/ui";
import { describe, expect, it, vi } from "vitest";
import type { MatchParameters } from "./rule-set";
import { MatchStore } from "./match-store";

const rules: MatchParameters = {
  maxDurationSeconds: 180,
  stopOnTimeOut: true,
  maxPointsCap: 10,
  pointSpreadVictory: 5,
  scores: [1, 2, 3, 4],
  maxDoubles: 3,
  allowAfterBlow: true,
  countDoubles: true,
  useNetScore: false,
  penalties: [
    { description: "Late in ring", penalties: [0], disqualify: true },
    { description: "Unsportsmanlike conduct", penalties: [0, 1, 2, 3], disqualify: true },
    { description: "Illegal target", penalties: [0, 1, 2, 3], disqualify: false },
    { description: "Bull rushing", penalties: [0, 1], disqualify: false },
    { description: "Illegal technique", penalties: [], disqualify: true },
    { description: "Influence Jury", penalties: [0, 3], disqualify: true },
    { description: "ring out", penalties: [1], disqualify: false },
    { description: "Other", penalties: [1, 2, 3, 4, 5], disqualify: true },
  ],
};

describe("match store", () => {
  it("publishes derived state after dispatching an event", () => {
    const store = new MatchStore(rules);
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch(scoreEvent({ fighterAScore: 2 }));

    expect(store.state.fighterAScore).toBe(2);
    expect(store.events).toHaveLength(1);
    expect(listener).toHaveBeenLastCalledWith(store.state);
  });

  it("replays persisted events into the same state without republishing them", () => {
    const store = new MatchStore(rules);
    const eventListener = vi.fn();
    store.subscribeToEvents(eventListener);

    store.replay([
      scoreEvent({ fighterAScore: 2 }),
      scoreEvent({ fighterBScore: 1 }),
    ]);

    expect(store.state.fighterAScore).toBe(2);
    expect(store.state.fighterBScore).toBe(1);
    expect(store.events).toHaveLength(2);
    expect(eventListener).not.toHaveBeenCalled();
  });

  it("protects stored events from mutations by consumers", () => {
    const store = new MatchStore(rules);
    store.dispatch(scoreEvent({ fighterAScore: 2 }));
    const events = store.events;
    (events[0] as ScoreMatchEventDetail).fighterAScore = 99;

    expect(
      (store.events[0] as ScoreMatchEventDetail).fighterAScore,
    ).toBe(2);
  });
});

function scoreEvent(
  overrides: {
    elapsedTimeSeconds?: number;
    fighterAScore?: number;
    fighterBScore?: number;
  } = {},
): ScoreMatchEventDetail {
  return {
    elapsedTimeSeconds: overrides.elapsedTimeSeconds ?? 10,
    fighterAScore: overrides.fighterAScore ?? 0,
    fighterBScore: overrides.fighterBScore ?? 0,
    details: {
      fighterA: { outcome: "score" },
      fighterB: { outcome: "no-score" },
    },
    type: "hit",
  };
}

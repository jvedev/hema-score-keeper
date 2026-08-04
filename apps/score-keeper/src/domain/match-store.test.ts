import type { ScoreMatchEventDetail } from "@hema/ui";
import { describe, expect, it, vi } from "vitest";
import { ruleSets } from "../data/mock/fixtures/rule-sets";
import { MatchStore } from "./match-store";

const ruleSet = ruleSets["rule-set-1"];
if (!ruleSet) throw new Error('Rule set "rule-set-1" is required by tests.');
const rules = {
  ...ruleSet.matchParameters,
  useNetScore: false,
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

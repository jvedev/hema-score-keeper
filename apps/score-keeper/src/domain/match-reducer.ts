import type {
  MatchEventDetail,
  ScoreMatchEventDetail,
} from "@hema/ui";
import type { MatchParameters } from "./rule-set";
import {
  createInitialMatchState,
  createMatchState,
  type MatchState,
} from "./match-state";

interface ScoreDelta {
  fighterA: number;
  fighterB: number;
}

export function reduceMatchEvent(
  state: MatchState,
  event: MatchEventDetail,
  rules: MatchParameters,
): MatchState {
  if (state.disqualifiedFighter) {
    throw new Error("No match events can be applied after disqualification.");
  }

  if (event.type === "score-adjustment") {
    const score = validScore(event.score, "Adjusted score");
    return createMatchState({
      ...state,
      fighterAScore: event.fighter === "A" ? score : state.fighterAScore,
      fighterBScore: event.fighter === "B" ? score : state.fighterBScore,
      elapsedTimeSeconds: validElapsedTime(event.elapsedTimeSeconds),
    });
  }

  if (event.type === "warning") {
    const pointsDeducted = validPoints(
      event.pointsDeducted,
      "Warning points deducted",
    );
    return createMatchState({
      ...state,
      fighterAScore:
        event.fighter === "A"
          ? state.fighterAScore - pointsDeducted
          : state.fighterAScore,
      fighterBScore:
        event.fighter === "B"
          ? state.fighterBScore - pointsDeducted
          : state.fighterBScore,
      elapsedTimeSeconds: validElapsedTime(event.elapsedTimeSeconds),
      warnings: {
        ...state.warnings,
        [event.fighter]: state.warnings[event.fighter] + 1,
      },
    });
  }

  if (event.type === "disqualification") {
    return createMatchState({
      ...state,
      elapsedTimeSeconds: validElapsedTime(event.elapsedTimeSeconds),
      disqualifiedFighter: event.fighter,
    });
  }

  const delta = scoreDelta(event, rules);
  return createMatchState({
    ...state,
    fighterAScore: state.fighterAScore + delta.fighterA,
    fighterBScore: state.fighterBScore + delta.fighterB,
    elapsedTimeSeconds: validElapsedTime(event.elapsedTimeSeconds),
  });
}

export function replayMatchEvents(
  events: readonly MatchEventDetail[],
  rules: MatchParameters,
): MatchState {
  return events.reduce(
    (state, event) => reduceMatchEvent(state, event, rules),
    createInitialMatchState(),
  );
}

function scoreDelta(
  event: ScoreMatchEventDetail,
  rules: MatchParameters,
): ScoreDelta {
  if (event.type === "no-score") {
    return { fighterA: 0, fighterB: 0 };
  }

  let fighterA = validPoints(event.fighterAScore, "Fighter A score");
  let fighterB = validPoints(event.fighterBScore, "Fighter B score");

  if (event.type === "double" && !rules.countDoubles) {
    return { fighterA: 0, fighterB: 0 };
  }

  if (event.type === "afterblow" && !rules.allowAfterBlow) {
    if (event.firstFighter === "A") fighterB = 0;
    else fighterA = 0;
  }



  if(rules.useNetScore){
    const netScore = getNetScore(fighterA, fighterB);
    fighterA = netScore.fighterA;
    fighterB = netScore.fighterB;
  }

  return {
    fighterA,
    fighterB,
  };
}

function getNetScore(a: number, b: number): { fighterA: number; fighterB: number } {
  if (a === b) {
    return { fighterA: 0, fighterB: 0 };
  }
  if (a > b) {
    return { fighterA: a - b, fighterB: 0 };
  }
  return { fighterA: 0, fighterB: b - a };
}

function validPoints(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function validScore(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function validElapsedTime(value: number): number {
  return validPoints(value, "Elapsed time");
}

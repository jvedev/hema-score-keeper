import type { FighterIdentifier } from "@hema/ui";

export interface MatchState {
  readonly fighterAScore: number;
  readonly fighterBScore: number;
  readonly elapsedTimeSeconds: number;
  readonly warnings: Readonly<Record<FighterIdentifier, number>>;
  readonly disqualifiedFighter?: FighterIdentifier;
}

export function createInitialMatchState(): MatchState {
  return createMatchState({
    fighterAScore: 0,
    fighterBScore: 0,
    elapsedTimeSeconds: 0,
    warnings: { A: 0, B: 0 },
  });
}

export function createMatchState(state: MatchState): MatchState {
  return Object.freeze({
    ...state,
    warnings: Object.freeze({ ...state.warnings }),
  });
}

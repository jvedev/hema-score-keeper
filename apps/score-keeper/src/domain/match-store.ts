import type { MatchEventDetail } from "@hema/ui";
import type { MatchParameters } from "./rule-set";
import {
  createInitialMatchState,
  createMatchState,
  type MatchState,
} from "./match-state";
import { reduceMatchEvent, replayMatchEvents } from "./match-reducer";

export type MatchStateListener = (state: MatchState) => void;
export type MatchEventListener = (
  event: MatchEventDetail,
  state: MatchState,
) => void;

export class MatchStore {
  readonly #rules: MatchParameters;
  readonly #initialState: MatchState;
  readonly #events: MatchEventDetail[] = [];
  readonly #stateListeners = new Set<MatchStateListener>();
  readonly #eventListeners = new Set<MatchEventListener>();
  #state: MatchState;

  constructor(rules: MatchParameters, initialState: MatchState = createInitialMatchState()) {
    this.#rules = structuredClone(rules);
    this.#initialState = createMatchState(initialState);
    this.#state = this.#initialState;
  }

  get state(): MatchState {
    return this.#state;
  }

  get events(): readonly MatchEventDetail[] {
    return this.#events.map((event) => structuredClone(event));
  }

  dispatch(event: MatchEventDetail): void {
    const storedEvent = structuredClone(event);
    const nextState = reduceMatchEvent(this.#state, storedEvent, this.#rules);
    this.#events.push(storedEvent);
    this.#state = nextState;

    for (const listener of this.#stateListeners) listener(this.#state);
    for (const listener of this.#eventListeners) {
      listener(structuredClone(storedEvent), this.#state);
    }
  }

  subscribe(listener: MatchStateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  subscribeToEvents(listener: MatchEventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  replay(events: readonly MatchEventDetail[]): void {
    const storedEvents = events.map((event) => structuredClone(event));
    const nextState = replayMatchEvents(storedEvents, this.#rules, this.#initialState);
    this.#events.splice(0, this.#events.length, ...storedEvents);
    this.#state = nextState;
    for (const listener of this.#stateListeners) listener(this.#state);
  }

  reset(): void {
    this.#events.splice(0);
    this.#state = this.#initialState;
    for (const listener of this.#stateListeners) listener(this.#state);
  }
}

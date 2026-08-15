import "@hema/ui";
import "@hema/ui/start-screen-view";
import type {
  ApiArena,
  ApiEvent,
  ApiMatch,
  ApiScheduleTimeSlot,
  ApiStage,
  ApiTournament,
} from "@hema/event-admin-api";
import { createEventRepository } from "./data/create-event-repository";
import { createRuleSetRepository } from "./data/create-rule-set-repository";
import { MatchStore } from "./domain/match-store";
import { createMatchState } from "./domain/match-state";
import "./styles.css";

type OrientationLockType =
  | "any"
  | "natural"
  | "landscape"
  | "portrait"
  | "portrait-primary"
  | "portrait-secondary"
  | "landscape-primary"
  | "landscape-secondary";

declare global {
  interface ScreenOrientation {
    lock(orientation: OrientationLockType): Promise<void>;
  }
}

interface ActiveTimeSlotSelection {
  tournament: ApiTournament;
  stage: ApiStage;
  timeSlot: ApiScheduleTimeSlot;
  matches: ApiMatch[];
}

interface CurrentSelection {
  event: ApiEvent | undefined;
  arena: ApiArena | undefined;
  timeSlotSelection: ActiveTimeSlotSelection | undefined;
}

function requireElement<ElementType extends Element>(
  selector: string,
): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Required element not found: "${selector}".`);
  return element;
}

const startScreenView =
  requireElement<HTMLElementTagNameMap["start-screen-view"]>(
    "#start-screen-view",
  );
const fightView =
  requireElement<HTMLElementTagNameMap["fight-view"]>("#fight-view");
const scoreView =
  requireElement<HTMLElementTagNameMap["score-view"]>("#score-view");
const warningView =
  requireElement<HTMLElementTagNameMap["warning-view"]>("#warning-view");
const forfeitDialog =
  requireElement<HTMLElementTagNameMap["action-dialog"]>("#forfeit-dialog");

const eventRepository = createEventRepository();
const ruleSetRepository = createRuleSetRepository();
const selectionStorageKey = "hema-score-keeper.start-selection";
const defaultArenaLeftColor = "#21c15b";
const defaultArenaRightColor = "#2f7dfa";

let events: readonly ApiEvent[] = [];
let selectedEventId: string | undefined;
let selectedArenaId: string | undefined;
let selectedMatchId: string | undefined;
let matchStore: MatchStore | undefined;
let wakeLock: WakeLockSentinel | undefined;
let wakeLockRequested = false;

fightView.setMatchActive(false);
showStartScreen();
startScreenView.configure(buildLoadingConfig());

startScreenView.addEventListener("event-selected", (event) => {
  selectEvent(event.detail.eventId);
});
startScreenView.addEventListener("arena-selected", (event) => {
  selectArena(event.detail.arenaId);
});
startScreenView.addEventListener("fight-selected", (event) => {
  void beginFightMode(event.detail.matchId, false);
});
startScreenView.addEventListener("reload-requested", () => {
  void loadEvents();
});

fightView.addEventListener("hit-requested", (event) => {
  if (!(event instanceof CustomEvent)) {
    throw new Error("hit-requested must be a CustomEvent.");
  }
  scoreView.open(
    (event as CustomEvent<{ elapsedTimeSeconds: number }>).detail
      .elapsedTimeSeconds,
  );
});
fightView.addEventListener("warning-requested", (event) => {
  if (!(event instanceof CustomEvent)) {
    throw new Error("warning-requested must be a CustomEvent.");
  }
  warningView.open(
    (event as CustomEvent<{ elapsedTimeSeconds: number }>).detail
      .elapsedTimeSeconds,
  );
});
fightView.addEventListener("match-reset-requested", () => {
  if (!matchStore) throw new Error("Match store is not initialized.");
  matchStore.reset();
  fightView.setMatchStarted(false);
});
fightView.addEventListener("forfeit-requested", () => forfeitDialog.open());

window.addEventListener("match-event", (event) => {
  if (!matchStore) throw new Error("Match store is not initialized.");
  matchStore.dispatch(event.detail);
});

window.addEventListener("popstate", () => {
  applyLocationSelection();
  if (isFightRoute()) {
    void beginFightMode(selectedMatchId, true);
    return;
  }

  void exitFightMode();
  showStartScreen();
  renderStartScreen();
});

void loadEvents();

async function loadEvents(): Promise<void> {
  startScreenView.configure(buildLoadingConfig());
  try {
    events = await eventRepository.listEvents();
    applyLocationSelection();
    if (isFightRoute()) {
      await beginFightMode(selectedMatchId, true);
      return;
    }

    await exitFightMode();
    showStartScreen();
    syncStartUrl();
    renderStartScreen();
  } catch (error) {
    await exitFightMode();
    showStartScreen();
    startScreenView.configure({
      ...buildLoadingConfig(),
      loading: false,
      error: error instanceof Error ? error.message : "Unable to load events.",
    });
  }
}

async function beginFightMode(
  matchId?: string,
  replaceUrl = false,
): Promise<void> {
  const selection = resolveCurrentSelection();
  const timeSlotSelection = selection.timeSlotSelection;
  if (!selection.event || !selection.arena || !timeSlotSelection) {
    await exitFightMode();
    syncStartUrl();
    showStartScreen();
    renderStartScreen("Event not active for the selected arena.");
    return;
  }

  const match =
    resolveMatch(timeSlotSelection, selection.arena.id, matchId) ??
    timeSlotSelection.matches[0];
  if (!match) {
    await exitFightMode();
    syncStartUrl();
    showStartScreen();
    renderStartScreen("No fights are assigned to the selected time slot.");
    return;
  }

  const ruleSetId =
    match.ruleset?.id ??
    timeSlotSelection.stage.ruleset?.id ??
    timeSlotSelection.tournament.ruleset?.id ??
    selection.event.ruleset?.id;
  if (!ruleSetId) {
    throw new Error("A ruleset is required to start the fight view.");
  }

  const ruleSet = await ruleSetRepository.getRuleSet(ruleSetId);
  const fighterA = resolveEntry(timeSlotSelection.tournament, match.entryAId);
  const fighterB = resolveEntry(timeSlotSelection.tournament, match.entryBId);
  if (!fighterA || !fighterB) {
    throw new Error(`Match "${match.id}" references an unknown fighter.`);
  }

  selectedMatchId = match.id;
  syncFightUrl(match.id, replaceUrl);
  showFightScreen();

  matchStore = new MatchStore(
    ruleSet.matchParameters,
    createMatchState({
      fighterAScore: match.scoreA ?? 0,
      fighterBScore: match.scoreB ?? 0,
      elapsedTimeSeconds: 0,
      warnings: { A: 0, B: 0 },
    }),
  );
  matchStore.subscribe((state) => {
    fightView.setScores(state);
    fightView.setMatchActive(!state.disqualifiedFighter);
    scoreView.setScores(state.fighterAScore, state.fighterBScore);
  });
  matchStore.subscribeToEvents((event) => {
    console.info("Match event:", {
      eventId: selection.event?.id,
      arenaId: selection.arena?.id,
      matchId: selectedMatchId,
      event,
    });
  });

  fightView.configureArena({
    name: `${selection.arena.name} · ${timeSlotSelection.timeSlot.label}`,
    fighterAName: fighterA.user.username,
    fighterBName: fighterB.user.username,
    leftFighterStyle: createFighterStyle(selection.arena.leftColor ?? defaultArenaLeftColor),
    rightFighterStyle: createFighterStyle(selection.arena.rightColor ?? defaultArenaRightColor),
  });
  fightView.setMatchDuration(ruleSet.matchParameters.maxDurationSeconds);
  fightView.setScores({
    fighterAScore: match.scoreA ?? 0,
    fighterBScore: match.scoreB ?? 0,
  });
  scoreView.configure({
    scores: ruleSet.matchParameters.scores,
    fighterA: {
      name: fighterA.user.username,
      score: match.scoreA ?? 0,
      ...createFighterStyle(selection.arena.leftColor ?? defaultArenaLeftColor),
    },
    fighterB: {
      name: fighterB.user.username,
      score: match.scoreB ?? 0,
      ...createFighterStyle(selection.arena.rightColor ?? defaultArenaRightColor),
    },
  });
  warningView.configure({
    fighterA: {
      name: fighterA.user.username,
      ...createFighterStyle(selection.arena.leftColor ?? defaultArenaLeftColor),
    },
    fighterB: {
      name: fighterB.user.username,
      ...createFighterStyle(selection.arena.rightColor ?? defaultArenaRightColor),
    },
    penalties: ruleSet.matchParameters.penalties,
  });

  await enterFightMode();
}

async function enterFightMode(): Promise<void> {
  wakeLockRequested = true;
  void requestWakeLock();

  try {
    await document.documentElement.requestFullscreen();
  } catch (error) {
    console.warn("Fullscreen mode is unavailable.", error);
  }

  try {
    await screen.orientation.lock("portrait");
  } catch (error) {
    console.warn("Portrait orientation lock is unavailable.", error);
  }

  await requestWakeLock();
}

async function exitFightMode(): Promise<void> {
  wakeLockRequested = false;
  if (wakeLock && wakeLock.released === false) {
    try {
      await wakeLock.release();
    } catch (error) {
      console.warn("Unable to release the screen wake lock.", error);
    }
  }
  wakeLock = undefined;
  matchStore = undefined;
  fightView.setWakeLockActive(false);
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn("Unable to exit fullscreen mode.", error);
    }
  }
  fightView.setMatchStarted(false);
  fightView.hidden = true;
  startScreenView.hidden = false;
  document.body.dataset.mode = "start";
}

async function requestWakeLock(): Promise<void> {
  if (!wakeLockRequested) return;
  if (!("wakeLock" in navigator)) {
    fightView.setWakeLockActive(false);
    return;
  }

  if (document.visibilityState !== "visible") {
    return;
  }

  if (wakeLock?.released === false) {
    fightView.setWakeLockActive(true);
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    fightView.setWakeLockActive(true);
    wakeLock.addEventListener("release", () => {
      wakeLock = undefined;
      fightView.setWakeLockActive(false);
      if (wakeLockRequested && document.visibilityState === "visible") {
        void requestWakeLock();
      }
    });
  } catch (error) {
    fightView.setWakeLockActive(false);
    console.warn("Unable to acquire a screen wake lock.", error);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wakeLockRequested) {
    void requestWakeLock();
  }
});

function renderStartScreen(inactiveMessage?: string): void {
  startScreenView.configure(buildStartScreenConfig(inactiveMessage));
}

function createFighterStyle(backgroundColor: string): { backgroundColor: string; textColor: string } {
  return {
    backgroundColor,
    textColor: getContrastTextColor(backgroundColor),
  };
}

function getContrastTextColor(backgroundColor: string): string {
  const hex = backgroundColor.trim().replace(/^#/, "");
  const expanded = hex.length === 3
    ? hex.split("").map((character) => `${character}${character}`).join("")
    : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return "#ffffff";
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;

  return luminance > 0.6 ? "#071a0d" : "#ffffff";
}

function buildLoadingConfig() {
  return {
    loading: true,
    error: null,
    eventOptions: [],
    selectedEventId: null,
    arenaOptions: [],
    selectedArenaId: null,
    activeTimeSlotLabel: null,
    fightSummary: null,
    inactiveMessage: null,
    fights: [],
  };
}

function buildStartScreenConfig(inactiveMessage?: string) {
  const selection = resolveCurrentSelection();
  const fights = selection.timeSlotSelection
    ? buildFightCards(selection.timeSlotSelection, selection.arena?.id)
    : [];
  const activeTimeSlotLabel = selection.timeSlotSelection
    ? `${selection.timeSlotSelection.tournament.name} · ${selection.timeSlotSelection.timeSlot.label}`
    : null;
  const fightSummary = selection.timeSlotSelection
    ? `${fights.length} fight${fights.length === 1 ? "" : "s"}`
    : null;

  return {
    loading: false,
    error: null,
    eventOptions: events.map((event) => ({
      id: event.id,
      name: event.eventName,
    })),
    selectedEventId: selection.event?.id ?? null,
    arenaOptions: selection.event
      ? selection.event.arenas.map((arena) => ({ id: arena.id, name: arena.name }))
      : [],
    selectedArenaId: selection.arena?.id ?? null,
    activeTimeSlotLabel,
    fightSummary,
    inactiveMessage:
      inactiveMessage ??
      (selection.timeSlotSelection
        ? fights.length === 0
          ? "No fights are assigned to this arena in the active time slot yet."
          : null
        : "Event not active for the selected arena."),
    fights,
  };
}

function resolveCurrentSelection(): CurrentSelection {
  const event =
    events.find((candidate) => candidate.id === selectedEventId) ?? events[0];
  if (!event) {
    return {
      event: undefined,
      arena: undefined,
      timeSlotSelection: undefined,
    };
  }

  const arena =
    event.arenas.find((candidate) => candidate.id === selectedArenaId) ??
    event.arenas[0];
  const timeSlotSelection = arena ? findActiveTimeSlot(event, arena.id) : undefined;
  return { event, arena, timeSlotSelection };
}

function findActiveTimeSlot(
  event: ApiEvent,
  arenaId: string,
): ActiveTimeSlotSelection | undefined {
  const schedule = event.schedule;
  if (!schedule?.currentTimeSlotId) {
    return undefined;
  }

  const timeSlot = schedule.timeSlots.find((candidate) => candidate.id === schedule.currentTimeSlotId);
  if (!timeSlot) {
    return undefined;
  }

  const placement = timeSlot.scheduledPhases.find((candidate) => candidate.arenaId === arenaId);
  if (!placement) {
    return undefined;
  }

  const tournament = event.tournaments.find((candidate) => candidate.id === placement.stage.tournament.id);
  const stage = tournament?.stages.find((candidate) => candidate.id === placement.stage.id);
  if (!tournament || !stage) {
    return undefined;
  }

  return {
    tournament,
    stage,
    timeSlot,
    matches: collectMatches(stage, arenaId, timeSlot.order),
  };
}

function collectMatches(stage: ApiStage, arenaId: string, roundNumber: number): ApiMatch[] {
  const round = stage.rounds.find((candidate) => candidate.roundNumber === roundNumber);
  if (!round) {
    return [];
  }

  return round.matches.filter((match) => match.arenaId === arenaId);
}

function buildFightCards(
  timeSlotSelection: ActiveTimeSlotSelection,
  arenaId?: string,
): Array<{
  id: string;
  roundLabel: string;
  fighterAName: string;
  fighterBName: string;
  statusLabel: string;
}> {
  if (!arenaId) {
    return [];
  }

  const cards: Array<{
    id: string;
    roundLabel: string;
    fighterAName: string;
    fighterBName: string;
    statusLabel: string;
  }> = [];

  for (const match of timeSlotSelection.matches) {
    const fighterA = resolveEntry(timeSlotSelection.tournament, match.entryAId);
    const fighterB = resolveEntry(timeSlotSelection.tournament, match.entryBId);
    if (!fighterA || !fighterB) {
      continue;
    }
    cards.push({
      id: match.id,
      roundLabel: timeSlotSelection.timeSlot.label,
      fighterAName: fighterA.user.username,
      fighterBName: fighterB.user.username,
      statusLabel: matchStatusLabel(match),
    });
  }

  return cards;
}

function resolveMatch(
  timeSlotSelection: ActiveTimeSlotSelection,
  arenaId: string,
  matchId?: string,
): ApiMatch | undefined {
  if (matchId) {
    const explicit = timeSlotSelection.matches.find((match) => match.id === matchId);
    if (explicit) {
      return explicit;
    }
  }

  return timeSlotSelection.matches.find((match) => match.arenaId === arenaId);
}

function resolveEntry(
  tournament: ApiTournament,
  entryId: string | null,
): ApiTournament["entries"][number] | undefined {
  if (!entryId) {
    return undefined;
  }

  return tournament.entries.find((entry) => entry.id === entryId);
}

function matchStatusLabel(match: ApiMatch): string {
  if (match.winnerEntryId) {
    return "Completed";
  }
  if (match.scoreA !== null || match.scoreB !== null) {
    return "In progress";
  }
  return "Ready";
}

function selectEvent(eventId: string): void {
  selectedEventId = eventId;
  const event = events.find((candidate) => candidate.id === eventId);
  selectedArenaId = event?.arenas[0]?.id;
  selectedMatchId = undefined;
  persistSelection();
  syncStartUrl();
  showStartScreen();
  renderStartScreen();
}

function selectArena(arenaId: string): void {
  selectedArenaId = arenaId;
  selectedMatchId = undefined;
  persistSelection();
  syncStartUrl();
  showStartScreen();
  renderStartScreen();
}

function syncStartUrl(): void {
  const url = new URL(window.location.href);
  url.pathname = "/";
  if (selectedEventId) {
    url.searchParams.set("eventId", selectedEventId);
  } else {
    url.searchParams.delete("eventId");
  }
  if (selectedArenaId) {
    url.searchParams.set("arenaId", selectedArenaId);
  } else {
    url.searchParams.delete("arenaId");
  }
  url.searchParams.delete("matchId");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function syncFightUrl(matchId: string, replaceUrl: boolean): void {
  const url = new URL(window.location.href);
  url.pathname = "/match";
  if (selectedEventId) {
    url.searchParams.set("eventId", selectedEventId);
  } else {
    url.searchParams.delete("eventId");
  }
  if (selectedArenaId) {
    url.searchParams.set("arenaId", selectedArenaId);
  } else {
    url.searchParams.delete("arenaId");
  }
  url.searchParams.set("matchId", matchId);
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replaceUrl) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
}

function applyLocationSelection(): void {
  const params = new URLSearchParams(window.location.search);
  const savedSelection = loadSavedSelection();
  const requestedEventId = params.get("eventId");
  const selectedEvent =
    events.find((candidate) => candidate.id === requestedEventId) ??
    events.find((candidate) => candidate.id === savedSelection?.eventId) ??
    events[0];
  selectedEventId = selectedEvent?.id;

  const requestedArenaId = params.get("arenaId");
  const selectedArena =
    selectedEvent?.arenas.find((candidate) => candidate.id === requestedArenaId) ??
    selectedEvent?.arenas.find((candidate) => candidate.id === savedSelection?.arenaId) ??
    selectedEvent?.arenas[0];
  selectedArenaId = selectedArena?.id;

  const requestedMatchId = params.get("matchId") ?? undefined;
  selectedMatchId = requestedMatchId && selectedArenaId
    ? selectedEvent?.tournaments.some((tournament) =>
        tournament.stages.some((stage) =>
          stage.rounds.some((round) =>
            round.matches.some(
              (match) =>
                match.id === requestedMatchId &&
                match.arenaId === selectedArenaId,
            ),
          ),
        ),
      )
      ? requestedMatchId
      : undefined
    : undefined;
  if (!selectedMatchId && requestedMatchId) {
    selectedMatchId = undefined;
  }
}

function loadSavedSelection(): { eventId?: string; arenaId?: string } | undefined {
  try {
    const raw = window.localStorage.getItem(selectionStorageKey);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<{ eventId: string; arenaId: string }>;
    const savedSelection: { eventId?: string; arenaId?: string } = {};
    if (typeof parsed.eventId === "string") {
      savedSelection.eventId = parsed.eventId;
    }
    if (typeof parsed.arenaId === "string") {
      savedSelection.arenaId = parsed.arenaId;
    }
    return savedSelection;
  } catch (error) {
    console.warn("Unable to read the saved start selection.", error);
    return undefined;
  }
}

function persistSelection(): void {
  try {
    window.localStorage.setItem(
      selectionStorageKey,
      JSON.stringify({
        eventId: selectedEventId,
        arenaId: selectedArenaId,
      }),
    );
  } catch (error) {
    console.warn("Unable to save the start selection.", error);
  }
}

function isFightRoute(): boolean {
  return normalizePath(window.location.pathname) === "/match";
}

function showStartScreen(): void {
  startScreenView.hidden = false;
  fightView.hidden = true;
  document.body.dataset.mode = "start";
}

function showFightScreen(): void {
  startScreenView.hidden = true;
  fightView.hidden = false;
  document.body.dataset.mode = "fight";
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

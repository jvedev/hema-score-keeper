import "@hema/ui";
import "@hema/ui/start-screen-view";
import { createApiClient } from "@hema/event-admin-api";
import type {
  ApiArena,
  ApiEvent,
  ApiMatch,
  ApiMatchExchangeInput,
  ApiScheduleTimeSlot,
  ApiStage,
  ApiTournament,
} from "@hema/event-admin-api";
import { createEventRepository } from "./data/create-event-repository";
import { createRuleSetRepository } from "./data/create-rule-set-repository";
import { shouldUseMockApi } from "./data/use-mock-api";
import { fetchSheetValues } from "./data/google-sheets-client";
import { MatchStore, createMatchState, reduceMatchEvent } from "@hema/match-engine";
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

interface GoogleSheetsSelection {
  sourceSheetId?: string | undefined;
  destSheetId?: string | undefined;
}

type AppRoute = "launcher" | "event" | "standalone" | "google-sheets" | "fight";

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
const launcherScreen = requireElement<HTMLElement>("#launcher-screen");
const standaloneScreen = requireElement<HTMLElement>("#standalone-screen");
const googleSheetsScreen = requireElement<HTMLElement>("#google-sheets-screen");
const standaloneButton =
  requireElement<HTMLButtonElement>("#standalone-button");
const googleSheetsButton =
  requireElement<HTMLButtonElement>("#google-sheets-button");
const eventButton = requireElement<HTMLButtonElement>("#event-button");
const standaloneBackButton =
  requireElement<HTMLButtonElement>("#standalone-back-button");
const googleSheetsBackButton =
  requireElement<HTMLButtonElement>("#google-sheets-back-button");
const googleSheetsSourceInput =
  requireElement<HTMLInputElement>("#google-sheets-source-input");
const googleSheetsDestInput =
  requireElement<HTMLInputElement>("#google-sheets-dest-input");
const googleSheetsApplyButton =
  requireElement<HTMLButtonElement>("#google-sheets-apply-button");
const googleSheetsStatus =
  requireElement<HTMLElement>("#google-sheets-status");
const scoreView =
  requireElement<HTMLElementTagNameMap["score-view"]>("#score-view");
const warningView =
  requireElement<HTMLElementTagNameMap["warning-view"]>("#warning-view");
const forfeitDialog =
  requireElement<HTMLElementTagNameMap["action-dialog"]>("#forfeit-dialog");

const eventRepository = createEventRepository();
const ruleSetRepository = createRuleSetRepository();
const backendClient = shouldUseMockApi() ? undefined : createApiClient();
const selectionStorageKey = "hema-score-keeper.start-selection";
const googleSheetsSelectionStorageKey = "hema-score-keeper.google-sheets-selection";
const defaultArenaLeftColor = "#21c15b";
const defaultArenaRightColor = "#2f7dfa";

let events: readonly ApiEvent[] = [];
let selectedEventId: string | undefined;
let selectedArenaId: string | undefined;
let selectedMatchId: string | undefined;
let matchStore: MatchStore | undefined;
let wakeLock: WakeLockSentinel | undefined;
let wakeLockRequested = false;
let eventsLoadPromise: Promise<void> | undefined;
let eventsLoaded = false;
const completedMatchIds = new Set<string>();
let googleSheetsSelection: GoogleSheetsSelection = {};

fightView.setMatchActive(false);

standaloneButton.addEventListener("click", () => {
  syncStandaloneUrl();
  showStandaloneScreen();
});
googleSheetsButton.addEventListener("click", () => {
  enterGoogleSheetsMode();
});
eventButton.addEventListener("click", () => {
  void openEventMode();
});
standaloneBackButton.addEventListener("click", () => {
  syncLauncherUrl(true);
  showLauncherScreen();
});
googleSheetsBackButton.addEventListener("click", () => {
  syncLauncherUrl(true);
  showLauncherScreen();
});
googleSheetsApplyButton.addEventListener("click", () => {
  googleSheetsSelection = {
    sourceSheetId: googleSheetsSourceInput.value.trim() || undefined,
    destSheetId: googleSheetsDestInput.value.trim() || undefined,
  };
  persistGoogleSheetsSelection();
  syncGoogleSheetsUrl(true);
  void logSourceSheetContents();
});

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
fightView.addEventListener("end-match-requested", () => {
  void completeMatch().catch((error) => {
    console.error("Unable to complete match.", error);
  });
});
fightView.addEventListener("forfeit-requested", () => forfeitDialog.open());

window.addEventListener("match-event", (event) => {
  if (!matchStore) throw new Error("Match store is not initialized.");
  matchStore.dispatch(event.detail);
});

window.addEventListener("popstate", () => {
  void handleRoute();
});

void initializeApp();

async function initializeApp(): Promise<void> {
  const route = resolveRoute();
  if (route === "event" || route === "fight") {
    showEventScreen();
    startScreenView.configure(buildLoadingConfig());
    await loadEvents();
    return;
  }

  if (route === "standalone") {
    showStandaloneScreen();
    return;
  }

  if (route === "google-sheets") {
    enterGoogleSheetsMode(true);
    return;
  }

  showLauncherScreen();
}

function enterGoogleSheetsMode(replaceUrl = false): void {
  applyGoogleSheetsLocationSelection();
  syncGoogleSheetsUrl(replaceUrl);
  showGoogleSheetsScreen();
  renderGoogleSheetsScreen();
}

async function openEventMode(): Promise<void> {
  syncEventUrl();
  showEventScreen();
  if (eventsLoaded) {
    applyLocationSelection();
    syncEventUrl(true);
    renderEventScreen();
    return;
  }

  startScreenView.configure(buildLoadingConfig());
  await loadEvents();
}

async function handleRoute(): Promise<void> {
  const route = resolveRoute();
  if (route === "launcher") {
    await exitFightMode();
    showLauncherScreen();
    return;
  }

  if (route === "standalone") {
    await exitFightMode();
    showStandaloneScreen();
    return;
  }

  if (route === "google-sheets") {
    await exitFightMode();
    enterGoogleSheetsMode(true);
    return;
  }

  if (route === "event") {
    await exitFightMode();
    showEventScreen();
    if (eventsLoaded) {
      applyLocationSelection();
      syncEventUrl(true);
      renderEventScreen();
      return;
    }

    startScreenView.configure(buildLoadingConfig());
    await loadEvents();
    return;
  }

  await exitFightMode();
  showEventScreen();
  if (eventsLoaded) {
    applyLocationSelection();
    await beginFightMode(selectedMatchId, true);
    return;
  }

  startScreenView.configure(buildLoadingConfig());
  await loadEvents();
}

async function loadEvents(): Promise<void> {
  if (eventsLoadPromise) {
    return eventsLoadPromise;
  }

  eventsLoadPromise = (async () => {
    startScreenView.configure(buildLoadingConfig());
    try {
      events = await eventRepository.listEvents();
      eventsLoaded = true;
      mergeCompletedMatchIds(events);
      applyLocationSelection();

      const route = resolveRoute();
      if (route === "fight") {
        await beginFightMode(selectedMatchId, true);
        return;
      }

      if (route === "event") {
        syncEventUrl(true);
        showEventScreen();
        renderEventScreen();
        return;
      }

      if (route === "standalone") {
        showStandaloneScreen();
        return;
      }

      if (route === "google-sheets") {
        enterGoogleSheetsMode(true);
        return;
      }
    } catch (error) {
      eventsLoaded = false;
      const route = resolveRoute();
      if (route === "fight" || route === "event") {
        await exitFightMode();
        showEventScreen();
        startScreenView.configure({
          ...buildLoadingConfig(),
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load events.",
        });
        return;
      }

      console.error("Unable to load events.", error);
    }
  })();

  try {
    await eventsLoadPromise;
  } finally {
    eventsLoadPromise = undefined;
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
    syncEventUrl(true);
    showEventScreen();
    renderEventScreen("Event not active for the selected arena.");
    return;
  }

  const match = resolveMatch(timeSlotSelection, selection.arena.id, matchId);
  if (!match) {
    await exitFightMode();
    syncEventUrl(true);
    showEventScreen();
    renderEventScreen(
      timeSlotSelection.matches.length === 0
        ? "No fights are assigned to the selected time slot."
        : "All fights in the selected time slot are already completed.",
    );
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
  fightView.setMatchCompleted(false);
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
  fightView.setMatchCompleted(false);
  scoreView.close();
  warningView.close();
  forfeitDialog.close();
  fightView.hidden = true;
}

async function completeMatch(): Promise<void> {
  if (!matchStore) {
    throw new Error("Match store is not initialized.");
  }

  const selection = resolveCurrentSelection();
  const timeSlotSelection = selection.timeSlotSelection;
  if (!selection.event || !selection.arena || !timeSlotSelection) {
    throw new Error("No active match is available to complete.");
  }

  if (!selectedMatchId) {
    throw new Error("No active match is available to complete.");
  }

  const match = timeSlotSelection.matches.find((candidate) => candidate.id === selectedMatchId);
  if (!match) {
    throw new Error("No active match is available to complete.");
  }

  const ruleSetId =
    match.ruleset?.id ??
    timeSlotSelection.stage.ruleset?.id ??
    timeSlotSelection.tournament.ruleset?.id ??
    selection.event.ruleset?.id;
  if (!ruleSetId) {
    throw new Error("A ruleset is required to complete the fight.");
  }

  const ruleSet = await ruleSetRepository.getRuleSet(ruleSetId);
  const exchanges = buildMatchExchanges(match, ruleSet.matchParameters, matchStore.events);
  const winnerEntryId = resolveWinnerEntryId(match, matchStore.state);

  if (backendClient) {
    await backendClient.completeMatch(match.id, {
      scoreA: matchStore.state.fighterAScore,
      scoreB: matchStore.state.fighterBScore,
      winnerEntryId,
      exchanges,
    });
  }

  completedMatchIds.add(match.id);
  selectedMatchId = undefined;
  persistSelection();
  syncEventUrl(true);
  await exitFightMode();
  await loadEvents();
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

function renderEventScreen(inactiveMessage?: string): void {
  startScreenView.configure(buildEventScreenConfig(inactiveMessage));
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

function buildEventScreenConfig(inactiveMessage?: string) {
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
  disabled: boolean;
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
    disabled: boolean;
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
      disabled: isMatchCompleted(match),
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
    if (explicit && !isMatchCompleted(explicit)) {
      return explicit;
    }
  }

  return timeSlotSelection.matches.find(
    (match) => match.arenaId === arenaId && !isMatchCompleted(match),
  );
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
  if (isMatchCompleted(match)) {
    return "Completed";
  }
  return "Ready";
}

function isMatchCompleted(match: ApiMatch): boolean {
  return (
    completedMatchIds.has(match.id) ||
    match.scoreA !== null ||
    match.scoreB !== null ||
    match.winnerEntryId !== null
  );
}

function mergeCompletedMatchIds(eventList: readonly ApiEvent[]): void {
  for (const event of eventList) {
    for (const tournament of event.tournaments) {
      for (const stage of tournament.stages) {
        for (const round of stage.rounds) {
          for (const match of round.matches) {
            if (isPersistedMatchCompleted(match)) {
              completedMatchIds.add(match.id);
            }
          }
        }
      }
    }
  }
}

function isPersistedMatchCompleted(match: ApiMatch): boolean {
  return match.scoreA !== null || match.scoreB !== null || match.winnerEntryId !== null;
}

function buildMatchExchanges(
  match: ApiMatch,
  rules: Parameters<typeof reduceMatchEvent>[2],
  eventsToPersist: readonly Parameters<typeof reduceMatchEvent>[1][],
): ApiMatchExchangeInput[] {
  const startingState = createMatchState({
    fighterAScore: match.scoreA ?? 0,
    fighterBScore: match.scoreB ?? 0,
    elapsedTimeSeconds: 0,
    warnings: { A: 0, B: 0 },
  });
  let nextState = startingState;

  return eventsToPersist.map((event) => {
    nextState = reduceMatchEvent(nextState, event, rules);
    return {
      scoreA: nextState.fighterAScore,
      scoreB: nextState.fighterBScore,
      details: event,
    };
  });
}

function resolveWinnerEntryId(
  match: ApiMatch,
  state: Parameters<typeof createMatchState>[0],
): string | null {
  if (state.disqualifiedFighter === "A") {
    return match.entryBId;
  }
  if (state.disqualifiedFighter === "B") {
    return match.entryAId;
  }
  if (state.fighterAScore > state.fighterBScore) {
    return match.entryAId;
  }
  if (state.fighterBScore > state.fighterAScore) {
    return match.entryBId;
  }
  return null;
}

function selectEvent(eventId: string): void {
  selectedEventId = eventId;
  const event = events.find((candidate) => candidate.id === eventId);
  selectedArenaId = event?.arenas[0]?.id;
  selectedMatchId = undefined;
  persistSelection();
  syncEventUrl(true);
  showEventScreen();
  renderEventScreen();
}

function selectArena(arenaId: string): void {
  selectedArenaId = arenaId;
  selectedMatchId = undefined;
  persistSelection();
  syncEventUrl(true);
  showEventScreen();
  renderEventScreen();
}

function syncLauncherUrl(replaceUrl = false): void {
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.searchParams.delete("eventId");
  url.searchParams.delete("arenaId");
  url.searchParams.delete("matchId");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replaceUrl) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
}

function syncEventUrl(replaceUrl = false): void {
  const url = new URL(window.location.href);
  url.pathname = "/event";
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
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replaceUrl) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
}

function syncStandaloneUrl(replaceUrl = false): void {
  syncModeUrl("/standalone", replaceUrl);
}

function syncGoogleSheetsUrl(replaceUrl = false): void {
  const url = new URL(window.location.href);
  url.pathname = "/google-sheets";
  if (googleSheetsSelection.sourceSheetId) {
    url.searchParams.set("sourceId", googleSheetsSelection.sourceSheetId);
  } else {
    url.searchParams.delete("sourceId");
  }
  if (googleSheetsSelection.destSheetId) {
    url.searchParams.set("destId", googleSheetsSelection.destSheetId);
  } else {
    url.searchParams.delete("destId");
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replaceUrl) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
}

function applyGoogleSheetsLocationSelection(): void {
  const params = new URLSearchParams(window.location.search);
  const savedSelection = loadSavedGoogleSheetsSelection();
  googleSheetsSelection = {
    sourceSheetId: params.get("sourceId") ?? savedSelection?.sourceSheetId,
    destSheetId: params.get("destId") ?? savedSelection?.destSheetId,
  };
  persistGoogleSheetsSelection();
}

function loadSavedGoogleSheetsSelection(): GoogleSheetsSelection | undefined {
  try {
    const raw = window.localStorage.getItem(googleSheetsSelectionStorageKey);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<GoogleSheetsSelection>;
    const savedSelection: GoogleSheetsSelection = {};
    if (typeof parsed.sourceSheetId === "string") {
      savedSelection.sourceSheetId = parsed.sourceSheetId;
    }
    if (typeof parsed.destSheetId === "string") {
      savedSelection.destSheetId = parsed.destSheetId;
    }
    return savedSelection;
  } catch (error) {
    console.warn("Unable to read the saved Google Sheets selection.", error);
    return undefined;
  }
}

function persistGoogleSheetsSelection(): void {
  try {
    window.localStorage.setItem(
      googleSheetsSelectionStorageKey,
      JSON.stringify(googleSheetsSelection),
    );
  } catch (error) {
    console.warn("Unable to save the Google Sheets selection.", error);
  }
}

function renderGoogleSheetsScreen(): void {
  googleSheetsSourceInput.value = googleSheetsSelection.sourceSheetId ?? "";
  googleSheetsDestInput.value = googleSheetsSelection.destSheetId ?? "";
  googleSheetsStatus.textContent = "";
}

async function logSourceSheetContents(): Promise<void> {
  if (!googleSheetsSelection.sourceSheetId) {
    return;
  }

  googleSheetsStatus.textContent = "Loading source sheet...";
  try {
    const values = await fetchSheetValues(googleSheetsSelection.sourceSheetId);
    console.log("Source sheet contents:", values);
    googleSheetsStatus.textContent = `Loaded ${values.length} row(s) — see the browser console.`;
  } catch (error) {
    console.error("Unable to read the source sheet.", error);
    googleSheetsStatus.textContent =
      error instanceof Error ? error.message : "Unable to read the source sheet.";
  }
}

function syncModeUrl(pathname: string, replaceUrl: boolean): void {
  const url = new URL(window.location.href);
  url.pathname = pathname;
  url.searchParams.delete("eventId");
  url.searchParams.delete("arenaId");
  url.searchParams.delete("matchId");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replaceUrl) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
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

function resolveRoute(): AppRoute {
  const pathname = normalizePath(window.location.pathname);
  if (pathname === "/match") {
    return "fight";
  }
  if (pathname === "/event") {
    return "event";
  }
  if (pathname === "/standalone") {
    return "standalone";
  }
  if (pathname === "/google-sheets") {
    return "google-sheets";
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has("matchId")) {
    return "fight";
  }
  if (params.has("eventId") || params.has("arenaId")) {
    return "event";
  }
  return "launcher";
}

function showLauncherScreen(): void {
  launcherScreen.hidden = false;
  standaloneScreen.hidden = true;
  googleSheetsScreen.hidden = true;
  startScreenView.hidden = true;
  fightView.hidden = true;
  document.body.dataset.mode = "launcher";
}

function showEventScreen(): void {
  launcherScreen.hidden = true;
  standaloneScreen.hidden = true;
  googleSheetsScreen.hidden = true;
  startScreenView.hidden = false;
  fightView.hidden = true;
  document.body.dataset.mode = "event";
}

function showStandaloneScreen(): void {
  launcherScreen.hidden = true;
  standaloneScreen.hidden = false;
  googleSheetsScreen.hidden = true;
  startScreenView.hidden = true;
  fightView.hidden = true;
  document.body.dataset.mode = "standalone";
}

function showGoogleSheetsScreen(): void {
  launcherScreen.hidden = true;
  standaloneScreen.hidden = true;
  googleSheetsScreen.hidden = false;
  startScreenView.hidden = true;
  fightView.hidden = true;
  document.body.dataset.mode = "google-sheets";
}

function showFightScreen(): void {
  launcherScreen.hidden = true;
  standaloneScreen.hidden = true;
  googleSheetsScreen.hidden = true;
  startScreenView.hidden = true;
  fightView.hidden = false;
  document.body.dataset.mode = "fight";
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

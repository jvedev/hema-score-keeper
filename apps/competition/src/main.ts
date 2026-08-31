import "@hema/ui";
import type { BoutSummary } from "@hema/ui";
import { MatchStore, createInitialMatchState, type MatchState } from "@hema/match-engine";
import "./styles.css";
import { createCompetitionRepository } from "./data/create-competition-repository";
import { getCurrentUser, setSession } from "./identity/session";
import { decodeGoogleIdTokenPayload, renderGoogleSignInButton } from "./identity/google-sign-in";
import type { CompetitionRepository } from "./data/competition-repository";
import type { Bout, Competition } from "./domain/competition";
import { shouldUseMockApi } from "./data/use-mock-api";
import { shouldUseSheetsApi } from "./data/use-backend-api";

type CompetitionTab = "ranking" | "participants";
type SelectorTab = "my" | "archive" | "public";

type Route =
  | { screen: "selector" }
  | { screen: "competition"; competitionId: string; tab: CompetitionTab }
  | { screen: "bouts"; competitionId: string; participantId: string }
  | { screen: "bout-details"; competitionId: string; participantId: string; boutId: string }
  | { screen: "new-bout"; competitionId: string; participantId: string | null }
  | { screen: "fight"; competitionId: string; participantId: string | null; fighterAId: string; fighterBId: string }
  | { screen: "publish"; competitionId: string; participantId: string | null };

interface ActiveMatch {
  fighterAId: string;
  fighterBId: string;
  matchStore: MatchStore;
}

interface PendingBoutResult {
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  details: Bout["details"];
}

const leftFighterStyle = { backgroundColor: "#21c15b", textColor: "#071a0d" };
const rightFighterStyle = { backgroundColor: "#2f7dfa", textColor: "#ffffff" };

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Required element not found: "${selector}".`);
  return element;
}

const competitionSelectorView = requireElement<
  HTMLElementTagNameMap["competition-selector-view"]
>("#competition-selector-view");
const rankingView = requireElement<HTMLElementTagNameMap["ranking-view"]>("#ranking-view");
const participantsView =
  requireElement<HTMLElementTagNameMap["participants-view"]>("#participants-view");
const boutsView = requireElement<HTMLElementTagNameMap["bouts-view"]>("#bouts-view");
const boutDetailsView =
  requireElement<HTMLElementTagNameMap["bout-details-view"]>("#bout-details-view");
const newBoutView = requireElement<HTMLElementTagNameMap["new-bout-view"]>("#new-bout-view");
const fightView = requireElement<HTMLElementTagNameMap["fight-view"]>("#fight-view");
const matchPublishView =
  requireElement<HTMLElementTagNameMap["match-publish-view"]>("#match-publish-view");
const scoreView = requireElement<HTMLElementTagNameMap["score-view"]>("#score-view");
const warningView = requireElement<HTMLElementTagNameMap["warning-view"]>("#warning-view");
const forfeitDialog = requireElement<HTMLElementTagNameMap["action-dialog"]>("#forfeit-dialog");
const signInScreen = requireElement<HTMLElement>("#sign-in-screen");
const signInError = requireElement<HTMLElement>("#sign-in-error");
const googleSignInButtonContainer = requireElement<HTMLElement>("#google-sign-in-button");

const allScreens = [
  competitionSelectorView,
  rankingView,
  participantsView,
  boutsView,
  boutDetailsView,
  newBoutView,
  fightView,
  matchPublishView,
] as const;

let competitionRepository!: CompetitionRepository;
let startupError: string | undefined;
try {
  competitionRepository = createCompetitionRepository();
} catch (error) {
  startupError = error instanceof Error ? error.message : "Unable to start the app.";
}

let currentCompetitionId: string | undefined;
let currentParticipantId: string | undefined;
let currentSelectorTab: SelectorTab = "my";
let currentBoutId: string | undefined;
let activeMatch: ActiveMatch | undefined;
let pendingResult: PendingBoutResult | undefined;
let wakeLock: WakeLockSentinel | undefined;
let wakeLockRequested = false;
let isPublishing = false;
let isCreatingBout = false;
let isSubmittingParticipant = false;

registerServiceWorker();
registerManifest();

competitionSelectorView.addEventListener("competition-selected", (event) => {
  navigateTo({ screen: "competition", competitionId: event.detail.competitionId, tab: "ranking" });
});

competitionSelectorView.addEventListener("tab-selected", (event) => {
  currentSelectorTab = event.detail.tab;
  void renderSelector();
});

rankingView.addEventListener("back-requested", () => {
  navigateTo({ screen: "selector" });
});
rankingView.addEventListener("view-participants-requested", () => {
  if (!currentCompetitionId) return;
  navigateTo({ screen: "competition", competitionId: currentCompetitionId, tab: "participants" });
});
rankingView.addEventListener("participant-selected", (event) => {
  if (!currentCompetitionId) return;
  navigateTo({
    screen: "bouts",
    competitionId: currentCompetitionId,
    participantId: event.detail.participantId,
  });
});
rankingView.addEventListener("new-bout-requested", () => {
  if (!currentCompetitionId) return;
  navigateTo({
    screen: "new-bout",
    competitionId: currentCompetitionId,
    participantId: currentParticipantId ?? null,
  });
});
rankingView.addEventListener("refresh-requested", () => {
  if (!currentCompetitionId) return;
  void renderRanking(currentCompetitionId, { forceRefresh: true });
});

participantsView.addEventListener("back-requested", () => {
  navigateTo({ screen: "selector" });
});
participantsView.addEventListener("view-ranking-requested", () => {
  if (!currentCompetitionId) return;
  navigateTo({ screen: "competition", competitionId: currentCompetitionId, tab: "ranking" });
});
participantsView.addEventListener("participant-selected", (event) => {
  if (!currentCompetitionId) return;
  navigateTo({
    screen: "bouts",
    competitionId: currentCompetitionId,
    participantId: event.detail.participantId,
  });
});
participantsView.addEventListener("participant-add-requested", (event) => {
  void handleAddParticipant(event.detail.name);
});
participantsView.addEventListener("self-register-requested", (event) => {
  void handleSelfRegister(event.detail.name);
});
participantsView.addEventListener("refresh-requested", () => {
  if (!currentCompetitionId) return;
  void renderParticipants(currentCompetitionId, { forceRefresh: true });
});

boutsView.addEventListener("back-requested", () => {
  if (!currentCompetitionId) return;
  navigateTo({ screen: "competition", competitionId: currentCompetitionId, tab: "participants" });
});
boutsView.addEventListener("bout-selected", (event) => {
  if (!currentCompetitionId || !currentParticipantId) return;
  navigateTo({
    screen: "bout-details",
    competitionId: currentCompetitionId,
    participantId: currentParticipantId,
    boutId: event.detail.boutId,
  });
});
boutsView.addEventListener("new-bout-requested", () => {
  if (!currentCompetitionId) return;
  navigateTo({
    screen: "new-bout",
    competitionId: currentCompetitionId,
    participantId: currentParticipantId ?? null,
  });
});

boutDetailsView.addEventListener("back-requested", () => {
  if (!currentCompetitionId || !currentParticipantId) return;
  navigateTo({
    screen: "bouts",
    competitionId: currentCompetitionId,
    participantId: currentParticipantId,
  });
});

newBoutView.addEventListener("back-requested", () => {
  if (!currentCompetitionId) return;
  if (currentParticipantId) {
    navigateTo({
      screen: "bouts",
      competitionId: currentCompetitionId,
      participantId: currentParticipantId,
    });
    return;
  }
  navigateTo({ screen: "competition", competitionId: currentCompetitionId, tab: "participants" });
});
newBoutView.addEventListener("bout-create-requested", (event) => {
  void handleCreateBout(event.detail.fighterAId, event.detail.fighterBId);
});

fightView.addEventListener("hit-requested", (event) => {
  scoreView.open(event.detail.elapsedTimeSeconds);
});
fightView.addEventListener("warning-requested", (event) => {
  warningView.open(event.detail.elapsedTimeSeconds);
});
fightView.addEventListener("match-reset-requested", () => {
  activeMatch?.matchStore.reset();
  fightView.setMatchStarted(false);
});
fightView.addEventListener("end-match-requested", () => {
  void completeFight();
});
fightView.addEventListener("forfeit-requested", () => forfeitDialog.open());

window.addEventListener("match-event", (event) => {
  activeMatch?.matchStore.dispatch(event.detail);
});

matchPublishView.addEventListener("publish-requested", () => {
  void handlePublish();
});
matchPublishView.addEventListener("decline-requested", () => {
  void handleDecline();
});

window.addEventListener("popstate", () => {
  void renderRoute(resolveRoute());
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wakeLockRequested) {
    void requestWakeLock();
  }
});

void bootstrap();

async function bootstrap(): Promise<void> {
  if (startupError) {
    showSignInScreen();
    googleSignInButtonContainer.hidden = true;
    signInError.textContent = startupError;
    return;
  }

  if (!shouldUseMockApi() && !shouldUseSheetsApi()) {
    hideSignInScreen();
    await renderRoute(resolveRoute());
    return;
  }

  if (getCurrentUser()) {
    await renderRoute(resolveRoute());
    return;
  }

  showSignInScreen();
  try {
    await renderGoogleSignInButton(googleSignInButtonContainer, (credential) => {
      const user = decodeGoogleIdTokenPayload(credential);
      setSession(credential, { email: user.email, displayName: user.name });
      hideSignInScreen();
      void renderRoute(resolveRoute());
    });
  } catch (error) {
    signInError.textContent =
      error instanceof Error ? error.message : "Unable to start Google Sign-In.";
  }
}

function showSignInScreen(): void {
  for (const screen of allScreens) {
    screen.hidden = true;
  }
  signInScreen.hidden = false;
  document.body.dataset.mode = "sign-in";
}

function hideSignInScreen(): void {
  signInScreen.hidden = true;
}

async function handleAddParticipant(name: string): Promise<void> {
  if (!currentCompetitionId || isSubmittingParticipant) return;
  isSubmittingParticipant = true;
  participantsView.setSubmitting(true);
  participantsView.setSubmitError(null);
  try {
    await competitionRepository.addParticipant(currentCompetitionId, name);
    await renderParticipants(currentCompetitionId);
  } catch (error) {
    participantsView.setSubmitError(
      error instanceof Error ? error.message : "Unable to add the participant. Please try again.",
    );
  } finally {
    isSubmittingParticipant = false;
    participantsView.setSubmitting(false);
  }
}

async function handleSelfRegister(name: string): Promise<void> {
  if (!currentCompetitionId || isSubmittingParticipant) return;
  isSubmittingParticipant = true;
  participantsView.setSubmitting(true);
  participantsView.setSubmitError(null);
  try {
    await competitionRepository.registerSelf(currentCompetitionId, name);
    await renderParticipants(currentCompetitionId);
  } catch (error) {
    participantsView.setSubmitError(
      error instanceof Error ? error.message : "Unable to register. Please try again.",
    );
  } finally {
    isSubmittingParticipant = false;
    participantsView.setSubmitting(false);
  }
}

async function completeFight(): Promise<void> {
  if (!activeMatch) return;

  const state = activeMatch.matchStore.state;
  pendingResult = {
    fighterAId: activeMatch.fighterAId,
    fighterBId: activeMatch.fighterBId,
    scoreA: state.fighterAScore,
    scoreB: state.fighterBScore,
    winnerParticipantId: resolveWinnerParticipantId(activeMatch, state),
    details: { events: activeMatch.matchStore.events },
  };

  await exitFightMode();
  if (!currentCompetitionId) return;
  navigateTo({
    screen: "publish",
    competitionId: currentCompetitionId,
    participantId: currentParticipantId ?? null,
  });
}

async function handleCreateBout(fighterAId: string, fighterBId: string): Promise<void> {
  if (!currentCompetitionId || isCreatingBout) return;

  isCreatingBout = true;
  newBoutView.setSubmitting(true);
  newBoutView.setSubmitError(null);
  try {
    const bout = await competitionRepository.createBout(currentCompetitionId, {
      fighterAId,
      fighterBId,
      scoreA: 0,
      scoreB: 0,
      winnerParticipantId: null,
      date: new Date().toISOString().slice(0, 10),
      details: {},
    });
    currentBoutId = bout.id;
    navigateTo(
      {
        screen: "fight",
        competitionId: currentCompetitionId,
        participantId: currentParticipantId ?? null,
        fighterAId,
        fighterBId,
      },
      true,
    );
  } catch (error) {
    newBoutView.setSubmitError(error instanceof Error ? error.message : "Unable to start the bout.");
  } finally {
    isCreatingBout = false;
    newBoutView.setSubmitting(false);
  }
}

function resolveWinnerParticipantId(match: ActiveMatch, state: MatchState): string | null {
  if (state.disqualifiedFighter === "A") return match.fighterBId;
  if (state.disqualifiedFighter === "B") return match.fighterAId;
  if (state.fighterAScore > state.fighterBScore) return match.fighterAId;
  if (state.fighterBScore > state.fighterAScore) return match.fighterBId;
  return null;
}

async function handlePublish(): Promise<void> {
  if (!currentCompetitionId || !pendingResult || !currentBoutId || isPublishing) return;
  const competitionId = currentCompetitionId;
  const result = pendingResult;
  const boutId = currentBoutId;

  isPublishing = true;
  matchPublishView.setPublishing(true);
  matchPublishView.setError(null);
  try {
    const bout = await competitionRepository.publishBout(competitionId, boutId, {
      fighterAId: result.fighterAId,
      fighterBId: result.fighterBId,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      winnerParticipantId: result.winnerParticipantId,
      date: new Date().toISOString().slice(0, 10),
      details: result.details,
    });
    pendingResult = undefined;
    navigateTo(
      {
        screen: "bouts",
        competitionId,
        participantId: currentParticipantId ?? bout.fighterAId,
      },
      true,
    );
    currentBoutId = undefined;
  } catch (error) {
    matchPublishView.setError(
      error instanceof Error ? error.message : "Unable to publish the bout. Please try again.",
    );
  } finally {
    isPublishing = false;
    matchPublishView.setPublishing(false);
  }
}

async function handleDecline(): Promise<void> {
  if (!currentCompetitionId || !currentBoutId) return;
  matchPublishView.setPublishing(true);
  matchPublishView.setError(null);
  try {
    await competitionRepository.declineBout(currentCompetitionId, currentBoutId);
    pendingResult = undefined;
    currentBoutId = undefined;
    if (currentParticipantId) {
      navigateTo(
        { screen: "bouts", competitionId: currentCompetitionId, participantId: currentParticipantId },
        true,
      );
      return;
    }
    navigateTo({ screen: "competition", competitionId: currentCompetitionId, tab: "participants" }, true);
  } catch (error) {
    matchPublishView.setError(
      error instanceof Error ? error.message : "Unable to discard the bout. Please try again.",
    );
  } finally {
    matchPublishView.setPublishing(false);
  }
}

function showScreen(active: Element, mode: string): void {
  for (const screen of allScreens) {
    screen.hidden = screen !== active;
  }
  document.body.dataset.mode = mode;
}

async function renderRoute(route: Route): Promise<void> {
  switch (route.screen) {
    case "selector":
      currentCompetitionId = undefined;
      currentParticipantId = undefined;
      currentBoutId = undefined;
      await renderSelector();
      return;
    case "competition":
      currentCompetitionId = route.competitionId;
      currentParticipantId = undefined;
      if (route.tab === "participants") {
        await renderParticipants(route.competitionId);
        return;
      }
      await renderRanking(route.competitionId);
      return;
    case "bouts":
      currentCompetitionId = route.competitionId;
      currentParticipantId = route.participantId;
      await renderBouts(route.competitionId, route.participantId);
      return;
    case "bout-details":
      currentCompetitionId = route.competitionId;
      currentParticipantId = route.participantId;
      await renderBoutDetails(route.competitionId, route.boutId);
      return;
    case "new-bout":
      currentCompetitionId = route.competitionId;
      currentParticipantId = route.participantId ?? undefined;
      await renderNewBout(route.competitionId, route.participantId);
      return;
    case "fight":
      currentCompetitionId = route.competitionId;
      currentParticipantId = route.participantId ?? undefined;
      await renderFight(route.competitionId, route.fighterAId, route.fighterBId);
      return;
    case "publish":
      currentCompetitionId = route.competitionId;
      currentParticipantId = route.participantId ?? undefined;
      await renderPublish();
      return;
  }
}

async function renderSelector(): Promise<void> {
  showScreen(competitionSelectorView, "selector");
  competitionSelectorView.configure({
    loading: true,
    error: null,
    activeTab: currentSelectorTab,
    tabs: [],
    competitions: [],
  });
  try {
    const competitions = await competitionRepository.listCompetitions();
    const currentUser = getCurrentUser();
    const withMembers = await Promise.all(
      competitions.map(async (competition) => ({
        competition,
        participants: await competitionRepository.getParticipants(competition.id),
      })),
    );
    const userEmail = currentUser?.email ?? null;
    const selector = classifyCompetitions(withMembers, userEmail);
    if (!selector.competitionsByTab[currentSelectorTab].length) {
      currentSelectorTab = firstNonEmptyTab(selector.competitionsByTab) ?? currentSelectorTab;
    }
    competitionSelectorView.configure({
      loading: false,
      error: null,
      activeTab: currentSelectorTab,
      tabs: [
        { key: "my", label: "My competitions", count: selector.competitionsByTab.my.length },
        { key: "archive", label: "Archive", count: selector.competitionsByTab.archive.length },
        { key: "public", label: "Public competitions", count: selector.competitionsByTab.public.length },
      ],
      competitions: selector.competitionsByTab[currentSelectorTab],
    });
  } catch (error) {
    competitionSelectorView.configure({
      loading: false,
      error: error instanceof Error ? error.message : "Unable to load competitions.",
      activeTab: currentSelectorTab,
      tabs: [],
      competitions: [],
    });
  }
}

function classifyCompetitions(
  competitions: readonly { competition: Competition; participants: readonly { linkedUserEmail: string | null }[] }[],
  userEmail: string | null,
): { competitionsByTab: Record<SelectorTab, readonly Competition[]> } {
  const competitionsByTab: Record<SelectorTab, Competition[]> = {
    my: [],
    archive: [],
    public: [],
  };

  for (const item of competitions) {
    const competition = item.competition;
    const isMember = userEmail !== null && item.participants.some((participant) => participant.linkedUserEmail === userEmail);

    if (isMember && competition.status !== "ARCHIVED") {
      competitionsByTab.my.push(competition);
      continue;
    }

    if (isMember && competition.status === "ARCHIVED") {
      competitionsByTab.archive.push(competition);
      continue;
    }

    competitionsByTab.public.push(competition);
  }

  return { competitionsByTab };
}

function firstNonEmptyTab(
  competitionsByTab: Record<SelectorTab, readonly Competition[]>,
): SelectorTab | undefined {
  if (competitionsByTab.my.length > 0) return "my";
  if (competitionsByTab.archive.length > 0) return "archive";
  if (competitionsByTab.public.length > 0) return "public";
  return undefined;
}

async function renderRanking(
  competitionId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<void> {
  showScreen(rankingView, "ranking");
  const competition = await competitionRepository.getCompetition(competitionId);
  rankingView.configure({ loading: true, error: null, competitionName: competition.name, entries: [] });
  try {
    const entries = await competitionRepository.getRanking(competitionId, options);
    rankingView.configure({ loading: false, error: null, competitionName: competition.name, entries });
  } catch (error) {
    rankingView.configure({
      loading: false,
      error: error instanceof Error ? error.message : "Unable to load the ranking.",
      competitionName: competition.name,
      entries: [],
    });
  }
}

async function renderParticipants(
  competitionId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<void> {
  showScreen(participantsView, "participants");
  const competition = await competitionRepository.getCompetition(competitionId);
  participantsView.configure({
    loading: true,
    error: null,
    competitionName: competition.name,
    participants: [],
    canRegisterSelf: false,
  });
  try {
    const participants = await competitionRepository.getParticipants(competitionId, options);
    const currentUserEmail = getCurrentUser()?.email ?? null;
    const linked = participants.find((participant) => participant.linkedUserEmail === currentUserEmail);
    participantsView.configure({
      loading: false,
      error: null,
      competitionName: competition.name,
      participants: participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        isMe: participant.id === linked?.id,
      })),
      canRegisterSelf: !linked,
    });
  } catch (error) {
    participantsView.configure({
      loading: false,
      error: error instanceof Error ? error.message : "Unable to load participants.",
      competitionName: competition.name,
      participants: [],
      canRegisterSelf: false,
    });
  }
}

async function renderBouts(competitionId: string, participantId: string): Promise<void> {
  showScreen(boutsView, "bouts");
  const participant = await competitionRepository.getParticipant(competitionId, participantId);
  boutsView.configure({ loading: true, error: null, participantName: participant.name, bouts: [] });
  try {
    const [bouts, participants] = await Promise.all([
      competitionRepository.getBoutsForParticipant(competitionId, participantId),
      competitionRepository.getParticipants(competitionId),
    ]);
    const nameById = new Map(participants.map((candidate) => [candidate.id, candidate.name]));
    boutsView.configure({
      loading: false,
      error: null,
      participantName: participant.name,
      bouts: bouts.map((bout) => buildBoutSummary(bout, participantId, nameById)),
    });
  } catch (error) {
    boutsView.configure({
      loading: false,
      error: error instanceof Error ? error.message : "Unable to load bouts.",
      participantName: participant.name,
      bouts: [],
    });
  }
}

function buildBoutSummary(
  bout: Bout,
  participantId: string,
  nameById: Map<string, string>,
): BoutSummary {
  const isFighterA = bout.fighterAId === participantId;
  const opponentId = isFighterA ? bout.fighterBId : bout.fighterAId;
  const scoreForParticipant = isFighterA ? bout.scoreA : bout.scoreB;
  const scoreForOpponent = isFighterA ? bout.scoreB : bout.scoreA;
  const result: BoutSummary["result"] = !bout.winnerParticipantId
    ? "draw"
    : bout.winnerParticipantId === participantId
      ? "win"
      : "loss";

  return {
    id: bout.id,
    opponentName: nameById.get(opponentId) ?? "Unknown",
    scoreForParticipant,
    scoreForOpponent,
    result,
    date: bout.date,
  };
}

async function renderBoutDetails(competitionId: string, boutId: string): Promise<void> {
  showScreen(boutDetailsView, "bout-details");
  boutDetailsView.configure({ loading: true, error: null, bout: null });
  try {
    const [bout, participants] = await Promise.all([
      competitionRepository.getBout(competitionId, boutId),
      competitionRepository.getParticipants(competitionId),
    ]);
    const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));
    boutDetailsView.configure({
      loading: false,
      error: null,
      bout: {
        id: bout.id,
        fighterAName: nameById.get(bout.fighterAId) ?? "Unknown",
        fighterBName: nameById.get(bout.fighterBId) ?? "Unknown",
        scoreA: bout.scoreA,
        scoreB: bout.scoreB,
        winnerName: bout.winnerParticipantId
          ? nameById.get(bout.winnerParticipantId) ?? null
          : null,
        date: bout.date,
      },
    });
  } catch (error) {
    boutDetailsView.configure({
      loading: false,
      error: error instanceof Error ? error.message : "Unable to load the bout.",
      bout: null,
    });
  }
}

async function renderNewBout(competitionId: string, participantId: string | null): Promise<void> {
  showScreen(newBoutView, "new-bout");
  const participants = await competitionRepository.getParticipants(competitionId);
  const currentUserEmail = getCurrentUser()?.email ?? null;
  const linked = participants.find((participant) => participant.linkedUserEmail === currentUserEmail);
  newBoutView.configure({
    participants: participants.map((participant) => ({ id: participant.id, name: participant.name })),
    preselectedParticipantId: participantId ?? linked?.id ?? null,
  });
}

async function renderFight(competitionId: string, fighterAId: string, fighterBId: string): Promise<void> {
  showScreen(fightView, "fight");
  const [fighterA, fighterB, ruleSet] = await Promise.all([
    competitionRepository.getParticipant(competitionId, fighterAId),
    competitionRepository.getParticipant(competitionId, fighterBId),
    competitionRepository.getRuleSet(competitionId),
  ]);

  const matchStore = new MatchStore(ruleSet.matchParameters, createInitialMatchState());
  activeMatch = { fighterAId, fighterBId, matchStore };

  matchStore.subscribe((state) => {
    fightView.setScores(state);
    fightView.setMatchActive(!state.disqualifiedFighter);
    scoreView.setScores(state.fighterAScore, state.fighterBScore);
  });

  fightView.configureArena({
    name: `${fighterA.name} vs ${fighterB.name}`,
    fighterAName: fighterA.name,
    fighterBName: fighterB.name,
    leftFighterStyle,
    rightFighterStyle,
  });
  fightView.setMatchDuration(ruleSet.matchParameters.maxDurationSeconds);
  fightView.setScores({ fighterAScore: 0, fighterBScore: 0 });
  fightView.setMatchCompleted(false);
  scoreView.configure({
    scores: ruleSet.matchParameters.scores,
    fighterA: { name: fighterA.name, score: 0, ...leftFighterStyle },
    fighterB: { name: fighterB.name, score: 0, ...rightFighterStyle },
  });
  warningView.configure({
    fighterA: { name: fighterA.name, ...leftFighterStyle },
    fighterB: { name: fighterB.name, ...rightFighterStyle },
    penalties: ruleSet.matchParameters.penalties,
  });

  await enterFightMode();
}

async function renderPublish(): Promise<void> {
  if (!pendingResult || !currentCompetitionId || !currentBoutId) {
    navigateTo({ screen: "selector" }, true);
    return;
  }

  showScreen(matchPublishView, "publish");
  const participants = await competitionRepository.getParticipants(currentCompetitionId);
  const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));
  matchPublishView.configure({
    fighterAName: nameById.get(pendingResult.fighterAId) ?? "Unknown",
    fighterBName: nameById.get(pendingResult.fighterBId) ?? "Unknown",
    scoreA: pendingResult.scoreA,
    scoreB: pendingResult.scoreB,
    winnerName: pendingResult.winnerParticipantId
      ? nameById.get(pendingResult.winnerParticipantId) ?? null
      : null,
  });
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
}

async function exitFightMode(): Promise<void> {
  wakeLockRequested = false;
  if (wakeLock && !wakeLock.released) {
    try {
      await wakeLock.release();
    } catch (error) {
      console.warn("Unable to release the screen wake lock.", error);
    }
  }
  wakeLock = undefined;
  activeMatch = undefined;
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
}

async function requestWakeLock(): Promise<void> {
  if (!wakeLockRequested) return;
  if (!("wakeLock" in navigator)) {
    fightView.setWakeLockActive(false);
    return;
  }
  if (document.visibilityState !== "visible") return;
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

function relativePath(): string {
  const base = import.meta.env.BASE_URL;
  const pathname = window.location.pathname;
  const path = pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : "/";
  return normalizePath(path);
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function resolveRoute(): Route {
  const path = relativePath();
  const params = new URLSearchParams(window.location.search);
  const competitionId = params.get("competitionId") ?? undefined;
  const participantId = params.get("participantId") ?? undefined;
  const boutId = params.get("boutId") ?? undefined;
  const fighterAId = params.get("fighterAId") ?? undefined;
  const fighterBId = params.get("fighterBId") ?? undefined;
  const tab: CompetitionTab = params.get("tab") === "participants" ? "participants" : "ranking";

  if (path === "/competition" && competitionId) {
    return { screen: "competition", competitionId, tab };
  }
  if (path === "/bouts" && competitionId && participantId) {
    return { screen: "bouts", competitionId, participantId };
  }
  if (path === "/bout" && competitionId && boutId) {
    return {
      screen: "bout-details",
      competitionId,
      participantId: participantId ?? "",
      boutId,
    };
  }
  if (path === "/new-bout" && competitionId) {
    return { screen: "new-bout", competitionId, participantId: participantId ?? null };
  }
  if (path === "/fight" && competitionId && fighterAId && fighterBId) {
    return {
      screen: "fight",
      competitionId,
      participantId: participantId ?? null,
      fighterAId,
      fighterBId,
    };
  }
  if (path === "/publish" && competitionId) {
    return { screen: "publish", competitionId, participantId: participantId ?? null };
  }
  return { screen: "selector" };
}

function buildUrl(route: Route): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const params = new URLSearchParams();
  let path = "/";

  switch (route.screen) {
    case "selector":
      path = "/";
      break;
    case "competition":
      path = "/competition";
      params.set("competitionId", route.competitionId);
      params.set("tab", route.tab);
      break;
    case "bouts":
      path = "/bouts";
      params.set("competitionId", route.competitionId);
      params.set("participantId", route.participantId);
      break;
    case "bout-details":
      path = "/bout";
      params.set("competitionId", route.competitionId);
      params.set("participantId", route.participantId);
      params.set("boutId", route.boutId);
      break;
    case "new-bout":
      path = "/new-bout";
      params.set("competitionId", route.competitionId);
      if (route.participantId) params.set("participantId", route.participantId);
      break;
    case "fight":
      path = "/fight";
      params.set("competitionId", route.competitionId);
      if (route.participantId) params.set("participantId", route.participantId);
      params.set("fighterAId", route.fighterAId);
      params.set("fighterBId", route.fighterBId);
      break;
    case "publish":
      path = "/publish";
      params.set("competitionId", route.competitionId);
      if (route.participantId) params.set("participantId", route.participantId);
      break;
  }

  const query = params.toString();
  return `${base}${path}${query ? `?${query}` : ""}`;
}

function navigateTo(route: Route, replace = false): void {
  const url = buildUrl(route);
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
  void renderRoute(route);
}

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}

function registerManifest(): void {
  if (import.meta.env.DEV) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = `${import.meta.env.BASE_URL}manifest.json`;
  document.head.append(link);
}

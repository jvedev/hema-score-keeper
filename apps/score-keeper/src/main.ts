import "@hema/ui";
import { createArenaRepository } from "./data/create-arena-repository";
import { createRuleSetRepository } from "./data/create-rule-set-repository";
import { MatchStore } from "./domain/match-store";
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

function requireElement<ElementType extends Element>(
  selector: string,
): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Required element not found: "${selector}".`);
  return element;
}

const fightView =
  requireElement<HTMLElementTagNameMap["fight-view"]>("#fight-view");
const scoreView =
  requireElement<HTMLElementTagNameMap["score-view"]>("#score-view");
const warningView =
  requireElement<HTMLElementTagNameMap["warning-view"]>("#warning-view");
const forfeitDialog =
  requireElement<HTMLElementTagNameMap["action-dialog"]>("#forfeit-dialog");

const startOverlay = requireElement<HTMLElement>("#start-overlay");
const startButton = requireElement<HTMLButtonElement>("#start-button");

const arenaRepository = createArenaRepository();
const ruleSetRepository = createRuleSetRepository();
let matchStore: MatchStore | undefined;
fightView.setMatchActive(false);

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
});
fightView.addEventListener("forfeit-requested", () => forfeitDialog.open());

window.addEventListener("match-event", (event) => {
  if (!matchStore) throw new Error("Match store is not initialized.");
  matchStore.dispatch(event.detail);
});

async function loadArena(): Promise<void> {
  const [arena, ruleSet] = await Promise.all([
    arenaRepository.getArena("arena-1"),
    ruleSetRepository.getRuleSet("rule-set-1"),
  ]);
  fightView.configureArena({
    name: arena.name,
    fighterAName: arena.selectedBout.fighterA.name,
    fighterBName: arena.selectedBout.fighterB.name,
    leftFighterStyle: arena.fighterStyles.left,
    rightFighterStyle: arena.fighterStyles.right,
  });
  fightView.setMatchDuration(ruleSet.matchParameters.maxDurationSeconds);
  scoreView.configure({
    scores: ruleSet.matchParameters.scores,
    fighterA: {
      name: arena.selectedBout.fighterA.name,
      score: 0,
      ...arena.fighterStyles.left,
    },
    fighterB: {
      name: arena.selectedBout.fighterB.name,
      score: 0,
      ...arena.fighterStyles.right,
    },
  });
  warningView.configure({
    fighterA: {
      name: arena.selectedBout.fighterA.name,
      ...arena.fighterStyles.left,
    },
    fighterB: {
      name: arena.selectedBout.fighterB.name,
      ...arena.fighterStyles.right,
    },
    penalties: ruleSet.matchParameters.penalties,
  });

  matchStore = new MatchStore(ruleSet.matchParameters);
  matchStore.subscribe((state) => {
    fightView.setScores(state);
    fightView.setMatchActive(!state.disqualifiedFighter);
    scoreView.setScores(state.fighterAScore, state.fighterBScore);
  });
  matchStore.subscribeToEvents((event) => {
    console.info("Match event:", event);
  });
}

void loadArena().catch((error: unknown) => {
  console.error("Unable to load arena.", error);
});

let wakeLock: WakeLockSentinel | undefined;

async function requestWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) {
    fightView.setWakeLockActive(false);
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    fightView.setWakeLockActive(true);
    wakeLock.addEventListener("release", () =>
      fightView.setWakeLockActive(false),
    );
  } catch (error) {
    fightView.setWakeLockActive(false);
    console.warn("Unable to acquire a screen wake lock.", error);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wakeLock?.released !== false) {
    void requestWakeLock();
  }
});

startButton.addEventListener("click", async () => {
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
  startOverlay.classList.add("hidden");
});

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith("hema-scorebox-"))
        .map((key) => caches.delete(key)),
    );
  });
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .catch((error: unknown) =>
        console.error("Service worker registration failed.", error),
      );
  });
}

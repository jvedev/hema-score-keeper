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

const selectBoutView =
  requireElement<HTMLElementTagNameMap["select-bout-view"]>("#select-bout-view");

const arenaRepository = createArenaRepository();
const ruleSetRepository = createRuleSetRepository();
let matchStore: MatchStore | undefined;
let selectedBoutId: string | undefined;
let enterSelectedBout: ((boutId: string) => Promise<void>) | undefined;
fightView.setMatchActive(false);

selectBoutView.addEventListener("bout-selected", (event) => {
  if (!enterSelectedBout) throw new Error("Arena is not initialized.");
  void enterSelectedBout(event.detail.boutId);
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

async function loadArena(): Promise<void> {
  const arenaId =
    new URLSearchParams(window.location.search).get("arenaId") ?? "arena-1";
  const [arena, ruleSet] = await Promise.all([
    arenaRepository.getArena(arenaId),
    ruleSetRepository.getRuleSet("rule-set-1"),
  ]);
  const fighters = new Map(
    arena.fighters.map((fighter) => [fighter.id, fighter]),
  );
  fightView.configureArena({
    name: arena.name,
    fighterAName: "Fighter A",
    fighterBName: "Fighter B",
    leftFighterStyle: arena.fighterStyles.left,
    rightFighterStyle: arena.fighterStyles.right,
  });
  fightView.setMatchDuration(ruleSet.matchParameters.maxDurationSeconds);
  const expectedBouts = arena.bouts.filter(
    (bout) => bout.status === "expected",
  );
  selectBoutView.configure({
    arenaName: arena.name,
    fighterCount: arena.fighters.length,
    bouts: expectedBouts.map((bout) => {
      const fighterA = fighters.get(bout.fighterAId);
      const fighterB = fighters.get(bout.fighterBId);
      if (!fighterA || !fighterB) {
        throw new Error(`Bout "${bout.id}" references an unknown fighter.`);
      }
      return {
        id: bout.id,
        round: bout.round,
        fighterAName: fighterA.name,
        fighterBName: fighterB.name,
      };
    }),
  });

  enterSelectedBout = async (boutId) => {
    const bout = expectedBouts.find((item) => item.id === boutId);
    if (!bout) throw new Error(`Expected bout "${boutId}" does not exist.`);
    const fighterA = fighters.get(bout.fighterAId);
    const fighterB = fighters.get(bout.fighterBId);
    if (!fighterA || !fighterB) {
      throw new Error(`Bout "${bout.id}" references an unknown fighter.`);
    }

    selectedBoutId = bout.id;
    fightView.configureArena({
      name: arena.name,
      fighterAName: fighterA.name,
      fighterBName: fighterB.name,
      leftFighterStyle: arena.fighterStyles.left,
      rightFighterStyle: arena.fighterStyles.right,
    });
    scoreView.configure({
        scores: ruleSet.matchParameters.scores,
        fighterA: {
          name: fighterA.name,
          score: 0,
          ...arena.fighterStyles.left,
        },
        fighterB: {
          name: fighterB.name,
          score: 0,
          ...arena.fighterStyles.right,
        },
    });
    warningView.configure({
        fighterA: { name: fighterA.name, ...arena.fighterStyles.left },
        fighterB: { name: fighterB.name, ...arena.fighterStyles.right },
        penalties: ruleSet.matchParameters.penalties,
    });

    matchStore = new MatchStore(ruleSet.matchParameters);
    matchStore.subscribe((state) => {
        fightView.setScores(state);
        fightView.setMatchActive(!state.disqualifiedFighter);
        scoreView.setScores(state.fighterAScore, state.fighterBScore);
    });
    matchStore.subscribeToEvents((event) => {
        console.info("Match event:", { arenaId, boutId: selectedBoutId, event });
    });
    await enterBoutMode();
  };
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

async function enterBoutMode(): Promise<void> {
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
  selectBoutView.hidden = true;
  fightView.hidden = false;
}

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

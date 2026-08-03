import "@hema/ui";
import { createArenaRepository } from "./data/create-arena-repository";
import "./styles.css";

function requireElement<ElementType extends Element>(
  selector: string,
): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Required element not found: "${selector}".`);
  return element;
}

const fightView =
  requireElement<HTMLElementTagNameMap["fight-view"]>("#fight-view");
const hitDialog =
  requireElement<HTMLElementTagNameMap["action-dialog"]>("#hit-dialog");
const warningDialog =
  requireElement<HTMLElementTagNameMap["action-dialog"]>("#warning-dialog");
const forfeitDialog =
  requireElement<HTMLElementTagNameMap["action-dialog"]>("#forfeit-dialog");

const startOverlay = requireElement<HTMLElement>("#start-overlay");
const startButton = requireElement<HTMLButtonElement>("#start-button");

const arenaRepository = createArenaRepository();

fightView.addEventListener("hit-requested", () => hitDialog.open());
fightView.addEventListener("warning-requested", () => warningDialog.open());
fightView.addEventListener("forfeit-requested", () => forfeitDialog.open());

async function loadArena(): Promise<void> {
  const arena = await arenaRepository.getArena("arena-1");
  fightView.configureArena({
    name: arena.name,
    leftFighterStyle: arena.fighterStyles.left,
    rightFighterStyle: arena.fighterStyles.right,
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

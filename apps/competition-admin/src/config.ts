/** The API root: VITE_COMPETITION_API_URL, or `/api/v1` when it is missing, empty or blank (as in .env.example). */
export function apiBaseUrl(configured: string | undefined = import.meta.env.VITE_COMPETITION_API_URL): string {
  return configured?.trim() || "/api/v1";
}

/**
 * Where the score-keeper app lives: ring links point at its `/ring/<token>` page. The score-keeper builds without a
 * Vite `base`, so that page is at the root of its site. Set VITE_SCORE_KEEPER_URL when it is not served from this site.
 */
export function scoreKeeperAppUrl(
  configured: string | undefined = import.meta.env.VITE_SCORE_KEEPER_URL,
  dev: boolean = import.meta.env.DEV,
  origin: string = window.location.origin,
): string {
  const url = configured?.trim() || (dev ? "http://localhost:5180" : origin);
  return url.replace(/\/+$/, "");
}

/** Where the participant app lives: invite links point at its /join/:code page. Set VITE_PARTICIPANT_APP_URL to override. */
export function participantAppUrl(): string {
  const configured = import.meta.env.VITE_PARTICIPANT_APP_URL;
  if (configured) {
    return configured;
  }
  // Dev: the participant app's dev server (port 5173). Otherwise the same site, where the apps are published side by side.
  return import.meta.env.DEV ? "http://localhost:5173/hema-score-keeper/competition" : `${window.location.origin}/hema-score-keeper/competition`;
}

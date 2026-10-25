/**
 * The participant app's pages. Paths live under the app's base (`/hema-score-keeper/competition/`),
 * so an invite link is `<origin><base>join/<code>`. A competition drills down: standings → fighter → bout.
 */
export type Route =
  | { name: "home" }
  | { name: "competitions" }
  /** The competition; opens on the fighter's own bouts when they are in it. */
  | { name: "competition"; competitionId: string }
  | { name: "standings"; competitionId: string }
  | { name: "fighter"; competitionId: string; participantId: string }
  | { name: "bout"; competitionId: string; boutId: string }
  | { name: "profile" }
  | { name: "join"; code: string };

/** The main tabs (sidebar on a laptop, bottom tabs on a phone). */
export type NavItem = "home" | "competitions" | "profile";

const NAV_FOR: Record<Route["name"], NavItem> = {
  home: "home",
  competitions: "competitions",
  competition: "competitions",
  standings: "competitions",
  fighter: "competitions",
  bout: "competitions",
  profile: "profile",
  join: "competitions",
};

/** The tab a page belongs to. */
export function navItemFor(route: Route): NavItem {
  return NAV_FOR[route.name];
}

/** The app's base path from Vite (`import.meta.env.BASE_URL`), always ending in "/". */
export const APP_BASE: string = normaliseBase(import.meta.env.BASE_URL ?? "/");

export function parseRoute(pathname: string, base: string = APP_BASE): Route {
  const relative = stripBase(pathname, normaliseBase(base));
  if (relative === null) {
    return { name: "home" };
  }
  let parts: string[];
  try {
    parts = relative.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: "home" };
  }
  const [first, id, second, third] = parts;
  if (first === "profile" && parts.length === 1) {
    return { name: "profile" };
  }
  if (first === "join" && id && parts.length === 2) {
    return { name: "join", code: id };
  }
  if (first === "competitions") {
    if (parts.length === 1) {
      return { name: "competitions" };
    }
    if (id && parts.length === 2) {
      return { name: "competition", competitionId: id };
    }
    if (id && second === "standings" && parts.length === 3) {
      return { name: "standings", competitionId: id };
    }
    if (id && second === "fighters" && third && parts.length === 4) {
      return { name: "fighter", competitionId: id, participantId: third };
    }
    if (id && second === "bouts" && third && parts.length === 4) {
      return { name: "bout", competitionId: id, boutId: third };
    }
  }
  return { name: "home" };
}

export function href(route: Route, base: string = APP_BASE): string {
  return normaliseBase(base) + relativePath(route);
}

function relativePath(route: Route): string {
  const e = encodeURIComponent;
  switch (route.name) {
    case "home":
      return "";
    case "competitions":
      return "competitions";
    case "competition":
      return `competitions/${e(route.competitionId)}`;
    case "standings":
      return `competitions/${e(route.competitionId)}/standings`;
    case "fighter":
      return `competitions/${e(route.competitionId)}/fighters/${e(route.participantId)}`;
    case "bout":
      return `competitions/${e(route.competitionId)}/bouts/${e(route.boutId)}`;
    case "profile":
      return "profile";
    case "join":
      return `join/${e(route.code)}`;
  }
}

/** Pushes (or replaces) the route in the address bar and tells the app. */
export function navigate(route: Route, replace = false): void {
  const target = href(route);
  if (replace) {
    window.history.replaceState({}, "", target);
  } else if (window.location.pathname !== target) {
    window.history.pushState({}, "", target);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function normaliseBase(base: string): string {
  const withLead = base.startsWith("/") ? base : `/${base}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

/** The path after the base, or null when the path is outside the app. */
function stripBase(pathname: string, base: string): string | null {
  if (pathname.startsWith(base)) {
    return pathname.slice(base.length);
  }
  if (`${pathname}/` === base) {
    return "";
  }
  return null;
}

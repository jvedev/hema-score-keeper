export type Route =
  | { name: "start" }
  | { name: "needs-you" }
  | { name: "competitions" }
  | { name: "competition"; competitionId: string }
  | { name: "fighter"; competitionId: string; participantId: string }
  | { name: "bout"; competitionId: string; boutId: string }
  | { name: "settings"; competitionId: string }
  | { name: "tournaments" }
  | { name: "tournament"; tournamentId: string }
  | { name: "objection"; boutId: string };

export const APP_BASE = normalizeBase(import.meta.env.BASE_URL ?? "/");

export function parseRoute(pathname: string): Route {
  const relativePath = stripBase(pathname, APP_BASE);
  const parts = (relativePath ?? "").split("/").filter(Boolean).map(decodeURIComponent);
  const [first, id, second, third] = parts;
  if (first === "needs-you" && parts.length === 1) {
    return { name: "needs-you" };
  }
  if (first === "objections" && id && parts.length === 2) {
    return { name: "objection", boutId: id };
  }
  if (first === "tournaments") {
    if (parts.length === 1) {
      return { name: "tournaments" };
    }
    if (id && parts.length === 2) {
      return { name: "tournament", tournamentId: id };
    }
  }
  if (first === "competitions") {
    if (parts.length === 1) {
      return { name: "competitions" };
    }
    if (id && parts.length === 2) {
      return { name: "competition", competitionId: id };
    }
    if (id && second === "settings" && parts.length === 3) {
      return { name: "settings", competitionId: id };
    }
    if (id && second === "fighters" && third && parts.length === 4) {
      return { name: "fighter", competitionId: id, participantId: third };
    }
    if (id && second === "bouts" && third && parts.length === 4) {
      return { name: "bout", competitionId: id, boutId: third };
    }
  }
  return { name: "start" };
}

export function href(route: Route): string {
  const e = encodeURIComponent;
  let path: string;
  switch (route.name) {
    case "start":
      path = "";
      break;
    case "needs-you":
      path = "needs-you";
      break;
    case "competitions":
      path = "competitions";
      break;
    case "competition":
      path = `competitions/${e(route.competitionId)}`;
      break;
    case "fighter":
      path = `competitions/${e(route.competitionId)}/fighters/${e(route.participantId)}`;
      break;
    case "bout":
      path = `competitions/${e(route.competitionId)}/bouts/${e(route.boutId)}`;
      break;
    case "settings":
      path = `competitions/${e(route.competitionId)}/settings`;
      break;
    case "tournaments":
      path = "tournaments";
      break;
    case "tournament":
      path = `tournaments/${e(route.tournamentId)}`;
      break;
    case "objection":
      path = `objections/${e(route.boutId)}`;
      break;
  }
  return APP_BASE + path;
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

function normalizeBase(base: string): string {
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function stripBase(pathname: string, base: string): string | null {
  if (base === "/") return pathname.replace(/^\/+/, "");
  if (pathname === base.slice(0, -1)) return "";
  return pathname.startsWith(base) ? pathname.slice(base.length) : null;
}

export type EventAdminRoute =
  | { kind: "events-index" }
  | { kind: "event-overview"; eventId: string }
  | { kind: "tournament-workspace"; eventId: string; tournamentId: string }
  | { kind: "competition-workspace"; eventId: string; competitionId: string }
  | { kind: "event-planning"; eventId: string }
  | { kind: "not-found"; path: string };

export function parseEventAdminRoute(pathname: string, baseUrl?: string): EventAdminRoute {
  const stripped = stripAppBase(pathname, baseUrl);
  const normalized = stripped.replace(/\/+$/, "") || "/";

  if (normalized === "/" || normalized === "/events") {
    return { kind: "events-index" };
  }

  if (normalized === "/planning") {
    return { kind: "event-planning", eventId: "" };
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 2 && parts[0] === "events" && parts[1]) {
    return { kind: "event-overview", eventId: parts[1] };
  }

  if (parts.length === 3 && parts[0] === "events" && parts[1] && parts[2] === "planning") {
    return { kind: "event-planning", eventId: parts[1] };
  }

  if (parts.length === 4 && parts[0] === "events" && parts[1] && parts[2] === "tournaments" && parts[3]) {
    return {
      kind: "tournament-workspace",
      eventId: parts[1],
      tournamentId: parts[3],
    };
  }

  if (parts.length === 4 && parts[0] === "events" && parts[1] && parts[2] === "competitions" && parts[3]) {
    return {
      kind: "competition-workspace",
      eventId: parts[1],
      competitionId: parts[3],
    };
  }

  return { kind: "not-found", path: pathname };
}

export function formatEventAdminRoute(route: EventAdminRoute, baseUrl?: string): string {
  let relativePath: string;
  switch (route.kind) {
    case "events-index":
      relativePath = "/events";
      break;
    case "event-overview":
      relativePath = `/events/${encodeURIComponent(route.eventId)}`;
      break;
    case "tournament-workspace":
      relativePath = `/events/${encodeURIComponent(route.eventId)}/tournaments/${encodeURIComponent(route.tournamentId)}`;
      break;
    case "competition-workspace":
      relativePath = `/events/${encodeURIComponent(route.eventId)}/competitions/${encodeURIComponent(route.competitionId)}`;
      break;
    case "event-planning":
      relativePath = route.eventId ? `/events/${encodeURIComponent(route.eventId)}/planning` : "/planning";
      break;
    case "not-found":
      relativePath = route.path;
      break;
  }
  return withAppBase(relativePath, baseUrl);
}

export function stripAppBase(pathname: string, baseUrl?: string): string {
  if (!baseUrl) return pathname;
  const base = normalizeBase(baseUrl);
  if (base === "/") return pathname;
  if (pathname === base.slice(0, -1)) return "/";
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
}

export function withAppBase(pathname: string, baseUrl?: string): string {
  if (!baseUrl) return pathname;
  const base = normalizeBase(baseUrl);
  if (base === "/") return pathname;
  if (pathname === base.slice(0, -1) || pathname.startsWith(base)) return pathname;
  return `${base}${pathname.replace(/^\/+/, "")}`;
}

function normalizeBase(base: string): string {
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

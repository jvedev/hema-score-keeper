export type Route =
  | { name: "start" }
  | { name: "needs-you" }
  | { name: "competitions" }
  | { name: "competition"; competitionId: string }
  | { name: "fighter"; competitionId: string; participantId: string }
  | { name: "bout"; competitionId: string; boutId: string }
  | { name: "settings"; competitionId: string }
  | { name: "objection"; boutId: string };

export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [first, id, second, third] = parts;
  if (first === "needs-you" && parts.length === 1) {
    return { name: "needs-you" };
  }
  if (first === "objections" && id && parts.length === 2) {
    return { name: "objection", boutId: id };
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
  switch (route.name) {
    case "start":
      return "/";
    case "needs-you":
      return "/needs-you";
    case "competitions":
      return "/competitions";
    case "competition":
      return `/competitions/${e(route.competitionId)}`;
    case "fighter":
      return `/competitions/${e(route.competitionId)}/fighters/${e(route.participantId)}`;
    case "bout":
      return `/competitions/${e(route.competitionId)}/bouts/${e(route.boutId)}`;
    case "settings":
      return `/competitions/${e(route.competitionId)}/settings`;
    case "objection":
      return `/objections/${e(route.boutId)}`;
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

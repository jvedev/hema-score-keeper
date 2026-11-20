import type { CompetitionWorkspaceView, EventAdminRoute } from "@hema/ui";
import type { Route } from "./router";

type CompetitionWorkspaceRoute = Extract<EventAdminRoute, { kind: "competition-workspace" }>;

/**
 * Where a Competition-admin route goes when the screens run inside the Event-admin shell for `eventId`.
 * Pages that only exist in the standalone app (its competition list and "needs you" inbox) lead back to the
 * Event overview, so hosted navigation never leaves the shell.
 */
export function toEventAdminRoute(route: Route, eventId: string, competitionId: string): EventAdminRoute {
  const workspace = (id: string, view?: CompetitionWorkspaceView): EventAdminRoute =>
    view ? { kind: "competition-workspace", eventId, competitionId: id, view } : { kind: "competition-workspace", eventId, competitionId: id };
  switch (route.name) {
    case "start":
    case "competitions":
    case "needs-you":
      return { kind: "event-overview", eventId };
    case "competition":
      return workspace(route.competitionId);
    case "settings":
      return workspace(route.competitionId, { name: "settings" });
    case "fighter":
      return workspace(route.competitionId, { name: "fighter", participantId: route.participantId });
    case "bout":
      return workspace(route.competitionId, { name: "bout", boutId: route.boutId });
    case "objection":
      return workspace(competitionId, { name: "objection", boutId: route.boutId });
  }
}

/** The Competition-admin route to render for an Event-admin competition workspace URL. */
export function fromEventAdminRoute(route: CompetitionWorkspaceRoute): Route {
  const competitionId = route.competitionId;
  switch (route.view?.name) {
    case undefined:
      return { name: "competition", competitionId };
    case "settings":
      return { name: "settings", competitionId };
    case "fighter":
      return { name: "fighter", competitionId, participantId: route.view.participantId };
    case "bout":
      return { name: "bout", competitionId, boutId: route.view.boutId };
    case "objection":
      return { name: "objection", boutId: route.view.boutId };
  }
}

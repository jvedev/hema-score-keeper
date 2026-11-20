import type { EventAdminRoute } from "@hema/ui";
import { describe, expect, it } from "vitest";
import { fromEventAdminRoute, toEventAdminRoute } from "./hosted-routes";
import type { Route } from "./router";

const pairs: Array<[Route, Extract<EventAdminRoute, { kind: "competition-workspace" }>]> = [
  [{ name: "competition", competitionId: "c1" }, { kind: "competition-workspace", eventId: "e1", competitionId: "c1" }],
  [{ name: "settings", competitionId: "c1" }, { kind: "competition-workspace", eventId: "e1", competitionId: "c1", view: { name: "settings" } }],
  [
    { name: "fighter", competitionId: "c1", participantId: "p1" },
    { kind: "competition-workspace", eventId: "e1", competitionId: "c1", view: { name: "fighter", participantId: "p1" } },
  ],
  [{ name: "bout", competitionId: "c1", boutId: "b1" }, { kind: "competition-workspace", eventId: "e1", competitionId: "c1", view: { name: "bout", boutId: "b1" } }],
  [{ name: "objection", boutId: "b1" }, { kind: "competition-workspace", eventId: "e1", competitionId: "c1", view: { name: "objection", boutId: "b1" } }],
];

describe("hosted routes", () => {
  it.each(pairs)("maps %o into the Event-admin shell and back", (route, hosted) => {
    expect(toEventAdminRoute(route, "e1", "c1")).toEqual(hosted);
    expect(fromEventAdminRoute(hosted)).toEqual(route);
  });

  it("sends standalone-only pages back to the Event overview", () => {
    for (const route of [{ name: "start" }, { name: "competitions" }, { name: "needs-you" }] satisfies Route[]) {
      expect(toEventAdminRoute(route, "e1", "c1")).toEqual({ kind: "event-overview", eventId: "e1" });
    }
  });

  it("keeps an objection inside the competition that is open", () => {
    expect(toEventAdminRoute({ name: "objection", boutId: "b9" }, "e1", "c2")).toEqual({
      kind: "competition-workspace",
      eventId: "e1",
      competitionId: "c2",
      view: { name: "objection", boutId: "b9" },
    });
  });
});

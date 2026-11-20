import { describe, expect, it } from "vitest";
import type { Route } from "../router";
import { routeLinkAttributes } from "./links";

describe("routeLinkAttributes", () => {
  it("uses the injected href so another shell can host the screens", () => {
    const route: Route = { name: "settings", competitionId: "c1" };
    const attributes = routeLinkAttributes(route, (r) => `/event-admin/events/e1/competitions/${r.name === "settings" ? r.competitionId : ""}/settings`);
    expect(attributes).toContain('href="/event-admin/events/e1/competitions/c1/settings"');
  });

  it("carries the route as escaped JSON for in-app navigation", () => {
    const route: Route = { name: "bout", competitionId: 'c"1', boutId: "b<1>" };
    const attributes = routeLinkAttributes(route, () => "/x");
    const match = /data-route="([^"]*)"/.exec(attributes);
    expect(match).not.toBeNull();
    const decoded = match![1]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    expect(JSON.parse(decoded)).toEqual(route);
  });
});

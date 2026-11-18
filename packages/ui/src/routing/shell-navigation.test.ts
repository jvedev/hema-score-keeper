import { describe, expect, it } from "vitest";
import {
  parseEventAdminRoute,
  formatEventAdminRoute,
  stripAppBase,
  withAppBase,
} from "./event-admin-router.js";

describe("shell-navigation", () => {
  it("navigates smoothly across routes and base paths", () => {
    const base = "/event-admin/";

    // 1. Root / Events list
    const r1 = parseEventAdminRoute("/event-admin/events", base);
    expect(r1).toEqual({ kind: "events-index" });
    expect(formatEventAdminRoute(r1, base)).toBe("/event-admin/events");

    // 2. Event Overview
    const r2 = parseEventAdminRoute("/event-admin/events/evt-99", base);
    expect(r2).toEqual({ kind: "event-overview", eventId: "evt-99" });
    expect(formatEventAdminRoute(r2, base)).toBe("/event-admin/events/evt-99");

    // 3. Tournament Workspace
    const r3 = parseEventAdminRoute(
      "/event-admin/events/evt-99/tournaments/trn-101",
      base,
    );
    expect(r3).toEqual({
      kind: "tournament-workspace",
      eventId: "evt-99",
      tournamentId: "trn-101",
    });
    expect(formatEventAdminRoute(r3, base)).toBe(
      "/event-admin/events/evt-99/tournaments/trn-101",
    );

    // 4. Competition Workspace
    const r4 = parseEventAdminRoute(
      "/event-admin/events/evt-99/competitions/cmp-202",
      base,
    );
    expect(r4).toEqual({
      kind: "competition-workspace",
      eventId: "evt-99",
      competitionId: "cmp-202",
    });
    expect(formatEventAdminRoute(r4, base)).toBe(
      "/event-admin/events/evt-99/competitions/cmp-202",
    );

    // 5. Event Planning
    const r5 = parseEventAdminRoute("/event-admin/events/evt-99/planning", base);
    expect(r5).toEqual({ kind: "event-planning", eventId: "evt-99" });
    expect(formatEventAdminRoute(r5, base)).toBe(
      "/event-admin/events/evt-99/planning",
    );
  });

  it("handles base path manipulation utilities", () => {
    expect(stripAppBase("/event-admin/events", "/event-admin/")).toBe("/events");
    expect(stripAppBase("/event-admin/", "/event-admin/")).toBe("/");
    expect(withAppBase("/events", "/event-admin/")).toBe("/event-admin/events");
  });
});

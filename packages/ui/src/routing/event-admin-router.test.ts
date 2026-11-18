import { describe, expect, it } from "vitest";
import {
  formatEventAdminRoute,
  parseEventAdminRoute,
  type EventAdminRoute,
} from "./event-admin-router.js";

describe("event-admin-router", () => {
  describe("parseEventAdminRoute", () => {
    it("parses root path as events-index", () => {
      expect(parseEventAdminRoute("/")).toEqual({ kind: "events-index" });
      expect(parseEventAdminRoute("")).toEqual({ kind: "events-index" });
    });

    it("parses /events as events-index", () => {
      expect(parseEventAdminRoute("/events")).toEqual({ kind: "events-index" });
      expect(parseEventAdminRoute("/events/")).toEqual({ kind: "events-index" });
    });

    it("parses /events/:eventId as event-overview", () => {
      expect(parseEventAdminRoute("/events/evt-123")).toEqual({
        kind: "event-overview",
        eventId: "evt-123",
      });
    });

    it("parses /events/:eventId/tournaments/:tournamentId as tournament-workspace", () => {
      expect(
        parseEventAdminRoute("/events/evt-123/tournaments/trn-456"),
      ).toEqual({
        kind: "tournament-workspace",
        eventId: "evt-123",
        tournamentId: "trn-456",
      });
    });

    it("parses /events/:eventId/competitions/:competitionId as competition-workspace", () => {
      expect(
        parseEventAdminRoute("/events/evt-123/competitions/cmp-789"),
      ).toEqual({
        kind: "competition-workspace",
        eventId: "evt-123",
        competitionId: "cmp-789",
      });
    });

    it("parses /events/:eventId/planning as event-planning", () => {
      expect(parseEventAdminRoute("/events/evt-123/planning")).toEqual({
        kind: "event-planning",
        eventId: "evt-123",
      });
    });

    it("handles legacy /planning with search params as event-planning or events-index", () => {
      expect(parseEventAdminRoute("/planning")).toEqual({
        kind: "event-planning",
        eventId: "",
      });
    });

    it("strips custom baseUrl correctly", () => {
      const baseUrl = "/event-admin/";
      expect(parseEventAdminRoute("/event-admin/events/evt-1", baseUrl)).toEqual({
        kind: "event-overview",
        eventId: "evt-1",
      });
      expect(parseEventAdminRoute("/event-admin", baseUrl)).toEqual({
        kind: "events-index",
      });
    });

    it("returns not-found for unsupported deep paths", () => {
      expect(parseEventAdminRoute("/unknown/sub/path")).toEqual({
        kind: "not-found",
        path: "/unknown/sub/path",
      });
    });
  });

  describe("formatEventAdminRoute", () => {
    it("formats events-index", () => {
      expect(formatEventAdminRoute({ kind: "events-index" })).toBe("/events");
      expect(formatEventAdminRoute({ kind: "events-index" }, "/event-admin/")).toBe(
        "/event-admin/events",
      );
    });

    it("formats event-overview", () => {
      expect(
        formatEventAdminRoute({ kind: "event-overview", eventId: "evt-1" }),
      ).toBe("/events/evt-1");
      expect(
        formatEventAdminRoute(
          { kind: "event-overview", eventId: "evt-1" },
          "/event-admin/",
        ),
      ).toBe("/event-admin/events/evt-1");
    });

    it("formats tournament-workspace", () => {
      expect(
        formatEventAdminRoute({
          kind: "tournament-workspace",
          eventId: "evt-1",
          tournamentId: "trn-2",
        }),
      ).toBe("/events/evt-1/tournaments/trn-2");
    });

    it("formats competition-workspace", () => {
      expect(
        formatEventAdminRoute({
          kind: "competition-workspace",
          eventId: "evt-1",
          competitionId: "cmp-3",
        }),
      ).toBe("/events/evt-1/competitions/cmp-3");
    });

    it("formats event-planning", () => {
      expect(
        formatEventAdminRoute({ kind: "event-planning", eventId: "evt-1" }),
      ).toBe("/events/evt-1/planning");
    });
  });
});

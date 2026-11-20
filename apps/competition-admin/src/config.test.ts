import { describe, expect, it } from "vitest";
import { apiBaseUrl, eventAdminBase, eventAdminCompetitionUrl } from "./config";

describe("apiBaseUrl", () => {
  it("uses the configured API URL", () => {
    expect(apiBaseUrl("https://api.example.org/api/v1")).toBe("https://api.example.org/api/v1");
  });

  it("falls back to /api/v1 when it is missing, empty or blank", () => {
    expect(apiBaseUrl(undefined)).toBe("/api/v1");
    expect(apiBaseUrl("")).toBe("/api/v1");
    expect(apiBaseUrl("   ")).toBe("/api/v1");
  });

  it("ignores surrounding whitespace", () => {
    expect(apiBaseUrl(" /backend/api/v1 ")).toBe("/backend/api/v1");
  });
});

describe("Event-admin links", () => {
  it("uses the configured Event-admin URL without a trailing slash", () => {
    expect(eventAdminBase(" https://example.org/event-admin/ ", true)).toBe("https://example.org/event-admin");
  });

  it("falls back to the dev server in development and the side-by-side path otherwise", () => {
    expect(eventAdminBase(undefined, true)).toBe("http://localhost:5182/event-admin");
    expect(eventAdminBase("", false)).toBe("/event-admin");
  });

  it("links to the Competition inside its Event", () => {
    expect(eventAdminCompetitionUrl("e 1", "c/1", "/event-admin")).toBe("/event-admin/events/e%201/competitions/c%2F1");
  });
});

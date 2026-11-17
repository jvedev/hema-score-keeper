import { describe, expect, it } from "vitest";
import { apiBaseUrl } from "./config";

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

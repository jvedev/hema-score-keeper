import { describe, expect, it } from "vitest";
import { apiBaseUrl, scoreKeeperAppUrl } from "./config";

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

describe("scoreKeeperAppUrl", () => {
  it("uses the configured URL without trailing slashes", () => {
    expect(scoreKeeperAppUrl(" https://keep.example.org/ ", false, "https://admin.example.org")).toBe("https://keep.example.org");
  });

  it("falls back to the score keeper dev app path", () => {
    expect(scoreKeeperAppUrl(undefined, true, "http://localhost:5175")).toBe("http://localhost:5180/score-keeper");
    expect(scoreKeeperAppUrl("  ", true, "http://localhost:5175")).toBe("http://localhost:5180/score-keeper");
  });

  it("falls back to this site's score keeper path in a build", () => {
    expect(scoreKeeperAppUrl(undefined, false, "https://admin.example.org")).toBe("https://admin.example.org/score-keeper");
  });
});

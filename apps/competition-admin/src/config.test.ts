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

  it("falls back to the score keeper dev server in dev", () => {
    expect(scoreKeeperAppUrl(undefined, true, "http://localhost:5175")).toBe("http://localhost:5180");
    expect(scoreKeeperAppUrl("  ", true, "http://localhost:5175")).toBe("http://localhost:5180");
  });

  it("falls back to this site in a build: the score keeper has no base path, so /ring/<token> is at the origin", () => {
    expect(scoreKeeperAppUrl(undefined, false, "https://admin.example.org")).toBe("https://admin.example.org");
  });
});

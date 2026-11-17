import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readScoreboardSettings,
  ringKeeperLink,
  ringKeeperStatus,
  ringScoreboardLink,
  rotateKeeperConfirmMessage,
  scoreKeeperBaseUrl,
} from "./live-rings";

describe("live ring links", () => {
  const originalLang = document.documentElement.lang;

  beforeEach(() => {
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    document.documentElement.lang = originalLang;
  });

  it("defaults the score-keeper URL to the same-origin app path", () => {
    expect(scoreKeeperBaseUrl(undefined, "https://hema.example")).toBe("https://hema.example/score-keeper");
    expect(scoreKeeperBaseUrl("   ", "https://hema.example")).toBe("https://hema.example/score-keeper");
  });

  it("uses a configured score-keeper URL without its trailing slashes", () => {
    expect(scoreKeeperBaseUrl(" http://localhost:5174/score-keeper// ", "https://hema.example")).toBe("http://localhost:5174/score-keeper");
  });

  it("builds the table and scoreboard links with encoded tokens", () => {
    expect(ringKeeperLink("https://hema.example/score-keeper/", "a/b c")).toBe("https://hema.example/score-keeper/ring/a%2Fb%20c");
    expect(ringScoreboardLink("https://hema.example/score-keeper", "tok")).toBe("https://hema.example/score-keeper/scoreboard/tok");
  });

  it("names the current keeper in the status and the new-link confirmation", () => {
    const kept = { name: "Ring 1", activeKeeper: { userName: "Alice", since: "2026-11-17T10:00:00.000Z" } };
    expect(ringKeeperStatus(kept)).toBe("Alice is scoring this ring");
    expect(rotateKeeperConfirmMessage(kept)).toContain("Alice is scoring Ring 1 and will be stopped");
    expect(ringKeeperStatus({ activeKeeper: null })).toBe("Nobody is scoring this ring");
    expect(rotateKeeperConfirmMessage({ name: "Ring 2", activeKeeper: null })).toContain("Make a new table link for Ring 2?");
  });

  it("reads the scoreboard settings: checkboxes and the fixed choices only", () => {
    const form = new FormData();
    form.set("mirrored", "on");
    form.set("textSize", "SMALL");
    form.set("theme", "LIGHT");
    expect(readScoreboardSettings(form)).toEqual({ mirrored: true, showNext: false, textSize: "SMALL", theme: "LIGHT" });
    form.set("theme", "GREY");
    expect(readScoreboardSettings(form)).toBeNull();
  });
});

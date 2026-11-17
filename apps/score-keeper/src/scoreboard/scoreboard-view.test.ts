import type { BoutDisplay } from "@hema/competition-domain";
import { describe, expect, it } from "vitest";
import { clockText, remainingNow, renderScoreboard, scoreboardClasses, scoreboardTokenFromPath, settingsOf, textColorFor, type ScoreboardData } from "./scoreboard-view";

const display = (patch: Partial<BoutDisplay> = {}): BoutDisplay => ({
  round: null,
  rounds: null,
  roundsWon: null,
  period: "REGULAR",
  extension: null,
  score: { left: 3, right: 1 },
  doubles: 0,
  maxDoublesReached: false,
  pointCapReached: false,
  warnings: { left: 1, right: 0 },
  remainingSeconds: 95,
  running: true,
  tone: "NORMAL",
  ...patch,
});

const data = (patch: Partial<ScoreboardData> = {}): ScoreboardData => ({
  serverTime: "2026-10-28T10:00:00.000Z",
  tournamentName: "Cup",
  ring: { name: "Ring 1", leftColor: "#21c15b", rightColor: "#2f7dfa" },
  current: { label: "M1", fighterLeft: "Ann", fighterRight: "Bea", display: display() },
  onDeck: { label: "M2", fighterLeft: "Cas", fighterRight: "Dirk" },
  after: { label: "M3", fighterLeft: "Eva", fighterRight: "Fien" },
  pool: null,
  ...patch,
});

/** Echoes the key and its params, so the tests see what was asked for. */
const tr = (key: string, params?: Record<string, string | number>) => (params ? `${key}(${Object.values(params).join(",")})` : key);
const texts = (html: string, cls: string) => [...html.matchAll(new RegExp(`class="${cls}"[^>]*>([^<]*)<`, "g"))].map((match) => match[1]!.trim());

describe("scoreboard view", () => {
  it("reads the token from the path", () => {
    expect(scoreboardTokenFromPath("/scoreboard/abc")).toBe("abc");
    expect(scoreboardTokenFromPath("/ring/abc")).toBeNull();
  });

  it("counts a running clock on from when the data arrived, never below 0", () => {
    expect(remainingNow(display(), 2500)).toBe(93);
    expect(remainingNow(display({ running: false }), 2500)).toBe(95);
    expect(remainingNow(display({ remainingSeconds: 1 }), 5000)).toBe(0);
    expect(clockText(95)).toBe("1:35");
  });

  it("picks readable text for a colour", () => {
    expect(textColorFor("#ffffff")).toBe("#0b0d10");
    expect(textColorFor("#1e4fb3")).toBe("#ffffff");
  });

  it("shows the bout: fighters in ring colours, clock, warnings and on deck", () => {
    const html = renderScoreboard(data(), "ok", 0, tr);
    expect(texts(html, "sb-name")).toEqual(["Ann", "Bea"]);
    expect(html).toContain("background:#21c15b;color:#0b0d10");
    expect(html).toMatch(/sb-clock sb-tone-normal">1:35</);
    expect(html).toContain("⚠ 1");
    expect(html).toMatch(/sb-strip[\s\S]*Cas[\s\S]*Eva/);
    expect(html).not.toContain("sb-round");
    expect(html).not.toContain("sb-lost");
  });

  const ring = (scoreboard: Partial<NonNullable<ScoreboardData["ring"]["scoreboard"]>>): ScoreboardData["ring"] => ({
    name: "Ring 1",
    leftColor: "#d62828",
    rightColor: "#2f7dfa",
    scoreboard: { mirrored: false, showNext: true, textSize: "MEDIUM", theme: "DARK", ...scoreboard },
  });

  it("mirrors the sides when the ring says so; each fighter keeps their colour", () => {
    const html = renderScoreboard(data({ ring: ring({ mirrored: true }) }), "ok", 0, tr);
    expect(texts(html, "sb-name")).toEqual(["Bea", "Ann"]);
    expect(html).toMatch(/sb-fighter sb-left" style="background:#2f7dfa[\s\S]*Bea[\s\S]*sb-fighter sb-right" style="background:#d62828[\s\S]*Ann/);
    expect(html).toMatch(/sb-strip[\s\S]*Dirk[\s\S]*Cas/);
  });

  it("without settings from the backend it looks like the original board", () => {
    expect(settingsOf(data())).toEqual({ mirrored: false, showNext: true, textSize: "MEDIUM", theme: "DARK" });
    expect(scoreboardClasses(settingsOf(data()))).toBe("scoreboard sb-theme-dark sb-text-medium");
    expect(renderScoreboard(data(), "ok", 0, tr)).toBe(renderScoreboard(data({ ring: { ...ring({}), leftColor: "#21c15b" } }), "ok", 0, tr));
  });

  it("theme and text size become classes of the board", () => {
    expect(scoreboardClasses(settingsOf(data({ ring: ring({ theme: "LIGHT", textSize: "LARGE" }) })))).toBe("scoreboard sb-theme-light sb-text-large");
    expect(scoreboardClasses(settingsOf(data({ ring: ring({ textSize: "SMALL" }) })))).toBe("scoreboard sb-theme-dark sb-text-small");
  });

  it("hides the next bout when the ring says so", () => {
    const during = renderScoreboard(data({ ring: ring({ showNext: false }) }), "ok", 0, tr);
    expect(during).not.toContain("sb-strip");
    expect(during).not.toContain("Cas");
    const pool = { name: "Pool_1", bouts: [{ label: "M2", fighterLeft: "Cas", fighterRight: "Dirk", status: "PENDING" as const, isNext: true, result: null }] };
    const between = renderScoreboard(data({ current: null, pool, ring: ring({ showNext: false }) }), "ok", 0, tr);
    expect(between).not.toContain("sb-next-names");
    expect(between).not.toContain("sb-pool-next");
    // With no bouts left the board still says so.
    expect(renderScoreboard(data({ current: null, onDeck: null, after: null, ring: ring({ showNext: false }) }), "ok", 0, tr)).toContain("scoreboard.noMoreBouts");
  });

  it("shows round, rounds won, overtime colour and the max-doubles flash", () => {
    const shown = display({ round: 2, rounds: 3, roundsWon: { left: 1, right: 0 }, period: "EXTENSION", extension: 1, tone: "OVERTIME", doubles: 3, maxDoublesReached: true });
    const html = renderScoreboard(data({ current: { label: "M1", fighterLeft: "Ann", fighterRight: "Bea", display: shown } }), "lost", 0, tr);
    expect(texts(html, "sb-round")).toEqual(["scoreboard.round(2,3)"]);
    expect(html).toContain("sb-clock sb-tone-overtime");
    expect(texts(html, "sb-period sb-tone-overtime")).toEqual(["scoreboard.extension(1)"]);
    expect(texts(html, "sb-alert")).toEqual([""]);
    expect(html).toContain("<span>scoreboard.maxDoubles</span>");
    expect(html).not.toContain("scoreboard.pointCap");
    const capped = renderScoreboard(data({ current: { label: "M1", fighterLeft: "Ann", fighterRight: "Bea", display: display({ pointCapReached: true }) } }), "ok", 0, tr);
    expect(capped).toContain("<span>scoreboard.pointCap</span>");
    expect(texts(html, "sb-rounds")).toEqual(["scoreboard.roundsWon(1)", "scoreboard.roundsWon(0)"]);
    expect(html).toContain("sb-lost");
  });

  it("between bouts: Next, and the pool with results and the next bout marked", () => {
    const pool = {
      name: "Pool_1",
      bouts: [
        { label: "M1", fighterLeft: "Ann", fighterRight: "Bea", status: "DONE" as const, isNext: false, result: { left: 5, right: 2 } },
        { label: "M2", fighterLeft: "Cas", fighterRight: "Dirk", status: "PENDING" as const, isNext: true, result: null },
      ],
    };
    const html = renderScoreboard(data({ current: null, pool }), "ok", 0, tr);
    expect(html).toMatch(/sb-next-names[\s\S]*Cas/);
    expect(texts(html, "sb-pool-result")).toEqual(["5–2", ""]);
    expect(html).toContain("sb-pool-bout sb-pool-pending sb-pool-next");
  });

  it("escapes names", () => {
    const html = renderScoreboard(data({ current: { label: "M1", fighterLeft: "<b>x</b>", fighterRight: "Bea", display: display() } }), "ok", 0, tr);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});

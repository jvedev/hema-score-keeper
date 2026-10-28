import type { BoutDisplay } from "@hema/competition-domain";
import { describe, expect, it } from "vitest";
import { clockText, remainingNow, renderScoreboard, scoreboardTokenFromPath, textColorFor, type ScoreboardData } from "./scoreboard-view";

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
    const html = renderScoreboard(data(), false, "ok", 0, tr);
    expect(texts(html, "sb-name")).toEqual(["Ann", "Bea"]);
    expect(html).toContain("background:#21c15b;color:#0b0d10");
    expect(html).toMatch(/sb-clock sb-tone-normal">1:35</);
    expect(html).toContain("⚠ 1");
    expect(html).toMatch(/sb-strip[\s\S]*Cas[\s\S]*Eva/);
    expect(html).not.toContain("sb-round");
    expect(html).not.toContain("sb-lost");
  });

  it("flips the sides", () => {
    expect(texts(renderScoreboard(data(), true, "ok", 0, tr), "sb-name")).toEqual(["Bea", "Ann"]);
  });

  it("shows round, rounds won, overtime colour and the max-doubles flash", () => {
    const shown = display({ round: 2, rounds: 3, roundsWon: { left: 1, right: 0 }, period: "EXTENSION", extension: 1, tone: "OVERTIME", doubles: 3, maxDoublesReached: true });
    const html = renderScoreboard(data({ current: { label: "M1", fighterLeft: "Ann", fighterRight: "Bea", display: shown } }), false, "lost", 0, tr);
    expect(texts(html, "sb-round")).toEqual(["scoreboard.round(2,3)"]);
    expect(html).toContain("sb-clock sb-tone-overtime");
    expect(texts(html, "sb-period sb-tone-overtime")).toEqual(["scoreboard.extension(1)"]);
    expect(texts(html, "sb-alert")).toEqual([""]);
    expect(html).toContain("<span>scoreboard.maxDoubles</span>");
    expect(html).not.toContain("scoreboard.pointCap");
    const capped = renderScoreboard(data({ current: { label: "M1", fighterLeft: "Ann", fighterRight: "Bea", display: display({ pointCapReached: true }) } }), false, "ok", 0, tr);
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
    const html = renderScoreboard(data({ current: null, pool }), false, "ok", 0, tr);
    expect(html).toMatch(/sb-next-names[\s\S]*Cas/);
    expect(texts(html, "sb-pool-result")).toEqual(["5–2", ""]);
    expect(html).toContain("sb-pool-bout sb-pool-pending sb-pool-next");
  });

  it("escapes names", () => {
    const html = renderScoreboard(data({ current: { label: "M1", fighterLeft: "<b>x</b>", fighterRight: "Bea", display: display() } }), false, "ok", 0, tr);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});

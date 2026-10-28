import { describe, expect, it } from "vitest";
import type { LiveRingLink, SyncTarget } from "../api-types";
import { defaultRingRules } from "@hema/competition-domain";
import { elapsedLabel, parseSpreadsheetId, ringLink, rotateConfirmMessage, rotateTarget, rulesFromForm, toImportReportView, toRingCards, toSyncCards } from "./tournaments";
import type { Translate } from "./translate";

/** Echoes the key and the params so the tests see what was asked for. */
const t: Translate = (key, params) => (params ? `${key}(${Object.entries(params).map(([name, value]) => `${name}=${value}`).join(",")})` : key);
const NOW = Date.parse("2026-10-26T12:00:00.000Z");

describe("ringLink", () => {
  it("is <score keeper>/ring/<token>, without a doubled slash", () => {
    expect(ringLink("https://keep.example.org", "abc")).toBe("https://keep.example.org/ring/abc");
    expect(ringLink("https://keep.example.org///", "abc")).toBe("https://keep.example.org/ring/abc");
    expect(ringLink("http://localhost:5174", "a b/c")).toBe("http://localhost:5174/ring/a%20b%2Fc");
  });
});

describe("parseSpreadsheetId", () => {
  it("takes an id as typed, trimmed, and nothing for an empty box", () => {
    expect(parseSpreadsheetId("  1AbC-d_E  ")).toBe("1AbC-d_E");
    expect(parseSpreadsheetId("   ")).toBeUndefined();
  });
  it("takes the id out of a pasted Google Sheets link", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/1AbC-d_E/edit#gid=0")).toBe("1AbC-d_E");
  });
});

describe("elapsedLabel", () => {
  it.each([
    [null, "tournaments.updatedNever"],
    ["2026-10-26T11:59:48.000Z", "tournaments.updatedSeconds(n=12)"],
    ["2026-10-26T12:00:05.000Z", "tournaments.updatedSeconds(n=0)"],
    ["2026-10-26T11:58:00.000Z", "tournaments.updatedMinutes(n=2)"],
    ["2026-10-26T09:00:00.000Z", "tournaments.updatedHours(n=3)"],
    ["not a date", "tournaments.updatedNever"],
  ])("%s -> %s", (iso, expected) => {
    expect(elapsedLabel(iso, NOW, t)).toBe(expected);
  });
});

describe("toSyncCards", () => {
  const targets: SyncTarget[] = [
    { target: "LOCAL", state: "OK", lastSuccessAt: "2026-10-26T11:59:48.000Z", lastError: null, lastErrorAt: null, pending: 2, failed: 0 },
    { target: "GOOGLE", state: "ERROR", lastSuccessAt: null, lastError: "<b>Quota</b>", lastErrorAt: "2026-10-26T11:00:00.000Z", pending: 0, failed: 3 },
    { target: "GOOGLE", state: "NO_SPREADSHEET", lastSuccessAt: null, lastError: null, lastErrorAt: null, pending: 0, failed: 0 },
  ];

  it("labels each target with its state, age and counts", () => {
    const [local, google] = toSyncCards(targets, NOW, t);
    expect(local).toEqual({
      title: "tournaments.sync.LOCAL",
      state: "OK",
      stateLabel: "tournaments.state.OK",
      tone: "ok",
      updated: "tournaments.updatedSeconds(n=12)",
      counts: ["tournaments.pending(n=2)"],
      error: null,
    });
    expect(google).toMatchObject({ state: "ERROR", tone: "error", counts: ["tournaments.failed(n=3)"], error: "<b>Quota</b>", updated: "tournaments.updatedNever" });
  });

  it("treats the states that need setup as a warning, not an error", () => {
    expect(toSyncCards(targets, NOW, t)[2]).toMatchObject({ tone: "warn", stateLabel: "tournaments.state.NO_SPREADSHEET", counts: [] });
  });

  it("coerces the counts to numbers", () => {
    const [card] = toSyncCards([{ ...targets[0]!, pending: "7<i>" as unknown as number, failed: "4" as unknown as number }], NOW, t);
    expect(card!.counts).toEqual(["tournaments.failed(n=4)"]);
  });
});

describe("toImportReportView", () => {
  it("summarises the counts and lists skipped bouts and error rows", () => {
    const view = toImportReportView(
      {
        added: 4,
        updated: 1,
        skipped: [{ label: "Match 3", reason: "HAS_EXCHANGES" }],
        errors: [{ row: 12, message: "Ring is empty" }, { row: 20, message: "Bad order" }],
      },
      t,
    );
    expect(view.summary).toBe("tournaments.report(added=4,updated=1,skipped=1,errors=2)");
    expect(view.skipped).toEqual(["tournaments.skipReason.HAS_EXCHANGES(label=Match 3)"]);
    expect(view.errors).toEqual(["tournaments.reportRow(row=12,message=Ring is empty)", "tournaments.reportRow(row=20,message=Bad order)"]);
    expect(view.hasProblems).toBe(true);
  });

  it("has no problems for a clean import, and coerces numbers", () => {
    const view = toImportReportView({ added: "2" as unknown as number, updated: null as unknown as number, skipped: [], errors: [] }, t);
    expect(view.summary).toBe("tournaments.report(added=2,updated=0,skipped=0,errors=0)");
    expect(view.hasProblems).toBe(false);
  });
});

describe("rotate confirmation", () => {
  const ring: LiveRingLink = { id: "r1", tournamentId: "t1", name: "Ring <1>", order: 1, keeperToken: "tok", scoreboardToken: "sb", leftColor: "#21c15b", rightColor: "#2f7dfa", activeKeeper: null };

  it("always asks, naming the ring", () => {
    expect(rotateConfirmMessage(ring, t)).toBe("tournaments.newLinkConfirm(ring=Ring <1>)");
  });

  it("names the keeper who will be stopped", () => {
    expect(rotateConfirmMessage({ ...ring, activeKeeper: { userName: "Alice", since: "2026-10-26T11:00:00.000Z" } }, t)).toBe(
      "tournaments.newLinkConfirmKeeper(name=Alice,ring=Ring <1>)",
    );
  });
});

describe("toRingCards", () => {
  it("gives each ring its link and who is keeping it", () => {
    const rings: LiveRingLink[] = [
      { id: "r1", tournamentId: "t1", name: "Ring 1", order: 1, keeperToken: "tok1", scoreboardToken: "sb1", leftColor: "#ff0000", rightColor: "#0000ff", activeKeeper: { userName: "Alice", since: "x" } },
      { id: "r2", tournamentId: "t1", name: "Ring 2", order: 2, keeperToken: "tok2", scoreboardToken: "sb2", leftColor: "#21c15b", rightColor: "#2f7dfa", activeKeeper: null },
    ];
    expect(toRingCards(rings, "https://keep.example.org", t)).toEqual([
      {
        id: "r1", name: "Ring 1", link: "https://keep.example.org/ring/tok1", scoreboardLink: "https://keep.example.org/scoreboard/sb1",
        leftColor: "#ff0000", rightColor: "#0000ff", keeper: "tournaments.keeping(name=Alice)", kept: true,
      },
      {
        id: "r2", name: "Ring 2", link: "https://keep.example.org/ring/tok2", scoreboardLink: "https://keep.example.org/scoreboard/sb2",
        leftColor: "#21c15b", rightColor: "#2f7dfa", keeper: "tournaments.notKept", kept: false,
      },
    ]);
  });
});

describe("rotateTarget", () => {
  const ring: LiveRingLink = { id: "r1", tournamentId: "t1", name: "Ring 1", order: 1, keeperToken: "tok", scoreboardToken: "sb", leftColor: "#21c15b", rightColor: "#2f7dfa", activeKeeper: null };
  it("takes the fresh copy of the ring, so a keeper who claimed it meanwhile is named", () => {
    const fresh = { ...ring, activeKeeper: { userName: "Alice", since: "x" } };
    expect(rotateTarget([fresh], "r1")).toBe(fresh);
    expect(rotateConfirmMessage(rotateTarget([fresh], "r1")!, t)).toContain("name=Alice");
  });
  it("is null when the ring is gone", () => {
    expect(rotateTarget([ring], "other")).toBeNull();
  });
});

describe("rulesFromForm", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  };

  it("reads every field", () => {
    const rules = rulesFromForm(
      form({ maxDurationSeconds: "120", scores: "1, 2, x, 3", maxDoubles: "3", maxPointsCap: "7", rounds: "3", breakSeconds: "30", lastExchangeSeconds: "10", overtimeAfter: "EVERY_ROUND", extensions: "2", extensionSeconds: "45", suddenDeath: "on" }),
      defaultRingRules(),
    );
    expect(rules).toMatchObject({ maxDurationSeconds: 120, scores: [1, 2, 3], maxDoubles: 3, maxPointsCap: 7 });
    expect(rules.format).toEqual({ rounds: 3, breakSeconds: 30, lastExchangeSeconds: 10, overtimeAfter: "EVERY_ROUND", extensions: 2, extensionSeconds: 45, suddenDeath: true });
  });

  it("keeps the current value for empty or bad numbers", () => {
    const current = defaultRingRules();
    const rules = rulesFromForm(form({ maxDurationSeconds: "", rounds: "1.5", scores: "" }), current);
    expect(rules.maxDurationSeconds).toBe(180);
    expect(rules.format.rounds).toBe(1);
    expect(rules.scores).toEqual([1, 2, 3]);
    expect(rules.format.suddenDeath).toBe(false);
  });
});

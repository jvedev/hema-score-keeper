import { describe, expect, it } from "vitest";
import { boutDisplay, clockTone, defaultRingRules, nextSteps, parseRingRules, roundsWon, type BoutDisplayInput, type RingRules } from "./ring-rules";

function rules(format: Partial<RingRules["format"]> = {}, rest: Partial<Omit<RingRules, "format">> = {}): RingRules {
  const base = defaultRingRules();
  return { ...base, ...rest, format: { ...base.format, ...format } };
}

const regular = { round: 1, period: "REGULAR" as const, extension: 0 };
const none = { left: 0, right: 0 };

describe("parseRingRules", () => {
  it("falls back to the ring defaults", () => {
    expect(parseRingRules(null)).toEqual(defaultRingRules());
    expect(parseRingRules({ rounds: 0, extensions: -1, overtimeAfter: "X", scores: ["a"] })).toEqual(defaultRingRules());
  });

  it("reads the format and the match parameters", () => {
    const parsed = parseRingRules({ maxDurationSeconds: 120, scores: [1, 2], maxDoubles: 3, rounds: 3, breakSeconds: 30, lastExchangeSeconds: 10, overtimeAfter: "EVERY_ROUND", extensions: 2, extensionSeconds: 30, suddenDeath: true });
    expect(parsed.maxDurationSeconds).toBe(120);
    expect(parsed.scores).toEqual([1, 2]);
    expect(parsed.maxDoubles).toBe(3);
    expect(parsed.format).toEqual({ rounds: 3, breakSeconds: 30, lastExchangeSeconds: 10, overtimeAfter: "EVERY_ROUND", extensions: 2, extensionSeconds: 30, suddenDeath: true });
    expect(parseRingRules(parsed)).toEqual(parsed);
  });
});

describe("roundsWon", () => {
  it("counts finished rounds only; a tied round goes to nobody", () => {
    expect(roundsWon([{ left: 3, right: 1 }, { left: 2, right: 2 }, { left: 0, right: 1 }], 2)).toEqual({ left: 1, right: 0 });
    expect(roundsWon([{ left: 3, right: 1 }, { left: 2, right: 2 }, { left: 0, right: 1 }], 3)).toEqual({ left: 1, right: 1 });
  });
});

describe("nextSteps", () => {
  it("offers extensions first, then sudden death, only at time-up with a tie", () => {
    const r = rules({ extensions: 1, suddenDeath: true });
    expect(nextSteps(r, regular, { left: 1, right: 1 }, none, false).extension).toBe(false);
    expect(nextSteps(r, regular, { left: 1, right: 1 }, none, true)).toMatchObject({ extension: true, suddenDeath: false });
    expect(nextSteps(r, { round: 1, period: "EXTENSION", extension: 1 }, { left: 1, right: 1 }, none, true)).toMatchObject({ extension: false, suddenDeath: true });
    expect(nextSteps(r, regular, { left: 2, right: 1 }, none, true)).toMatchObject({ extension: false, suddenDeath: false });
  });

  it("only gives overtime in the last round unless every round has it", () => {
    const last = rules({ rounds: 3, extensions: 1 });
    expect(nextSteps(last, regular, { left: 1, right: 1 }, none, true).extension).toBe(false);
    expect(nextSteps(last, { ...regular, round: 3 }, { left: 1, right: 1 }, { left: 1, right: 1 }, true).extension).toBe(true);
    expect(nextSteps(rules({ rounds: 3, extensions: 1, overtimeAfter: "EVERY_ROUND" }), regular, { left: 1, right: 1 }, none, true).extension).toBe(true);
  });

  it("offers a next round until someone has won enough rounds", () => {
    const r = rules({ rounds: 3 });
    expect(nextSteps(r, regular, { left: 2, right: 0 }, none, true).nextRound).toBe(true);
    expect(nextSteps(r, { ...regular, round: 2 }, { left: 2, right: 0 }, { left: 1, right: 0 }, true).nextRound).toBe(false);
    expect(nextSteps(rules(), regular, none, none, true).nextRound).toBe(false);
    expect(nextSteps(r, { ...regular, period: "BREAK" }, none, none, false)).toEqual({ extension: false, suddenDeath: false, nextRound: false, startRound: true });
  });
});

describe("clockTone", () => {
  it("is orange in the last-exchange window and red in overtime", () => {
    const r = rules({ lastExchangeSeconds: 15 });
    expect(clockTone(r, "REGULAR", 16)).toBe("NORMAL");
    expect(clockTone(r, "REGULAR", 15)).toBe("LAST_EXCHANGE");
    expect(clockTone(r, "EXTENSION", 50)).toBe("OVERTIME");
    expect(clockTone(r, "SUDDEN_DEATH", 0)).toBe("OVERTIME");
    expect(clockTone(rules(), "REGULAR", 0)).toBe("NORMAL");
  });
});

describe("boutDisplay", () => {
  const input = (patch: Partial<BoutDisplayInput> = {}): BoutDisplayInput => ({
    phase: regular,
    roundScores: [{ left: 2, right: 1, doubles: 1 }],
    warnings: { left: 1, right: 0 },
    clock: { seconds: 50, running: true },
    done: false,
    breakElapsedSeconds: 0,
    ...patch,
  });

  it("hides rounds when there are none and counts the clock down", () => {
    expect(boutDisplay(rules({}, { maxDoubles: 1 }), input())).toEqual({
      round: null,
      rounds: null,
      roundsWon: null,
      period: "REGULAR",
      extension: null,
      score: { left: 2, right: 1 },
      doubles: 1,
      maxDoublesReached: true,
      pointCapReached: false,
      warnings: { left: 1, right: 0 },
      remainingSeconds: 130,
      running: true,
      tone: "NORMAL",
    });
  });

  it("flags the point cap", () => {
    expect(boutDisplay(rules({}, { maxPointsCap: 2 }), input()).pointCapReached).toBe(true);
    expect(boutDisplay(rules({}, { maxPointsCap: 3 }), input()).pointCapReached).toBe(false);
    expect(parseRingRules({ maxPointsCap: 7 }).maxPointsCap).toBe(7);
  });

  it("adds the extension time to the countdown", () => {
    const shown = boutDisplay(rules({ extensions: 2, extensionSeconds: 30 }), input({ phase: { round: 1, period: "EXTENSION", extension: 2 }, clock: { seconds: 200, running: true } }));
    expect(shown).toMatchObject({ extension: 2, remainingSeconds: 40, tone: "OVERTIME" });
  });

  it("shows the round, rounds won and the break countdown", () => {
    const shown = boutDisplay(
      rules({ rounds: 3, breakSeconds: 60 }),
      input({ phase: { round: 2, period: "BREAK", extension: 0 }, roundScores: [{ left: 3, right: 0, doubles: 0 }, { left: 0, right: 2, doubles: 0 }], breakElapsedSeconds: 20.5 }),
    );
    expect(shown).toMatchObject({ round: 2, rounds: 3, roundsWon: { left: 1, right: 0 }, score: { left: 0, right: 2 }, remainingSeconds: 40, running: true });
  });

  it("counts the last round once the bout is done", () => {
    const shown = boutDisplay(rules({ rounds: 3 }), input({ phase: { round: 2, period: "REGULAR", extension: 0 }, roundScores: [{ left: 3, right: 0, doubles: 0 }, { left: 2, right: 0, doubles: 0 }], done: true }));
    expect(shown).toMatchObject({ roundsWon: { left: 2, right: 0 }, running: false });
  });
});

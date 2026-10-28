/**
 * Ring-mode rules for a tournament: what the table scores with and how a bout is shaped (rounds, break, overtime).
 * Shared by the backend (which works out what the scoreboard shows) and the table, so both read the rules alike.
 */

export type OvertimeAfter = "EVERY_ROUND" | "LAST_ROUND";

export interface BoutFormat {
  /** Best of N rounds; 1 means no rounds. Every round starts at 0–0. */
  rounds: number;
  /** The pause between rounds. */
  breakSeconds: number;
  /** The clock shows the last-exchange window when this many seconds or fewer remain (0 = off). */
  lastExchangeSeconds: number;
  overtimeAfter: OvertimeAfter;
  /** How many extensions a round may get; each adds `extensionSeconds` to the countdown. */
  extensions: number;
  extensionSeconds: number;
  /** After the extensions, a tied round may go to sudden death: first point wins, no time. */
  suddenDeath: boolean;
}

export interface RingPenalty {
  description: string;
  penalties: number[];
  disqualify: boolean;
}

export interface RingRules {
  maxDurationSeconds: number;
  scores: number[];
  /** 0 = no limit. */
  maxDoubles: number;
  /** A fighter reaching this many points in the round ends it (0 = no cap). */
  maxPointsCap: number;
  penalties: RingPenalty[];
  format: BoutFormat;
}

export const DEFAULT_BOUT_FORMAT: Readonly<BoutFormat> = Object.freeze({
  rounds: 1,
  breakSeconds: 60,
  lastExchangeSeconds: 0,
  overtimeAfter: "LAST_ROUND",
  extensions: 0,
  extensionSeconds: 60,
  suddenDeath: false,
});

/** Sheet tournaments without a ruleset score with these (the ring constants of phase 2). */
export function defaultRingRules(): RingRules {
  return {
    maxDurationSeconds: 180,
    scores: [1, 2, 3],
    maxDoubles: 0,
    maxPointsCap: 0,
    penalties: [
      { description: "Warning", penalties: [0, 1, 2, 3], disqualify: false },
      { description: "Ring out", penalties: [1], disqualify: false },
    ],
    format: { ...DEFAULT_BOUT_FORMAT },
  };
}

function wholeNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/** Reads stored match parameters leniently: anything missing or out of range takes the default. */
export function parseRingRules(raw: unknown): RingRules {
  const rules = defaultRingRules();
  if (typeof raw !== "object" || raw === null) return rules;
  const data = raw as Record<string, unknown>;
  rules.maxDurationSeconds = wholeNumber(data.maxDurationSeconds, 1, 3600) ?? rules.maxDurationSeconds;
  if (Array.isArray(data.scores)) {
    const scores = data.scores.filter((score): score is number => wholeNumber(score, 1, 10) !== undefined);
    if (scores.length > 0) rules.scores = scores;
  }
  rules.maxDoubles = wholeNumber(data.maxDoubles, 0, 99) ?? rules.maxDoubles;
  rules.maxPointsCap = wholeNumber(data.maxPointsCap, 0, 999) ?? rules.maxPointsCap;
  if (Array.isArray(data.penalties)) {
    const penalties = data.penalties.filter(
      (penalty): penalty is RingPenalty =>
        typeof penalty === "object" &&
        penalty !== null &&
        typeof (penalty as RingPenalty).description === "string" &&
        Array.isArray((penalty as RingPenalty).penalties) &&
        (penalty as RingPenalty).penalties.every((points) => wholeNumber(points, 0, 10) !== undefined),
    );
    if (penalties.length > 0) {
      rules.penalties = penalties.map((penalty) => ({ description: penalty.description, penalties: [...penalty.penalties], disqualify: penalty.disqualify === true }));
    }
  }
  // The format may sit in `format` (a stored `RingRules`) or next to the match parameters (a ruleset's matchParameters).
  const source = typeof data.format === "object" && data.format !== null ? (data.format as Record<string, unknown>) : data;
  const format = rules.format;
  format.rounds = wholeNumber(source.rounds, 1, 9) ?? format.rounds;
  format.breakSeconds = wholeNumber(source.breakSeconds, 0, 3600) ?? format.breakSeconds;
  format.lastExchangeSeconds = wholeNumber(source.lastExchangeSeconds, 0, 3600) ?? format.lastExchangeSeconds;
  if (source.overtimeAfter === "EVERY_ROUND" || source.overtimeAfter === "LAST_ROUND") format.overtimeAfter = source.overtimeAfter;
  format.extensions = wholeNumber(source.extensions, 0, 9) ?? format.extensions;
  format.extensionSeconds = wholeNumber(source.extensionSeconds, 1, 3600) ?? format.extensionSeconds;
  if (typeof source.suddenDeath === "boolean") format.suddenDeath = source.suddenDeath;
  return rules;
}

export type BoutPeriod = "REGULAR" | "BREAK" | "EXTENSION" | "SUDDEN_DEATH";
export const BOUT_PERIODS: readonly BoutPeriod[] = ["REGULAR", "BREAK", "EXTENSION", "SUDDEN_DEATH"];

/** Where a bout is: its round (1-based), the period, and how many extensions this round has had. */
export interface BoutPhase {
  round: number;
  period: BoutPeriod;
  extension: number;
}

export interface SideScore {
  left: number;
  right: number;
}

export function roundsToWin(format: BoutFormat): number {
  return Math.floor(format.rounds / 2) + 1;
}

/** The countdown length of the current round: its time plus every extension it got. */
export function roundSeconds(rules: RingRules, extension: number): number {
  return rules.maxDurationSeconds + extension * rules.format.extensionSeconds;
}

function overtimeAllowed(format: BoutFormat, round: number): boolean {
  return format.overtimeAfter === "EVERY_ROUND" || round >= format.rounds;
}

/**
 * Rounds won, from each finished round's score (index 0 = round 1). A tied round goes to nobody.
 * `finishedRounds` is how many rounds count: the rounds before the current one, or all of them once the bout is done.
 */
export function roundsWon(roundScores: readonly SideScore[], finishedRounds: number): SideScore {
  const won = { left: 0, right: 0 };
  roundScores.slice(0, finishedRounds).forEach((score) => {
    if (score.left > score.right) won.left += 1;
    else if (score.right > score.left) won.right += 1;
  });
  return won;
}

/** What the table may do next, at a paused clock. */
export interface NextSteps {
  extension: boolean;
  suddenDeath: boolean;
  /** Ends the round and starts the break (the bout is not decided yet and rounds are left). */
  nextRound: boolean;
  /** In the break: start the next round. */
  startRound: boolean;
}

/**
 * `timeUp`: the round's countdown reached 0. Overtime is only offered at time-up with a tied round; extensions come
 * before sudden death. `won` is the rounds won before this round.
 */
export function nextSteps(rules: RingRules, phase: BoutPhase, roundScore: SideScore, won: SideScore, timeUp: boolean): NextSteps {
  const format = rules.format;
  if (phase.period === "BREAK") return { extension: false, suddenDeath: false, nextRound: false, startRound: true };
  const tied = roundScore.left === roundScore.right;
  const overtime = timeUp && tied && phase.period !== "SUDDEN_DEATH" && overtimeAllowed(format, phase.round);
  const extension = overtime && phase.extension < format.extensions;
  const suddenDeath = overtime && !extension && format.suddenDeath;
  const after = roundsWon([roundScore], 1);
  const need = roundsToWin(format);
  const decided = won.left + after.left >= need || won.right + after.right >= need;
  const nextRound = format.rounds > 1 && phase.round < format.rounds && !decided;
  return { extension, suddenDeath, nextRound, startRound: false };
}

export type ClockTone = "NORMAL" | "LAST_EXCHANGE" | "OVERTIME";

export function clockTone(rules: RingRules, period: BoutPeriod, remainingSeconds: number): ClockTone {
  if (period === "EXTENSION" || period === "SUDDEN_DEATH") return "OVERTIME";
  if (period === "REGULAR" && rules.format.lastExchangeSeconds > 0 && remainingSeconds <= rules.format.lastExchangeSeconds) return "LAST_EXCHANGE";
  return "NORMAL";
}

export interface BoutDisplayInput {
  phase: BoutPhase;
  /** Each round's score so far (index 0 = round 1); doubles are this round's doubles. */
  roundScores: readonly (SideScore & { doubles: number })[];
  warnings: SideScore;
  clock: { seconds: number; running: boolean };
  done: boolean;
  /** Seconds since the break started (only read in a break). */
  breakElapsedSeconds: number;
}

/** What a scoreboard shows for a bout. The scoreboard draws this and works nothing out itself. */
export interface BoutDisplay {
  /** Null when the bout has no rounds. */
  round: number | null;
  rounds: number | null;
  roundsWon: SideScore | null;
  period: BoutPeriod;
  /** Null outside an extension. */
  extension: number | null;
  score: SideScore;
  doubles: number;
  maxDoublesReached: boolean;
  /** A fighter has the round's point cap. */
  pointCapReached: boolean;
  warnings: SideScore;
  /** Countdown seconds left (the break's in a break; 0 in sudden death). */
  remainingSeconds: number;
  running: boolean;
  tone: ClockTone;
}

export function boutDisplay(rules: RingRules, input: BoutDisplayInput): BoutDisplay {
  const { phase } = input;
  const hasRounds = rules.format.rounds > 1;
  const current = input.roundScores[phase.round - 1] ?? { left: 0, right: 0, doubles: 0 };
  const finished = input.done ? phase.round : phase.round - 1;
  let remaining: number;
  let running = input.clock.running;
  if (phase.period === "BREAK") {
    remaining = Math.max(0, rules.format.breakSeconds - Math.floor(input.breakElapsedSeconds));
    running = remaining > 0;
  } else if (phase.period === "SUDDEN_DEATH") {
    remaining = 0;
  } else {
    remaining = Math.max(0, roundSeconds(rules, phase.extension) - input.clock.seconds);
  }
  return {
    round: hasRounds ? phase.round : null,
    rounds: hasRounds ? rules.format.rounds : null,
    roundsWon: hasRounds ? roundsWon(input.roundScores, finished) : null,
    period: phase.period,
    extension: phase.period === "EXTENSION" ? phase.extension : null,
    score: { left: current.left, right: current.right },
    doubles: current.doubles,
    maxDoublesReached: rules.maxDoubles > 0 && current.doubles >= rules.maxDoubles,
    pointCapReached: rules.maxPointsCap > 0 && Math.max(current.left, current.right) >= rules.maxPointsCap,
    warnings: { left: input.warnings.left, right: input.warnings.right },
    remainingSeconds: remaining,
    running: input.done ? false : running,
    tone: clockTone(rules, phase.period, remaining),
  };
}

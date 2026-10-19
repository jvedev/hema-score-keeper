import { ensureObject, HttpError, requireString } from "../http.js";

export type ExchangeKind = "SCORE" | "DOUBLE" | "WARNING" | "TIME";

export interface ExchangeInput {
  atSeconds: number;
  kind: ExchangeKind;
  side: "A" | "B" | null;
  points: number;
  reason: string | null;
}

/** The scored result of a bout: what a correction replaces. */
export interface BoutResultInput {
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  warningsA: number;
  warningsB: number;
  exchanges: ExchangeInput[];
}

export interface BoutInput extends BoutResultInput {
  fighterAUserId: string;
  fighterBUserId: string;
  refereeUserId: string;
  juryUserIds: string[];
  tableUserId: string | null;
  ring: string | null;
  startedAt: string;
  startedInCompetitionId: string | null;
}

const EXCHANGE_KINDS: readonly ExchangeKind[] = ["SCORE", "DOUBLE", "WARNING", "TIME"];
const MAX_JURY = 4;
/** A bout is recorded right after it's fought; anything older would rewrite the rating history. */
export const MAX_RECORDING_DELAY_MS = 24 * 60 * 60 * 1000;
/** Allowed difference between the scorer's clock and the server's. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function parseBoutInput(body: unknown, now: Date): BoutInput {
  const input = ensureObject(body, "Bout");
  const fighterAUserId = requireString(input.fighterAUserId, "Fighter A");
  const fighterBUserId = requireString(input.fighterBUserId, "Fighter B");
  const refereeUserId = requireString(input.refereeUserId, "Referee");
  const juryUserIds = parseJury(input.juryUserIds);
  const tableUserId = optionalString(input.tableUserId, "Table official");

  if (fighterAUserId === fighterBUserId) {
    throw new HttpError(400, "A bout needs two different fighters.");
  }
  const fighters = new Set([fighterAUserId, fighterBUserId]);
  if (fighters.has(refereeUserId)) {
    throw new HttpError(400, "The referee can't be one of the fighters.");
  }
  if (juryUserIds.some((userId) => fighters.has(userId) || userId === refereeUserId)) {
    throw new HttpError(400, "Jury members can't be a fighter or the referee.");
  }
  if (tableUserId !== null && (fighters.has(tableUserId) || tableUserId === refereeUserId || juryUserIds.includes(tableUserId))) {
    throw new HttpError(400, "The table official can't be a fighter, the referee or on the jury.");
  }

  const startedAt = requireString(input.startedAt, "Start time");
  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    throw new HttpError(400, "Start time must be an ISO date and time.");
  }
  if (startedAtMs > now.getTime() + MAX_CLOCK_SKEW_MS) {
    throw new HttpError(400, "Start time is in the future.");
  }
  if (startedAtMs < now.getTime() - MAX_RECORDING_DELAY_MS) {
    throw new HttpError(400, "Bouts must be recorded within a day of being fought.");
  }

  return {
    fighterAUserId,
    fighterBUserId,
    refereeUserId,
    juryUserIds,
    tableUserId,
    ring: optionalString(input.ring, "Ring"),
    startedAt: new Date(startedAt).toISOString(),
    startedInCompetitionId: optionalString(input.startedInCompetitionId, "Start competition"),
    ...parseBoutResult(input),
  };
}

export function parseBoutResult(body: unknown): BoutResultInput {
  const input = ensureObject(body, "Result");
  const scoreA = requireCount(input.scoreA, "Score A");
  const scoreB = requireCount(input.scoreB, "Score B");
  const winnerSide = input.winnerSide === null || input.winnerSide === undefined ? null : requireSide(input.winnerSide, "Winner");
  if (winnerSide === null && scoreA !== scoreB) {
    throw new HttpError(400, "A draw needs equal scores.");
  }
  if ((winnerSide === "A" && scoreA < scoreB) || (winnerSide === "B" && scoreB < scoreA)) {
    throw new HttpError(400, "The winner can't have the lower score.");
  }
  return {
    scoreA,
    scoreB,
    winnerSide,
    warningsA: input.warningsA === undefined ? 0 : requireCount(input.warningsA, "Warnings A"),
    warningsB: input.warningsB === undefined ? 0 : requireCount(input.warningsB, "Warnings B"),
    exchanges: parseExchanges(input.exchanges),
  };
}

function parseJury(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "Jury must be a list of users.");
  }
  const jury = value.map((userId, index) => requireString(userId, `Jury member ${index + 1}`));
  if (jury.length > MAX_JURY) {
    throw new HttpError(400, `A bout has at most ${MAX_JURY} jury members.`);
  }
  if (new Set(jury).size !== jury.length) {
    throw new HttpError(400, "Each jury member can only sit once.");
  }
  return jury;
}

function parseExchanges(value: unknown): ExchangeInput[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "Exchanges must be a list.");
  }
  return value.map((raw, index) => {
    const label = `Exchange ${index + 1}`;
    const exchange = ensureObject(raw, label);
    const kind = requireString(exchange.kind, `${label} kind`);
    if (!EXCHANGE_KINDS.includes(kind as ExchangeKind)) {
      throw new HttpError(400, `${label} kind must be one of ${EXCHANGE_KINDS.join(", ")}.`);
    }
    return {
      atSeconds: requireCount(exchange.atSeconds, `${label} time`),
      kind: kind as ExchangeKind,
      side: exchange.side === null || exchange.side === undefined ? null : requireSide(exchange.side, `${label} side`),
      points: exchange.points === undefined ? 0 : requireCount(exchange.points, `${label} points`),
      reason: optionalString(exchange.reason, `${label} reason`),
    };
  });
}

function requireCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${label} must be a whole number of 0 or more.`);
  }
  return value;
}

function requireSide(value: unknown, label: string): "A" | "B" {
  if (value !== "A" && value !== "B") {
    throw new HttpError(400, `${label} must be A or B.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  return value === undefined || value === null ? null : requireString(value, label);
}

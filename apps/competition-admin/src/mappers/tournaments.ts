import type { RingRules } from "@hema/competition-domain";
import type { ImportReport, LiveRingLink, SyncTarget } from "../api-types";
import type { Translate } from "./translate";

/** The link a score keeper opens (or scans) to get a ring: the score-keeper app's ring page. */
export function ringLink(scoreKeeperUrl: string, token: string): string {
  return `${scoreKeeperUrl.replace(/\/+$/, "")}/ring/${encodeURIComponent(token)}`;
}

/** The spreadsheet id from the box: an id as typed, or the id inside a pasted Google Sheets link. Nothing when empty. */
export function parseSpreadsheetId(input: string): string | undefined {
  const text = input.trim();
  if (text === "") {
    return undefined;
  }
  return /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? text;
}

/** "updated 12 s ago", from the last success; never negative (a slightly fast clock reads as 0 s). */
export function elapsedLabel(lastSuccessAt: string | null, nowMs: number, translate: Translate): string {
  const at = lastSuccessAt === null ? Number.NaN : Date.parse(lastSuccessAt);
  if (Number.isNaN(at)) {
    return translate("tournaments.updatedNever");
  }
  const seconds = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (seconds < 60) {
    return translate("tournaments.updatedSeconds", { n: seconds });
  }
  if (seconds < 3600) {
    return translate("tournaments.updatedMinutes", { n: Math.floor(seconds / 60) });
  }
  return translate("tournaments.updatedHours", { n: Math.floor(seconds / 3600) });
}

export interface SyncCardView {
  title: string;
  state: SyncTarget["state"];
  stateLabel: string;
  tone: "ok" | "warn" | "error";
  updated: string;
  counts: string[];
  /** The server's message, raw: escape it when it goes into HTML. */
  error: string | null;
}

const count = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

/** One card per sync target: its state, how fresh it is, what is waiting or failed, and any current error. */
export function toSyncCards(targets: readonly SyncTarget[], nowMs: number, translate: Translate): SyncCardView[] {
  return targets.map((target) => {
    const pending = count(target.pending);
    const failed = count(target.failed);
    const counts: string[] = [];
    if (pending > 0) {
      counts.push(translate("tournaments.pending", { n: pending }));
    }
    if (failed > 0) {
      counts.push(translate("tournaments.failed", { n: failed }));
    }
    return {
      title: translate(`tournaments.sync.${target.target === "GOOGLE" ? "GOOGLE" : "LOCAL"}`),
      state: target.state,
      stateLabel: translate(`tournaments.state.${target.state}`),
      tone: target.state === "OK" ? "ok" : target.state === "ERROR" ? "error" : "warn",
      updated: elapsedLabel(target.lastSuccessAt, nowMs, translate),
      counts,
      error: target.state === "ERROR" ? target.lastError : null,
    };
  });
}

export interface ImportReportView {
  summary: string;
  skipped: string[];
  errors: string[];
  hasProblems: boolean;
}

/** The import result as text: the counts, the skipped bouts (with the reason) and the rows that failed. Text is raw, not HTML. */
export function toImportReportView(report: ImportReport, translate: Translate): ImportReportView {
  const skipped = (report.skipped ?? []).map((item) => translate(`tournaments.skipReason.${item.reason}`, { label: String(item.label) }));
  const errors = (report.errors ?? []).map((item) => translate("tournaments.reportRow", { row: count(item.row), message: String(item.message) }));
  return {
    summary: translate("tournaments.report", { added: count(report.added), updated: count(report.updated), skipped: skipped.length, errors: errors.length }),
    skipped,
    errors,
    hasProblems: skipped.length > 0 || errors.length > 0,
  };
}

/** "Make a new link" always asks; when a phone is scoring the ring, it says who will be stopped. */
export function rotateConfirmMessage(ring: LiveRingLink, translate: Translate): string {
  return ring.activeKeeper
    ? translate("tournaments.newLinkConfirmKeeper", { name: ring.activeKeeper.userName, ring: ring.name })
    : translate("tournaments.newLinkConfirm", { ring: ring.name });
}

export interface RingCardView {
  id: string;
  name: string;
  link: string;
  /** The ring's view-only scoreboard page. */
  scoreboardLink: string;
  leftColor: string;
  rightColor: string;
  keeper: string;
  kept: boolean;
}

export function toRingCards(rings: readonly LiveRingLink[], scoreKeeperUrl: string, translate: Translate): RingCardView[] {
  return rings.map((ring) => ({
    id: ring.id,
    name: ring.name,
    link: ringLink(scoreKeeperUrl, ring.keeperToken),
    scoreboardLink: scoreboardLink(scoreKeeperUrl, ring.scoreboardToken),
    leftColor: ring.leftColor,
    rightColor: ring.rightColor,
    keeper: ring.activeKeeper ? translate("tournaments.keeping", { name: ring.activeKeeper.userName }) : translate("tournaments.notKept"),
    kept: ring.activeKeeper !== null,
  }));
}

/** The link a ring's scoreboard monitor opens: view only, no sign-in. */
export function scoreboardLink(scoreKeeperUrl: string, token: string): string {
  return `${scoreKeeperUrl.replace(/\/+$/, "")}/scoreboard/${encodeURIComponent(token)}`;
}

/** The ring to confirm a new link for, taken from freshly loaded rings (null when it no longer exists). */
export function rotateTarget(freshRings: readonly LiveRingLink[], ringId: string): LiveRingLink | null {
  return freshRings.find((ring) => ring.id === ringId) ?? null;
}

/**
 * The ring-rules form back into rules. Fields left empty or not a whole number keep the current value; the backend
 * checks the ranges again.
 */
export function rulesFromForm(form: FormData, current: RingRules): RingRules {
  const whole = (name: string, fallback: number): number => {
    const value = Number(String(form.get(name) ?? "").trim());
    return String(form.get(name) ?? "").trim() !== "" && Number.isInteger(value) && value >= 0 ? value : fallback;
  };
  const scores = String(form.get("scores") ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const overtimeAfter = form.get("overtimeAfter") === "EVERY_ROUND" ? "EVERY_ROUND" : "LAST_ROUND";
  return {
    ...current,
    maxDurationSeconds: whole("maxDurationSeconds", current.maxDurationSeconds),
    scores: scores.length > 0 ? scores : current.scores,
    maxDoubles: whole("maxDoubles", current.maxDoubles),
    maxPointsCap: whole("maxPointsCap", current.maxPointsCap),
    format: {
      rounds: whole("rounds", current.format.rounds),
      breakSeconds: whole("breakSeconds", current.format.breakSeconds),
      lastExchangeSeconds: whole("lastExchangeSeconds", current.format.lastExchangeSeconds),
      overtimeAfter,
      extensions: whole("extensions", current.format.extensions),
      extensionSeconds: whole("extensionSeconds", current.format.extensionSeconds),
      suddenDeath: form.get("suddenDeath") === "on",
    },
  };
}

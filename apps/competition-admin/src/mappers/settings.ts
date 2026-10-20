import { readinessChecklist, transitionCompetition, type CompetitionAction } from "@hema/competition-domain";
import type { LifecycleStatus } from "../api-types";

const ACTIONS: readonly CompetitionAction[] = ["OPEN_REGISTRATION", "START", "CLOSE", "REOPEN", "ARCHIVE"];
const READY = readinessChecklist({ rulesetVersionId: "inline", hasScope: true, startDate: "set" });

/** The lifecycle steps the competition can take from here (readiness is checked by the server). */
export function allowedActions(status: LifecycleStatus): CompetitionAction[] {
  return ACTIONS.filter((action) => {
    try {
      transitionCompetition(status, action, READY);
      return true;
    } catch {
      return false;
    }
  });
}

/** The ruleset is fixed once the competition is running. */
export function rulesetEditable(status: LifecycleStatus): boolean {
  return status === "DRAFT" || status === "REGISTRATION_OPEN";
}

export interface ParametersForm {
  minutes: number;
  maxPointsCap: number;
  pointSpreadVictory: number;
  /** Comma list of the point values a hit can score. */
  scores: string;
  maxDoubles: number;
  allowAfterBlow: boolean;
  countDoubles: boolean;
  useNetScore: boolean;
}

interface RulesetLike {
  matchParameters?: Record<string, unknown>;
  [key: string]: unknown;
}

const DEFAULTS = {
  maxDurationSeconds: 180,
  stopOnTimeOut: true,
  maxPointsCap: 10,
  pointSpreadVictory: 5,
  scores: [1, 2, 3, 4],
  maxDoubles: 3,
  allowAfterBlow: true,
  countDoubles: true,
  useNetScore: true,
  penalties: [],
};

export function parametersToForm(ruleset: unknown): ParametersForm {
  // A stored ruleset is only JSON: take numbers and booleans only, so nothing else reaches the page.
  const raw = ((ruleset as RulesetLike | null)?.matchParameters ?? {}) as Record<string, unknown>;
  const number = (key: keyof typeof DEFAULTS) => (typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : (DEFAULTS[key] as number));
  const flag = (key: keyof typeof DEFAULTS) => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : (DEFAULTS[key] as boolean));
  const scores = Array.isArray(raw.scores) ? raw.scores.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : DEFAULTS.scores;
  return {
    minutes: Math.round(number("maxDurationSeconds") / 60),
    maxPointsCap: number("maxPointsCap"),
    pointSpreadVictory: number("pointSpreadVictory"),
    scores: scores.join(", "),
    maxDoubles: number("maxDoubles"),
    allowAfterBlow: flag("allowAfterBlow"),
    countDoubles: flag("countDoubles"),
    useNetScore: flag("useNetScore"),
  };
}

/** Writes the form back into the ruleset, keeping everything the form doesn't show (penalties, weapon class…). */
export function formToParameters(ruleset: unknown, form: ParametersForm): RulesetLike {
  const base = (ruleset as RulesetLike | null) ?? { weaponClass: "" };
  return {
    ...base,
    matchParameters: {
      ...DEFAULTS,
      ...(base.matchParameters ?? {}),
      maxDurationSeconds: form.minutes * 60,
      maxPointsCap: form.maxPointsCap,
      pointSpreadVictory: form.pointSpreadVictory,
      scores: form.scores
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0),
      maxDoubles: form.maxDoubles,
      allowAfterBlow: form.allowAfterBlow,
      countDoubles: form.countDoubles,
      useNetScore: form.useNetScore,
    },
  };
}

/** Owners and system admins manage co-admins; a co-admin can only leave. */
export function adminCapabilities(role: "OWNER" | "CO_ADMIN" | "SYSTEM_ADMIN"): { manage: boolean; leave: boolean } {
  return role === "CO_ADMIN" ? { manage: false, leave: true } : { manage: true, leave: false };
}

export function parseScopeValues(text: string): string[] {
  return text
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

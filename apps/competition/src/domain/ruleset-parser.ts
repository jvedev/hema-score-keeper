import type { MatchParameters, PenaltyRule, RuleSet } from "@hema/match-engine";

export interface RuleSetFallbackIdentity {
  id: string;
  name: string;
}

export function parseRuleSet(fallback: RuleSetFallbackIdentity, raw: unknown): RuleSet {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("The competition's ruleset is missing or malformed.");
  }
  const data = raw as Record<string, unknown>;

  if (typeof data.weaponClass !== "string") {
    throw new Error('The competition\'s ruleset is missing a "weaponClass" field.');
  }

  return {
    id: typeof data.id === "string" ? data.id : fallback.id,
    name: typeof data.name === "string" ? data.name : `${fallback.name} ruleset`,
    version: typeof data.version === "string" ? data.version : "1.0",
    weaponClass: data.weaponClass,
    matchParameters: parseMatchParameters(data.matchParameters),
  };
}

function parseMatchParameters(raw: unknown): MatchParameters {
  if (typeof raw !== "object" || raw === null) {
    throw new Error('The competition\'s ruleset is missing "matchParameters".');
  }
  const data = raw as Record<string, unknown>;

  requireNumber(data, "maxDurationSeconds");
  requireBoolean(data, "stopOnTimeOut");
  requireNumber(data, "maxPointsCap");
  requireNumber(data, "pointSpreadVictory");
  requireNumberArray(data, "scores");
  requireNumber(data, "maxDoubles");
  requireBoolean(data, "allowAfterBlow");
  requireBoolean(data, "countDoubles");
  requireBoolean(data, "useNetScore");

  return {
    maxDurationSeconds: data.maxDurationSeconds as number,
    stopOnTimeOut: data.stopOnTimeOut as boolean,
    maxPointsCap: data.maxPointsCap as number,
    pointSpreadVictory: data.pointSpreadVictory as number,
    scores: data.scores as number[],
    maxDoubles: data.maxDoubles as number,
    allowAfterBlow: data.allowAfterBlow as boolean,
    countDoubles: data.countDoubles as boolean,
    useNetScore: data.useNetScore as boolean,
    penalties: parsePenalties(data.penalties),
  };
}

function parsePenalties(raw: unknown): PenaltyRule[] {
  if (!Array.isArray(raw)) {
    throw new Error('The competition\'s ruleset "matchParameters.penalties" must be an array.');
  }
  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`The competition's ruleset penalty at index ${index} is malformed.`);
    }
    const data = entry as Record<string, unknown>;
    requireString(data, "description", `penalties[${index}]`);
    requireNumberArray(data, "penalties", `penalties[${index}]`);
    requireBoolean(data, "disqualify", `penalties[${index}]`);
    return {
      description: data.description as string,
      penalties: data.penalties as number[],
      disqualify: data.disqualify as boolean,
    };
  });
}

function requireNumber(data: Record<string, unknown>, key: string, context = "matchParameters"): void {
  if (typeof data[key] !== "number") {
    throw new Error(`The competition's ruleset "${context}.${key}" must be a number.`);
  }
}

function requireBoolean(data: Record<string, unknown>, key: string, context = "matchParameters"): void {
  if (typeof data[key] !== "boolean") {
    throw new Error(`The competition's ruleset "${context}.${key}" must be a boolean.`);
  }
}

function requireString(data: Record<string, unknown>, key: string, context = "matchParameters"): void {
  if (typeof data[key] !== "string") {
    throw new Error(`The competition's ruleset "${context}.${key}" must be a string.`);
  }
}

function requireNumberArray(data: Record<string, unknown>, key: string, context = "matchParameters"): void {
  const value = data[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "number")) {
    throw new Error(`The competition's ruleset "${context}.${key}" must be an array of numbers.`);
  }
}

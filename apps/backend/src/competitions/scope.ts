import type { ScopeKind } from "@hema/competition-domain";
import { ensureObject, HttpError, requireString } from "../http.js";

export interface CompetitionScope {
  kind: ScopeKind;
  values: string[];
}

const SCOPE_KINDS: readonly ScopeKind[] = ["CLUB", "CLUBS", "AREA", "COUNTRY", "OPEN"];

export function parseScope(input: unknown): CompetitionScope {
  const body = ensureObject(input, "Scope");
  const kind = requireString(body.kind, "Scope kind");
  if (!SCOPE_KINDS.includes(kind as ScopeKind)) {
    throw new HttpError(400, `Scope kind must be one of ${SCOPE_KINDS.join(", ")}.`);
  }
  const rawValues = body.values ?? [];
  if (!Array.isArray(rawValues)) {
    throw new HttpError(400, "Scope values must be a list.");
  }
  const values = rawValues.map((value, index) => requireString(value, `Scope value ${index + 1}`));
  return { kind: kind as ScopeKind, values: kind === "OPEN" ? [] : values };
}

/** Open competitions need nothing more; every other scope needs at least one club, area or country. */
export function hasScope(scope: CompetitionScope): boolean {
  return scope.kind === "OPEN" || scope.values.length > 0;
}

export function scopeFromRow(row: { scopeKind: string; scopeValuesJson: string }): CompetitionScope {
  return { kind: row.scopeKind as ScopeKind, values: JSON.parse(row.scopeValuesJson) as string[] };
}

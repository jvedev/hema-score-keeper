export type ScopeKind = "CLUB" | "CLUBS" | "AREA" | "COUNTRY" | "OPEN";

export interface CompetitionScopeInput {
  kind: ScopeKind;
  values: readonly string[];
}

/** The club fields a scope check needs; matches the backend Club row (area/countryCode are optional there). */
export interface ScopeClub {
  id: string;
  slug: string;
  area: string | null;
  countryCode: string | null;
}

function normalise(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Whether someone from `club` (null when they have none) may sign up for a competition with this scope. */
export function scopeAllows(scope: CompetitionScopeInput, club: ScopeClub | null): boolean {
  if (scope.kind === "OPEN") return true;
  if (!club) return false;

  switch (scope.kind) {
    case "CLUB":
    case "CLUBS":
      return scope.values.some((value) => value === club.id || value === club.slug);
    case "AREA":
    case "COUNTRY": {
      const own = normalise(scope.kind === "AREA" ? club.area : club.countryCode);
      return own !== "" && scope.values.some((value) => normalise(value) === own);
    }
  }
}

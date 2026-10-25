import { describe, expect, it } from "vitest";
import { scopeAllows, type ScopeClub } from "./competition-scope";

const club: ScopeClub = { id: "club-1", slug: "amsterdam-hema", area: "Noord-Holland", countryCode: "NL" };

describe("scopeAllows", () => {
  it("lets everyone in on OPEN, with or without a club", () => {
    expect(scopeAllows({ kind: "OPEN", values: [] }, club)).toBe(true);
    expect(scopeAllows({ kind: "OPEN", values: [] }, null)).toBe(true);
  });

  it.each(["CLUB", "CLUBS", "AREA", "COUNTRY"] as const)("rejects a user without a club for %s", (kind) => {
    expect(scopeAllows({ kind, values: ["club-1", "NL", "Noord-Holland"] }, null)).toBe(false);
  });

  it.each(["CLUB", "CLUBS"] as const)("matches the club id or slug for %s", (kind) => {
    expect(scopeAllows({ kind, values: ["club-1"] }, club)).toBe(true);
    expect(scopeAllows({ kind, values: ["other", "amsterdam-hema"] }, club)).toBe(true);
    expect(scopeAllows({ kind, values: ["other"] }, club)).toBe(false);
    expect(scopeAllows({ kind, values: [] }, club)).toBe(false);
  });

  it("matches the club area case-insensitively and trimmed", () => {
    expect(scopeAllows({ kind: "AREA", values: ["  noord-holland "] }, club)).toBe(true);
    expect(scopeAllows({ kind: "AREA", values: ["Zuid-Holland"] }, club)).toBe(false);
    expect(scopeAllows({ kind: "AREA", values: ["Noord-Holland"] }, { ...club, area: " NOORD-HOLLAND" })).toBe(true);
  });

  it("does not match an area scope when the club has no area", () => {
    expect(scopeAllows({ kind: "AREA", values: ["", "Noord-Holland"] }, { ...club, area: null })).toBe(false);
    expect(scopeAllows({ kind: "AREA", values: [""] }, { ...club, area: "  " })).toBe(false);
  });

  it("matches the country code case-insensitively", () => {
    expect(scopeAllows({ kind: "COUNTRY", values: ["nl"] }, club)).toBe(true);
    expect(scopeAllows({ kind: "COUNTRY", values: ["BE"] }, club)).toBe(false);
    expect(scopeAllows({ kind: "COUNTRY", values: ["NL"] }, { ...club, countryCode: null })).toBe(false);
  });
});

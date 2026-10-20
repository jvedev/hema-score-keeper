import { describe, expect, it } from "vitest";
import { href, parseRoute, type Route } from "./router";

const cases: Array<[string, Route]> = [
  ["/needs-you", { name: "needs-you" }],
  ["/competitions", { name: "competitions" }],
  ["/competitions/c1", { name: "competition", competitionId: "c1" }],
  ["/competitions/c1/fighters/p1", { name: "fighter", competitionId: "c1", participantId: "p1" }],
  ["/competitions/c1/bouts/b1", { name: "bout", competitionId: "c1", boutId: "b1" }],
  ["/competitions/c1/settings", { name: "settings", competitionId: "c1" }],
  ["/objections/b1", { name: "objection", boutId: "b1" }],
];

describe("router", () => {
  it.each(cases)("parses %s", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });

  it.each(cases)("writes %s back", (path, route) => {
    expect(href(route)).toBe(path);
  });

  it("ignores a trailing slash", () => {
    expect(parseRoute("/competitions/c1/")).toEqual({ name: "competition", competitionId: "c1" });
  });

  it("encodes ids", () => {
    expect(href({ name: "competition", competitionId: "a b/c" })).toBe("/competitions/a%20b%2Fc");
    expect(parseRoute("/competitions/a%20b%2Fc")).toEqual({ name: "competition", competitionId: "a b/c" });
  });

  it("sends anything unknown to the start", () => {
    expect(parseRoute("/nonsense/here")).toEqual({ name: "start" });
    expect(parseRoute("/")).toEqual({ name: "start" });
  });
});

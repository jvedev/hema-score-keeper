import { describe, expect, it } from "vitest";
import { href, navItemFor, parseRoute, type Route } from "./router";

const BASE = "/hema-score-keeper/competition/";

const cases: Array<[string, Route]> = [
  ["/hema-score-keeper/competition/", { name: "home" }],
  ["/hema-score-keeper/competition/competitions", { name: "competitions" }],
  ["/hema-score-keeper/competition/competitions/c1", { name: "competition", competitionId: "c1" }],
  ["/hema-score-keeper/competition/competitions/c1/standings", { name: "standings", competitionId: "c1" }],
  ["/hema-score-keeper/competition/competitions/c1/fighters/p1", { name: "fighter", competitionId: "c1", participantId: "p1" }],
  ["/hema-score-keeper/competition/competitions/c1/bouts/b1", { name: "bout", competitionId: "c1", boutId: "b1" }],
  ["/hema-score-keeper/competition/profile", { name: "profile" }],
  ["/hema-score-keeper/competition/join/AbC123", { name: "join", code: "AbC123" }],
];

describe("router", () => {
  it.each(cases)("parses %s", (path, route) => {
    expect(parseRoute(path, BASE)).toEqual(route);
  });

  it.each(cases)("writes %s back", (path, route) => {
    expect(href(route, BASE)).toBe(path);
  });

  it("works without a base too", () => {
    expect(parseRoute("/join/x", "/")).toEqual({ name: "join", code: "x" });
    expect(href({ name: "profile" }, "/")).toBe("/profile");
    expect(href({ name: "home" }, "/")).toBe("/");
  });

  it("accepts the base without its trailing slash", () => {
    expect(parseRoute("/hema-score-keeper/competition", BASE)).toEqual({ name: "home" });
  });

  it("ignores a trailing slash", () => {
    expect(parseRoute("/hema-score-keeper/competition/join/abc/", BASE)).toEqual({ name: "join", code: "abc" });
  });

  it("encodes ids and codes", () => {
    expect(href({ name: "competition", competitionId: "a b/c" }, BASE)).toBe("/hema-score-keeper/competition/competitions/a%20b%2Fc");
    expect(parseRoute("/hema-score-keeper/competition/competitions/a%20b%2Fc", BASE)).toEqual({ name: "competition", competitionId: "a b/c" });
    expect(parseRoute("/hema-score-keeper/competition/join/a%2Fb", BASE)).toEqual({ name: "join", code: "a/b" });
  });

  it("sends anything unknown home", () => {
    expect(parseRoute("/hema-score-keeper/competition/nonsense/here", BASE)).toEqual({ name: "home" });
    expect(parseRoute("/hema-score-keeper/competition/join", BASE)).toEqual({ name: "home" });
    expect(parseRoute("/hema-score-keeper/competition/competitions/c1/fighters", BASE)).toEqual({ name: "home" });
    expect(parseRoute("/hema-score-keeper/competition/competitions/c1/bouts/b1/extra", BASE)).toEqual({ name: "home" });
    expect(parseRoute("/somewhere-else/join/abc", BASE)).toEqual({ name: "home" });
  });

  it("survives a broken escape", () => {
    expect(parseRoute("/hema-score-keeper/competition/join/%E0%A4%A", BASE)).toEqual({ name: "home" });
  });
});

describe("navItemFor", () => {
  it("lights up the tab each page belongs to", () => {
    expect(navItemFor({ name: "home" })).toBe("home");
    expect(navItemFor({ name: "competitions" })).toBe("competitions");
    expect(navItemFor({ name: "competition", competitionId: "c1" })).toBe("competitions");
    expect(navItemFor({ name: "standings", competitionId: "c1" })).toBe("competitions");
    expect(navItemFor({ name: "fighter", competitionId: "c1", participantId: "p1" })).toBe("competitions");
    expect(navItemFor({ name: "bout", competitionId: "c1", boutId: "b1" })).toBe("competitions");
    expect(navItemFor({ name: "join", code: "abc" })).toBe("competitions");
    expect(navItemFor({ name: "profile" })).toBe("profile");
  });
});

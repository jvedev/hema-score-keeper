import { describe, expect, it } from "vitest";
import { boutRowText, loadRetryText } from "./ring-texts";

const fake = (key: string, params: Record<string, string | number> = {}) => `${key}${Object.keys(params).length ? JSON.stringify(params) : ""}`;

describe("ring screen texts", () => {
  // Phase-2 e2e Dutch pass: the bout rows said "Ronald vs Diego" and "1 dubbels".
  it("bout rows use the translated 'vs' and a singular for one double", () => {
    expect(boutRowText(1, fake)).toEqual({ vs: "ring.vs", doubles: "ring.doublesOne" });
    expect(boutRowText(2, fake)).toEqual({ vs: "ring.vs", doubles: 'ring.doubles{"count":2}' });
    expect(boutRowText(0, fake).doubles).toBe("");
  });

  it("an unreachable server says it is retrying, with the unsent count only when something is queued", () => {
    expect(loadRetryText(0, fake)).toBe("ring.retrying");
    expect(loadRetryText(3, fake)).toBe('ring.retrying · ring.notSent{"count":3}');
  });
});

import { describe, expect, it } from "vitest";
import type { BoutView } from "../api-types";
import { actionDoneMessage, availableActions, objectionReason } from "./bout-actions";

const translate = (key: string) => key;

const now = Date.parse("2026-10-21T12:00:00.000Z");

function view(overrides: Partial<BoutView>): BoutView {
  return {
    id: "b1",
    status: "COUNTED",
    startedAt: "2026-10-20T12:00:00.000Z",
    ring: null,
    fighterA: { userId: "u1", name: "Eva" },
    fighterB: { userId: "u2", name: "Kees" },
    referee: { userId: "u3", name: "Ref" },
    jury: [],
    table: [],
    scoreA: 5,
    scoreB: 3,
    winnerSide: "A",
    warningsA: 0,
    warningsB: 0,
    exchanges: [],
    windowEndsAt: "2026-10-23T12:00:00.000Z",
    fighterApproved: { A: false, B: true },
    objection: null,
    voidReason: null,
    competitionIds: ["X"],
    ...overrides,
  };
}

describe("bout actions", () => {
  it("lets a fighter approve or object while the bout is in its three days and they haven't approved", () => {
    expect(availableActions(view({}), "u1", now)).toEqual(["approve", "object"]);
    expect(availableActions(view({}), "u2", now)).toEqual([]);
  });

  it("offers nothing once the three days are over", () => {
    expect(availableActions(view({ windowEndsAt: "2026-10-21T11:59:59.000Z" }), "u1", now)).toEqual([]);
  });

  it("lets the objecting fighter withdraw, and nobody else", () => {
    const objected = view({ status: "OBJECTED", objection: { by: "B", at: "2026-10-21T10:00:00.000Z", reason: null } });
    expect(availableActions(objected, "u2", now)).toEqual(["withdraw"]);
    expect(availableActions(objected, "u1", now)).toEqual([]);
  });

  it("lets the referee approve a scored bout", () => {
    const scored = view({ status: "SCORED", windowEndsAt: null, fighterApproved: { A: false, B: false } });
    expect(availableActions(scored, "u3", now)).toEqual(["referee-approve"]);
    expect(availableActions(scored, "u1", now)).toEqual([]);
  });

  it("offers nothing on a final or voided bout, or to an outsider", () => {
    expect(availableActions(view({ status: "FINAL" }), "u1", now)).toEqual([]);
    expect(availableActions(view({ status: "VOIDED" }), "u1", now)).toEqual([]);
    expect(availableActions(view({}), "u9", now)).toEqual([]);
  });

  it("needs a reason to object", () => {
    expect(objectionReason("  It was a double  ")).toBe("It was a double");
    expect(objectionReason("   ")).toBeNull();
  });

  it("says what was done", () => {
    expect(actionDoneMessage("approve", translate)).toBe("app.boutApproved");
    expect(actionDoneMessage("object", translate)).toBe("app.objectionSent");
    expect(actionDoneMessage("withdraw", translate)).toBe("app.objectionWithdrawn");
    expect(actionDoneMessage("referee-approve", translate)).toBe("app.refereeApproved");
  });
});

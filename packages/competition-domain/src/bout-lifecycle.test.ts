import { describe, expect, it } from "vitest";
import {
  approveByFighter,
  approveByReferee,
  boutCounts,
  BoutTransitionError,
  createScoredBout,
  objectToBout,
  OBJECTION_WINDOW_MS,
  resolveObjection,
  settleBout,
  voidBout,
  withdrawObjection,
  type BoutLifecycle,
} from "./bout-lifecycle";

const t0 = new Date("2026-10-15T20:40:00Z");
const at = (ms: number): Date => new Date(t0.getTime() + ms);
const noneOnSpot = { A: false, B: false };

function counted(): BoutLifecycle {
  return approveByReferee(createScoredBout(), t0, noneOnSpot);
}

function objected(): BoutLifecycle {
  return objectToBout(counted(), "A", at(1000));
}

function expectError(fn: () => unknown, code: BoutTransitionError["code"]): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BoutTransitionError);
    expect((error as BoutTransitionError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("createScoredBout", () => {
  it("starts scored, revision 1, without approvals or window", () => {
    expect(createScoredBout()).toEqual({
      status: "SCORED",
      revision: 1,
      windowStartedAt: null,
      fighterApproved: { A: false, B: false },
      objection: null,
      voidReason: null,
    });
  });

  it("doesn't count before the referee approves", () => {
    expect(boutCounts(createScoredBout())).toBe(false);
  });
});

describe("approveByReferee", () => {
  it("counts the bout and opens the objection window", () => {
    const bout = counted();
    expect(bout.status).toBe("COUNTED");
    expect(bout.windowStartedAt).toBe(t0.toISOString());
    expect(boutCounts(bout)).toBe(true);
  });

  it("makes the bout final when both fighters approve on the spot", () => {
    expect(approveByReferee(createScoredBout(), t0, { A: true, B: true }).status).toBe("FINAL");
  });

  it("records a single on-the-spot approval", () => {
    const bout = approveByReferee(createScoredBout(), t0, { A: true, B: false });
    expect(bout.status).toBe("COUNTED");
    expect(bout.fighterApproved).toEqual({ A: true, B: false });
  });

  it("only works on a scored bout", () => {
    expectError(() => approveByReferee(counted(), t0, noneOnSpot), "INVALID_STATE");
  });
});

describe("approveByFighter", () => {
  it("makes the bout final once both fighters approved", () => {
    const one = approveByFighter(counted(), "A", at(1000));
    expect(one.status).toBe("COUNTED");
    expect(approveByFighter(one, "B", at(2000)).status).toBe("FINAL");
  });

  it("is refused after the window closed", () => {
    expectError(() => approveByFighter(counted(), "A", at(OBJECTION_WINDOW_MS)), "WINDOW_CLOSED");
  });
});

describe("objectToBout", () => {
  it("takes the bout out of the ratings", () => {
    const bout = objected();
    expect(bout.status).toBe("OBJECTED");
    expect(bout.objection).toEqual({ by: "A", at: at(1000).toISOString() });
    expect(boutCounts(bout)).toBe(false);
  });

  it("rejects an objection at exactly three days", () => {
    expect(OBJECTION_WINDOW_MS).toBe(259_200_000);
    expectError(() => objectToBout(counted(), "A", at(OBJECTION_WINDOW_MS)), "WINDOW_CLOSED");
    expect(objectToBout(counted(), "A", at(OBJECTION_WINDOW_MS - 1)).status).toBe("OBJECTED");
  });

  it("refuses an objection from a fighter who already approved", () => {
    const approvedA = approveByFighter(counted(), "A", at(1000));
    expectError(() => objectToBout(approvedA, "A", at(2000)), "ALREADY_APPROVED");
    expect(objectToBout(approvedA, "B", at(2000)).status).toBe("OBJECTED");
  });

  it("is refused on a final bout", () => {
    expectError(() => objectToBout(approveByReferee(createScoredBout(), t0, { A: true, B: true }), "A", at(1)), "INVALID_STATE");
  });
});

describe("resolveObjection", () => {
  it("restores the bout within its original window", () => {
    const bout = resolveObjection(objected(), { kind: "restore" }, at(2000));
    expect(bout.status).toBe("COUNTED");
    expect(bout.windowStartedAt).toBe(t0.toISOString());
    expect(bout.objection).toBeNull();
  });

  it("restore after the window makes the bout final", () => {
    expect(resolveObjection(objected(), { kind: "restore" }, at(OBJECTION_WINDOW_MS + 1)).status).toBe("FINAL");
  });

  it("starts a new revision and window on correction", () => {
    const bout = resolveObjection(objected(), { kind: "correct" }, at(5000));
    expect(bout.status).toBe("COUNTED");
    expect(bout.revision).toBe(2);
    expect(bout.windowStartedAt).toBe(at(5000).toISOString());
    expect(bout.fighterApproved).toEqual({ A: false, B: false });
    expect(bout.objection).toBeNull();
  });

  it("voids with a reason", () => {
    const bout = resolveObjection(objected(), { kind: "void", reason: " Sanne injured " }, at(5000));
    expect(bout.status).toBe("VOIDED");
    expect(bout.voidReason).toBe("Sanne injured");
  });

  it("needs a reason to void", () => {
    expectError(() => resolveObjection(objected(), { kind: "void", reason: "  " }, at(5000)), "REASON_REQUIRED");
  });

  it("only works on an objected bout", () => {
    expectError(() => resolveObjection(counted(), { kind: "restore" }, at(5000)), "INVALID_STATE");
  });
});

describe("voidBout", () => {
  it("voids a scored or counted bout with a reason", () => {
    expect(voidBout(createScoredBout(), "Injury").status).toBe("VOIDED");
    expect(voidBout(counted(), "Wrong fighter").voidReason).toBe("Wrong fighter");
  });

  it("needs a reason", () => {
    expectError(() => voidBout(counted(), ""), "REASON_REQUIRED");
  });

  it("can't void a final bout", () => {
    expectError(() => voidBout(approveByReferee(createScoredBout(), t0, { A: true, B: true }), "x"), "INVALID_STATE");
  });
});

describe("settleBout", () => {
  it("makes a counted bout final when the window has passed", () => {
    expect(settleBout(counted(), at(OBJECTION_WINDOW_MS)).status).toBe("FINAL");
  });

  it("leaves it counted inside the window", () => {
    expect(settleBout(counted(), at(OBJECTION_WINDOW_MS - 1)).status).toBe("COUNTED");
  });

  it("leaves an objected bout alone, however long it stays open", () => {
    expect(settleBout(objected(), at(OBJECTION_WINDOW_MS * 100)).status).toBe("OBJECTED");
  });
});

describe("purity", () => {
  it("doesn't mutate its input", () => {
    const bout = counted();
    const snapshot = structuredClone(bout);
    approveByFighter(bout, "A", at(1));
    objectToBout(bout, "B", at(1));
    settleBout(bout, at(OBJECTION_WINDOW_MS));
    expect(bout).toEqual(snapshot);
  });
});

describe("withdrawObjection", () => {
  it("lets the objecting fighter withdraw, restoring the bout", () => {
    const bout = withdrawObjection(objected(), "A", at(2000));
    expect(bout.status).toBe("COUNTED");
    expect(bout.objection).toBeNull();
  });

  it("refuses a withdrawal by the other fighter", () => {
    expectError(() => withdrawObjection(objected(), "B", at(2000)), "NOT_OBJECTOR");
  });

  it("only works on an objected bout", () => {
    expectError(() => withdrawObjection(counted(), "A", at(2000)), "INVALID_STATE");
  });
});

describe("repeat objections", () => {
  it("stops a fighter objecting again after a restore", () => {
    const restored = resolveObjection(objected(), { kind: "restore" }, at(2000));
    expectError(() => objectToBout(restored, "A", at(3000)), "ALREADY_APPROVED");
    expect(objectToBout(restored, "B", at(3000)).status).toBe("OBJECTED");
  });

  it("stops a fighter objecting again after withdrawing", () => {
    const withdrawn = withdrawObjection(objected(), "A", at(2000));
    expectError(() => objectToBout(withdrawn, "A", at(3000)), "ALREADY_APPROVED");
  });

  it("makes the bout final when the other fighter had already approved", () => {
    const approvedB = approveByFighter(counted(), "B", at(500));
    const objectedByA = objectToBout(approvedB, "A", at(1000));
    expect(resolveObjection(objectedByA, { kind: "restore" }, at(2000)).status).toBe("FINAL");
  });

  it("lets both fighters object again after a correction", () => {
    const corrected = resolveObjection(objected(), { kind: "correct" }, at(5000));
    expect(objectToBout(corrected, "A", at(6000)).status).toBe("OBJECTED");
  });
});

export type BoutStatus = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";
export type FighterSide = "A" | "B";

/** Fighters can object for exactly three days after the referee approved (or after a correction). */
export const OBJECTION_WINDOW_MS = 259_200_000;

export interface BoutLifecycle {
  status: BoutStatus;
  revision: number;
  windowStartedAt: string | null;
  fighterApproved: { A: boolean; B: boolean };
  objection: { by: FighterSide; at: string } | null;
  voidReason: string | null;
}

export type BoutTransitionErrorCode =
  | "INVALID_STATE"
  | "WINDOW_CLOSED"
  | "ALREADY_APPROVED"
  | "NOT_OBJECTOR"
  | "REASON_REQUIRED";

export class BoutTransitionError extends Error {
  constructor(
    readonly code: BoutTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BoutTransitionError";
  }
}

export type ObjectionResolution = { kind: "restore" } | { kind: "correct" } | { kind: "void"; reason: string };

export function createScoredBout(): BoutLifecycle {
  return {
    status: "SCORED",
    revision: 1,
    windowStartedAt: null,
    fighterApproved: { A: false, B: false },
    objection: null,
    voidReason: null,
  };
}

export function approveByReferee(bout: BoutLifecycle, now: Date, onSpot: { A: boolean; B: boolean }): BoutLifecycle {
  requireStatus(bout, ["SCORED"], "approve");
  const fighterApproved = { ...onSpot };
  return {
    ...bout,
    status: fighterApproved.A && fighterApproved.B ? "FINAL" : "COUNTED",
    windowStartedAt: now.toISOString(),
    fighterApproved,
  };
}

export function approveByFighter(bout: BoutLifecycle, side: FighterSide, now: Date): BoutLifecycle {
  requireStatus(bout, ["COUNTED"], "approve");
  requireWindowOpen(bout, now);
  const fighterApproved = { ...bout.fighterApproved, [side]: true };
  return { ...bout, fighterApproved, status: fighterApproved.A && fighterApproved.B ? "FINAL" : "COUNTED" };
}

export function objectToBout(bout: BoutLifecycle, side: FighterSide, now: Date): BoutLifecycle {
  requireStatus(bout, ["COUNTED"], "object to");
  requireWindowOpen(bout, now);
  if (bout.fighterApproved[side]) {
    throw new BoutTransitionError("ALREADY_APPROVED", `Fighter ${side} already approved this bout.`);
  }
  return { ...bout, status: "OBJECTED", objection: { by: side, at: now.toISOString() } };
}

export function resolveObjection(bout: BoutLifecycle, resolution: ObjectionResolution, now: Date): BoutLifecycle {
  requireStatus(bout, ["OBJECTED"], "resolve");
  switch (resolution.kind) {
    case "restore":
      return restore(bout, now);
    case "correct":
      return {
        ...bout,
        status: "COUNTED",
        revision: bout.revision + 1,
        windowStartedAt: now.toISOString(),
        fighterApproved: { A: false, B: false },
        objection: null,
      };
    case "void":
      return { ...bout, status: "VOIDED", voidReason: requireReason(resolution.reason) };
  }
}

export function withdrawObjection(bout: BoutLifecycle, side: FighterSide, now: Date): BoutLifecycle {
  requireStatus(bout, ["OBJECTED"], "withdraw an objection on");
  if (bout.objection?.by !== side) {
    throw new BoutTransitionError("NOT_OBJECTOR", "Only the fighter who objected can withdraw the objection.");
  }
  return restore(bout, now);
}

export function voidBout(bout: BoutLifecycle, reason: string): BoutLifecycle {
  requireStatus(bout, ["SCORED", "COUNTED"], "void");
  return { ...bout, status: "VOIDED", voidReason: requireReason(reason) };
}

export function settleBout(bout: BoutLifecycle, now: Date): BoutLifecycle {
  if (bout.status !== "COUNTED" || isWindowOpen(bout, now)) {
    return bout;
  }
  return { ...bout, status: "FINAL" };
}

export function boutCounts(bout: Pick<BoutLifecycle, "status">): boolean {
  return bout.status === "COUNTED" || bout.status === "FINAL";
}

/** A restored objection counts as the objector's approval, so they can't pull the same result out again. */
function restore(bout: BoutLifecycle, now: Date): BoutLifecycle {
  const fighterApproved = bout.objection ? { ...bout.fighterApproved, [bout.objection.by]: true } : bout.fighterApproved;
  if (fighterApproved.A && fighterApproved.B) {
    return { ...bout, status: "FINAL", fighterApproved, objection: null };
  }
  return settleBout({ ...bout, status: "COUNTED", fighterApproved, objection: null }, now);
}

function isWindowOpen(bout: BoutLifecycle, now: Date): boolean {
  if (bout.windowStartedAt === null) {
    return false;
  }
  return now.getTime() < Date.parse(bout.windowStartedAt) + OBJECTION_WINDOW_MS;
}

function requireWindowOpen(bout: BoutLifecycle, now: Date): void {
  if (!isWindowOpen(bout, now)) {
    throw new BoutTransitionError("WINDOW_CLOSED", "The three-day objection window has closed.");
  }
}

function requireStatus(bout: BoutLifecycle, allowed: readonly BoutStatus[], verb: string): void {
  if (!allowed.includes(bout.status)) {
    throw new BoutTransitionError("INVALID_STATE", `Cannot ${verb} a bout that is ${bout.status}.`);
  }
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new BoutTransitionError("REASON_REQUIRED", "A reason is required to void a bout.");
  }
  return trimmed;
}

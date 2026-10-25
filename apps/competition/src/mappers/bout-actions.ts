import type { BoutView } from "../api-types";
import type { Translate } from "./translate";

/** What a fighter or referee can do with a bout (the same four as the home to-do buttons). */
export type BoutAction = "approve" | "object" | "withdraw" | "referee-approve";

/**
 * The actions open to the signed-in user, by the same rules as the home to-do list:
 * a fighter approves or objects while the bout counts and is in its three days and they haven't approved;
 * the fighter who objected can withdraw; the referee approves a scored bout.
 */
export function availableActions(bout: BoutView, userId: string, now: number): BoutAction[] {
  const side = bout.fighterA.userId === userId ? "A" : bout.fighterB.userId === userId ? "B" : null;
  const actions: BoutAction[] = [];
  if (side !== null) {
    const inWindow = bout.windowEndsAt !== null && Date.parse(bout.windowEndsAt) > now;
    if (bout.status === "COUNTED" && inWindow && !bout.fighterApproved[side]) {
      actions.push("approve", "object");
    }
    if (bout.status === "OBJECTED" && bout.objection?.by === side) {
      actions.push("withdraw");
    }
  }
  if (bout.status === "SCORED" && bout.referee.userId === userId) {
    actions.push("referee-approve");
  }
  return actions;
}

/** The objection reason as typed, or null when there is none. */
export function objectionReason(text: string): string | null {
  const reason = text.trim();
  return reason === "" ? null : reason;
}

const DONE: Record<BoutAction, string> = {
  approve: "app.boutApproved",
  object: "app.objectionSent",
  withdraw: "app.objectionWithdrawn",
  "referee-approve": "app.refereeApproved",
};

export function actionDoneMessage(action: BoutAction, translate: Translate): string {
  return translate(DONE[action]);
}

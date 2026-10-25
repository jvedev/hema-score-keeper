import { t } from "@hema/ui";
import type { ParticipantStatus } from "./api-types";
import type { AppContext } from "./app-context";
import { actionDoneMessage, type BoutAction } from "./mappers/bout-actions";
import { leaveQuestion, leftMessage } from "./mappers/competitions";
import { joinedMessage, joinFailure } from "./mappers/join";
import type { Translate } from "./mappers/translate";
import { SessionExpiredError } from "./participant-client";
import { askObjectionReason, confirmDialog } from "./screens/dialogs";

/** How an action shows it is running and what went wrong, on whatever started it (to-do list, bout page, join card). */
export interface ActionFeedback {
  setBusy(busy: boolean): void;
  setError(message: string | null): void;
  /** Whether what started the action is still on screen; when the user has moved on, nothing reloads or navigates. */
  stillShown(): boolean;
}

const translate = t as Translate;

type ActionContext = Pick<AppContext, "client" | "toast" | "sessionExpired">;

const SEND: Record<BoutAction, (context: ActionContext, boutId: string, reason: string) => Promise<unknown>> = {
  approve: (context, boutId) => context.client.approveBout(boutId),
  object: (context, boutId, reason) => context.client.objectToBout(boutId, reason),
  withdraw: (context, boutId) => context.client.withdrawObjection(boutId),
  "referee-approve": (context, boutId) => context.client.approveAsReferee(boutId),
};

/**
 * Approve, object (asks for the reason first), withdraw an objection or approve as referee.
 * The one implementation behind the home to-do buttons and the bout page. True when it went through.
 */
export async function runBoutAction(context: ActionContext, action: BoutAction, boutId: string, feedback: ActionFeedback): Promise<boolean> {
  let reason = "";
  if (action === "object") {
    const given = await askObjectionReason();
    if (given === null) {
      return false;
    }
    reason = given;
  }
  return run(context, feedback, async () => {
    await SEND[action](context, boutId, reason);
    context.toast(actionDoneMessage(action, translate));
  });
}

/** Signs up for a competition from a join card. True when the fighter is in (or waiting to be accepted). */
export async function joinCompetition(context: ActionContext, competitionId: string, name: string, feedback: ActionFeedback): Promise<boolean> {
  feedback.setError(null);
  feedback.setBusy(true);
  try {
    context.toast(joinedMessage(await context.client.signup(competitionId), name, translate));
    return true;
  } catch (error) {
    const failure = joinFailure(error, translate);
    if (failure.kind === "session-expired") {
      context.sessionExpired();
      return false;
    }
    if (failure.kind === "already-in") {
      context.toast(failure.message);
      return true;
    }
    feedback.setError(failure.message);
    feedback.setBusy(false);
    return false;
  }
}

/** Leaves a competition (or withdraws a pending sign-up) after asking. True when it went through. */
export async function leaveCompetition(
  context: ActionContext,
  competitionId: string,
  name: string,
  myStatus: ParticipantStatus | null,
  feedback: ActionFeedback,
): Promise<boolean> {
  const question = leaveQuestion(myStatus, name, translate);
  if (!(await confirmDialog(question.message, question.confirmLabel))) {
    return false;
  }
  return run(context, feedback, async () => {
    await context.client.leave(competitionId);
    context.toast(leftMessage(myStatus, name, translate));
  });
}

async function run(context: ActionContext, feedback: ActionFeedback, request: () => Promise<void>): Promise<boolean> {
  feedback.setError(null);
  feedback.setBusy(true);
  try {
    await request();
    return true;
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      context.sessionExpired();
      return false;
    }
    feedback.setError(error instanceof Error ? error.message : String(error));
    feedback.setBusy(false);
    return false;
  }
}

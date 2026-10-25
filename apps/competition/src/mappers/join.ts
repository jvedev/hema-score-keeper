import type { InvitePreview, JoinRefusal, SignupResult } from "../api-types";
import { ApiError, SessionExpiredError } from "../participant-client";
import type { Translate } from "./translate";

/** What the invite landing shows. */
export type InviteState =
  | { kind: "open"; competitionId: string; name: string; status: string }
  | { kind: "closed"; competitionId: string; name: string; status: string }
  /** The code is unknown or was replaced by a newer one. */
  | { kind: "invalid" };

/** The invite preview, or the error reading it gave (a 404 means the link no longer works). */
export function inviteState(preview: InvitePreview | unknown): InviteState {
  if (preview instanceof ApiError && preview.status === 404) {
    return { kind: "invalid" };
  }
  if (preview instanceof Error) {
    throw preview;
  }
  const { competitionId, name, status, joinable } = preview as InvitePreview;
  return { kind: joinable ? "open" : "closed", competitionId, name, status };
}

export function joinedMessage(result: SignupResult, name: string, translate: Translate): string {
  return translate(result.status === "PENDING" ? "app.joinPending" : "app.joined", { name });
}

const REFUSALS: Record<Exclude<JoinRefusal, "ALREADY_IN">, string> = {
  FULL: "app.joinFull",
  NOT_OPEN: "app.joinNotOpen",
  OUT_OF_SCOPE: "app.joinOutOfScope",
};

/** Why a sign-up didn't go through. Being in already counts as joined; an expired login goes back to sign-in. */
export type JoinFailure =
  | { kind: "already-in"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "session-expired" };

export function joinFailure(error: unknown, translate: Translate): JoinFailure {
  if (error instanceof SessionExpiredError) {
    return { kind: "session-expired" };
  }
  const reason = refusalReason(error);
  if (reason === "ALREADY_IN") {
    return { kind: "already-in", message: translate("app.alreadyIn") };
  }
  if (reason) {
    return { kind: "refused", message: translate(REFUSALS[reason]) };
  }
  return { kind: "refused", message: error instanceof Error ? error.message : String(error) };
}

function refusalReason(error: unknown): JoinRefusal | null {
  if (!(error instanceof ApiError) || typeof error.details !== "object" || error.details === null) {
    return null;
  }
  const reason = (error.details as { reason?: unknown }).reason;
  return reason === "ALREADY_IN" || reason === "FULL" || reason === "NOT_OPEN" || reason === "OUT_OF_SCOPE" ? reason : null;
}

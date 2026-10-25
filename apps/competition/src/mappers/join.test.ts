import { describe, expect, it } from "vitest";
import { ApiError, SessionExpiredError } from "../participant-client";
import { inviteState, joinFailure, joinedMessage } from "./join";

const translate = (key: string, params: Record<string, string | number> = {}) =>
  `${key}${Object.keys(params).length ? `{${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}}` : ""}`;

const preview = { competitionId: "c1", name: "Ladder", status: "RUNNING", date: "2026-10-01", joinable: true };

describe("invite landing", () => {
  it("shows a joinable competition", () => {
    expect(inviteState(preview)).toEqual({ kind: "open", competitionId: "c1", name: "Ladder", status: "RUNNING" });
  });

  it("explains a competition that can't be joined now", () => {
    expect(inviteState({ ...preview, status: "CLOSED", joinable: false })).toEqual({ kind: "closed", competitionId: "c1", name: "Ladder", status: "CLOSED" });
  });

  it("treats an unknown or replaced code as invalid", () => {
    expect(inviteState(new ApiError("Invite not found.", 404, undefined))).toEqual({ kind: "invalid" });
  });

  it("passes other errors on", () => {
    const error = new ApiError("Server down", 500, undefined);
    expect(() => inviteState(error)).toThrow(error);
  });
});

describe("joining", () => {
  it("says whether the fighter is in or waiting", () => {
    expect(joinedMessage({ status: "ACTIVE" }, "Ladder", translate)).toBe("app.joined{name=Ladder}");
    expect(joinedMessage({ status: "PENDING" }, "Ladder", translate)).toBe("app.joinPending{name=Ladder}");
  });

  it("counts already being in as joined", () => {
    expect(joinFailure(new ApiError("Already in.", 409, { reason: "ALREADY_IN" }), translate)).toEqual({ kind: "already-in", message: "app.alreadyIn" });
  });

  it("explains each refusal", () => {
    expect(joinFailure(new ApiError("x", 409, { reason: "FULL" }), translate)).toEqual({ kind: "refused", message: "app.joinFull" });
    expect(joinFailure(new ApiError("x", 409, { reason: "NOT_OPEN" }), translate)).toEqual({ kind: "refused", message: "app.joinNotOpen" });
    expect(joinFailure(new ApiError("x", 403, { reason: "OUT_OF_SCOPE" }), translate)).toEqual({ kind: "refused", message: "app.joinOutOfScope" });
  });

  it("sends an expired login back to sign-in instead of showing it as a refusal", () => {
    expect(joinFailure(new SessionExpiredError(), translate)).toEqual({ kind: "session-expired" });
  });

  it("falls back to the server's message", () => {
    expect(joinFailure(new ApiError("Competition not found.", 404, undefined), translate)).toEqual({ kind: "refused", message: "Competition not found." });
    expect(joinFailure(new Error("offline"), translate)).toEqual({ kind: "refused", message: "offline" });
  });
});

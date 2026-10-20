import { describe, expect, it } from "vitest";
import type { RecordBoutPayload } from "./competition-payload";
import { saveCompetitionBout, type PendingBout, type SaveClient } from "./competition-save";

const payload = { fighterAUserId: "a", fighterBUserId: "b" } as RecordBoutPayload;
const allApprove = { refereeApproves: true, fighterAApproves: true, fighterBApproves: true };

function fakeClient(options: { failRecord?: boolean; failApproveTimes?: number } = {}) {
  const calls: string[] = [];
  let approveFailures = options.failApproveTimes ?? 0;
  const client: SaveClient = {
    async recordBout() {
      calls.push("record");
      if (options.failRecord) {
        throw new Error("Start time is in the future.");
      }
      return { id: "b1", status: "SCORED" };
    },
    async approveAsReferee(boutId, onSpot) {
      calls.push(`approve ${boutId} ${onSpot.A} ${onSpot.B}`);
      if (approveFailures > 0) {
        approveFailures--;
        throw new Error("Network down");
      }
      return { id: boutId, status: "FINAL" };
    },
  };
  return { client, calls };
}

describe("saveCompetitionBout", () => {
  it("records and approves", async () => {
    const { client, calls } = fakeClient();
    const pending: PendingBout = { payload, boutId: null };
    await saveCompetitionBout(client, pending, allApprove);
    expect(calls).toEqual(["record", "approve b1 true true"]);
  });

  it("only records when the referee doesn't approve", async () => {
    const { client, calls } = fakeClient();
    await saveCompetitionBout(client, { payload, boutId: null }, { refereeApproves: false, fighterAApproves: false, fighterBApproves: false });
    expect(calls).toEqual(["record"]);
  });

  it("remembers a saved bout when the approval fails, and retries only the approval", async () => {
    const { client, calls } = fakeClient({ failApproveTimes: 1 });
    const pending: PendingBout = { payload, boutId: null };

    await expect(saveCompetitionBout(client, pending, allApprove)).rejects.toThrow("Network down");
    expect(pending.boutId).toBe("b1");

    await saveCompetitionBout(client, pending, allApprove);
    expect(calls).toEqual(["record", "approve b1 true true", "approve b1 true true"]);
  });

  it("keeps an unsaved bout unsaved when recording fails", async () => {
    const { client } = fakeClient({ failRecord: true });
    const pending: PendingBout = { payload, boutId: null };
    await expect(saveCompetitionBout(client, pending, allApprove)).rejects.toThrow("Start time is in the future.");
    expect(pending.boutId).toBeNull();
  });
});

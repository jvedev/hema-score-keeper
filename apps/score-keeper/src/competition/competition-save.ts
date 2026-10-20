import type { RecordBoutPayload } from "./competition-payload";

/** A fought bout waiting to be saved; `boutId` is set once the backend has recorded it. */
export interface PendingBout {
  payload: RecordBoutPayload;
  boutId: string | null;
}

export interface Approvals {
  refereeApproves: boolean;
  fighterAApproves: boolean;
  fighterBApproves: boolean;
}

export interface SaveClient {
  recordBout(input: unknown): Promise<{ id: string; status: string }>;
  approveAsReferee(boutId: string, onSpot: { A: boolean; B: boolean }): Promise<{ id: string; status: string }>;
}

/**
 * Records the bout (once) and registers the approvals. If the approval fails after the bout was
 * recorded, `pending.boutId` is kept so a retry only repeats the approval and never records the
 * bout twice.
 */
export async function saveCompetitionBout(client: SaveClient, pending: PendingBout, approvals: Approvals): Promise<void> {
  if (pending.boutId === null) {
    const bout = await client.recordBout(pending.payload);
    pending.boutId = bout.id;
  }
  if (approvals.refereeApproves) {
    await client.approveAsReferee(pending.boutId, { A: approvals.fighterAApproves, B: approvals.fighterBApproves });
  }
}

import { OBJECTION_WINDOW_MS, type BoutStatus } from "@hema/competition-domain";
import type { DbExecutor } from "../db.js";
import type { ExchangeInput } from "./bout-input.js";
import { boutCompetitionIds, type BoutRow } from "./bout-store.js";

export interface PersonRef {
  userId: string;
  name: string;
}

export interface BoutView {
  id: string;
  status: BoutStatus;
  revision: number;
  startedAt: string;
  ring: string | null;
  fighterA: PersonRef;
  fighterB: PersonRef;
  referee: PersonRef;
  jury: Array<PersonRef & { seat: number }>;
  table: PersonRef | null;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  warningsA: number;
  warningsB: number;
  exchanges: ExchangeInput[];
  windowEndsAt: string | null;
  fighterApproved: { A: boolean; B: boolean };
  objection: { by: "A" | "B"; at: string; reason: string | null } | null;
  voidReason: string | null;
  startedInCompetitionId: string | null;
  competitionIds: string[];
}

export async function toBoutView(executor: DbExecutor, row: BoutRow): Promise<BoutView> {
  const jury = await executor.selectFrom("BoutJury").select(["seat", "userId"]).where("boutId", "=", row.id).orderBy("seat").execute();
  const userIds = [row.fighterAUserId, row.fighterBUserId, row.refereeUserId, ...jury.map((seat) => seat.userId)];
  if (row.tableUserId) {
    userIds.push(row.tableUserId);
  }
  const names = new Map(
    (await executor.selectFrom("User").select(["id", "name"]).where("id", "in", userIds).execute()).map((user) => [user.id, user.name]),
  );
  const person = (userId: string): PersonRef => ({ userId, name: names.get(userId) ?? userId });

  return {
    id: row.id,
    status: row.status as BoutStatus,
    revision: row.revision,
    startedAt: row.startedAt,
    ring: row.ring,
    fighterA: person(row.fighterAUserId),
    fighterB: person(row.fighterBUserId),
    referee: person(row.refereeUserId),
    jury: jury.map((seat) => ({ seat: seat.seat, ...person(seat.userId) })),
    table: row.tableUserId ? person(row.tableUserId) : null,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    winnerSide: row.winnerSide,
    warningsA: row.warningsA,
    warningsB: row.warningsB,
    exchanges: JSON.parse(row.exchangesJson) as ExchangeInput[],
    windowEndsAt: row.windowStartedAt ? new Date(Date.parse(row.windowStartedAt) + OBJECTION_WINDOW_MS).toISOString() : null,
    fighterApproved: { A: row.fighterApprovedA === 1, B: row.fighterApprovedB === 1 },
    objection:
      row.objectionBy !== null && row.objectionAt !== null
        ? { by: row.objectionBy, at: row.objectionAt, reason: row.objectionReason }
        : null,
    voidReason: row.voidReason,
    startedInCompetitionId: row.startedInCompetitionId,
    competitionIds: await boutCompetitionIds(executor, row.id),
  };
}

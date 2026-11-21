import { nextBracketSlot } from "@hema/ranking";
import type { DbExecutor } from "../db.js";
import { HttpError } from "../http.js";

/**
 * Moves the result of a bracket match on: its winner into the next round, and for a semi-final its loser into
 * the bronze match. Called in the same transaction as every write of a match result (the complete route and the
 * live-result projection and correction), so a correction re-places the fighters too. Refuses, rolling the
 * result back with the transaction, when the slot would change in a match that has already started.
 * Does nothing for pool matches. Assumes one bracket per tournament (bracket matches are found per tournament).
 */
export async function advanceBracket(executor: DbExecutor, matchId: string): Promise<void> {
  const match = await executor
    .selectFrom("Match")
    .innerJoin("Round", "Round.id", "Match.roundId")
    .innerJoin("Stage", "Stage.id", "Round.stageId")
    .select([
      "Match.id",
      "Match.entryAId",
      "Match.entryBId",
      "Match.winnerEntryId",
      "Match.bracketRound",
      "Match.bracketPosition",
      "Match.bracketKind",
      "Stage.tournamentId",
    ])
    .where("Match.id", "=", matchId)
    .executeTakeFirst();
  if (!match || match.bracketKind !== "MAIN" || match.bracketRound === null || match.bracketPosition === null) return;

  const bracket = await executor
    .selectFrom("Match")
    .innerJoin("Round", "Round.id", "Match.roundId")
    .innerJoin("Stage", "Stage.id", "Round.stageId")
    .select(["Match.id", "Match.entryAId", "Match.entryBId", "Match.bracketRound", "Match.bracketPosition", "Match.bracketKind"])
    .where("Stage.tournamentId", "=", match.tournamentId)
    .where("Match.bracketKind", "is not", null)
    .execute();
  const lastRound = Math.max(...bracket.filter((item) => item.bracketKind === "MAIN").map((item) => item.bracketRound ?? 0));
  const size = 2 ** (lastRound + 1);

  const winner = match.winnerEntryId;
  const loser = winner === null ? null : winner === match.entryAId ? match.entryBId : match.entryAId;

  const next = nextBracketSlot(size, match.bracketRound, match.bracketPosition);
  if (next) {
    const target = bracket.find((item) => item.bracketKind === "MAIN" && item.bracketRound === next.round && item.bracketPosition === next.position);
    if (target) await placeInSlot(executor, target, next.side, winner);
  }
  if (match.bracketRound === lastRound - 1) {
    const bronze = bracket.find((item) => item.bracketKind === "BRONZE");
    if (bronze) await placeInSlot(executor, bronze, match.bracketPosition % 2 === 0 ? "A" : "B", loser);
  }
}

async function placeInSlot(
  executor: DbExecutor,
  target: { id: string; entryAId: string | null; entryBId: string | null },
  side: "A" | "B",
  entryId: string | null,
): Promise<void> {
  const current = side === "A" ? target.entryAId : target.entryBId;
  if (current === entryId) return;
  if (await matchStarted(executor, target.id)) {
    throw new HttpError(409, "The next bracket match has already started, so this result can no longer change who plays in it.");
  }
  await executor
    .updateTable("Match")
    .set(side === "A" ? { entryAId: entryId } : { entryBId: entryId })
    .where("id", "=", target.id)
    .execute();
}

async function matchStarted(executor: DbExecutor, matchId: string): Promise<boolean> {
  const row = await executor.selectFrom("Match").select(["scoreA", "scoreB", "winnerEntryId"]).where("id", "=", matchId).executeTakeFirstOrThrow();
  if (row.scoreA !== null || row.scoreB !== null || row.winnerEntryId !== null) return true;
  if (await executor.selectFrom("Exchange").select("id").where("matchId", "=", matchId).executeTakeFirst()) return true;
  const live = await executor.selectFrom("LiveBout").select("status").where("sourceMatchId", "=", matchId).executeTakeFirst();
  return live !== undefined && live.status !== "PENDING";
}

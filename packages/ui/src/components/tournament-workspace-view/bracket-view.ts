import type { ApiTournament } from "@hema/event-admin-api";
import { matchPlayed } from "./stage-matches.js";

export interface BracketSlot {
  entryId: string | null;
  name: string | null;
  winner: boolean;
}

export interface BracketCell {
  /** Null for a first-round place without a match (a bye). */
  matchId: string | null;
  round: number;
  position: number;
  a: BracketSlot;
  b: BracketSlot;
  score: string | null;
  played: boolean;
}

export interface BracketColumn {
  round: number;
  /** Fighters still in at this round: 2 = final, 4 = semi-finals, … */
  fighters: number;
  cells: BracketCell[];
}

export interface BracketLayout {
  columns: BracketColumn[];
  bronze: BracketCell | null;
}

/**
 * The tournament's elimination bracket as columns, first round to final, every position filled (byes as empty
 * cells), plus the bronze match. Bracket matches may sit in several stages (separate final stages); they are
 * collected from the whole tournament. Null when there is no bracket yet.
 */
export function bracketLayout(tournament: ApiTournament): BracketLayout | null {
  const names = new Map((tournament.entries ?? []).map((entry) => [entry.id, entry.user?.username ?? null] as const));
  const matches = (tournament.stages ?? [])
    .flatMap((stage) => stage.rounds ?? [])
    .flatMap((round) => round.matches ?? [])
    .filter((match) => match.bracketKind !== null && match.bracketRound !== null && match.bracketPosition !== null);
  const main = matches.filter((match) => match.bracketKind === "MAIN");
  if (main.length === 0) return null;
  const lastRound = Math.max(...main.map((match) => match.bracketRound!));
  const size = 2 ** (lastRound + 1);

  const cell = (match: (typeof matches)[number] | undefined, round: number, position: number): BracketCell => {
    const slot = (entryId: string | null): BracketSlot => ({
      entryId,
      name: entryId ? (names.get(entryId) ?? null) : null,
      winner: entryId !== null && match?.winnerEntryId === entryId,
    });
    const played = match ? matchPlayed(match) : false;
    return {
      matchId: match?.id ?? null,
      round,
      position,
      a: slot(match?.entryAId ?? null),
      b: slot(match?.entryBId ?? null),
      score: played ? `${match!.scoreA}–${match!.scoreB}` : null,
      played,
    };
  };

  const columns: BracketColumn[] = [];
  for (let round = 0; round <= lastRound; round += 1) {
    const count = size / 2 ** (round + 1);
    const cells: BracketCell[] = [];
    for (let position = 0; position < count; position += 1) {
      cells.push(cell(main.find((match) => match.bracketRound === round && match.bracketPosition === position), round, position));
    }
    columns.push({ round, fighters: count * 2, cells });
  }
  const bronzeMatch = matches.find((match) => match.bracketKind === "BRONZE");
  return { columns, bronze: bronzeMatch ? cell(bronzeMatch, lastRound, 0) : null };
}

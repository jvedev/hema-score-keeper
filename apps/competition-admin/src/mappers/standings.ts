import type { StandingRowView } from "@hema/ui";
import type { Club, StandingRow } from "../api-types";

export function toStandingRows(rows: readonly StandingRow[], clubs: readonly Club[]): StandingRowView[] {
  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  return rows.map((row) => ({
    participantId: row.participantId,
    position: row.position,
    name: row.name,
    clubName: row.clubId ? (clubNames.get(row.clubId) ?? null) : null,
    rating: row.rating,
    lastChange: row.lastChange,
    bouts: row.bouts,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    warnings: row.warnings,
    provisional: row.provisional,
  }));
}

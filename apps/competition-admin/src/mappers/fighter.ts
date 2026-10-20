import type { BoutDetailView, FighterBoutView, FighterSummaryView } from "@hema/ui";
import type { HistoryBout, StandingRow } from "../api-types";

function sideOf(bout: HistoryBout, participantId: string): "A" | "B" | null {
  return bout.fighterAParticipantId === participantId ? "A" : bout.fighterBParticipantId === participantId ? "B" : null;
}

/** A fighter's bouts (newest first, as the history comes), seen from their own side. */
export function toFighterBouts(history: readonly HistoryBout[], participantId: string, names: ReadonlyMap<string, string>): FighterBoutView[] {
  return history.flatMap((bout): FighterBoutView[] => {
    const own = sideOf(bout, participantId);
    if (own === null) {
      return [];
    }
    const other = own === "A" ? "B" : "A";
    const opponentId = own === "A" ? bout.fighterBParticipantId : bout.fighterAParticipantId;
    const change = bout.ratingChange;
    return [
      {
        boutId: bout.id,
        foughtAt: bout.foughtAt,
        location: bout.ring,
        opponentName: names.get(opponentId) ?? opponentId,
        ownScore: own === "A" ? bout.scoreA : bout.scoreB,
        opponentScore: own === "A" ? bout.scoreB : bout.scoreA,
        result: bout.winnerSide === null ? "DRAW" : bout.winnerSide === own ? "WIN" : "LOSS",
        ratingChange: change ? (own === "A" ? change.afterA - change.beforeA : change.afterB - change.beforeB) : null,
        status: bout.status,
        approvals: { referee: bout.approvals.referee, own: bout.approvals[own], opponent: bout.approvals[other] },
        voidReason: null,
      },
    ];
  });
}

/** Ratings after each counted bout, oldest first, starting with the rating before the first one. */
export function ratingHistory(history: readonly HistoryBout[], participantId: string): number[] {
  const ratings: number[] = [];
  for (const bout of [...history].reverse()) {
    const own = sideOf(bout, participantId);
    if (own === null || bout.ratingChange === null) {
      continue;
    }
    const change = bout.ratingChange;
    if (ratings.length === 0) {
      ratings.push(own === "A" ? change.beforeA : change.beforeB);
    }
    ratings.push(own === "A" ? change.afterA : change.afterB);
  }
  return ratings;
}

export function toFighterSummary(row: StandingRow, clubName: string | null, history: readonly HistoryBout[]): FighterSummaryView {
  return {
    name: row.name,
    clubName,
    since: null,
    rating: row.rating,
    ratingHistory: ratingHistory(history, row.participantId),
    bouts: row.bouts,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    warnings: row.warnings,
  };
}

/** Bouts from before referee approval existed have no officials or exchanges; show what there is. */
export function legacyBoutDetail(bout: HistoryBout, names: ReadonlyMap<string, string>): BoutDetailView {
  const person = (participantId: string) => ({ userId: participantId, name: names.get(participantId) ?? participantId });
  return {
    boutId: bout.id,
    status: bout.status,
    approvals: bout.approvals,
    fighterA: person(bout.fighterAParticipantId),
    fighterB: person(bout.fighterBParticipantId),
    scoreA: bout.scoreA,
    scoreB: bout.scoreB,
    startedAt: bout.foughtAt,
    location: bout.ring,
    rulesetLabel: null,
    officials: { referee: { userId: "", name: "—" }, jury: [], table: [] },
    exchanges: [],
    windowEndsAt: null,
    objection: null,
    voidReason: null,
  };
}

/** The fighter to show beside a bout: the one opened before if they fought in it, otherwise fighter A. */
export function fighterForBout(history: readonly HistoryBout[], boutId: string, remembered: string | undefined): string | undefined {
  const bout = history.find((entry) => entry.id === boutId);
  if (!bout) {
    return undefined;
  }
  return remembered === bout.fighterAParticipantId || remembered === bout.fighterBParticipantId ? remembered : bout.fighterAParticipantId;
}

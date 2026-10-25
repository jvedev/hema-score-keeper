import type { BoutDetailView, FighterBoutView, FighterSummaryView, StandingRowView } from "@hema/ui";
import type { BoutView, Club, HistoryBout, PersonRef, StandingRow } from "../api-types";
import type { Route } from "../router";

export type CompetitionRoute = Extract<Route, { name: "competition" | "standings" | "fighter" | "bout" }>;

/** Which step of standings → fighter → bout is in front (on a phone only that one shows). */
export type DrillStep = "standings" | "fighter" | "bout";

/** Warnings arrive only on the viewer's own row; elsewhere they are null and stay hidden (no `show-warnings`). */
export function toStandingRows(rows: readonly StandingRow[], clubs: readonly Club[]): StandingRowView[] {
  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  return rows.map((row) => ({
    participantId: row.participantId,
    position: Number(row.position),
    name: row.name,
    clubName: row.clubId ? (clubNames.get(row.clubId) ?? null) : null,
    rating: Number(row.rating),
    lastChange: numberOrNull(row.lastChange),
    bouts: Number(row.bouts),
    wins: Number(row.wins),
    draws: Number(row.draws),
    losses: Number(row.losses),
    warnings: Number(row.warnings ?? 0),
    provisional: row.provisional,
    left: row.left,
  }));
}

/** The signed-in fighter's own row, if they are in the standings. */
export function ownRow(rows: readonly StandingRow[], userId: string): StandingRow | undefined {
  return rows.find((row) => row.userId === userId);
}

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
    const scoreA = Number(bout.scoreA);
    const scoreB = Number(bout.scoreB);
    return [
      {
        boutId: bout.id,
        foughtAt: bout.foughtAt,
        location: bout.ring,
        opponentName: names.get(opponentId) ?? opponentId,
        ownScore: own === "A" ? scoreA : scoreB,
        opponentScore: own === "A" ? scoreB : scoreA,
        result: bout.winnerSide === null ? "DRAW" : bout.winnerSide === own ? "WIN" : "LOSS",
        ratingChange: change ? (own === "A" ? Number(change.afterA) - Number(change.beforeA) : Number(change.afterB) - Number(change.beforeB)) : null,
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
      ratings.push(Number(own === "A" ? change.beforeA : change.beforeB));
    }
    ratings.push(Number(own === "A" ? change.afterA : change.afterB));
  }
  return ratings;
}

export function toFighterSummary(row: StandingRow, clubName: string | null, history: readonly HistoryBout[]): FighterSummaryView {
  return {
    name: row.name,
    clubName,
    since: null,
    rating: Number(row.rating),
    ratingHistory: ratingHistory(history, row.participantId),
    bouts: Number(row.bouts),
    wins: Number(row.wins),
    draws: Number(row.draws),
    losses: Number(row.losses),
    warnings: Number(row.warnings ?? 0),
  };
}

/** The bout as the server let this fighter see it (others' warnings and objection reasons are already left out). */
export function toBoutDetailView(bout: BoutView): BoutDetailView {
  const person = ({ userId, name }: PersonRef) => ({ userId, name });
  return {
    boutId: bout.id,
    status: bout.status,
    approvals: { referee: bout.windowEndsAt !== null, A: bout.fighterApproved.A, B: bout.fighterApproved.B },
    fighterA: person(bout.fighterA),
    fighterB: person(bout.fighterB),
    scoreA: Number(bout.scoreA),
    scoreB: Number(bout.scoreB),
    startedAt: bout.startedAt,
    location: bout.ring,
    rulesetLabel: null,
    officials: { referee: person(bout.referee), jury: bout.jury.map(person), table: bout.table.map(person) },
    exchanges: bout.exchanges.map((exchange) => ({ ...exchange, atSeconds: Number(exchange.atSeconds), points: Number(exchange.points) })),
    windowEndsAt: bout.windowEndsAt,
    objection: bout.objection ? { by: bout.objection.by, reason: bout.objection.reason } : null,
    voidReason: bout.voidReason,
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
    scoreA: Number(bout.scoreA),
    scoreB: Number(bout.scoreB),
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

/** The signed-in user fought in this bout. */
export function isOwnBout(bout: Pick<BoutView, "fighterA" | "fighterB">, userId: string): boolean {
  return bout.fighterA.userId === userId || bout.fighterB.userId === userId;
}

/**
 * Warnings show on a bout to its fighters, referee and jury (the server sends them the warnings too).
 * Table officials and everyone else don't get them.
 */
export function seesBoutWarnings(bout: Pick<BoutView, "fighterA" | "fighterB" | "referee" | "jury">, userId: string): boolean {
  return isOwnBout(bout, userId) || bout.referee.userId === userId || bout.jury.some((member) => member.userId === userId);
}

/**
 * Which fighter to show and which step is in front. The competition opens on the fighter's own bouts
 * ("my bouts first"); a bout keeps the fighter opened before beside it, else their own, else fighter A.
 */
export function drillState(
  route: CompetitionRoute,
  history: readonly HistoryBout[],
  ownParticipantId: string | undefined,
  remembered: string | undefined,
): { participantId: string | undefined; step: DrillStep } {
  switch (route.name) {
    case "competition":
      return { participantId: ownParticipantId, step: ownParticipantId ? "fighter" : "standings" };
    case "standings":
      return { participantId: remembered ?? ownParticipantId, step: "standings" };
    case "fighter":
      return { participantId: route.participantId, step: "fighter" };
    case "bout": {
      const bout = history.find((entry) => entry.id === route.boutId);
      if (!bout) {
        return { participantId: undefined, step: "bout" };
      }
      const inBout = (id: string | undefined) => id !== undefined && (id === bout.fighterAParticipantId || id === bout.fighterBParticipantId);
      const participantId = inBout(remembered) ? remembered : inBout(ownParticipantId) ? ownParticipantId : bout.fighterAParticipantId;
      return { participantId, step: "bout" };
    }
  }
}

function numberOrNull(value: number | null): number | null {
  return value === null ? null : Number(value);
}

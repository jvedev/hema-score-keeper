/**
 * Data the competition views display. Apps map their API responses onto these shapes;
 * the views never fetch anything themselves.
 */

export interface StandingRowView {
  participantId: string;
  position: number;
  name: string;
  clubName: string | null;
  rating: number;
  /** Rating change from the participant's latest counted bout. */
  lastChange: number | null;
  bouts: number;
  wins: number;
  draws: number;
  losses: number;
  warnings: number;
  provisional: boolean;
}

export interface PersonView {
  userId: string;
  name: string;
}

export interface OfficialsView {
  referee: PersonView;
  /** At most four, in seat order. */
  jury: PersonView[];
  table: PersonView | null;
}

export type ExchangeKind = "SCORE" | "DOUBLE" | "WARNING" | "TIME";

export interface ExchangeView {
  atSeconds: number;
  kind: ExchangeKind;
  side: "A" | "B" | null;
  points: number;
  reason: string | null;
}

export type BoutStatusView = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";

/** One bout seen from one fighter's side ("own" = this fighter). */
export interface FighterBoutView {
  boutId: string;
  foughtAt: string;
  location: string | null;
  opponentName: string;
  ownScore: number;
  opponentScore: number;
  result: "WIN" | "DRAW" | "LOSS";
  ratingChange: number | null;
  status: BoutStatusView;
  approvals: { referee: boolean; own: boolean; opponent: boolean };
  voidReason: string | null;
}

export interface FighterSummaryView {
  name: string;
  clubName: string | null;
  since: string | null;
  rating: number;
  /** Oldest first; drawn as a sparkline. */
  ratingHistory: number[];
  bouts: number;
  wins: number;
  draws: number;
  losses: number;
  warnings: number;
}

export interface BoutDetailView {
  boutId: string;
  status: BoutStatusView;
  approvals: { referee: boolean; A: boolean; B: boolean };
  fighterA: PersonView;
  fighterB: PersonView;
  scoreA: number;
  scoreB: number;
  startedAt: string;
  location: string | null;
  rulesetLabel: string | null;
  officials: OfficialsView;
  exchanges: ExchangeView[];
  /** End of the three-day objection window, while the bout is counted. */
  windowEndsAt: string | null;
  objection: { by: "A" | "B"; reason: string | null } | null;
  voidReason: string | null;
}

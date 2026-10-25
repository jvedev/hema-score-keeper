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
  /** True when the fighter left the competition; the row stays because their bouts still count. */
  left?: boolean;
}

export interface PersonView {
  userId: string;
  name: string;
}

export interface OfficialsView {
  referee: PersonView;
  /** At most four, in seat order. */
  jury: PersonView[];
  /** Zero, one or two table officials. */
  table: PersonView[];
}

export type ExchangeKind = "SCORE" | "DOUBLE" | "WARNING" | "TIME" | "ADJUSTMENT" | "DISQUALIFICATION";

export interface ExchangeView {
  atSeconds: number;
  kind: ExchangeKind;
  side: "A" | "B" | null;
  /** Points scored; points deducted for WARNING; signed change for ADJUSTMENT. */
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

export interface SetupCompetitionView {
  id: string;
  name: string;
}

export interface SetupPersonView {
  userId: string;
  name: string;
  clubName: string | null;
}

/** What the score-keeper operator chose before a competition bout starts. */
export interface BoutSetupResult {
  competitionId: string;
  fighterAUserId: string;
  fighterBUserId: string;
  refereeUserId: string;
  juryUserIds: string[];
  tableUserIds: string[];
  ring: string | null;
  alsoCountIn: string[];
}

export type LifecycleStatusView = "DRAFT" | "REGISTRATION_OPEN" | "RUNNING" | "CLOSED" | "ARCHIVED";

export interface CompetitionListItemView {
  id: string;
  name: string;
  status: LifecycleStatusView;
  scopeLabel: string;
  meta: string;
  openBouts: number;
}

export interface NeedsYouItemView {
  kind: "objection" | "awaiting-referee";
  boutId: string;
  competitionName: string;
  fighterA: string;
  fighterB: string;
  scoreA: number;
  scoreB: number;
  detail: string;
  /** When it started waiting (objection made, bout recorded). */
  since: string;
}

/** One thing the fighter has to do. "approve": check a counted bout (approve or object); "objection": own open objection (withdraw); "referee": approve a bout they refereed. */
export interface TodoItemView {
  kind: "approve" | "objection" | "referee";
  boutId: string;
  competitionName: string | null;
  /** The opponent, or both fighters for a bout the viewer refereed. */
  opponentName: string;
  /** Score from the viewer's side (side A when refereeing). */
  ownScore: number;
  opponentScore: number;
  /** When it started waiting (bout recorded, objection made). */
  since: string;
}

export type ParticipantStatusView = "ACTIVE" | "PENDING" | "LEFT";

export interface MyCompetitionView {
  id: string;
  name: string;
  status: LifecycleStatusView;
  myStatus: ParticipantStatusView;
  rank: number | null;
  rating: number | null;
  lastChange: number | null;
}

export interface JoinCardView {
  id: string;
  name: string;
  status: LifecycleStatusView;
  scopeLabel: string;
  /** Free places, or null without a limit. */
  placesLeft: number | null;
  signupsNeedApproval: boolean;
  /** The viewer's own standing in it: null when never joined. */
  myStatus: ParticipantStatusView | null;
  /** False when joining isn't possible right now (shown with a note instead of the button). */
  joinable: boolean;
}

/**
 * The backend responses this app reads, kept in step with apps/backend by hand
 * (`competitions/participant-routes.ts`, `competitions/signup-routes.ts`, `api-types.ts`).
 */

export type Language = "en" | "nl";
export type ParticipantStatus = "ACTIVE" | "PENDING" | "LEFT";

/** The signed-in fighter as this app remembers them. */
export interface ParticipantUser {
  id: string;
  name: string;
  language: Language;
  clubId: string | null;
}

/** `GET /auth/me` (ApiUser), the fields this app uses. */
export interface Account {
  id: string;
  clubId: string | null;
  name: string;
  username: string;
  role: "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
  language: string;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  area: string | null;
  countryCode: string | null;
}

export interface PersonRef {
  userId: string;
  name: string;
}

export interface TodoBout {
  boutId: string;
  competitionId: string | null;
  competitionName: string | null;
  startedAt: string;
  ring: string | null;
  /** The viewer's side; null when they only refereed. */
  side: "A" | "B" | null;
  fighterA: PersonRef;
  fighterB: PersonRef;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  windowEndsAt: string | null;
}

export interface MyCompetition {
  id: string;
  name: string;
  status: string;
  date: string;
  myStatus: ParticipantStatus;
  rank: number | null;
  rating: number | null;
  lastChange: number | null;
  bouts: number;
}

/** `GET /me/home`. Every to-do list is oldest first. */
export interface MeHome {
  todo: {
    toApprove: TodoBout[];
    myObjections: TodoBout[];
    toReferee: TodoBout[];
  };
  competitions: MyCompetition[];
}

/** `GET /invites/:code` (no login needed). 404 for an unknown or replaced code. */
export interface InvitePreview {
  competitionId: string;
  name: string;
  status: string;
  date: string;
  /** Open or running and not full (scope doesn't matter with an invite). */
  joinable: boolean;
}

/** `POST /competitions/:id/signup`. */
export interface SignupResult {
  status: "ACTIVE" | "PENDING";
}

/** Why the server refused a sign-up (`details.reason` of a 403/409). */
export type JoinRefusal = "NOT_OPEN" | "ALREADY_IN" | "OUT_OF_SCOPE" | "FULL";

export interface SignUpInput {
  name: string;
  username: string;
  password: string;
  clubSlug: string;
  language: Language;
}

export type LifecycleStatus = "DRAFT" | "REGISTRATION_OPEN" | "RUNNING" | "CLOSED" | "ARCHIVED";
export type ScopeKind = "CLUB" | "CLUBS" | "AREA" | "COUNTRY" | "OPEN";
export type BoutStatus = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";

/** Who may join: CLUB/CLUBS values are club ids or slugs, AREA/COUNTRY values are names or codes. */
export interface CompetitionScope {
  kind: ScopeKind;
  values: string[];
}

/** `GET /me/joinable`: a competition the fighter may sign up for right now. */
export interface JoinableCompetition {
  id: string;
  name: string;
  status: string;
  date: string;
  scope: CompetitionScope;
  signupsNeedApproval: boolean;
  placeLimit: number | null;
  /** Null when there is no limit. */
  placesLeft: number | null;
}

/** `DELETE /competitions/:id/signup`: LEFT, or null when a pending sign-up without bouts was removed. */
export interface LeaveResult {
  status: "LEFT" | null;
}

/** `GET /competitions/:id`, the fields this app uses. */
export interface CompetitionDetail {
  id: string;
  name: string;
  status: string;
  date: string;
  scope: CompetitionScope;
  signupsNeedApproval: boolean;
  /** Counts active and pending fighters; null means no limit. */
  placeLimit: number | null;
}

/** `GET /competitions/:id/participants`, the fields this app uses. */
export interface CompetitionParticipant {
  id: string;
  name: string;
  clubId: string | null;
  userId: string | null;
  status: ParticipantStatus;
}

/** `GET /competitions/:id/standings`. `warnings` is only filled on the viewer's own row (null elsewhere). */
export interface StandingRow {
  participantId: string;
  position: number;
  name: string;
  clubId: string | null;
  userId: string | null;
  rating: number;
  lastChange: number | null;
  bouts: number;
  wins: number;
  draws: number;
  losses: number;
  warnings: number | null;
  provisional: boolean;
  /** Left (or waiting to come back); the row stays because their bouts still count. */
  left: boolean;
}

export interface RatingChange {
  boutId: string;
  beforeA: number;
  afterA: number;
  beforeB: number;
  afterB: number;
}

/** `GET /competitions/:id/bout-history`, newest first. */
export interface HistoryBout {
  id: string;
  source: "LEGACY" | "BOUT";
  foughtAt: string;
  fighterAParticipantId: string;
  fighterBParticipantId: string;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  status: BoutStatus;
  ratingChange: RatingChange | null;
  approvals: { referee: boolean; A: boolean; B: boolean };
  ring: string | null;
  startedInCompetitionId: string | null;
}

export interface ApiExchange {
  atSeconds: number;
  kind: "SCORE" | "DOUBLE" | "WARNING" | "TIME" | "ADJUSTMENT" | "DISQUALIFICATION";
  side: "A" | "B" | null;
  points: number;
  reason: string | null;
}

/**
 * `GET /competitions/:id/bouts/:boutId/view`. People in the bout get everything; everyone else gets
 * no warnings (null, WARNING exchanges removed) and no objection reason (null).
 */
export interface BoutView {
  id: string;
  status: BoutStatus;
  startedAt: string;
  ring: string | null;
  fighterA: PersonRef;
  fighterB: PersonRef;
  referee: PersonRef;
  jury: Array<PersonRef & { seat: number }>;
  table: Array<PersonRef & { seat: number }>;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  warningsA: number | null;
  warningsB: number | null;
  exchanges: ApiExchange[];
  windowEndsAt: string | null;
  fighterApproved: { A: boolean; B: boolean };
  objection: { by: "A" | "B"; at: string; reason: string | null } | null;
  voidReason: string | null;
  competitionIds: string[];
}

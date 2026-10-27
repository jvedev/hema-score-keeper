/** Shapes of the backend responses the admin app reads. */

export type LifecycleStatus = "DRAFT" | "REGISTRATION_OPEN" | "RUNNING" | "CLOSED" | "ARCHIVED";
export type ScopeKind = "CLUB" | "CLUBS" | "AREA" | "COUNTRY" | "OPEN";
export type BoutStatus = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";

export interface AdminUser {
  id: string;
  name: string;
  language: "en" | "nl";
  role: "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
}

export interface CompetitionSummary {
  id: string;
  name: string;
  slug: string;
  status: LifecycleStatus;
  date: string;
  visibility: "PUBLIC" | "CLUB_ONLY";
  clubId: string | null;
  scope: { kind: ScopeKind; values: string[] };
  acceptsOtherBouts: boolean;
  signupsNeedApproval: boolean;
  /** Null means no limit. Counts active and pending fighters. */
  placeLimit: number | null;
}

export interface CompetitionDetail extends CompetitionSummary {
  rulesetJson: unknown;
}

/** What an admin of the competition gets: the current invite code too (null until one is made). */
export interface AdminCompetitionDetail extends CompetitionDetail {
  inviteCode: string | null;
}

export interface SignupItem {
  participantId: string;
  competitionId: string;
  competitionName: string;
  fighterName: string;
  clubName: string | null;
  requestedAt: string;
}

export interface SignupDecisionResult {
  participantId: string;
  status: "ACTIVE" | "LEFT" | null;
}

export interface NewInvite {
  inviteCode: string;
}

export interface NeedsYouResponse {
  objections: Array<{
    boutId: string;
    competitionId: string;
    competitionName: string;
    fighterA: string;
    fighterB: string;
    scoreA: number;
    scoreB: number;
    objectedBy: "A" | "B";
    reason: string | null;
    objectedAt: string;
  }>;
  awaitingReferee: Array<{
    boutId: string;
    competitionId: string;
    competitionName: string;
    fighterA: string;
    fighterB: string;
    scoreA: number;
    scoreB: number;
    refereeName: string;
    recordedAt: string;
  }>;
  /** Sign-ups waiting for an accept or decline, oldest first. */
  signups: SignupItem[];
}

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
  warnings: number;
  provisional: boolean;
}

export interface RatingChange {
  boutId: string;
  beforeA: number;
  afterA: number;
  beforeB: number;
  afterB: number;
}

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

export interface PersonRef {
  userId: string;
  name: string;
}

export interface ApiExchange {
  atSeconds: number;
  kind: "SCORE" | "DOUBLE" | "WARNING" | "TIME" | "ADJUSTMENT" | "DISQUALIFICATION";
  side: "A" | "B" | null;
  points: number;
  reason: string | null;
}

export interface BoutResponse {
  id: string;
  status: BoutStatus;
  revision: number;
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
  warningsA: number;
  warningsB: number;
  exchanges: ApiExchange[];
  windowEndsAt: string | null;
  fighterApproved: { A: boolean; B: boolean };
  objection: { by: "A" | "B"; at: string; reason: string | null } | null;
  voidReason: string | null;
  startedInCompetitionId: string | null;
  competitionIds: string[];
}

export interface ParticipantRow {
  id: string;
  competitionId: string;
  name: string;
  displayName: string | null;
  clubId: string | null;
  userId: string | null;
  kind: string;
}

export interface CompetitionAdminEntry {
  userId: string;
  name: string;
  username: string;
  role: "OWNER" | "CO_ADMIN";
}

export interface PersonSearchResult {
  userId: string;
  name: string;
  username: string;
  clubName: string | null;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  area: string | null;
  countryCode: string | null;
}

export type ObjectionResolution =
  | { kind: "restore" }
  | { kind: "void"; reason: string }
  | {
      kind: "correct";
      result: { scoreA: number; scoreB: number; winnerSide: "A" | "B" | null; warningsA: number; warningsB: number; exchanges: ApiExchange[] };
    };

export interface LiveTournamentSummary {
  id: string;
  name: string;
  googleSpreadsheetId: string | null;
  createdAt: string;
}

export interface LiveTournamentDetail extends LiveTournamentSummary {
  rings: Array<{ id: string; name: string; order: number }>;
}

/** What `POST .../import/xlsx` and `.../import/google` answer. `row` is the sheet row. */
export interface ImportReport {
  added: number;
  updated: number;
  skipped: Array<{ label: string; reason: "HAS_EXCHANGES" }>;
  errors: Array<{ row: number; message: string }>;
}

export type SyncState = "OK" | "ERROR" | "NOT_CONFIGURED" | "NO_SPREADSHEET" | "NO_BACKUP_FILE";

export interface SyncTarget {
  target: "LOCAL" | "GOOGLE";
  state: SyncState;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  pending: number;
  failed: number;
}

/** One ring with its secret keeper token, as the laptop person sees it. */
export interface LiveRingLink {
  id: string;
  tournamentId: string;
  name: string;
  order: number;
  keeperToken: string;
  activeKeeper: { userName: string; since: string } | null;
}

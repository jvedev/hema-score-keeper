import type BetterSqlite3 from "better-sqlite3";
import type { BackendDatabase } from "./db.js";

type NativeDatabase = InstanceType<typeof BetterSqlite3>;

/**
 * Version of {@link BASELINE_SCHEMA_SQL}, stored in `PRAGMA user_version`.
 * Until the first production release, schema changes edit the baseline directly and the dev database is
 * recreated (`npm run backend:db:reset`); real migrations keyed on this version come once production data exists.
 */
export const SCHEMA_VERSION = 1;

/** Every table of the baseline, in creation (dependency) order. Must list exactly the tables of `BackendDatabase`. */
export const BACKEND_TABLES = [
  "Club",
  "User",
  "UserSession",
  "EnrollmentToken",
  "PasswordResetToken",
  "Skill",
  "Event",
  "Ruleset",
  "EventAdmin",
  "EventSchedule",
  "ScheduleTimeSlot",
  "Arena",
  "Tournament",
  "TournamentAdmin",
  "Entry",
  "Stage",
  "StageArena",
  "StageOfficial",
  "ScheduledPhase",
  "ScheduledAssignment",
  "Round",
  "Match",
  "ScheduledMatch",
  "Exchange",
  "Competition",
  "CompetitionAdmin",
  "CompetitionParticipant",
  "CompetitionBout",
  "Bout",
  "BoutJury",
  "BoutTableOfficial",
  "BoutCompetition",
  "BoutRevision",
  "LiveTournament",
  "LiveTournamentFighter",
  "LiveRing",
  "LiveBout",
  "LiveBoutRevision",
  "LiveExchange",
  "LivePushSubscription",
  "LivePushJob",
] as const;

export type BackendTableName = (typeof BACKEND_TABLES)[number];

type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Compile-time guard: adding a table to `BackendDatabase` without listing it here (or vice versa) fails the build. */
const tablesMatchBackendDatabase: SameKeys<BackendTableName, keyof BackendDatabase> = true;
void tablesMatchBackendDatabase;

/**
 * The complete database schema. SQLite resolves foreign keys when rows are written, so the few nullable
 * back-pointers between Event-admin tables (Event.rulesetId, Tournament.currentStageId,
 * EventSchedule.currentTimeSlotId) may name a table that is created later in this script.
 */
export const BASELINE_SCHEMA_SQL = `
-- Accounts and clubs -------------------------------------------------------------------------

CREATE TABLE "Club" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "area" TEXT,
  "countryCode" TEXT
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clubId" TEXT REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT,
  "emailHash" TEXT,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "judgeVolunteer" INTEGER NOT NULL DEFAULT 0,
  "juryVolunteer" INTEGER NOT NULL DEFAULT 0,
  "tableVolunteer" INTEGER NOT NULL DEFAULT 0,
  "otherVolunteer" INTEGER NOT NULL DEFAULT 0,
  "language" TEXT NOT NULL DEFAULT 'en'
);
CREATE UNIQUE INDEX "User_username_key" ON "User" ("username");
CREATE UNIQUE INDEX "User_emailHash_key" ON "User" ("emailHash");
CREATE INDEX "User_clubId_idx" ON "User" ("clubId");
CREATE INDEX "User_role_idx" ON "User" ("role");
CREATE INDEX "User_status_idx" ON "User" ("status");

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "revokedAt" TEXT,
  "rememberMe" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "UserSession_refreshTokenHash_key" ON "UserSession" ("refreshTokenHash");
CREATE INDEX "UserSession_userId_idx" ON "UserSession" ("userId");

CREATE TABLE "EnrollmentToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "consumedAt" TEXT,
  "defaultClubId" TEXT REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EnrollmentToken_tokenHash_key" ON "EnrollmentToken" ("tokenHash");
CREATE INDEX "EnrollmentToken_userId_idx" ON "EnrollmentToken" ("userId");
CREATE INDEX "EnrollmentToken_defaultClubId_idx" ON "EnrollmentToken" ("defaultClubId");

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "emailHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "consumedAt" TEXT
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken" ("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken" ("userId");

CREATE TABLE "Skill" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "skillName" TEXT NOT NULL,
  "skillLevel" INTEGER NOT NULL
);
CREATE INDEX "Skill_userId_idx" ON "Skill" ("userId");

-- Event administration -----------------------------------------------------------------------

CREATE TABLE "Event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventName" TEXT NOT NULL,
  "rulesetId" TEXT REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "allFightersAreVolunteers" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "Ruleset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "definition" TEXT
);
CREATE UNIQUE INDEX "Ruleset_eventId_name_version_key" ON "Ruleset" ("eventId", "name", "version");

CREATE TABLE "EventAdmin" (
  "eventId" TEXT NOT NULL REFERENCES "Event" ("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "addedByUserId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL,
  "createdAt" TEXT NOT NULL,
  PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "EventAdmin_userId_idx" ON "EventAdmin" ("userId");

CREATE TABLE "EventSchedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "startTimeMinutes" INTEGER NOT NULL DEFAULT 540,
  "currentTimeSlotId" TEXT REFERENCES "ScheduleTimeSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EventSchedule_eventId_key" ON "EventSchedule" ("eventId");
CREATE UNIQUE INDEX "EventSchedule_currentTimeSlotId_key" ON "EventSchedule" ("currentTimeSlotId");

CREATE TABLE "ScheduleTimeSlot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scheduleId" TEXT NOT NULL REFERENCES "EventSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "order" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT,
  "isBreak" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "ScheduleTimeSlot_scheduleId_order_key" ON "ScheduleTimeSlot" ("scheduleId", "order");

CREATE TABLE "Arena" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "leftColor" TEXT NOT NULL DEFAULT '#21c15b',
  "rightColor" TEXT NOT NULL DEFAULT '#2f7dfa'
);
CREATE INDEX "Arena_eventId_idx" ON "Arena" ("eventId");

CREATE TABLE "Tournament" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdByUserId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "rulesetId" TEXT REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "currentStageId" TEXT REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL DEFAULT '#5B8CFF'
);
CREATE INDEX "Tournament_eventId_idx" ON "Tournament" ("eventId");
CREATE UNIQUE INDEX "Tournament_currentStageId_key" ON "Tournament" ("currentStageId");

CREATE TABLE "TournamentAdmin" (
  "tournamentId" TEXT NOT NULL REFERENCES "Tournament" ("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "addedByUserId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL,
  "createdAt" TEXT NOT NULL,
  PRIMARY KEY ("tournamentId", "userId")
);
CREATE INDEX "TournamentAdmin_userId_idx" ON "TournamentAdmin" ("userId");

CREATE TABLE "Entry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'FIGHTER',
  "seed" INTEGER
);
CREATE UNIQUE INDEX "Entry_tournamentId_userId_key" ON "Entry" ("tournamentId", "userId");
CREATE INDEX "Entry_userId_idx" ON "Entry" ("userId");

CREATE TABLE "Stage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "name" TEXT,
  "rulesetId" TEXT REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "minPoolSize" INTEGER,
  "maxPoolSize" INTEGER,
  "preferredPoolSize" INTEGER,
  "eliminationParticipantCount" INTEGER,
  "timeBetweenMatchesMinutes" INTEGER NOT NULL DEFAULT 2
);
CREATE INDEX "Stage_tournamentId_idx" ON "Stage" ("tournamentId");

CREATE TABLE "StageArena" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stageId" TEXT NOT NULL REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "arenaId" TEXT NOT NULL REFERENCES "Arena" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StageArena_stageId_arenaId_key" ON "StageArena" ("stageId", "arenaId");
CREATE INDEX "StageArena_arenaId_idx" ON "StageArena" ("arenaId");

CREATE TABLE "StageOfficial" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stageId" TEXT NOT NULL REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "entryId" TEXT NOT NULL REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" TEXT NOT NULL
);
CREATE UNIQUE INDEX "StageOfficial_stageId_entryId_role_key" ON "StageOfficial" ("stageId", "entryId", "role");
CREATE INDEX "StageOfficial_entryId_idx" ON "StageOfficial" ("entryId");

-- Several stages may share one arena in one time slot, so (arenaId, timeSlotId) is not unique.
CREATE TABLE "ScheduledPhase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stageId" TEXT NOT NULL REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "arenaId" TEXT NOT NULL REFERENCES "Arena" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "timeSlotId" TEXT NOT NULL REFERENCES "ScheduleTimeSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScheduledPhase_stageId_arenaId_timeSlotId_key" ON "ScheduledPhase" ("stageId", "arenaId", "timeSlotId");
CREATE INDEX "ScheduledPhase_arenaId_idx" ON "ScheduledPhase" ("arenaId");
CREATE INDEX "ScheduledPhase_timeSlotId_idx" ON "ScheduledPhase" ("timeSlotId");

CREATE TABLE "ScheduledAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scheduledPhaseId" TEXT NOT NULL REFERENCES "ScheduledPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ScheduledAssignment_scheduledPhaseId_userId_key" ON "ScheduledAssignment" ("scheduledPhaseId", "userId");
CREATE INDEX "ScheduledAssignment_userId_idx" ON "ScheduledAssignment" ("userId");

CREATE TABLE "Round" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stageId" TEXT NOT NULL REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "roundNumber" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "Round_stageId_roundNumber_key" ON "Round" ("stageId", "roundNumber");

CREATE TABLE "Match" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "roundId" TEXT NOT NULL REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "arenaId" TEXT REFERENCES "Arena" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "entryAId" TEXT REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "entryBId" TEXT REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "winnerEntryId" TEXT REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "scoreA" INTEGER,
  "scoreB" INTEGER,
  "rulesetId" TEXT REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Match_roundId_idx" ON "Match" ("roundId");
CREATE INDEX "Match_arenaId_idx" ON "Match" ("arenaId");

CREATE TABLE "ScheduledMatch" (
  "matchId" TEXT NOT NULL PRIMARY KEY REFERENCES "Match" ("id") ON DELETE CASCADE,
  "scheduledPhaseId" TEXT NOT NULL REFERENCES "ScheduledPhase" ("id") ON DELETE CASCADE,
  "order" INTEGER NOT NULL CHECK ("order" > 0)
);
CREATE UNIQUE INDEX "ScheduledMatch_scheduledPhaseId_order_key" ON "ScheduledMatch" ("scheduledPhaseId", "order");

CREATE TABLE "Exchange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "matchId" TEXT NOT NULL REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "scoreA" INTEGER,
  "scoreB" INTEGER,
  "details" TEXT
);
CREATE INDEX "Exchange_matchId_idx" ON "Exchange" ("matchId");

-- Competitions -------------------------------------------------------------------------------

CREATE TABLE "Competition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "rulesetJson" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "clubId" TEXT REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "scopeKind" TEXT NOT NULL DEFAULT 'OPEN',
  "scopeValuesJson" TEXT NOT NULL DEFAULT '[]',
  "acceptsOtherBouts" INTEGER NOT NULL DEFAULT 1,
  "signupsNeedApproval" INTEGER NOT NULL DEFAULT 0,
  "placeLimit" INTEGER,
  "inviteCode" TEXT
);
CREATE INDEX "Competition_status_idx" ON "Competition" ("status");
CREATE INDEX "Competition_date_idx" ON "Competition" ("date");
CREATE INDEX "Competition_visibility_idx" ON "Competition" ("visibility");
CREATE INDEX "Competition_clubId_idx" ON "Competition" ("clubId");
CREATE UNIQUE INDEX "Competition_inviteCode_key" ON "Competition" ("inviteCode") WHERE "inviteCode" IS NOT NULL;

CREATE TABLE "CompetitionAdmin" (
  "competitionId" TEXT NOT NULL REFERENCES "Competition" ("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('OWNER', 'CO_ADMIN')),
  PRIMARY KEY ("competitionId", "userId")
);
CREATE INDEX "CompetitionAdmin_userId_idx" ON "CompetitionAdmin" ("userId");
CREATE UNIQUE INDEX "CompetitionAdmin_one_owner_key" ON "CompetitionAdmin" ("competitionId") WHERE "role" = 'OWNER';

CREATE TABLE "CompetitionParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "competitionId" TEXT NOT NULL REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "displayName" TEXT,
  "linkedUserEmail" TEXT,
  "linkedUserEmailHash" TEXT,
  "clubId" TEXT REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "userId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'PENDING', 'LEFT')),
  "joinedAt" TEXT
);
CREATE UNIQUE INDEX "CompetitionParticipant_competitionId_userId_key" ON "CompetitionParticipant" ("competitionId", "userId");
CREATE INDEX "CompetitionParticipant_userId_idx" ON "CompetitionParticipant" ("userId");
CREATE INDEX "CompetitionParticipant_clubId_idx" ON "CompetitionParticipant" ("clubId");
CREATE INDEX "CompetitionParticipant_kind_idx" ON "CompetitionParticipant" ("kind");

CREATE TABLE "CompetitionBout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "competitionId" TEXT NOT NULL REFERENCES "Competition" ("id") ON DELETE CASCADE,
  "fighterAId" TEXT NOT NULL REFERENCES "CompetitionParticipant" ("id") ON DELETE CASCADE,
  "fighterBId" TEXT NOT NULL REFERENCES "CompetitionParticipant" ("id") ON DELETE CASCADE,
  "scoreA" INTEGER NOT NULL,
  "scoreB" INTEGER NOT NULL,
  "winnerParticipantId" TEXT REFERENCES "CompetitionParticipant" ("id") ON DELETE SET NULL,
  "date" TEXT NOT NULL,
  "published" INTEGER NOT NULL DEFAULT 1,
  "details" TEXT NOT NULL
);
CREATE INDEX "CompetitionBout_competitionId_idx" ON "CompetitionBout" ("competitionId");

-- Bouts (free-standing, counted for zero or more competitions) -------------------------------

CREATE TABLE "Bout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fighterAUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  "fighterBUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  "refereeUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  "ring" TEXT,
  "startedAt" TEXT NOT NULL,
  "scoreA" INTEGER NOT NULL,
  "scoreB" INTEGER NOT NULL,
  "winnerSide" TEXT CHECK ("winnerSide" IN ('A', 'B')),
  "warningsA" INTEGER NOT NULL DEFAULT 0,
  "warningsB" INTEGER NOT NULL DEFAULT 0,
  "exchangesJson" TEXT NOT NULL DEFAULT '[]',
  "startedInCompetitionId" TEXT REFERENCES "Competition" ("id") ON DELETE SET NULL,
  "createdByUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  "status" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TEXT,
  "fighterApprovedA" INTEGER NOT NULL DEFAULT 0,
  "fighterApprovedB" INTEGER NOT NULL DEFAULT 0,
  "objectionBy" TEXT CHECK ("objectionBy" IN ('A', 'B')),
  "objectionAt" TEXT,
  "objectionReason" TEXT,
  "voidReason" TEXT
);
CREATE INDEX "Bout_fighterAUserId_idx" ON "Bout" ("fighterAUserId");
CREATE INDEX "Bout_fighterBUserId_idx" ON "Bout" ("fighterBUserId");
CREATE INDEX "Bout_refereeUserId_idx" ON "Bout" ("refereeUserId");

CREATE TABLE "BoutJury" (
  "boutId" TEXT NOT NULL REFERENCES "Bout" ("id") ON DELETE CASCADE,
  "seat" INTEGER NOT NULL CHECK ("seat" BETWEEN 1 AND 4),
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("boutId", "seat"),
  UNIQUE ("boutId", "userId")
);

CREATE TABLE "BoutTableOfficial" (
  "boutId" TEXT NOT NULL REFERENCES "Bout" ("id") ON DELETE CASCADE,
  "seat" INTEGER NOT NULL CHECK ("seat" BETWEEN 1 AND 2),
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("boutId", "seat"),
  UNIQUE ("boutId", "userId")
);

CREATE TABLE "BoutCompetition" (
  "boutId" TEXT NOT NULL REFERENCES "Bout" ("id") ON DELETE CASCADE,
  "competitionId" TEXT NOT NULL REFERENCES "Competition" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("boutId", "competitionId")
);
CREATE INDEX "BoutCompetition_competitionId_idx" ON "BoutCompetition" ("competitionId");

CREATE TABLE "BoutRevision" (
  "boutId" TEXT NOT NULL REFERENCES "Bout" ("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL,
  "scoreA" INTEGER NOT NULL,
  "scoreB" INTEGER NOT NULL,
  "winnerSide" TEXT,
  "warningsA" INTEGER NOT NULL,
  "warningsB" INTEGER NOT NULL,
  "exchangesJson" TEXT NOT NULL,
  "replacedAt" TEXT NOT NULL,
  "replacedByUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  PRIMARY KEY ("boutId", "revision")
);

-- Tournament mode: the live projection of an Event-admin tournament ----------------------------

CREATE TABLE "LiveTournament" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "sourceTournamentId" TEXT NOT NULL UNIQUE REFERENCES "Tournament" ("id") ON DELETE CASCADE,
  "createdByUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  "createdAt" TEXT NOT NULL,
  "ruleset" TEXT
);

CREATE TABLE "LiveTournamentFighter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "LiveTournament" ("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE UNIQUE INDEX "LiveTournamentFighter_tournamentId_userId_key" ON "LiveTournamentFighter" ("tournamentId", "userId");
CREATE INDEX "LiveTournamentFighter_userId_idx" ON "LiveTournamentFighter" ("userId");

CREATE TABLE "LiveRing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "LiveTournament" ("id") ON DELETE CASCADE,
  "sourceArenaId" TEXT REFERENCES "Arena" ("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "keeperToken" TEXT NOT NULL,
  "activeDeviceId" TEXT,
  "activeUserId" TEXT REFERENCES "User" ("id"),
  "activeSince" TEXT,
  "scoreboardToken" TEXT NOT NULL,
  "leftColor" TEXT NOT NULL DEFAULT '#21c15b',
  "rightColor" TEXT NOT NULL DEFAULT '#2f7dfa'
);
CREATE UNIQUE INDEX "LiveRing_tournamentId_name_key" ON "LiveRing" ("tournamentId", "name");
CREATE UNIQUE INDEX "LiveRing_tournamentId_sourceArenaId_key" ON "LiveRing" ("tournamentId", "sourceArenaId") WHERE "sourceArenaId" IS NOT NULL;
CREATE UNIQUE INDEX "LiveRing_keeperToken_key" ON "LiveRing" ("keeperToken");
CREATE UNIQUE INDEX "LiveRing_scoreboardToken_key" ON "LiveRing" ("scoreboardToken");

CREATE TABLE "LiveBout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL REFERENCES "LiveTournament" ("id") ON DELETE CASCADE,
  "sourceMatchId" TEXT NOT NULL UNIQUE REFERENCES "Match" ("id") ON DELETE RESTRICT,
  "scheduledPhaseId" TEXT REFERENCES "ScheduledPhase" ("id") ON DELETE SET NULL,
  "sourceScheduleSignature" TEXT,
  "sourceResultSignature" TEXT,
  "ringId" TEXT NOT NULL REFERENCES "LiveRing" ("id") ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "fighterLeft" TEXT NOT NULL,
  "fighterRight" TEXT NOT NULL,
  "fighterLeftId" TEXT REFERENCES "LiveTournamentFighter" ("id") ON DELETE SET NULL,
  "fighterRightId" TEXT REFERENCES "LiveTournamentFighter" ("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'RUNNING', 'DONE')),
  "startedAt" TEXT,
  "finishedAt" TEXT,
  "clockSeconds" INTEGER NOT NULL DEFAULT 0,
  "clockRunning" INTEGER NOT NULL DEFAULT 0,
  "clockUpdatedAt" TEXT,
  "round" INTEGER NOT NULL DEFAULT 1,
  "period" TEXT NOT NULL DEFAULT 'REGULAR' CHECK ("period" IN ('REGULAR', 'BREAK', 'EXTENSION', 'SUDDEN_DEATH')),
  "extension" INTEGER NOT NULL DEFAULT 0,
  "periodStartedAt" TEXT,
  "warningsLeft" INTEGER NOT NULL DEFAULT 0,
  "warningsRight" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "LiveBout_ringId_order_idx" ON "LiveBout" ("ringId", "order");

CREATE TABLE "LiveBoutRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "boutId" TEXT NOT NULL REFERENCES "LiveBout" ("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "boutStateJson" TEXT NOT NULL,
  "exchangesJson" TEXT NOT NULL,
  "replacedAt" TEXT NOT NULL,
  "replacedByUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  UNIQUE ("boutId", "revision")
);

CREATE TABLE "LiveExchange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "boutId" TEXT NOT NULL REFERENCES "LiveBout" ("id") ON DELETE CASCADE,
  "seq" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('EXCHANGE', 'DEDUCTION')),
  "leftPoints" INTEGER NOT NULL,
  "rightPoints" INTEGER NOT NULL,
  "isDouble" INTEGER NOT NULL DEFAULT 0,
  "firstScorer" TEXT CHECK ("firstScorer" IN ('LEFT', 'RIGHT')),
  "round" INTEGER NOT NULL DEFAULT 1,
  "clientExchangeId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL REFERENCES "User" ("id"),
  "createdAt" TEXT NOT NULL,
  "undoneAt" TEXT
);
CREATE UNIQUE INDEX "LiveExchange_boutId_clientExchangeId_key" ON "LiveExchange" ("boutId", "clientExchangeId");
CREATE UNIQUE INDEX "LiveExchange_boutId_seq_key" ON "LiveExchange" ("boutId", "seq");

CREATE TABLE "LivePushSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX "LivePushSubscription_userId_idx" ON "LivePushSubscription" ("userId");

CREATE TABLE "LivePushJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL REFERENCES "LivePushSubscription" ("id") ON DELETE CASCADE,
  "tournamentId" TEXT NOT NULL REFERENCES "LiveTournament" ("id") ON DELETE CASCADE,
  "boutId" TEXT NOT NULL REFERENCES "LiveBout" ("id") ON DELETE CASCADE,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'SENDING', 'DONE', 'FAILED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TEXT NOT NULL,
  "lastError" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  UNIQUE ("boutId", "subscriptionId")
);
CREATE INDEX "LivePushJob_status_nextAttemptAt_idx" ON "LivePushJob" ("status", "nextAttemptAt");
`;

/** The database holds data from another schema than this backend's baseline; it must be recreated. */
export class DatabaseSchemaError extends Error {
  constructor(foundVersion: number) {
    super(
      `This database was not created by this version of the backend (schema version ${foundVersion}, expected ${SCHEMA_VERSION}). ` +
        "Old databases are not upgraded: recreate the database. In development run `npm run backend:db:reset` " +
        "(it keeps a backup of the old file); elsewhere move the database file away and start the server again.",
    );
    this.name = "DatabaseSchemaError";
  }
}

export type SchemaState = "created" | "current";

function schemaVersion(database: NativeDatabase): number {
  return database.pragma("user_version", { simple: true }) as number;
}

function hasSchemaObjects(database: NativeDatabase): boolean {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get() !== undefined;
}

/**
 * Creates the baseline schema on an empty database (in one transaction, stamped with {@link SCHEMA_VERSION}),
 * accepts a database that already has the current version, and refuses anything else.
 */
export function ensureBaselineSchema(database: NativeDatabase): SchemaState {
  const version = schemaVersion(database);
  if (version === SCHEMA_VERSION) {
    return "current";
  }
  if (version !== 0 || hasSchemaObjects(database)) {
    throw new DatabaseSchemaError(version);
  }
  database.transaction(() => {
    database.exec(BASELINE_SCHEMA_SQL);
    database.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
  return "created";
}

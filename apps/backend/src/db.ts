import path from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect, type Transaction } from "kysely";
import type { EntryKind, ScheduleRole, StageOfficialRole, StageType } from "./api-types.js";
import { initializeCompetitionDatabase } from "./competition-bootstrap.js";

export type SqliteBoolean = 0 | 1;

interface UserTable {
  id: string;
  username: string;
  judgeVolunteer: SqliteBoolean;
  juryVolunteer: SqliteBoolean;
  tableVolunteer: SqliteBoolean;
  otherVolunteer: SqliteBoolean;
}

interface SkillTable {
  id: string;
  userId: string;
  skillName: string;
  skillLevel: number;
}

interface EventTable {
  id: string;
  eventName: string;
  rulesetId: string | null;
  allFightersAreVolunteers: SqliteBoolean;
}

interface EventScheduleTable {
  id: string;
  eventId: string;
  startTimeMinutes: number;
  currentTimeSlotId: string | null;
}

interface ScheduleTimeSlotTable {
  id: string;
  scheduleId: string;
  order: number;
  durationMinutes: number;
  label: string;
  color: string | null;
  isBreak: SqliteBoolean;
}

interface TournamentTable {
  id: string;
  eventId: string;
  name: string;
  rulesetId: string | null;
  currentStageId: string | null;
  order: number;
  color: string;
}

interface EntryTable {
  id: string;
  tournamentId: string;
  userId: string;
  kind: EntryKind;
  seed: number | null;
}

interface ArenaTable {
  id: string;
  eventId: string;
  name: string;
  order: number;
  leftColor: string;
  rightColor: string;
}

interface StageTable {
  id: string;
  tournamentId: string;
  type: StageType;
  name: string | null;
  rulesetId: string | null;
  minPoolSize: number | null;
  maxPoolSize: number | null;
  preferredPoolSize: number | null;
  eliminationParticipantCount: number | null;
  timeBetweenMatchesMinutes: number;
}

interface ScheduledPhaseTable {
  id: string;
  stageId: string;
  arenaId: string;
  timeSlotId: string;
}

interface ScheduledAssignmentTable {
  id: string;
  scheduledPhaseId: string;
  userId: string;
  role: ScheduleRole;
}

interface StageArenaTable {
  id: string;
  stageId: string;
  arenaId: string;
}

interface StageOfficialTable {
  id: string;
  stageId: string;
  entryId: string;
  role: StageOfficialRole;
}

interface RoundTable {
  id: string;
  stageId: string;
  roundNumber: number;
}

interface MatchTable {
  id: string;
  roundId: string;
  arenaId: string | null;
  entryAId: string | null;
  entryBId: string | null;
  winnerEntryId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  rulesetId: string | null;
}

interface ExchangeTable {
  id: string;
  matchId: string;
  scoreA: number | null;
  scoreB: number | null;
  details: string | null;
}

interface CompetitionTable {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  rulesetJson: string;
}

interface CompetitionParticipantTable {
  id: string;
  competitionId: string;
  name: string;
  linkedUserEmail: string | null;
}

interface CompetitionBoutTable {
  id: string;
  competitionId: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  published: SqliteBoolean;
  details: string;
}

export interface BackendDatabase {
  User: UserTable;
  Skill: SkillTable;
  Event: EventTable;
  EventSchedule: EventScheduleTable;
  ScheduleTimeSlot: ScheduleTimeSlotTable;
  Tournament: TournamentTable;
  Entry: EntryTable;
  Arena: ArenaTable;
  Stage: StageTable;
  ScheduledPhase: ScheduledPhaseTable;
  ScheduledAssignment: ScheduledAssignmentTable;
  StageArena: StageArenaTable;
  StageOfficial: StageOfficialTable;
  Round: RoundTable;
  Match: MatchTable;
  Ruleset: {
    id: string;
    eventId: string;
    name: string;
    version: number;
    definition: string | null;
  };
  Exchange: ExchangeTable;
  Competition: CompetitionTable;
  CompetitionParticipant: CompetitionParticipantTable;
  CompetitionBout: CompetitionBoutTable;
}

export type DbExecutor = Kysely<BackendDatabase> | Transaction<BackendDatabase>;

function resolveDatabasePath(databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db"): string {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = path.resolve(moduleDir, "..");
  const databaseDir = path.join(appRoot, "data");
  const filePath = databaseUrl.slice("file:".length);

  if (filePath === ":memory:") {
    return filePath;
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(databaseDir, filePath);
}

export function createDatabase(): Kysely<BackendDatabase> {
  const native = new BetterSqlite3(resolveDatabasePath());
  native.pragma("foreign_keys = ON");
  initializeCompetitionDatabase(native);

  return new Kysely<BackendDatabase>({
    dialect: new SqliteDialect({ database: native }),
  });
}

export const db = createDatabase();

export function fromSqliteBoolean(value: SqliteBoolean | boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

export function toSqliteBoolean(value: boolean): SqliteBoolean {
  return value ? 1 : 0;
}

import type { FastifyInstance } from "fastify";
import BetterSqlite3 from "better-sqlite3";
import {
  type Kysely,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
} from "kysely";
import type { AccountRole } from "../src/api-types.js";
import { signAccessToken } from "../src/auth.js";
import { initializeDatabase, type BackendDatabase } from "../src/db.js";
import { createApp } from "../src/server.js";

export interface TestContext {
  app: FastifyInstance;
  database: Kysely<BackendDatabase>;
}

export interface TestUser {
  id: string;
  role: AccountRole;
  clubId: string | null;
}

export class TestClock {
  private current = Date.parse("2026-10-15T20:00:00.000Z");

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current += ms;
  }

  set(iso: string): void {
    this.current = Date.parse(iso);
  }
}

/**
 * Lets other work run after every query, as a slower real database would. better-sqlite3 answers at once,
 * so without this, requests sent together never interleave and races can't show up in tests.
 */
export class YieldAfterEachQuery implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    await new Promise((resolve) => setImmediate(resolve));
    return args.result;
  }
}

export async function createTestContext(options: { now?: () => Date; plugins?: KyselyPlugin[] } = {}): Promise<TestContext> {
  const native = new BetterSqlite3(":memory:");
  native.exec(`
    CREATE TABLE Event (
      id TEXT PRIMARY KEY,
      eventName TEXT NOT NULL,
      rulesetId TEXT,
      allFightersAreVolunteers INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE Tournament (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rulesetId TEXT,
      currentStageId TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#5B8CFF'
    );
    CREATE TABLE Ruleset (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      minPoolSize INTEGER NOT NULL DEFAULT 4,
      maxPoolSize INTEGER NOT NULL DEFAULT 6,
      preferredPoolSize INTEGER NOT NULL DEFAULT 5,
      timeBetweenMatchesMinutes INTEGER NOT NULL DEFAULT 2,
      definition TEXT NOT NULL
    );
    CREATE TABLE Stage (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES Tournament(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT,
      rulesetId TEXT REFERENCES Ruleset(id) ON DELETE SET NULL,
      minPoolSize INTEGER,
      maxPoolSize INTEGER,
      preferredPoolSize INTEGER,
      eliminationParticipantCount INTEGER,
      timeBetweenMatchesMinutes INTEGER NOT NULL DEFAULT 2
    );
    CREATE TABLE Arena (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      leftColor TEXT NOT NULL DEFAULT '#21c15b',
      rightColor TEXT NOT NULL DEFAULT '#2f7dfa'
    );
    CREATE TABLE Entry (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES Tournament(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'FIGHTER',
      seed INTEGER
    );
    CREATE TABLE StageArena (
      id TEXT PRIMARY KEY,
      stageId TEXT NOT NULL REFERENCES Stage(id) ON DELETE CASCADE,
      arenaId TEXT NOT NULL REFERENCES Arena(id) ON DELETE CASCADE
    );
    CREATE TABLE StageOfficial (
      id TEXT PRIMARY KEY,
      stageId TEXT NOT NULL REFERENCES Stage(id) ON DELETE CASCADE,
      entryId TEXT NOT NULL REFERENCES Entry(id) ON DELETE CASCADE,
      role TEXT NOT NULL
    );
    CREATE TABLE Round (
      id TEXT PRIMARY KEY,
      stageId TEXT NOT NULL REFERENCES Stage(id) ON DELETE CASCADE,
      roundNumber INTEGER NOT NULL
    );
    CREATE TABLE Match (
      id TEXT PRIMARY KEY,
      roundId TEXT NOT NULL REFERENCES Round(id) ON DELETE CASCADE,
      arenaId TEXT REFERENCES Arena(id) ON DELETE SET NULL,
      entryAId TEXT REFERENCES Entry(id) ON DELETE SET NULL,
      entryBId TEXT REFERENCES Entry(id) ON DELETE SET NULL,
      winnerEntryId TEXT REFERENCES Entry(id) ON DELETE SET NULL,
      scoreA INTEGER,
      scoreB INTEGER,
      rulesetId TEXT REFERENCES Ruleset(id) ON DELETE SET NULL
    );
    CREATE TABLE Exchange (
      id TEXT PRIMARY KEY,
      matchId TEXT NOT NULL REFERENCES Match(id) ON DELETE CASCADE,
      scoreA INTEGER,
      scoreB INTEGER,
      details TEXT
    );
    CREATE TABLE EventSchedule (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
      startTimeMinutes INTEGER NOT NULL DEFAULT 540,
      currentTimeSlotId TEXT
    );
    CREATE TABLE ScheduleTimeSlot (
      id TEXT PRIMARY KEY,
      scheduleId TEXT NOT NULL REFERENCES EventSchedule(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      durationMinutes INTEGER NOT NULL,
      label TEXT NOT NULL,
      color TEXT,
      isBreak INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE ScheduledPhase (
      id TEXT PRIMARY KEY,
      stageId TEXT NOT NULL REFERENCES Stage(id) ON DELETE CASCADE,
      arenaId TEXT NOT NULL REFERENCES Arena(id) ON DELETE CASCADE,
      timeSlotId TEXT NOT NULL REFERENCES ScheduleTimeSlot(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX ScheduledPhase_arenaId_timeSlotId_key
      ON ScheduledPhase(arenaId, timeSlotId);
    CREATE TABLE ScheduledAssignment (
      id TEXT PRIMARY KEY,
      scheduledPhaseId TEXT NOT NULL REFERENCES ScheduledPhase(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      role TEXT NOT NULL
    );
  `);
  let database = initializeDatabase(native);
  for (const plugin of options.plugins ?? []) {
    database = database.withPlugin(plugin);
  }
  const app = createApp(database, options.now ? { now: options.now } : {});
  await app.ready();
  return { app, database };
}

export async function insertClub(
  database: Kysely<BackendDatabase>,
  input: { id: string; slug?: string; name?: string },
): Promise<void> {
  await database
    .insertInto("Club")
    .values({ id: input.id, slug: input.slug ?? input.id, name: input.name ?? input.id })
    .execute();
}

export async function insertUser(
  database: Kysely<BackendDatabase>,
  input: { id: string; role: AccountRole; clubId?: string | null; name?: string },
): Promise<TestUser> {
  const clubId = input.clubId ?? null;
  await database
    .insertInto("User")
    .values({
      id: input.id,
      clubId,
      name: input.name ?? input.id,
      username: input.id,
      passwordHash: null,
      emailHash: null,
      role: input.role,
      status: "ACTIVE",
      judgeVolunteer: 0,
      juryVolunteer: 0,
      tableVolunteer: 0,
      otherVolunteer: 0,
    })
    .execute();
  return { id: input.id, role: input.role, clubId };
}

export async function insertEventAdmin(
  database: Kysely<BackendDatabase>,
  input: { eventId: string; userId: string; addedByUserId?: string | null; createdAt?: string },
): Promise<void> {
  await database
    .insertInto("EventAdmin")
    .values({
      eventId: input.eventId,
      userId: input.userId,
      addedByUserId: input.addedByUserId === undefined ? input.userId : input.addedByUserId,
      createdAt: input.createdAt ?? "2026-11-08T10:00:00.000Z",
    })
    .execute();
}

export function bearer(user: TestUser): { authorization: string } {
  return { authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role, clubId: user.clubId })}` };
}

/** A competition with the given users enrolled as participants (participant id = `${competitionId}:${userId}`). */
export async function insertCompetition(
  database: Kysely<BackendDatabase>,
  input: { id: string; status: string; userIds: string[]; adminUserId?: string; adminRole?: "OWNER" | "CO_ADMIN"; date?: string },
): Promise<void> {
  await database
    .insertInto("Competition")
    .values({
      id: input.id,
      name: input.id,
      slug: input.id,
      status: input.status,
      date: input.date ?? "2026-10-01",
      rulesetJson: "{}",
      visibility: "PUBLIC",
      clubId: null,
    })
    .execute();
  for (const userId of input.userIds) {
    await database
      .insertInto("CompetitionParticipant")
      .values({
        id: `${input.id}:${userId}`,
        competitionId: input.id,
        name: userId,
        displayName: userId,
        linkedUserEmail: null,
        linkedUserEmailHash: null,
        clubId: null,
        userId,
        kind: "MEMBER",
      })
      .execute();
  }
  if (input.adminUserId) {
    await database
      .insertInto("CompetitionAdmin")
      .values({ competitionId: input.id, userId: input.adminUserId, role: input.adminRole ?? "OWNER" })
      .execute();
  }
}

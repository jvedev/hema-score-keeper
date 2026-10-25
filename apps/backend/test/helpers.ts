import type { FastifyInstance } from "fastify";
import {
  sql,
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
import { createDatabase, type BackendDatabase } from "../src/db.js";
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
  let database = createDatabase("file::memory:");
  for (const plugin of options.plugins ?? []) {
    database = database.withPlugin(plugin);
  }
  // Created outside the competition bootstrap in real databases; user lookups join it.
  await sql`
    CREATE TABLE IF NOT EXISTS Skill (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      skillName TEXT NOT NULL,
      skillLevel INTEGER NOT NULL
    )
  `.execute(database);
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

import type { FastifyInstance } from "fastify";
import { sql, type Kysely } from "kysely";
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

export async function createTestContext(): Promise<TestContext> {
  const database = createDatabase("file::memory:");
  // Created outside the competition bootstrap in real databases; user lookups join it.
  await sql`
    CREATE TABLE IF NOT EXISTS Skill (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      skillName TEXT NOT NULL,
      skillLevel INTEGER NOT NULL
    )
  `.execute(database);
  const app = createApp(database);
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

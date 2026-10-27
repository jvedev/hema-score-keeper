import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { hashPassword } from "./auth.js";
import type { BackendDatabase } from "./db.js";

export interface CreateAdminInput {
  username: string;
  name: string;
  password: string;
}

/** Creates an active SYSTEM_ADMIN. Used by the create-admin script to bootstrap a fresh database. */
export async function createAdmin(database: Kysely<BackendDatabase>, input: CreateAdminInput): Promise<string> {
  const username = input.username.trim();
  const name = input.name.trim();
  if (!username || !name) {
    throw new Error("Username and name are required.");
  }
  if (!input.password) {
    throw new Error("Password is required.");
  }
  const existing = await database.selectFrom("User").select("id").where("username", "=", username).executeTakeFirst();
  if (existing) {
    throw new Error(`A user named "${username}" already exists.`);
  }
  const id = randomUUID();
  await database
    .insertInto("User")
    .values({
      id,
      clubId: null,
      name,
      username,
      passwordHash: hashPassword(input.password),
      emailHash: null,
      role: "SYSTEM_ADMIN",
      status: "ACTIVE",
      judgeVolunteer: 0,
      juryVolunteer: 0,
      tableVolunteer: 0,
      otherVolunteer: 0,
    })
    .execute();
  return id;
}

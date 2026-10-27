import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdmin } from "../src/create-admin.js";
import { createDatabase, type BackendDatabase } from "../src/db.js";
import { createApp } from "../src/server.js";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";

let database: Kysely<BackendDatabase>;
let app: FastifyInstance;

beforeEach(async () => {
  // A brand-new database: only the normal bootstrap and migrations, nothing else created by hand.
  database = createDatabase("file::memory:");
  app = createApp(database);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("fresh database", () => {
  it("login works on a fresh database", async () => {
    await createAdmin(database, { username: "venue-admin", name: "Venue Admin", password: "correct horse battery" });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "venue-admin", password: "correct horse battery" },
    });

    expect(response.statusCode).toBe(200);
    const user = await database.selectFrom("User").select(["role", "status"]).where("username", "=", "venue-admin").executeTakeFirstOrThrow();
    expect(user).toEqual({ role: "SYSTEM_ADMIN", status: "ACTIVE" });
  });

  it("create-admin refuses a duplicate username", async () => {
    await createAdmin(database, { username: "venue-admin", name: "Venue Admin", password: "first password" });

    await expect(
      createAdmin(database, { username: "venue-admin", name: "Other", password: "second password" }),
    ).rejects.toThrow(/already exists/);
  });
});

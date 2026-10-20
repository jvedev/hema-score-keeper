import type { FastifyInstance } from "fastify";
import { sql, type Kysely } from "kysely";
import { resolveAccessUser } from "./access-user.js";
import type { BackendDatabase } from "./db.js";
import { ensureObject, HttpError, requireString } from "./http.js";

const MAX_RESULTS = 20;

export interface PersonSearchResult {
  userId: string;
  name: string;
  username: string;
  clubName: string | null;
}

/** Lets anyone who is logged in find people to name as officials; returns no roles or emails. */
export function registerPeopleRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.get("/api/v1/people", async (request): Promise<PersonSearchResult[]> => {
    if (!(await resolveAccessUser(request, database))) {
      throw new HttpError(401, "Not authenticated.");
    }
    const query = requireString(ensureObject(request.query ?? {}, "Query").q, "Search text");
    if (query.length < 2) {
      throw new HttpError(400, "Type at least two characters to search.");
    }
    // `%` and `_` in what people type are plain characters, not wildcards.
    const pattern = `%${query.replace(/[!%_]/g, (character) => `!${character}`)}%`;
    return database
      .selectFrom("User")
      .leftJoin("Club", "Club.id", "User.clubId")
      .select(["User.id as userId", "User.name as name", "User.username as username", "Club.name as clubName"])
      .where((eb) =>
        eb.or([
          sql<boolean>`${eb.ref("User.name")} LIKE ${pattern} ESCAPE '!'`,
          sql<boolean>`${eb.ref("User.username")} LIKE ${pattern} ESCAPE '!'`,
        ]),
      )
      .orderBy("User.name")
      .limit(MAX_RESULTS)
      .execute();
  });
}

import type { FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import { verifyJwt } from "./auth.js";
import type { BackendDatabase } from "./db.js";
import { ensureObject, HttpError, requireString } from "./http.js";

export interface AccessUser {
  id: string;
  clubId: string | null;
  role: "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
}

export async function resolveAccessUser(request: FastifyRequest, database: Kysely<BackendDatabase>): Promise<AccessUser | null> {
  const authorization = request.headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  const claims = verifyJwt(token, "access");
  const user = await database.selectFrom("User").selectAll().where("id", "=", claims.sub).executeTakeFirst();
  if (!user) {
    throw new HttpError(401, "Authenticated user not found.");
  }

  return {
    id: user.id,
    clubId: user.clubId,
    role: user.role as AccessUser["role"],
  };
}

export async function requireAdminUser(request: FastifyRequest, database: Kysely<BackendDatabase>): Promise<AccessUser> {
  const user = await resolveAccessUser(request, database);
  if (!user || user.role === "USER") {
    throw new HttpError(403, "Competition admin access required.");
  }
  return user;
}

export function requirePathParam(request: FastifyRequest, key: string): string {
  const params = ensureObject(request.params ?? {}, "Route parameters");
  return requireString(params[key], key);
}

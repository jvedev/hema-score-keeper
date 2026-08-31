import {
  createHmac,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { HttpError } from "./http.js";
import type { AccountRole } from "./api-types.js";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "development-auth-secret";
const EMAIL_HASH_SECRET = process.env.AUTH_EMAIL_PEPPER ?? AUTH_SECRET;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AuthJwtClaims {
  sub: string;
  role: AccountRole;
  clubId: string | null;
  tokenType: "access" | "refresh";
  jti: string;
  iat: number;
  exp: number;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  refreshTokenHash: string;
}

type AuthTokenPayload = Omit<AuthJwtClaims, "iat" | "exp" | "tokenType" | "jti">;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHmac("sha256", EMAIL_HASH_SECRET).update(normalizeEmail(email)).digest("hex");
}

export function generateToken(length = 32): string {
  return randomBytes(length).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const salt = parts[1];
  const expectedHash = parts[2];
  if (!salt || !expectedHash) {
   return false;
  }

  const expected = Buffer.from(expectedHash, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signJwtPayload(payload: Omit<AuthJwtClaims, "iat" | "exp" | "jti">, ttlSeconds: number): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: AuthJwtClaims = {
    ...payload,
    jti: randomUUID(),
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", AUTH_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return signJwtPayload({ ...payload, tokenType: "access" }, ACCESS_TOKEN_TTL_SECONDS);
}

export function signRefreshToken(
  payload: AuthTokenPayload,
  ttlSeconds = REFRESH_TOKEN_TTL_SECONDS,
): string {
  return signJwtPayload({ ...payload, tokenType: "refresh" }, ttlSeconds);
}

export function verifyJwt(token: string, expectedType?: AuthJwtClaims["tokenType"]): AuthJwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new HttpError(401, "Invalid token.");
  }

  const encodedHeader = parts[0]!;
  const encodedPayload = parts[1]!;
  const signature = parts[2]!;
  const expectedSignature = createHmac("sha256", AUTH_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  if (signature !== expectedSignature) {
    throw new HttpError(401, "Invalid token.");
  }

  let payload: AuthJwtClaims;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AuthJwtClaims;
  } catch {
    throw new HttpError(401, "Invalid token.");
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, "Token expired.");
  }
  if (expectedType && payload.tokenType !== expectedType) {
    throw new HttpError(401, "Invalid token type.");
  }

  return payload;
}

export function createAuthTokenPair(
  payload: AuthTokenPayload,
  refreshTokenTtlSeconds = REFRESH_TOKEN_TTL_SECONDS,
): AuthTokenPair {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload, refreshTokenTtlSeconds);
  const accessClaims = verifyJwt(accessToken, "access");
  const refreshClaims = verifyJwt(refreshToken, "refresh");

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(accessClaims.exp * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(refreshClaims.exp * 1000).toISOString(),
    refreshTokenHash: hashToken(refreshToken),
  };
}

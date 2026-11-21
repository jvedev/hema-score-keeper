import path from "node:path";
import { mkdirSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import { appDataDir } from "./app-root.js";
import { ensureBaselineSchema } from "./schema.js";

// Side-effect free on import, so scripts (seed, reset, create-admin) can open the database the same way the server does.

type NativeDatabase = InstanceType<typeof BetterSqlite3>;

export const DEFAULT_DATABASE_URL = "file:./dev.db";

/** `file:` URLs are resolved against the app data dir (`APP_DATA_DIR`, default `apps/backend/data`). */
export function resolveDatabasePath(
  databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const filePath = databaseUrl.slice("file:".length);
  if (filePath === ":memory:") {
    return filePath;
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(appDataDir(env), filePath);
}

/** Turns on foreign keys, creates the baseline schema on an empty database (or refuses an old one) and adds demo data. */
export function prepareNativeDatabase(native: NativeDatabase): NativeDatabase {
  native.pragma("foreign_keys = ON");
  ensureBaselineSchema(native);
  return native;
}

/** Opens (creating it when missing) and prepares the database file that `databaseUrl` points to. */
export function openNativeDatabase(databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): NativeDatabase {
  const databasePath = resolveDatabasePath(databaseUrl);
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const native = new BetterSqlite3(databasePath);
  try {
    return prepareNativeDatabase(native);
  } catch (error) {
    native.close();
    throw error;
  }
}

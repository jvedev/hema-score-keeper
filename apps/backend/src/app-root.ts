import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The backend app's root folder (apps/backend), the same from `src/` (tests) and from `dist/` (the built server).
 * Default data paths hang off it, so they don't depend on the working directory the server was started from.
 */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Persistent application data may be relocated independently of release files with `APP_DATA_DIR`. */
export function appDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(APP_ROOT, "data");
}

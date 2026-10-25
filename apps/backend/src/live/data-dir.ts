import path from "node:path";
import { APP_ROOT } from "../app-root.js";

/** Where the live tournaments keep their files: `LIVE_DATA_DIR`, or `data/live` under the backend app root. */
export function liveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.LIVE_DATA_DIR || path.join(APP_ROOT, "data", "live");
}

/** Where each tournament's local backup workbook lives: `<live data dir>/<tournamentId>/backup.xlsx`. */
export function backupPath(tournamentId: string): string {
  return path.join(liveDataDir(), tournamentId, "backup.xlsx");
}

import type { Selectable, Updateable } from "kysely";
import type { ApiScoreboardSettings, ScoreboardTextSize, ScoreboardTheme } from "../api-types.js";
import { fromSqliteBoolean, toSqliteBoolean, type BackendDatabase, type DbExecutor } from "../db.js";
import { ensureObject, HttpError } from "../http.js";

type LiveRingRow = Selectable<BackendDatabase["LiveRing"]>;

export const SCOREBOARD_TEXT_SIZES: readonly ScoreboardTextSize[] = ["SMALL", "MEDIUM", "LARGE"];
export const SCOREBOARD_THEMES: readonly ScoreboardTheme[] = ["DARK", "LIGHT"];
const SETTING_KEYS = ["mirrored", "showNext", "textSize", "theme"] as const;

export function scoreboardSettingsOf(ring: Pick<LiveRingRow, "scoreboardMirrored" | "scoreboardShowNext" | "scoreboardTextSize" | "scoreboardTheme">): ApiScoreboardSettings {
  return {
    mirrored: fromSqliteBoolean(ring.scoreboardMirrored),
    showNext: fromSqliteBoolean(ring.scoreboardShowNext),
    textSize: ring.scoreboardTextSize,
    theme: ring.scoreboardTheme,
  };
}

function requireBooleanSetting(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new HttpError(400, `${label} must be true or false.`);
  return value;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new HttpError(400, `${label} must be one of ${allowed.join(", ")}.`);
  }
  return value as T;
}

/** All four settings, nothing else (400 otherwise). */
export function parseScoreboardSettings(body: unknown): ApiScoreboardSettings {
  const object = ensureObject(body, "Scoreboard settings");
  const unknownKey = Object.keys(object).find((key) => !(SETTING_KEYS as readonly string[]).includes(key));
  if (unknownKey !== undefined) throw new HttpError(400, `Unknown scoreboard setting: ${unknownKey}.`);
  return {
    mirrored: requireBooleanSetting(object.mirrored, "mirrored"),
    showNext: requireBooleanSetting(object.showNext, "showNext"),
    textSize: requireOneOf(object.textSize, SCOREBOARD_TEXT_SIZES, "textSize"),
    theme: requireOneOf(object.theme, SCOREBOARD_THEMES, "theme"),
  };
}

export function scoreboardColumns(settings: ApiScoreboardSettings): Updateable<BackendDatabase["LiveRing"]> {
  return {
    scoreboardMirrored: toSqliteBoolean(settings.mirrored),
    scoreboardShowNext: toSqliteBoolean(settings.showNext),
    scoreboardTextSize: settings.textSize,
    scoreboardTheme: settings.theme,
  };
}

/** The Event whose colour palette a ring picks from: its live tournament's source Tournament's event. */
export async function ringEventId(executor: DbExecutor, ringId: string): Promise<string> {
  const row = await executor
    .selectFrom("LiveRing")
    .innerJoin("LiveTournament", "LiveTournament.id", "LiveRing.tournamentId")
    .innerJoin("Tournament", "Tournament.id", "LiveTournament.sourceTournamentId")
    .select("Tournament.eventId")
    .where("LiveRing.id", "=", ringId)
    .executeTakeFirst();
  if (!row) throw new HttpError(404, "Ring not found.");
  return row.eventId;
}

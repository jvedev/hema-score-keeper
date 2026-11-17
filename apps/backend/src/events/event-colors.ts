import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { ApiEventColor, EventColorPreset } from "../api-types.js";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { HttpError } from "../http.js";

type EventColorRow = Selectable<BackendDatabase["EventColor"]>;

/** A palette keeps at least this many colours: a bout needs two different ones. */
export const MIN_EVENT_COLORS = 2;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The palette every new Event starts with; left red and right blue are the arena defaults. */
export const DEFAULT_EVENT_COLORS: ReadonlyArray<{ preset: EventColorPreset; hex: string }> = [
  { preset: "RED", hex: "#d62828" },
  { preset: "BLUE", hex: "#2f7dfa" },
];

export function toApiEventColor(row: EventColorRow): ApiEventColor {
  return { id: row.id, eventId: row.eventId, name: row.name, preset: row.preset, hex: row.hex, order: row.order };
}

export async function insertDefaultEventColors(executor: DbExecutor, eventId: string): Promise<void> {
  await executor
    .insertInto("EventColor")
    .values(DEFAULT_EVENT_COLORS.map((color, index) => ({ id: randomUUID(), eventId, name: null, preset: color.preset, hex: color.hex, order: index })))
    .execute();
}

export async function loadEventColors(executor: DbExecutor, eventIds: readonly string[]): Promise<Map<string, ApiEventColor[]>> {
  const byEvent = new Map<string, ApiEventColor[]>();
  if (eventIds.length === 0) return byEvent;
  const rows = await executor.selectFrom("EventColor").selectAll().where("eventId", "in", [...eventIds]).orderBy("eventId").orderBy("order").execute();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push(toApiEventColor(row));
    byEvent.set(row.eventId, list);
  }
  return byEvent;
}

export async function eventPalette(executor: DbExecutor, eventId: string): Promise<ApiEventColor[]> {
  return (await loadEventColors(executor, [eventId])).get(eventId) ?? [];
}

/** `#rrggbb` in lower case, or 400. */
export function requireHexColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) throw new HttpError(400, `${label} must be a colour like #d62828.`);
  return value.toLowerCase();
}

export interface ColorPair {
  leftColor: string;
  rightColor: string;
}

/** Checks a left/right pair against the event palette: both in it and different (400 otherwise). Returns them in lower case. */
export async function requirePaletteColors(executor: DbExecutor, eventId: string, pair: { leftColor: unknown; rightColor: unknown }): Promise<ColorPair> {
  const leftColor = requireHexColor(pair.leftColor, "leftColor");
  const rightColor = requireHexColor(pair.rightColor, "rightColor");
  if (leftColor === rightColor) throw new HttpError(400, "The left and right colour must differ.");
  const palette = new Set((await eventPalette(executor, eventId)).map((color) => color.hex));
  for (const [label, color] of [["leftColor", leftColor], ["rightColor", rightColor]] as const) {
    if (!palette.has(color)) throw new HttpError(400, `${label} is not one of the event's colours.`);
  }
  return { leftColor, rightColor };
}

/** The first two palette colours: the default left and right colour of a new arena. */
export async function defaultPaletteColors(executor: DbExecutor, eventId: string): Promise<ColorPair> {
  const [left, right] = await eventPalette(executor, eventId);
  if (!left || !right) throw new HttpError(409, "This event needs at least two colours first.");
  return { leftColor: left.hex, rightColor: right.hex };
}

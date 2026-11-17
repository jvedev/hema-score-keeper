import type { ApiEventColor, ApiLiveRingColors } from "@hema/event-admin-api";
import { t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A palette colour's name: its own, or the translated name of its built-in preset. */
export function eventColorLabel(color: Pick<ApiEventColor, "name" | "preset" | "hex">): string {
  if (color.name) return color.name;
  return color.preset ? t(`eventColors.preset.${color.preset}`) : color.hex;
}

/** `<option>`s for a colour select. A current colour outside the palette stays listed (as its hex) so it is not silently changed. */
export function renderColorOptions(palette: readonly ApiEventColor[], selected: string): string {
  const known = palette.some((color) => color.hex === selected);
  const options = palette.map((color) => `<option value="${escapeHtml(color.hex)}"${color.hex === selected ? " selected" : ""}>${escapeHtml(eventColorLabel(color))}</option>`);
  if (!known && selected) options.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
  return options.join("");
}

/** A left/right colour select pair, for the arena form and the live ring cards. */
export function renderColorSelect(name: "leftColor" | "rightColor", label: string, palette: readonly ApiEventColor[], selected: string): string {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="text-input" name="${name}" required>${renderColorOptions(palette, selected)}</select>
    </label>
  `;
}

/** The colours from a left/right form: both from the palette and different, or null. */
export function readPaletteColors(form: FormData, palette: readonly ApiEventColor[]): ApiLiveRingColors | null {
  const leftColor = String(form.get("leftColor") ?? "").toLowerCase();
  const rightColor = String(form.get("rightColor") ?? "").toLowerCase();
  const hexes = new Set(palette.map((color) => color.hex));
  return hexes.has(leftColor) && hexes.has(rightColor) && leftColor !== rightColor ? { leftColor, rightColor } : null;
}

/** The first two palette colours: what a new arena starts with. */
export function defaultArenaColors(palette: readonly ApiEventColor[]): ApiLiveRingColors {
  return { leftColor: palette[0]?.hex ?? "", rightColor: palette[1]?.hex ?? "" };
}

export interface EventColorValues {
  name: string;
  hex: string;
}

/** A colour row's name and hex, or null when the name is empty or the hex is not `#rrggbb`. */
export function readEventColorForm(form: FormData): EventColorValues | null {
  const name = String(form.get("name") ?? "").trim();
  const hex = String(form.get("hex") ?? "").toLowerCase();
  return name !== "" && HEX_COLOR.test(hex) ? { name, hex } : null;
}

/** What changed in a colour row. An unnamed preset whose shown (translated) name was left alone keeps no name. */
export function eventColorChanges(color: ApiEventColor, values: EventColorValues): { name?: string; hex?: string } {
  const nameChanged = color.name === null ? values.name !== eventColorLabel(color) : values.name !== color.name;
  return { ...(nameChanged ? { name: values.name } : {}), ...(values.hex !== color.hex ? { hex: values.hex } : {}) };
}

/** The palette's colour ids with one moved up or down; null when it cannot move that way. */
export function movedColorIds(palette: readonly ApiEventColor[], colorId: string, direction: "up" | "down"): string[] | null {
  const ids = palette.map((color) => color.id);
  const index = ids.indexOf(colorId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids;
}

/** Palette refusals the backend names with a `reason`; each has its own message in the catalogues. */
const EVENT_COLOR_ERROR_REASONS = ["COLOR_IN_USE", "TOO_FEW_COLORS"] as const;
type EventColorErrorReason = (typeof EVENT_COLOR_ERROR_REASONS)[number];

function isEventColorErrorReason(value: unknown): value is EventColorErrorReason {
  return (EVENT_COLOR_ERROR_REASONS as readonly unknown[]).includes(value);
}

/** The `reason` of a refused request (the API client keeps the JSON error body on the error), if any. */
function refusalReason(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("body" in error)) return undefined;
  const body: unknown = error.body;
  return typeof body === "object" && body !== null && "reason" in body ? body.reason : undefined;
}

/** A palette change failure in the admin's language: by the backend's reason code, else a general message. */
export function eventColorErrorMessage(error: unknown): string {
  const reason = refusalReason(error);
  return isEventColorErrorReason(reason) ? t(`eventColors.error.${reason}`) : t("eventColors.error.generic");
}

export interface EventColorsView {
  readonly palette: readonly ApiEventColor[];
  readonly busy: boolean;
  readonly notice: string | null;
  readonly error: string | null;
}

/** The event palette editor (event admins): rename, recolour, reorder, remove and add colours. */
export function renderEventColors(view: EventColorsView): string {
  const disabled = view.busy ? " disabled" : "";
  const last = view.palette.length - 1;
  const rows = view.palette
    .map(
      (color, index) => `
        <form class="event-color-row" data-action="event-color-save" data-color-id="${escapeHtml(color.id)}">
          <span class="tournament-color" style="background-color: ${escapeHtml(color.hex)}" aria-hidden="true"></span>
          <input class="text-input" name="name" value="${escapeHtml(eventColorLabel(color))}" aria-label="${escapeHtml(t("eventColors.name"))}" required maxlength="40" />
          <input class="event-color-hex" type="color" name="hex" value="${escapeHtml(color.hex)}" aria-label="${escapeHtml(t("eventColors.hex"))}" />
          <button type="submit" class="button secondary"${disabled}>${escapeHtml(t("eventColors.save"))}</button>
          <button type="button" class="button secondary icon-button" data-action="event-color-move" data-direction="up" data-color-id="${escapeHtml(color.id)}" title="${escapeHtml(t("eventColors.moveUp"))}" aria-label="${escapeHtml(t("eventColors.moveUp"))}"${index === 0 ? " disabled" : disabled}>↑</button>
          <button type="button" class="button secondary icon-button" data-action="event-color-move" data-direction="down" data-color-id="${escapeHtml(color.id)}" title="${escapeHtml(t("eventColors.moveDown"))}" aria-label="${escapeHtml(t("eventColors.moveDown"))}"${index === last ? " disabled" : disabled}>↓</button>
          <button type="button" class="button secondary" data-action="event-color-remove" data-color-id="${escapeHtml(color.id)}"${view.palette.length <= 2 ? " disabled" : disabled}>${escapeHtml(t("eventColors.remove"))}</button>
        </form>`,
    )
    .join("");
  return `
    <section class="info-card event-colors" aria-label="${escapeHtml(t("eventColors.heading"))}">
      <div class="info-card-title">${escapeHtml(t("eventColors.heading"))}</div>
      <div class="info-card-subtitle">${escapeHtml(t("eventColors.note"))}</div>
      ${view.notice ? `<p class="event-color-notice" role="status">${escapeHtml(view.notice)}</p>` : ""}
      ${view.error ? `<p class="event-color-error" role="alert">${escapeHtml(view.error)}</p>` : ""}
      <div class="event-color-list">${rows}</div>
      <form class="event-color-row" data-action="event-color-add">
        <input class="text-input" name="name" placeholder="${escapeHtml(t("eventColors.name"))}" aria-label="${escapeHtml(t("eventColors.name"))}" required maxlength="40" />
        <input class="event-color-hex" type="color" name="hex" value="#ffd400" aria-label="${escapeHtml(t("eventColors.hex"))}" />
        <button type="submit" class="button"${disabled}>${escapeHtml(t("eventColors.add"))}</button>
      </form>
    </section>
  `;
}

import { ApiError } from "@hema/api-session";
import type { ActiveKeeper, LiveRing, PaletteColor, RingColors, ScoreboardSettings, ScoreboardTextSize, ScoreboardTheme } from "./live-client";
import type { Translate } from "./ring-texts";

/** Kept free of @hema/ui (DOM components) so it is testable in Node; ring mode passes in `t` and `escapeHtml`. */

/** What the scoreboard looks like until the table changes it (the backend's defaults). */
export const DEFAULT_SCOREBOARD_SETTINGS: Readonly<ScoreboardSettings> = { mirrored: false, showNext: true, textSize: "MEDIUM", theme: "DARK" };
/** The ring colours when the backend sends none (the default event palette's red and blue). */
export const DEFAULT_RING_COLORS: Readonly<RingColors> = { leftColor: "#d62828", rightColor: "#2f7dfa" };

export const TEXT_SIZES: readonly ScoreboardTextSize[] = ["SMALL", "MEDIUM", "LARGE"];
export const THEMES: readonly ScoreboardTheme[] = ["DARK", "LIGHT"];

export type Side = "left" | "right";

export function ringColors(ring: LiveRing | null): RingColors {
  return { leftColor: ring?.leftColor ?? DEFAULT_RING_COLORS.leftColor, rightColor: ring?.rightColor ?? DEFAULT_RING_COLORS.rightColor };
}

export function scoreboardSettings(ring: LiveRing | null): ScoreboardSettings {
  return { ...DEFAULT_SCOREBOARD_SETTINGS, ...(ring?.scoreboard ?? {}) };
}

/** Picking the other side's colour swaps the two, so left and right never end up the same. */
export function colorsAfterPick(current: RingColors, side: Side, hex: string): RingColors {
  const other = side === "left" ? current.rightColor : current.leftColor;
  const mine = side === "left" ? current.leftColor : current.rightColor;
  const otherNext = other === hex ? mine : other;
  return side === "left" ? { leftColor: hex, rightColor: otherNext } : { leftColor: otherNext, rightColor: hex };
}

/** A palette colour's name: its own, or the translated name of its built-in preset. */
export function paletteLabel(color: Pick<PaletteColor, "name" | "preset" | "hex">, t: Translate): string {
  if (color.name) return color.name;
  return color.preset ? t(`eventColors.preset.${color.preset}`) : color.hex;
}

/** What the ring settings writes need from the backend. `LiveClient` is the real one. */
export interface RingSettingsApi {
  setRingColors(ringToken: string, colors: RingColors): Promise<{ ring: LiveRing }>;
  setScoreboardSettings(ringToken: string, settings: ScoreboardSettings): Promise<{ ring: LiveRing }>;
}

/** The ring the panel works on, and what to do with the answers. `RingController` provides it. */
export interface RingSettingsHost {
  ringToken(): string;
  ring(): LiveRing | null;
  isKeeper(): boolean;
  ringChanged(ring: LiveRing): void;
  takenOver(activeKeeper: ActiveKeeper | null): void;
  render(): void;
}

export interface RingSettingsState {
  open: boolean;
  saving: boolean;
  error: string | null;
}

/**
 * The ring settings panel: the ring's fighter colours and its scoreboard settings, written straight away on each tap.
 * Only the keeper may write; one write at a time (the buttons are disabled while saving).
 */
export class RingSettingsPanel {
  #state: RingSettingsState = { open: false, saving: false, error: null };

  constructor(
    private readonly api: RingSettingsApi,
    private readonly host: RingSettingsHost,
  ) {}

  get state(): Readonly<RingSettingsState> {
    return this.#state;
  }

  toggle(): void {
    this.#set({ open: !this.#state.open, error: null });
  }

  close(): void {
    if (this.#state.open) this.#set({ open: false, error: null });
  }

  pickColor(side: Side, hex: string): Promise<void> {
    const colors = colorsAfterPick(ringColors(this.host.ring()), side, hex);
    return this.#write((token) => this.api.setRingColors(token, colors));
  }

  setScoreboard(change: Partial<ScoreboardSettings>): Promise<void> {
    const settings = { ...scoreboardSettings(this.host.ring()), ...change };
    return this.#write((token) => this.api.setScoreboardSettings(token, settings));
  }

  async #write(send: (token: string) => Promise<{ ring: LiveRing }>): Promise<void> {
    if (this.#state.saving || !this.host.isKeeper() || !this.host.ring()) return;
    this.#set({ saving: true, error: null });
    try {
      const { ring } = await send(this.host.ringToken());
      this.host.ringChanged(ring);
      this.#set({ saving: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.body.reason === "TAKEN_OVER") {
        this.#set({ saving: false, open: false });
        this.host.takenOver(activeKeeperOf(error.body.activeKeeper));
        return;
      }
      this.#set({ saving: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  #set(changes: Partial<RingSettingsState>): void {
    this.#state = { ...this.#state, ...changes };
    this.host.render();
  }
}

function activeKeeperOf(value: unknown): ActiveKeeper | null {
  if (typeof value !== "object" || value === null) return null;
  const { userName, since } = value as { userName?: unknown; since?: unknown };
  return typeof userName === "string" && typeof since === "string" ? { userName, since } : null;
}

// --- rendering (data is escaped) ---

type Escape = (value: string) => string;

function pressed(on: boolean): string {
  return ` aria-pressed="${on ? "true" : "false"}"`;
}

function colorRow(side: Side, current: string, palette: readonly PaletteColor[], disabled: string, t: Translate, escape: Escape): string {
  const swatches = palette
    .map(
      (color) => `<button type="button" class="ring-swatch" data-action="ring-color" data-side="${side}" data-hex="${escape(color.hex)}"${pressed(color.hex === current)}${disabled}>
          <span class="ring-swatch-color" style="background:${escape(color.hex)}"></span>${escape(paletteLabel(color, t))}</button>`,
    )
    .join("");
  return `<div class="ring-setting"><span class="ring-setting-label">${escape(t(side === "left" ? "ring.settingsLeft" : "ring.settingsRight"))}</span>
      <div class="ring-setting-options">${swatches}</div></div>`;
}

function toggleRow(setting: "mirrored" | "showNext", on: boolean, disabled: string, t: Translate, escape: Escape, hint?: string): string {
  return `<div class="ring-setting"><span class="ring-setting-label">${escape(t(`scoreboardSettings.${setting}`))}</span>
      <div class="ring-setting-options">
        <button type="button" class="ring-choice" data-action="ring-scoreboard" data-setting="${setting}" data-value="true"${pressed(on)}${disabled}>${escape(t("scoreboardSettings.on"))}</button>
        <button type="button" class="ring-choice" data-action="ring-scoreboard" data-setting="${setting}" data-value="false"${pressed(!on)}${disabled}>${escape(t("scoreboardSettings.off"))}</button>
      </div>${hint ? `<small class="ring-setting-hint">${escape(hint)}</small>` : ""}</div>`;
}

function choiceRow(setting: "textSize" | "theme", values: readonly string[], current: string, disabled: string, t: Translate, escape: Escape): string {
  const buttons = values
    .map((value) => `<button type="button" class="ring-choice" data-action="ring-scoreboard" data-setting="${setting}" data-value="${value}"${pressed(value === current)}${disabled}>${escape(t(`scoreboardSettings.${setting}.${value}`))}</button>`)
    .join("");
  return `<div class="ring-setting"><span class="ring-setting-label">${escape(t(`scoreboardSettings.${setting}`))}</span><div class="ring-setting-options">${buttons}</div></div>`;
}

/** The settings button and, when open, the panel. Only the keeper sees it (only the keeper may write). */
export function renderRingSettings(state: Readonly<RingSettingsState>, ring: LiveRing | null, palette: readonly PaletteColor[], isKeeper: boolean, t: Translate, escape: Escape): string {
  if (!isKeeper || !ring) return "";
  const button = `<div class="mode-actions"><button type="button" class="mode-button" data-action="ring-settings" aria-expanded="${state.open ? "true" : "false"}">${escape(t(state.open ? "ring.settingsClose" : "ring.settings"))}</button></div>`;
  if (!state.open) return button;
  const colors = ringColors(ring);
  const settings = scoreboardSettings(ring);
  const disabled = state.saving ? " disabled" : "";
  const colorRows =
    palette.length === 0
      ? `<p class="mode-copy">${escape(t("ring.settingsNoPalette"))}</p>`
      : `${colorRow("left", colors.leftColor, palette, disabled, t, escape)}${colorRow("right", colors.rightColor, palette, disabled, t, escape)}`;
  return `${button}
    <section class="ring-settings" aria-label="${escape(t("ring.settings"))}">
      <h2>${escape(t("ring.settingsColors"))}</h2>
      ${colorRows}
      <h2>${escape(t("scoreboardSettings.heading"))}</h2>
      ${toggleRow("mirrored", settings.mirrored, disabled, t, escape, t("scoreboardSettings.mirroredHint"))}
      ${toggleRow("showNext", settings.showNext, disabled, t, escape)}
      ${choiceRow("textSize", TEXT_SIZES, settings.textSize, disabled, t, escape)}
      ${choiceRow("theme", THEMES, settings.theme, disabled, t, escape)}
      ${state.saving ? `<p class="mode-copy" role="status">${escape(t("ring.settingsSaving"))}</p>` : ""}
      ${state.error ? `<p class="ring-notice" role="alert">${escape(t("ring.settingsFailed", { error: state.error }))}</p>` : ""}
    </section>`;
}

/** Reads a tapped scoreboard setting button into a change, or null for an unknown one. */
export function scoreboardChange(setting: string | undefined, value: string | undefined): Partial<ScoreboardSettings> | null {
  switch (setting) {
    case "mirrored":
    case "showNext":
      return value === "true" || value === "false" ? { [setting]: value === "true" } : null;
    case "textSize":
      return (TEXT_SIZES as readonly string[]).includes(value ?? "") ? { textSize: value as ScoreboardTextSize } : null;
    case "theme":
      return (THEMES as readonly string[]).includes(value ?? "") ? { theme: value as ScoreboardTheme } : null;
    default:
      return null;
  }
}

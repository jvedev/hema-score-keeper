import type { ApiEventColor } from "@hema/event-admin-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultArenaColors,
  eventColorChanges,
  eventColorErrorMessage,
  eventColorLabel,
  movedColorIds,
  readEventColorForm,
  readPaletteColors,
  renderColorOptions,
  renderEventColors,
} from "./event-colors";

const palette: ApiEventColor[] = [
  { id: "red", eventId: "e", name: null, preset: "RED", hex: "#d62828", order: 0 },
  { id: "blue", eventId: "e", name: null, preset: "BLUE", hex: "#2f7dfa", order: 1 },
  { id: "yellow", eventId: "e", name: "Geel <1>", preset: null, hex: "#ffd400", order: 2 },
];

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("event colours", () => {
  const originalLang = document.documentElement.lang;
  beforeEach(() => {
    document.documentElement.lang = "nl";
  });
  afterEach(() => {
    document.documentElement.lang = originalLang;
  });

  it("names presets in the viewer's language and keeps own names", () => {
    expect(eventColorLabel(palette[0]!)).toBe("Rood");
    expect(eventColorLabel(palette[1]!)).toBe("Blauw");
    expect(eventColorLabel(palette[2]!)).toBe("Geel <1>");
  });

  it("offers the palette as options, escaped, keeping an unknown current colour visible", () => {
    const html = renderColorOptions(palette, "#2f7dfa");
    expect(html).toContain('<option value="#2f7dfa" selected>Blauw</option>');
    expect(html).toContain("Geel &lt;1&gt;");
    expect(renderColorOptions(palette, "#123456")).toMatch(/^<option value="#123456" selected>#123456<\/option>/);
  });

  it("reads a left/right pair only from the palette and only when different", () => {
    expect(readPaletteColors(formOf({ leftColor: "#FFD400", rightColor: "#d62828" }), palette)).toEqual({ leftColor: "#ffd400", rightColor: "#d62828" });
    expect(readPaletteColors(formOf({ leftColor: "#d62828", rightColor: "#d62828" }), palette)).toBeNull();
    expect(readPaletteColors(formOf({ leftColor: "#000000", rightColor: "#d62828" }), palette)).toBeNull();
  });

  it("a new arena starts with the first two colours", () => {
    expect(defaultArenaColors(palette)).toEqual({ leftColor: "#d62828", rightColor: "#2f7dfa" });
  });

  it("reads a colour row and sends only what changed", () => {
    expect(readEventColorForm(formOf({ name: " Wit ", hex: "#FFFFFF" }))).toEqual({ name: "Wit", hex: "#ffffff" });
    expect(readEventColorForm(formOf({ name: " ", hex: "#ffffff" }))).toBeNull();
    expect(readEventColorForm(formOf({ name: "Wit", hex: "white" }))).toBeNull();
    // An unnamed preset shown as "Rood": unchanged unless the admin typed another name.
    expect(eventColorChanges(palette[0]!, { name: "Rood", hex: "#d62828" })).toEqual({});
    expect(eventColorChanges(palette[0]!, { name: "Scharlaken", hex: "#b00020" })).toEqual({ name: "Scharlaken", hex: "#b00020" });
    expect(eventColorChanges(palette[2]!, { name: "Geel <1>", hex: "#ffee00" })).toEqual({ hex: "#ffee00" });
  });

  it("moves a colour up or down within the palette", () => {
    expect(movedColorIds(palette, "blue", "up")).toEqual(["blue", "red", "yellow"]);
    expect(movedColorIds(palette, "blue", "down")).toEqual(["red", "yellow", "blue"]);
    expect(movedColorIds(palette, "red", "up")).toBeNull();
    expect(movedColorIds(palette, "yellow", "down")).toBeNull();
    expect(movedColorIds(palette, "nope", "up")).toBeNull();
  });

  it("renders the editor: a row per colour, remove disabled at two colours", () => {
    const html = renderEventColors({ palette, busy: false, notice: null, error: null });
    expect(html.match(/data-action="event-color-save"/g)).toHaveLength(3);
    expect(html).toContain('data-action="event-color-add"');
    expect(html).toMatch(/data-action="event-color-remove" data-color-id="red">/);
    const two = renderEventColors({ palette: palette.slice(0, 2), busy: false, notice: null, error: "Kapot" });
    expect(two).toMatch(/data-action="event-color-remove" data-color-id="red" disabled>/);
    expect(two).toContain('role="alert">Kapot<');
  });

  it("names palette refusals by their reason code, with a general fallback", () => {
    const refusal = (body: Record<string, unknown>) => Object.assign(new Error("English server text"), { status: 409, body });
    expect(eventColorErrorMessage(refusal({ reason: "COLOR_IN_USE" }))).toBe("Deze kleur wordt gebruikt door een arena of ring. Kies daar eerst een andere kleur.");
    expect(eventColorErrorMessage(refusal({ reason: "TOO_FEW_COLORS" }))).toBe("Een evenement houdt minstens twee kleuren.");
    expect(eventColorErrorMessage(refusal({ reason: "SOMETHING_ELSE" }))).toBe("De kleuren konden niet worden opgeslagen. Probeer het opnieuw.");
    expect(eventColorErrorMessage(new TypeError("Failed to fetch"))).toBe("De kleuren konden niet worden opgeslagen. Probeer het opnieuw.");
  });
});

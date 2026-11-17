import { ApiError } from "@hema/api-session";
import { describe, expect, it } from "vitest";
import type { ActiveKeeper, LiveRing, PaletteColor, RingColors, ScoreboardSettings } from "./live-client";
import {
  colorsAfterPick,
  paletteLabel,
  renderRingSettings,
  RingSettingsPanel,
  scoreboardChange,
  type RingSettingsApi,
  type RingSettingsHost,
  type RingSettingsState,
} from "./ring-settings";

const RED = "#d62828";
const BLUE = "#2f7dfa";
const YELLOW = "#ffd400";
const palette: PaletteColor[] = [
  { id: "c1", name: null, preset: "RED", hex: RED },
  { id: "c2", name: null, preset: "BLUE", hex: BLUE },
  { id: "c3", name: "Geel", preset: null, hex: YELLOW },
];
const ring = (patch: Partial<LiveRing> = {}): LiveRing => ({
  id: "r1",
  tournamentId: "t1",
  name: "Ring 1",
  order: 1,
  leftColor: RED,
  rightColor: BLUE,
  scoreboard: { mirrored: false, showNext: true, textSize: "MEDIUM", theme: "DARK" },
  ...patch,
});
const tr = (key: string, params?: Record<string, string | number>) => (params ? `${key}(${Object.values(params).join(",")})` : key);
const escape = (value: string) => value.replace(/</g, "&lt;");

class FakeApi implements RingSettingsApi {
  calls: Array<{ token: string; body: RingColors | ScoreboardSettings }> = [];
  fail: Error | null = null;
  setRingColors = async (token: string, colors: RingColors) => this.#answer(token, colors, { ...colors });
  setScoreboardSettings = async (token: string, settings: ScoreboardSettings) => this.#answer(token, settings, { scoreboard: settings });
  async #answer(token: string, body: RingColors | ScoreboardSettings, change: Partial<LiveRing>) {
    this.calls.push({ token, body });
    if (this.fail) throw this.fail;
    return { ring: ring(change) };
  }
}

class FakeHost implements RingSettingsHost {
  current: LiveRing | null = ring();
  keeper = true;
  renders = 0;
  lostTo: Array<ActiveKeeper | null> = [];
  ringToken = () => "tok";
  ring = () => this.current;
  isKeeper = () => this.keeper;
  ringChanged = (changed: LiveRing) => {
    this.current = { ...this.current!, ...changed };
  };
  takenOver = (activeKeeper: ActiveKeeper | null) => {
    this.lostTo.push(activeKeeper);
    this.keeper = false;
  };
  render = () => {
    this.renders += 1;
  };
}

describe("ring settings", () => {
  it("picking the other side's colour swaps the two", () => {
    const current = { leftColor: RED, rightColor: BLUE };
    expect(colorsAfterPick(current, "left", YELLOW)).toEqual({ leftColor: YELLOW, rightColor: BLUE });
    expect(colorsAfterPick(current, "left", BLUE)).toEqual({ leftColor: BLUE, rightColor: RED });
    expect(colorsAfterPick(current, "right", RED)).toEqual({ leftColor: BLUE, rightColor: RED });
    expect(colorsAfterPick(current, "right", BLUE)).toEqual(current);
  });

  it("names a colour by its own name or its translated preset", () => {
    expect(paletteLabel(palette[0]!, tr)).toBe("eventColors.preset.RED");
    expect(paletteLabel(palette[2]!, tr)).toBe("Geel");
  });

  it("reads only known scoreboard settings", () => {
    expect(scoreboardChange("mirrored", "true")).toEqual({ mirrored: true });
    expect(scoreboardChange("showNext", "false")).toEqual({ showNext: false });
    expect(scoreboardChange("textSize", "LARGE")).toEqual({ textSize: "LARGE" });
    expect(scoreboardChange("theme", "LIGHT")).toEqual({ theme: "LIGHT" });
    expect(scoreboardChange("theme", "GREY")).toBeNull();
    expect(scoreboardChange("mirrored", "yes")).toBeNull();
    expect(scoreboardChange("other", "true")).toBeNull();
  });

  it("writes a colour pick and a scoreboard change straight away, and the ring takes the answer", async () => {
    const api = new FakeApi();
    const host = new FakeHost();
    const panel = new RingSettingsPanel(api, host);
    panel.toggle();
    expect(panel.state.open).toBe(true);
    await panel.pickColor("left", BLUE);
    expect(api.calls[0]).toEqual({ token: "tok", body: { leftColor: BLUE, rightColor: RED } });
    expect(host.current).toMatchObject({ leftColor: BLUE, rightColor: RED });
    await panel.setScoreboard({ mirrored: true });
    expect(api.calls[1]!.body).toEqual({ mirrored: true, showNext: true, textSize: "MEDIUM", theme: "DARK" });
    expect(host.current?.scoreboard?.mirrored).toBe(true);
    expect(panel.state).toEqual({ open: true, saving: false, error: null });
  });

  it("a ring without settings from an older backend starts from the defaults", async () => {
    const api = new FakeApi();
    const host = new FakeHost();
    host.current = { id: "r1", tournamentId: "t1", name: "Ring 1", order: 1 };
    await new RingSettingsPanel(api, host).setScoreboard({ theme: "LIGHT" });
    expect(api.calls[0]!.body).toEqual({ mirrored: false, showNext: true, textSize: "MEDIUM", theme: "LIGHT" });
  });

  it("does not write when this device does not keep the ring, or while a write is on its way", async () => {
    const api = new FakeApi();
    const host = new FakeHost();
    host.keeper = false;
    const panel = new RingSettingsPanel(api, host);
    await panel.pickColor("left", BLUE);
    expect(api.calls).toHaveLength(0);
    host.keeper = true;
    const first = panel.setScoreboard({ theme: "LIGHT" });
    expect(panel.state.saving).toBe(true);
    await panel.setScoreboard({ theme: "DARK" });
    await first;
    expect(api.calls).toHaveLength(1);
  });

  it("taken over: the panel closes and the ring turns read-only", async () => {
    const api = new FakeApi();
    const host = new FakeHost();
    const keeper = { userName: "Bob", since: "2026-11-17T10:00:00Z" };
    api.fail = new ApiError("Taken over.", 409, undefined, { reason: "TAKEN_OVER", activeKeeper: keeper });
    const panel = new RingSettingsPanel(api, host);
    panel.toggle();
    await panel.pickColor("right", YELLOW);
    expect(host.lostTo).toEqual([keeper]);
    expect(panel.state).toEqual({ open: false, saving: false, error: null });
  });

  it("another failure is shown and the ring keeps its settings", async () => {
    const api = new FakeApi();
    const host = new FakeHost();
    api.fail = new ApiError("leftColor is not one of the event's colours.", 400, undefined);
    const panel = new RingSettingsPanel(api, host);
    await panel.pickColor("left", "#000000");
    expect(panel.state.error).toBe("leftColor is not one of the event's colours.");
    expect(host.current?.leftColor).toBe(RED);
  });

  describe("rendering", () => {
    const closed: RingSettingsState = { open: false, saving: false, error: null };
    const open: RingSettingsState = { open: true, saving: false, error: null };

    it("only the keeper sees the settings, closed until asked", () => {
      expect(renderRingSettings(open, ring(), palette, false, tr, escape)).toBe("");
      const html = renderRingSettings(closed, ring(), palette, true, tr, escape);
      expect(html).toContain('data-action="ring-settings" aria-expanded="false"');
      expect(html).not.toContain("ring-swatch");
    });

    it("shows the palette per side and the four scoreboard settings, the current ones pressed", () => {
      const html = renderRingSettings(open, ring({ scoreboard: { mirrored: true, showNext: false, textSize: "LARGE", theme: "LIGHT" } }), palette, true, tr, escape);
      expect(html.match(/data-action="ring-color" data-side="left"/g)).toHaveLength(3);
      expect(html).toContain(`data-side="left" data-hex="${RED}" aria-pressed="true"`);
      expect(html).toContain(`data-side="right" data-hex="${BLUE}" aria-pressed="true"`);
      expect(html).toContain(`data-side="left" data-hex="${BLUE}" aria-pressed="false"`);
      expect(html).toContain("Geel");
      expect(html).toContain('data-setting="mirrored" data-value="true" aria-pressed="true"');
      expect(html).toContain('data-setting="showNext" data-value="false" aria-pressed="true"');
      expect(html).toContain('data-setting="textSize" data-value="LARGE" aria-pressed="true"');
      expect(html).toContain('data-setting="theme" data-value="LIGHT" aria-pressed="true"');
      expect(html).not.toContain(" disabled");
    });

    it("disables the choices while saving and shows a failure", () => {
      const saving = renderRingSettings({ open: true, saving: true, error: null }, ring(), palette, true, tr, escape);
      expect(saving).toContain(" disabled");
      expect(saving).toContain("ring.settingsSaving");
      expect(renderRingSettings({ open: true, saving: false, error: "<boom>" }, ring(), palette, true, tr, escape)).toContain("ring.settingsFailed(&lt;boom>)");
      expect(renderRingSettings(open, ring(), [], true, tr, escape)).toContain("ring.settingsNoPalette");
    });
  });
});

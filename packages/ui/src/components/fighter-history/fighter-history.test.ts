import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { FighterBoutView, FighterSummaryView } from "../../models/competition-views.js";
import "./fighter-history.js";
import type { FighterHistory } from "./fighter-history.js";

const summary: FighterSummaryView = {
  name: "Ilse Bakker",
  clubName: "Zwaardkring Leiden",
  since: "2024-04-01",
  rating: 1641,
  ratingHistory: [1500, 1520, 1512, 1560, 1600, 1655, 1641],
  bouts: 37,
  wins: 24,
  draws: 2,
  losses: 11,
  warnings: 3,
};

const approvals = { referee: true, own: true, opponent: true };
const bouts: FighterBoutView[] = [
  { boutId: "b1", foughtAt: "2026-10-15T18:40:00.000Z", location: "Ochs Utrecht, ring 2", opponentName: "Tomas Kuiper", ownScore: 3, opponentScore: 5, result: "LOSS", ratingChange: -14, status: "FINAL", approvals, voidReason: null },
  { boutId: "b2", foughtAt: "2026-10-12T17:10:00.000Z", location: "Leiden, main hall", opponentName: "Joris Meijer", ownScore: 4, opponentScore: 4, result: "DRAW", ratingChange: null, status: "COUNTED", approvals: { referee: true, own: true, opponent: false }, voidReason: null },
  { boutId: "b3", foughtAt: "2026-10-08T19:05:00.000Z", location: "Ochs Utrecht, ring 1", opponentName: "Daan Mulder", ownScore: 6, opponentScore: 2, result: "WIN", ratingChange: 11, status: "FINAL", approvals, voidReason: null },
  { boutId: "b4", foughtAt: "2026-10-08T18:30:00.000Z", location: "Ochs Utrecht, ring 1", opponentName: "Sanne Visser", ownScore: 1, opponentScore: 0, result: "WIN", ratingChange: null, status: "VOIDED", approvals, voidReason: "Sanne injured" },
  { boutId: "b5", foughtAt: "2026-10-01T17:45:00.000Z", location: "Leiden, main hall", opponentName: "Lotte Smit", ownScore: 5, opponentScore: 1, result: "WIN", ratingChange: 4, status: "FINAL", approvals, voidReason: null },
];

const mounted: HTMLElement[] = [];

function mount(attributes: Record<string, string> = {}): FighterHistory {
  const history = document.createElement("fighter-history");
  for (const [name, value] of Object.entries(attributes)) {
    history.setAttribute(name, value);
  }
  history.summary = summary;
  history.bouts = bouts;
  document.body.appendChild(history);
  mounted.push(history);
  return history;
}

const rows = (history: HTMLElement) => [...history.shadowRoot!.querySelectorAll<HTMLElement>("[data-bout-id]")];
const visibleIds = (history: HTMLElement) => rows(history).filter((row) => !row.hidden).map((row) => row.dataset.boutId);

function search(history: HTMLElement, value: string): void {
  const input = history.shadowRoot!.querySelector("search-field")!.shadowRoot!.querySelector("input")!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  mounted.splice(0).forEach((history) => history.remove());
  setLocale("en");
});

describe("fighter-history", () => {
  it("shows the fighter and every bout with result and rating change", () => {
    const history = mount();
    expect(history.shadowRoot!.querySelector(".fighter-name")!.textContent).toBe("Ilse Bakker");
    expect(history.shadowRoot!.querySelector(".big-rating")!.textContent).toContain("1641");
    expect(rows(history)).toHaveLength(5);

    const first = rows(history)[0]!;
    expect(first.querySelector(".opponent")!.textContent).toBe("vs Tomas Kuiper");
    expect(first.querySelector(".score")!.textContent).toBe("3–5");
    expect(first.querySelector(".result")!.textContent).toBe("LOST");
    expect(first.querySelector(".delta")!.textContent).toBe("−14");
    expect(rows(history)[2]!.querySelector(".delta")!.textContent).toBe("+11");
    expect(rows(history)[1]!.querySelector(".delta")!.textContent).toBe("waiting");
    expect(first.querySelector("bout-seal")!.getAttribute("status")).toBe("FINAL");
  });

  it("shows why a bout was voided", () => {
    const voided = rows(mount())[3]!;
    expect(voided.querySelector(".when")!.textContent).toContain("voided: Sanne injured");
    expect(voided.querySelector(".result")!.textContent).toBe("VOID");
    expect(voided.querySelector(".delta")!.textContent).toBe("—");
  });

  it("hides warnings", () => {
    const labels = (history: HTMLElement) => [...history.shadowRoot!.querySelectorAll(".stat span")].map((label) => label.textContent);
    expect(labels(mount())).toEqual(["Bouts", "Won", "Drawn", "Lost"]);
    expect(labels(mount({ "show-warnings": "" }))).toEqual(["Bouts", "Won", "Drawn", "Lost", "Warn"]);
  });

  it("searches opponents, places and months", () => {
    const history = mount({ searchable: "" });
    search(history, "leiden");
    expect(visibleIds(history)).toEqual(["b2", "b5"]);
    search(history, "oct");
    expect(visibleIds(history)).toHaveLength(5);
    search(history, "mulder");
    expect(visibleIds(history)).toEqual(["b3"]);
  });

  it("finds Dutch month names in Dutch", () => {
    const history = mount({ searchable: "" });
    setLocale("nl");
    search(history, "okt");
    expect(visibleIds(history)).toHaveLength(5);
  });

  it("tells the app which bout was chosen", () => {
    const history = mount();
    const chosen: string[] = [];
    history.addEventListener("bout-selected", (event) => chosen.push(event.detail.boutId));
    rows(history)[0]!.click();
    rows(history)[2]!.click();
    expect(chosen).toEqual(["b1", "b3"]);
  });

  it("draws a point per rating in the sparkline", () => {
    const points = mount().shadowRoot!.querySelector("svg.spark polyline")!.getAttribute("points")!.trim().split(/\s+/);
    expect(points).toHaveLength(summary.ratingHistory.length);
  });

  it("renders in Dutch", () => {
    const history = mount();
    setLocale("nl");
    expect(rows(history)[0]!.querySelector(".opponent")!.textContent).toBe("tegen Tomas Kuiper");
    expect(rows(history)[0]!.querySelector(".result")!.textContent).toBe("VERLOREN");
  });
});

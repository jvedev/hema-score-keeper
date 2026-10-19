import { afterEach, describe, expect, it, vi } from "vitest";
import type { FighterBoutView, FighterSummaryView } from "../../models/competition-views.js";
import "./fighter-history.js";
import type { FighterHistory } from "./fighter-history.js";

const summary: FighterSummaryView = {
  name: "Ilse Bakker",
  clubName: "Zwaardkring Leiden",
  since: null,
  rating: 1641,
  ratingHistory: [1600, 1641],
  bouts: 2,
  wins: 1,
  draws: 0,
  losses: 1,
  warnings: 0,
};
const approvals = { referee: true, own: true, opponent: true };
const bouts: FighterBoutView[] = [
  { boutId: "b1", foughtAt: "2026-10-15T18:40:00.000Z", location: "Ochs Utrecht, ring 2", opponentName: "Tomas Kuiper", ownScore: 3, opponentScore: 5, result: "LOSS", ratingChange: -14, status: "FINAL", approvals, voidReason: null },
  { boutId: "b2", foughtAt: "2026-10-01T17:45:00.000Z", location: "Leiden, main hall", opponentName: "Lotte Smit", ownScore: 5, opponentScore: 1, result: "WIN", ratingChange: 4, status: "FINAL", approvals, voidReason: null },
];

let history: FighterHistory;

function mount(attributes: Record<string, string> = {}): FighterHistory {
  history = document.createElement("fighter-history");
  for (const [name, value] of Object.entries(attributes)) {
    history.setAttribute(name, value);
  }
  history.summary = summary;
  history.bouts = bouts;
  document.body.appendChild(history);
  return history;
}

const searchInput = () => history.shadowRoot!.querySelector("search-field")!.shadowRoot!.querySelector("input")!;
const rowFor = (id: string) => history.shadowRoot!.querySelector<HTMLElement>(`[data-bout-id="${id}"]`)!;

afterEach(() => {
  history.remove();
  vi.restoreAllMocks();
});

describe("fighter-history refreshes", () => {
  it("keeps what the user typed when new bouts arrive", () => {
    mount({ searchable: "" });
    searchInput().value = "Leiden ";
    searchInput().dispatchEvent(new Event("input", { bubbles: true }));

    history.bouts = [...bouts];

    expect(searchInput().value).toBe("Leiden ");
    expect(rowFor("b1").hidden).toBe(true);
  });

  it("marks the selected bout as current and keeps focus", () => {
    mount();
    rowFor("b2").focus();
    history.setAttribute("selected", "b2");
    expect(history.shadowRoot!.activeElement).toBe(rowFor("b2"));
    expect(rowFor("b2").getAttribute("aria-current")).toBe("true");
    expect(rowFor("b2").tagName).toBe("BUTTON");
  });

  it("doesn't add listeners when bouts refresh", () => {
    mount({ searchable: "" });
    const spy = vi.spyOn(EventTarget.prototype, "addEventListener");
    history.bouts = [...bouts];
    history.bouts = [...bouts];
    expect(spy.mock.calls.filter(([type]) => type === "click" || type === "keydown" || type === "search-changed")).toEqual([]);
  });
});

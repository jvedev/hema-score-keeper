import { afterEach, describe, expect, it, vi } from "vitest";
import type { StandingRowView } from "../../models/competition-views.js";
import "./participant-table.js";
import type { ParticipantTable } from "./participant-table.js";

const rows: StandingRowView[] = [
  { participantId: "p1", position: 1, name: "Tomas Kuiper", clubName: "Ochs Utrecht", rating: 1688, lastChange: 14, bouts: 41, wins: 29, draws: 3, losses: 9, warnings: 2, provisional: false },
  { participantId: "p2", position: 2, name: "Ilse Bakker", clubName: "Zwaardkring Leiden", rating: 1641, lastChange: -14, bouts: 37, wins: 24, draws: 2, losses: 11, warnings: 3, provisional: false },
  { participantId: "p3", position: 3, name: "Daan Mulder", clubName: "Ochs Utrecht", rating: 1602, lastChange: 6, bouts: 33, wins: 19, draws: 4, losses: 10, warnings: 0, provisional: false },
];

let table: ParticipantTable;

function mount(attributes: Record<string, string> = {}): ParticipantTable {
  table = document.createElement("participant-table");
  for (const [name, value] of Object.entries(attributes)) {
    table.setAttribute(name, value);
  }
  table.rows = rows;
  document.body.appendChild(table);
  return table;
}

const searchInput = () => table.shadowRoot!.querySelector("search-field")!.shadowRoot!.querySelector("input")!;
const rowFor = (id: string) => table.shadowRoot!.querySelector<HTMLElement>(`[data-participant-id="${id}"]`)!;

afterEach(() => {
  table.remove();
  vi.restoreAllMocks();
});

describe("participant-table refreshes", () => {
  it("keeps what the user typed when new rows arrive", () => {
    mount({ searchable: "" });
    searchInput().value = "Ochs ";
    searchInput().dispatchEvent(new Event("input", { bubbles: true }));

    table.rows = [...rows];

    expect(searchInput().value).toBe("Ochs ");
    expect(rowFor("p2").hidden).toBe(true);
    expect(rowFor("p3").hidden).toBe(false);
  });

  it("keeps keyboard focus when the selection changes", () => {
    mount();
    const button = rowFor("p3").querySelector("button")!;
    button.focus();
    table.setAttribute("selected", "p3");
    expect(table.shadowRoot!.activeElement).toBe(rowFor("p3").querySelector("button"));
    expect(rowFor("p3").getAttribute("aria-current")).toBe("true");
    expect(rowFor("p1").hasAttribute("aria-current")).toBe(false);
  });

  it("keeps keyboard focus on the same participant when rows refresh", () => {
    mount();
    rowFor("p2").querySelector("button")!.focus();
    table.rows = [...rows];
    expect(table.shadowRoot!.activeElement).toBe(rowFor("p2").querySelector("button"));
  });

  it("doesn't add listeners when rows refresh", () => {
    mount({ searchable: "" });
    const spy = vi.spyOn(EventTarget.prototype, "addEventListener");
    table.rows = [...rows];
    table.rows = [...rows];
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps its internal search to itself", () => {
    mount({ searchable: "" });
    const outside: string[] = [];
    document.addEventListener("search-changed", (event) => outside.push((event as CustomEvent<{ query: string }>).detail.query));
    searchInput().value = "ochs";
    searchInput().dispatchEvent(new Event("input", { bubbles: true }));
    expect(outside).toEqual([]);
  });
});

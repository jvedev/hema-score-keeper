import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { StandingRowView } from "../../models/competition-views.js";
import "./participant-table.js";
import type { ParticipantTable } from "./participant-table.js";

const rows: StandingRowView[] = [
  { participantId: "p1", position: 1, name: "Tomas Kuiper", clubName: "Ochs Utrecht", rating: 1688, lastChange: 14, bouts: 41, wins: 29, draws: 3, losses: 9, warnings: 2, provisional: false },
  { participantId: "p2", position: 2, name: "Ilse Bakker", clubName: "Zwaardkring Leiden", rating: 1641, lastChange: -14, bouts: 37, wins: 24, draws: 2, losses: 11, warnings: 3, provisional: false },
  { participantId: "p3", position: 3, name: "Daan Mulder", clubName: "Ochs Utrecht", rating: 1602, lastChange: 6, bouts: 33, wins: 19, draws: 4, losses: 10, warnings: 0, provisional: false },
  { participantId: "p6", position: 4, name: "Lotte Smit", clubName: "Ochs Utrecht", rating: 1508, lastChange: null, bouts: 4, wins: 2, draws: 0, losses: 2, warnings: 0, provisional: true },
];

const mounted: HTMLElement[] = [];

function mount(attributes: Record<string, string> = {}, data: StandingRowView[] = rows): ParticipantTable {
  const table = document.createElement("participant-table");
  for (const [name, value] of Object.entries(attributes)) {
    table.setAttribute(name, value);
  }
  table.rows = data;
  document.body.appendChild(table);
  mounted.push(table);
  return table;
}

const visibleRows = (table: HTMLElement) =>
  [...table.shadowRoot!.querySelectorAll<HTMLElement>("[data-participant-id]")].filter((row) => !row.hidden);
const visibleNames = (table: HTMLElement) => visibleRows(table).map((row) => row.querySelector(".name")!.textContent);

function search(table: HTMLElement, value: string): void {
  const input = table.shadowRoot!.querySelector("search-field")!.shadowRoot!.querySelector("input")!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  mounted.splice(0).forEach((table) => table.remove());
  setLocale("en");
});

describe("participant-table", () => {
  it("renders a row per participant with rating and last change", () => {
    const table = mount();
    expect(visibleNames(table)).toEqual(["Tomas Kuiper", "Ilse Bakker", "Daan Mulder", "Lotte Smit"]);
    const first = visibleRows(table)[0]!;
    expect(first.querySelector(".rating")!.textContent).toContain("1688");
    expect(first.querySelector(".change")!.textContent).toBe("+14");
    expect(visibleRows(table)[1]!.querySelector(".change")!.textContent).toBe("−14");
    expect(visibleRows(table)[3]!.textContent).toContain("provisional");
  });

  it("shows a left chip only for fighters who left, and never leaks warning counts without show-warnings", () => {
    const table = mount({}, [{ ...rows[0]!, left: true }, rows[1]!]);
    const [first, second] = visibleRows(table);
    expect(first!.querySelector(".left-chip")!.textContent).toBe("left");
    expect(second!.querySelector(".left-chip")).toBeNull();
    expect([...table.shadowRoot!.querySelectorAll(".record")].map((record) => record.textContent).join(" ")).not.toContain("warn");
    expect(mount({ "show-warnings": "" }).shadowRoot!.querySelector(".record")!.textContent).toContain("2 warn");
  });

  it("hides warnings", () => {
    expect(mount().shadowRoot!.querySelectorAll('[data-col="warnings"]')).toHaveLength(0);
    const withWarnings = mount({ "show-warnings": "" });
    const cells = [...withWarnings.shadowRoot!.querySelectorAll('td[data-col="warnings"]')].map((cell) => cell.textContent);
    expect(cells).toEqual(["2", "3", "0", "0"]);
  });

  it("filters and clears", () => {
    const table = mount({ searchable: "" });
    search(table, "ochs");
    expect(visibleNames(table)).toEqual(["Tomas Kuiper", "Daan Mulder", "Lotte Smit"]);
    expect(table.shadowRoot!.querySelector("search-field")!.getAttribute("count")).toBe("3");

    search(table, "");
    expect(visibleNames(table)).toHaveLength(4);

    search(table, "zzz");
    expect(visibleNames(table)).toEqual([]);
    expect(table.shadowRoot!.querySelector(".no-results")!.textContent).toBe("Nothing matches “zzz”.");
  });

  it("tells the app which participant was chosen", () => {
    const table = mount();
    const chosen: string[] = [];
    table.addEventListener("participant-selected", (event) => chosen.push(event.detail.participantId));
    visibleRows(table)[1]!.click();
    visibleRows(table)[2]!.querySelector("button")!.click();
    expect(chosen).toEqual(["p2", "p3"]);
  });

  it("marks the selected participant", () => {
    const table = mount({ selected: "p2" });
    expect(visibleRows(table)[1]!.getAttribute("aria-current")).toBe("true");
    expect(visibleRows(table)[0]!.hasAttribute("aria-current")).toBe(false);
  });

  it("escapes names", () => {
    const table = mount({}, [{ ...rows[0]!, name: "<img src=x onerror=alert(1)>" }]);
    expect(table.shadowRoot!.querySelector("img")).toBeNull();
    expect(visibleNames(table)).toEqual(["<img src=x onerror=alert(1)>"]);
  });

  it("says when there are no participants", () => {
    expect(mount({}, []).shadowRoot!.querySelector(".empty")!.textContent).toBe("No participants yet.");
  });

  it("says 1 bout, not 1 bouts, in English and Dutch", () => {
    const one = [{ ...rows[0]!, bouts: 1, wins: 1, draws: 0, losses: 0 }];
    const record = (table: HTMLElement) => table.shadowRoot!.querySelector(".record")!.textContent;
    expect(record(mount({}, one))).toBe("1 bout · 1–0–0");
    expect(record(mount())).toBe("41 bouts · 29–3–9");
    setLocale("nl");
    expect(record(mount({}, one))).toBe("1 partij · 1–0–0");
    expect(record(mount())).toBe("41 partijen · 29–3–9");
  });

  it("renders in Dutch", () => {
    const table = mount();
    setLocale("nl");
    expect(table.shadowRoot!.querySelector('th[data-col="bouts"]')!.textContent).toBe("Partijen");
  });
});

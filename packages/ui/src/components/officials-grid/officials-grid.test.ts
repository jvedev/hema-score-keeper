import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { OfficialsView, PersonView } from "../../models/competition-views.js";
import "./officials-grid.js";

const referee: PersonView = { userId: "ref", name: "Joris Meijer" };
const jury: PersonView[] = [
  { userId: "j1", name: "Sanne Visser" },
  { userId: "j2", name: "Lotte Smit" },
  { userId: "j3", name: "Ravi Jansen" },
  { userId: "j4", name: "Daan Mulder" },
];

const mounted: HTMLElement[] = [];

function mount(juryCount: number, table: PersonView[] = []): HTMLElement {
  const grid = document.createElement("officials-grid");
  const officials: OfficialsView = { referee, jury: jury.slice(0, juryCount), table };
  grid.officials = officials;
  document.body.appendChild(grid);
  mounted.push(grid);
  return grid;
}

const cells = (grid: HTMLElement) => grid.shadowRoot!.querySelectorAll(".official");
const fillers = (grid: HTMLElement) => grid.shadowRoot!.querySelectorAll(".filler");
const roles = (grid: HTMLElement) => [...grid.shadowRoot!.querySelectorAll(".role")].map((role) => role.textContent);

afterEach(() => {
  mounted.splice(0).forEach((grid) => grid.remove());
  setLocale("en");
});

describe("officials-grid", () => {
  it("referee and one jury share a row", () => {
    const grid = mount(1);
    expect(cells(grid)).toHaveLength(2);
    expect(fillers(grid)).toHaveLength(0);
    expect(roles(grid)).toEqual(["Referee", "Jury"]);
  });

  it.each([
    [0, 1, 0],
    [2, 3, 1],
    [3, 4, 0],
    [4, 5, 1],
  ])("with %i jury shows %i officials and %i filler", (juryCount, officials, filler) => {
    const grid = mount(juryCount);
    expect(cells(grid)).toHaveLength(officials);
    expect(fillers(grid)).toHaveLength(filler);
  });

  it("numbers jury seats when there is more than one", () => {
    expect(roles(mount(2))).toEqual(["Referee", "Jury 1", "Jury 2"]);
  });

  it("leaves the table official out of the grid", () => {
    const grid = mount(1, [{ userId: "t", name: "Table Person" }]);
    expect(grid.shadowRoot!.textContent).not.toContain("Table Person");
  });

  it("escapes names", () => {
    const grid = document.createElement("officials-grid");
    grid.officials = { referee: { userId: "x", name: "<b>bold</b>" }, jury: [], table: [] };
    document.body.appendChild(grid);
    mounted.push(grid);
    expect(grid.shadowRoot!.querySelector("b")).toBeNull();
  });

  it("renders in Dutch", () => {
    const grid = mount(1);
    setLocale("nl");
    expect(roles(grid)).toEqual(["Scheidsrechter", "Jury"]);
  });
});

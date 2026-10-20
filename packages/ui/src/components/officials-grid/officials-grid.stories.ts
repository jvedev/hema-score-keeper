import type { OfficialsView } from "../../models/competition-views.js";
import "./officials-grid.js";

const jury = [
  { userId: "j1", name: "Sanne Visser" },
  { userId: "j2", name: "Lotte Smit" },
  { userId: "j3", name: "Ravi Jansen" },
  { userId: "j4", name: "Daan Mulder" },
];

function grid(juryCount: number): HTMLElement {
  const element = document.createElement("officials-grid");
  const officials: OfficialsView = { referee: { userId: "ref", name: "Joris Meijer" }, jury: jury.slice(0, juryCount), table: [] };
  element.officials = officials;
  element.style.cssText = "display:block;width:260px;margin-bottom:16px";
  return element;
}

const meta = { title: "Components/OfficialsGrid" };

export default meta;
export const RefereeAndOneJury = { render: () => grid(1) };
export const RefereeAndTwoJury = { render: () => grid(2) };
export const RefereeAndFourJury = { render: () => grid(4) };

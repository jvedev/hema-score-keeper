import type { StandingRowView } from "../../models/competition-views.js";
import "./participant-table.js";

const rows: StandingRowView[] = [
  { participantId: "p1", position: 1, name: "Tomas Kuiper", clubName: "Ochs Utrecht", rating: 1688, lastChange: 14, bouts: 41, wins: 29, draws: 3, losses: 9, warnings: 2, provisional: false },
  { participantId: "p2", position: 2, name: "Ilse Bakker", clubName: "Zwaardkring Leiden", rating: 1641, lastChange: -14, bouts: 37, wins: 24, draws: 2, losses: 11, warnings: 3, provisional: false },
  { participantId: "p3", position: 3, name: "Daan Mulder", clubName: "Ochs Utrecht", rating: 1602, lastChange: 6, bouts: 33, wins: 19, draws: 4, losses: 10, warnings: 0, provisional: false },
  { participantId: "p4", position: 4, name: "Sanne Visser", clubName: "Fechtschule Arnhem", rating: 1577, lastChange: null, bouts: 28, wins: 15, draws: 1, losses: 12, warnings: 1, provisional: false },
  { participantId: "p5", position: 5, name: "Joris Meijer", clubName: "Zwaardkring Leiden", rating: 1530, lastChange: -9, bouts: 30, wins: 13, draws: 3, losses: 14, warnings: 0, provisional: false },
  { participantId: "p6", position: 6, name: "Lotte Smit", clubName: "Ochs Utrecht", rating: 1508, lastChange: null, bouts: 4, wins: 2, draws: 0, losses: 2, warnings: 0, provisional: true },
];

function table(width: number): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.width = `${width}px`;
  const element = document.createElement("participant-table");
  element.setAttribute("searchable", "");
  element.setAttribute("show-warnings", "");
  element.setAttribute("selected", "p2");
  element.rows = rows;
  wrapper.appendChild(element);
  return wrapper;
}

const meta = { title: "Components/ParticipantTable" };

export default meta;
export const Wide = { render: () => table(620) };
export const Phone = { render: () => table(340) };

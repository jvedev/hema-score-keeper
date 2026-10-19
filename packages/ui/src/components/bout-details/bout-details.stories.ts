import type { BoutDetailView } from "../../models/competition-views.js";
import "./bout-details.js";

const bout: BoutDetailView = {
  boutId: "b1",
  status: "FINAL",
  approvals: { referee: true, A: true, B: true },
  fighterA: { userId: "f1", name: "Ilse Bakker" },
  fighterB: { userId: "f2", name: "Tomas Kuiper" },
  scoreA: 3,
  scoreB: 5,
  startedAt: "2026-10-15T18:40:00.000Z",
  location: "Ochs Utrecht, ring 2",
  rulesetLabel: "Longsword v2 · 3:00 · first to 7",
  officials: {
    referee: { userId: "ref", name: "Joris Meijer" },
    jury: [
      { userId: "j1", name: "Sanne Visser" },
      { userId: "j2", name: "Lotte Smit" },
      { userId: "j3", name: "Ravi Jansen" },
    ],
    table: { userId: "t", name: "Daan Mulder" },
  },
  exchanges: [
    { atSeconds: 12, kind: "SCORE", side: "B", points: 1, reason: null },
    { atSeconds: 31, kind: "DOUBLE", side: null, points: 0, reason: null },
    { atSeconds: 48, kind: "SCORE", side: "A", points: 2, reason: null },
    { atSeconds: 65, kind: "SCORE", side: "B", points: 2, reason: null },
    { atSeconds: 82, kind: "WARNING", side: "A", points: 0, reason: "grappling after halt" },
    { atSeconds: 100, kind: "SCORE", side: "A", points: 1, reason: null },
    { atSeconds: 135, kind: "SCORE", side: "B", points: 2, reason: null },
    { atSeconds: 180, kind: "TIME", side: null, points: 0, reason: null },
  ],
  windowEndsAt: null,
  objection: null,
  voidReason: null,
};

function details(data: BoutDetailView): HTMLElement {
  const element = document.createElement("bout-details");
  element.setAttribute("show-warnings", "");
  element.setAttribute("show-lead-graph", "");
  element.bout = data;
  element.style.cssText = "display:grid;max-width:360px";
  return element;
}

const meta = { title: "Components/BoutDetails" };

export default meta;
export const Final = { render: () => details(bout) };
export const Objected = {
  render: () => details({ ...bout, status: "OBJECTED", approvals: { referee: true, A: false, B: false }, objection: { by: "B", reason: "Last exchange was a double" } }),
};
export const Counting = {
  render: () => details({ ...bout, status: "COUNTED", approvals: { referee: true, A: true, B: false }, windowEndsAt: "2026-10-18T18:40:00.000Z" }),
};

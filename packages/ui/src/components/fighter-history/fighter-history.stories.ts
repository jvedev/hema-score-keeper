import type { FighterBoutView } from "../../models/competition-views.js";
import "./fighter-history.js";

const approvals = { referee: true, own: true, opponent: true };
const bouts: FighterBoutView[] = [
  { boutId: "b1", foughtAt: "2026-10-15T18:40:00.000Z", location: "Ochs Utrecht, ring 2", opponentName: "Tomas Kuiper", ownScore: 3, opponentScore: 5, result: "LOSS", ratingChange: -14, status: "FINAL", approvals, voidReason: null },
  { boutId: "b2", foughtAt: "2026-10-12T17:10:00.000Z", location: "Leiden, main hall", opponentName: "Joris Meijer", ownScore: 4, opponentScore: 4, result: "DRAW", ratingChange: null, status: "COUNTED", approvals: { referee: true, own: true, opponent: false }, voidReason: null },
  { boutId: "b3", foughtAt: "2026-10-08T19:05:00.000Z", location: "Ochs Utrecht, ring 1", opponentName: "Daan Mulder", ownScore: 6, opponentScore: 2, result: "WIN", ratingChange: 11, status: "FINAL", approvals, voidReason: null },
  { boutId: "b4", foughtAt: "2026-10-08T18:30:00.000Z", location: "Ochs Utrecht, ring 1", opponentName: "Sanne Visser", ownScore: 1, opponentScore: 0, result: "WIN", ratingChange: null, status: "VOIDED", approvals, voidReason: "Sanne injured" },
  { boutId: "b5", foughtAt: "2026-10-01T17:45:00.000Z", location: "Leiden, main hall", opponentName: "Lotte Smit", ownScore: 5, opponentScore: 1, result: "WIN", ratingChange: 4, status: "FINAL", approvals, voidReason: null },
];

const meta = {
  title: "Components/FighterHistory",
  render: () => {
    const element = document.createElement("fighter-history");
    element.setAttribute("searchable", "");
    element.setAttribute("show-warnings", "");
    element.setAttribute("selected", "b1");
    element.summary = {
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
    element.bouts = bouts;
    element.style.cssText = "display:block;max-width:380px";
    return element;
  },
};

export default meta;
export const Default = {};

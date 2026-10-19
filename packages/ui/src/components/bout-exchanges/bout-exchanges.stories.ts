import type { ExchangeView } from "../../models/competition-views.js";
import "./bout-exchanges.js";

const exchanges: ExchangeView[] = [
  { atSeconds: 12, kind: "SCORE", side: "B", points: 1, reason: null },
  { atSeconds: 31, kind: "DOUBLE", side: null, points: 0, reason: null },
  { atSeconds: 48, kind: "SCORE", side: "A", points: 2, reason: null },
  { atSeconds: 65, kind: "SCORE", side: "B", points: 2, reason: null },
  { atSeconds: 82, kind: "WARNING", side: "A", points: 0, reason: "grappling after halt" },
  { atSeconds: 100, kind: "SCORE", side: "A", points: 1, reason: null },
  { atSeconds: 135, kind: "SCORE", side: "B", points: 2, reason: null },
  { atSeconds: 180, kind: "TIME", side: null, points: 0, reason: null },
];

function list(showWarnings: boolean): HTMLElement {
  const element = document.createElement("bout-exchanges");
  if (showWarnings) {
    element.setAttribute("show-warnings", "");
  }
  element.setAttribute("show-lead-graph", "");
  element.fighterNames = { A: "Bakker", B: "Kuiper" };
  element.exchanges = exchanges;
  element.style.cssText = "display:block;max-width:340px";
  return element;
}

const meta = { title: "Components/BoutExchanges" };

export default meta;
export const WithWarnings = { render: () => list(true) };
export const PublicView = { render: () => list(false) };

import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { ExchangeView } from "../../models/competition-views.js";
import "./bout-exchanges.js";

// The mockup bout: A = Ilse Bakker, B = Tomas Kuiper.
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

const mounted: HTMLElement[] = [];

function mount(attributes: Record<string, string> = {}, data: ExchangeView[] = exchanges): HTMLElement {
  const list = document.createElement("bout-exchanges");
  for (const [name, value] of Object.entries(attributes)) {
    list.setAttribute(name, value);
  }
  list.fighterNames = { A: "Bakker", B: "Kuiper" };
  list.exchanges = data;
  document.body.appendChild(list);
  mounted.push(list);
  return list;
}

const rows = (list: HTMLElement) => [...list.shadowRoot!.querySelectorAll<HTMLElement>(".exchange")];
const column = (list: HTMLElement, selector: string) => rows(list).map((row) => row.querySelector(selector)!.textContent);

afterEach(() => {
  mounted.splice(0).forEach((list) => list.remove());
  setLocale("en");
});

describe("bout-exchanges", () => {
  it("shows each exchange with its clock time and running score", () => {
    const list = mount({ "show-warnings": "" });
    expect(column(list, ".time")).toEqual(["00:12", "00:31", "00:48", "01:05", "01:22", "01:40", "02:15", "03:00"]);
    expect(column(list, ".running")).toEqual(["0–1", "0–1", "2–1", "2–3", "2–3", "3–3", "3–5", "3–5"]);
    expect(column(list, ".text")[0]).toBe("Kuiper +1");
    expect(column(list, ".text")[1]).toBe("Double hit, no score");
    expect(column(list, ".text")[4]).toContain("Bakker · grappling after halt");
    expect(column(list, ".text")[7]).toBe("Time");
  });

  it("hides warnings", () => {
    const list = mount();
    expect(rows(list)).toHaveLength(7);
    expect(list.shadowRoot!.textContent).not.toContain("grappling");
    expect(column(list, ".running")).toEqual(["0–1", "0–1", "2–1", "2–3", "3–3", "3–5", "3–5"]);
  });

  it("escapes warning reasons", () => {
    const list = mount({ "show-warnings": "" }, [{ atSeconds: 5, kind: "WARNING", side: "A", points: 0, reason: "<script>x</script>" }]);
    expect(list.shadowRoot!.querySelector("script")).toBeNull();
    expect(column(list, ".text")[0]).toContain("<script>x</script>");
  });

  it("only draws the lead graph when asked", () => {
    expect(mount().shadowRoot!.querySelector("svg.lead")).toBeNull();
    const withGraph = mount({ "show-lead-graph": "" });
    const points = withGraph.shadowRoot!.querySelector("svg.lead polyline")!.getAttribute("points")!.trim().split(/\s+/);
    expect(points).toHaveLength(exchanges.length + 1);
  });

  it("subtracts points a warning deducts", () => {
    const list = mount({ "show-warnings": "" }, [
      { atSeconds: 10, kind: "SCORE", side: "A", points: 3, reason: null },
      { atSeconds: 20, kind: "WARNING", side: "A", points: 1, reason: "late hit" },
    ]);
    expect(column(list, ".running")).toEqual(["3–0", "2–0"]);
    expect(column(list, ".text")[1]).toContain("(−1)");
  });

  it("keeps a deduction in the score even when warnings are hidden", () => {
    const list = mount({}, [
      { atSeconds: 10, kind: "SCORE", side: "A", points: 3, reason: null },
      { atSeconds: 20, kind: "WARNING", side: "A", points: 1, reason: "late hit" },
      { atSeconds: 30, kind: "SCORE", side: "B", points: 1, reason: null },
    ]);
    expect(column(list, ".running")).toEqual(["3–0", "2–1"]);
  });

  it("shows a score correction", () => {
    const list = mount({}, [
      { atSeconds: 10, kind: "SCORE", side: "B", points: 3, reason: null },
      { atSeconds: 40, kind: "ADJUSTMENT", side: "B", points: -1, reason: null },
    ]);
    expect(column(list, ".text")[1]).toBe("Kuiper score corrected −1");
    expect(column(list, ".running")[1]).toBe("0–2");
  });

  it("shows a disqualification", () => {
    const list = mount({}, [{ atSeconds: 90, kind: "DISQUALIFICATION", side: "A", points: 0, reason: "Unsafe conduct" }]);
    expect(column(list, ".text")[0]).toBe("Bakker disqualified");
  });

  it("renders in Dutch", () => {
    const list = mount();
    setLocale("nl");
    expect(column(list, ".text")[1]).toBe("Dubbeltreffer, geen punt");
  });
});

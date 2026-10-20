import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatAge, setLocale } from "../../i18n/i18n.js";
import type { NeedsYouItemView } from "../../models/competition-views.js";
import "./needs-you-list.js";
import type { NeedsYouList } from "./needs-you-list.js";

const now = new Date("2026-10-20T12:00:00.000Z");
const items: NeedsYouItemView[] = [
  { kind: "objection", boutId: "b1", competitionName: "Lowlands Ladder", fighterA: "Daan Mulder", fighterB: "Tomas Kuiper", scoreA: 4, scoreB: 6, detail: "Daan objected: last exchange was a double", since: "2026-10-16T12:00:00.000Z" },
  { kind: "awaiting-referee", boutId: "b2", competitionName: "Ochs club ladder", fighterA: "Joris Meijer", fighterB: "Sanne Visser", scoreA: 2, scoreB: 2, detail: "Waiting for Joris", since: "2026-10-18T12:00:00.000Z" },
];

let list: NeedsYouList;

beforeEach(() => {
  list = document.createElement("needs-you-list");
  list.now = now;
  list.items = items;
  document.body.appendChild(list);
});

afterEach(() => {
  list.remove();
  setLocale("en");
});

describe("formatAge", () => {
  it("says how long ago something happened", () => {
    expect(formatAge("2026-10-16T12:00:00.000Z", now)).toBe("4 days");
    expect(formatAge("2026-10-20T09:00:00.000Z", now)).toBe("3 hours");
    expect(formatAge("2026-10-20T11:59:00.000Z", now)).toBe("1 minute");
    setLocale("nl");
    expect(formatAge("2026-10-16T12:00:00.000Z", now)).toBe("4 dagen");
  });
});

describe("needs-you-list", () => {
  it("groups objections and bouts waiting for the referee", () => {
    const headings = [...list.shadowRoot!.querySelectorAll(".group h3")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Objections · 1", "Waiting for the referee · 1"]);
  });

  it("shows the bout, the detail and the age", () => {
    const row = list.shadowRoot!.querySelector<HTMLElement>('[data-bout-id="b1"]')!;
    expect(row.querySelector(".score")!.textContent).toBe("4–6");
    expect(row.textContent).toContain("Daan objected: last exchange was a double");
    expect(row.querySelector(".age")!.textContent).toBe("4 days");
    expect(row.querySelector("bout-seal")!.getAttribute("status")).toBe("OBJECTED");
  });

  it("tells the app which item was chosen", () => {
    const chosen: unknown[] = [];
    list.addEventListener("needs-you-selected", (event) => chosen.push(event.detail));
    list.shadowRoot!.querySelector<HTMLElement>('[data-bout-id="b2"]')!.click();
    expect(chosen).toEqual([{ boutId: "b2", kind: "awaiting-referee" }]);
  });

  it("renders nothing without items", () => {
    list.items = [];
    expect(list.shadowRoot!.querySelectorAll(".group")).toHaveLength(0);
  });

  it("escapes text", () => {
    list.items = [{ ...items[0]!, detail: "<b>x</b>" }];
    expect(list.shadowRoot!.querySelector("b")).toBeNull();
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect(list.shadowRoot!.querySelector(".group h3")!.textContent).toBe("Bezwaren · 1");
  });
});

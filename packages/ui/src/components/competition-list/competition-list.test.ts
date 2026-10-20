import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { CompetitionListItemView } from "../../models/competition-views.js";
import "./competition-list.js";
import type { CompetitionList } from "./competition-list.js";

const items: CompetitionListItemView[] = [
  { id: "run1", name: "Lowlands Longsword Ladder", status: "RUNNING", scopeLabel: "Country", meta: "48 fighters", openBouts: 3 },
  { id: "arc1", name: "Old Ladder", status: "ARCHIVED", scopeLabel: "Club", meta: "2024", openBouts: 0 },
  { id: "dr1", name: "Spring Rapier Cup", status: "DRAFT", scopeLabel: "Area", meta: "No ruleset yet", openBouts: 0 },
  { id: "run2", name: "Ochs club ladder", status: "RUNNING", scopeLabel: "Club", meta: "14 fighters", openBouts: 0 },
  { id: "reg1", name: "Winter Open Sabre", status: "REGISTRATION_OPEN", scopeLabel: "Open", meta: "13 Dec", openBouts: 0 },
  { id: "arc2", name: "Older Ladder", status: "ARCHIVED", scopeLabel: "Club", meta: "2023", openBouts: 0 },
];

let list: CompetitionList;
const $$ = (selector: string) => [...list.shadowRoot!.querySelectorAll<HTMLElement>(selector)];

beforeEach(() => {
  list = document.createElement("competition-list");
  list.items = items;
  document.body.appendChild(list);
});

afterEach(() => {
  list.remove();
  setLocale("en");
});

describe("competition-list", () => {
  it("groups competitions in lifecycle order with counts", () => {
    expect($$(".group h3").map((heading) => heading.textContent)).toEqual([
      "Draft · 1",
      "Registration open · 1",
      "Running · 2",
      "Archived · 2",
    ]);
  });

  it("folds archived competitions until asked", () => {
    expect($$('[data-competition-id="arc1"]')[0]!.closest("[hidden]")).not.toBeNull();
    const show = list.shadowRoot!.querySelector<HTMLButtonElement>("button.show-archived")!;
    expect(show.textContent).toBe("Show 2 archived");
    show.click();
    expect($$('[data-competition-id="arc1"]')[0]!.closest("[hidden]")).toBeNull();
  });

  it("shows open bouts on running competitions", () => {
    expect($$('[data-competition-id="run1"] .open')[0]!.textContent).toBe("3 open");
    expect($$('[data-competition-id="run2"] .open')).toHaveLength(0);
  });

  it("tells the app which competition was chosen and marks it", () => {
    const chosen: string[] = [];
    list.addEventListener("competition-selected", (event) => chosen.push(event.detail.competitionId));
    $$('[data-competition-id="dr1"]')[0]!.click();
    expect(chosen).toEqual(["dr1"]);
    list.setAttribute("selected", "dr1");
    expect($$('[data-competition-id="dr1"]')[0]!.getAttribute("aria-current")).toBe("true");
  });

  it("asks for a new competition", () => {
    let asked = 0;
    list.addEventListener("competition-create-requested", () => asked++);
    list.shadowRoot!.querySelector<HTMLButtonElement>("button.create")!.click();
    expect(asked).toBe(1);
  });

  it("escapes names", () => {
    list.items = [{ ...items[0]!, name: "<img src=x>" }];
    expect(list.shadowRoot!.querySelector("img")).toBeNull();
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect($$(".group h3")[0]!.textContent).toBe("Concept · 1");
  });
});

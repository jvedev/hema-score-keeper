import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { TodoItemView } from "../../models/competition-views.js";
import "./todo-list.js";
import type { TodoList } from "./todo-list.js";

const now = new Date("2026-10-20T12:00:00.000Z");
const items: TodoItemView[] = [
  { kind: "approve", boutId: "b1", competitionName: "Lowlands Ladder", opponentName: "Tomas Kuiper", ownScore: 6, opponentScore: 4, since: "2026-10-18T12:00:00.000Z" },
  { kind: "objection", boutId: "b2", competitionName: "Ochs club ladder", opponentName: "Sanne Visser", ownScore: 2, opponentScore: 5, since: "2026-10-19T12:00:00.000Z" },
  { kind: "referee", boutId: "b3", competitionName: null, opponentName: "Joris Meijer – Sanne Visser", ownScore: 3, opponentScore: 3, since: "2026-10-20T09:00:00.000Z" },
];

let list: TodoList;
const $ = (selector: string) => list.shadowRoot!.querySelector<HTMLElement>(selector)!;
const $$ = (selector: string) => [...list.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
const row = (boutId: string) => $(`[data-bout-id="${boutId}"]`);

beforeEach(() => {
  list = document.createElement("todo-list");
  list.now = now;
  list.items = items;
  document.body.appendChild(list);
});

afterEach(() => {
  list.remove();
  setLocale("en");
});

describe("todo-list", () => {
  it("shows a heading with the count and one row per item in the given order", () => {
    expect($("h3").textContent).toBe("To do · 3");
    expect($$(".item").map((item) => item.dataset.boutId)).toEqual(["b1", "b2", "b3"]);
  });

  it("shows seal, score, opponent, competition and age", () => {
    const first = row("b1");
    expect(first.querySelector("bout-seal")!.getAttribute("status")).toBe("COUNTED");
    expect(first.querySelector(".score")!.textContent).toBe("6–4");
    expect(first.querySelector(".names")!.textContent).toBe("vs Tomas Kuiper");
    expect(first.querySelector(".detail")!.textContent).toContain("Lowlands Ladder");
    expect(first.querySelector(".age")!.textContent).toBe("2 days");
    expect(row("b2").querySelector("bout-seal")!.getAttribute("status")).toBe("OBJECTED");
    expect(row("b3").querySelector("bout-seal")!.getAttribute("status")).toBe("SCORED");
    expect(row("b3").querySelector(".names")!.textContent).toBe("Joris Meijer – Sanne Visser");
  });

  it("offers the actions that belong to each kind", () => {
    const actions = (id: string) => [...row(id).querySelectorAll<HTMLElement>("button")].map((button) => button.dataset.action);
    expect(actions("b1")).toEqual(["approve", "object"]);
    expect(actions("b2")).toEqual(["withdraw"]);
    expect(actions("b3")).toEqual(["referee-approve"]);
  });

  it.each([
    ["b1", "approve", "todo-approve"],
    ["b1", "object", "todo-object"],
    ["b2", "withdraw", "todo-withdraw"],
    ["b3", "referee-approve", "todo-referee-approve"],
  ])("fires the event for %s %s", (boutId, action, eventName) => {
    const seen: unknown[] = [];
    list.addEventListener(eventName, (event) => seen.push((event as CustomEvent).detail));
    row(boutId).querySelector<HTMLElement>(`button[data-action="${action}"]`)!.click();
    expect(seen).toEqual([{ boutId }]);
  });

  it("renders nothing without items", () => {
    list.items = [];
    expect($$("h3, .item")).toHaveLength(0);
  });

  it("escapes text and coerces scores", () => {
    list.items = [{ ...items[0]!, opponentName: "<b>x</b>", ownScore: "7" as unknown as number }];
    expect(list.shadowRoot!.querySelector("b")).toBeNull();
    expect($(".score").textContent).toBe("7–4");
    list.items = [{ ...items[0]!, ownScore: "<i>1</i>" as unknown as number }];
    expect(list.shadowRoot!.querySelector("i")).toBeNull();
  });

  it("stays hidden with the hidden attribute", () => {
    list.setAttribute("hidden", "");
    expect(getComputedStyle(list).display).toBe("none");
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect($("h3").textContent).toBe("Te doen · 3");
    expect(row("b1").querySelector('[data-action="object"]')!.textContent).toBe("Bezwaar");
  });
});

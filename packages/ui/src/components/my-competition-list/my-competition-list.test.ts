import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { MyCompetitionView } from "../../models/competition-views.js";
import "./my-competition-list.js";
import type { MyCompetitionList } from "./my-competition-list.js";

const items: MyCompetitionView[] = [
  { id: "c1", name: "Lowlands Ladder", status: "RUNNING", myStatus: "ACTIVE", rank: 3, rating: 1024, lastChange: 16 },
  { id: "c2", name: "Winter Open", status: "REGISTRATION_OPEN", myStatus: "PENDING", rank: null, rating: null, lastChange: null },
  { id: "c3", name: "Old Ladder", status: "CLOSED", myStatus: "LEFT", rank: 5, rating: 990, lastChange: -14 },
];

let list: MyCompetitionList;
const $$ = (selector: string) => [...list.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
const card = (id: string) => list.shadowRoot!.querySelector<HTMLElement>(`[data-competition-id="${id}"]`)!;

beforeEach(() => {
  list = document.createElement("my-competition-list");
  list.items = items;
  document.body.appendChild(list);
});

afterEach(() => {
  list.remove();
  setLocale("en");
});

describe("my-competition-list", () => {
  it("shows rank, rating and last change for an active fighter", () => {
    expect(card("c1").querySelector(".rank")!.textContent).toBe("#3");
    expect(card("c1").querySelector(".rating")!.textContent).toContain("1024");
    expect(card("c1").querySelector(".change.up")!.textContent).toBe("+16");
    expect(card("c1").querySelector(".chip")).toBeNull();
  });

  it("shows a pending sign-up as a chip without numbers", () => {
    expect(card("c2").querySelector(".chip.pending")!.textContent).toBe("Waiting for approval");
    expect(card("c2").querySelector(".rating")).toBeNull();
  });

  it("marks a competition the fighter left", () => {
    expect(card("c3").querySelector(".chip.left")!.textContent).toBe("Left");
    expect(card("c3").querySelector(".change.down")!.textContent).toBe("−14");
  });

  it("tells the app which competition was chosen", () => {
    const chosen: unknown[] = [];
    list.addEventListener("competition-selected", (event) => chosen.push(event.detail));
    card("c2").click();
    expect(chosen).toEqual([{ competitionId: "c2" }]);
  });

  it("shows an empty message", () => {
    list.items = [];
    expect($$(".card")).toHaveLength(0);
    expect(list.shadowRoot!.querySelector(".empty")!.textContent).toBe("You haven't joined a competition yet.");
  });

  it("escapes names and coerces numbers", () => {
    list.items = [{ ...items[0]!, name: "<b>x</b>", rating: "<i>9</i>" as unknown as number }];
    expect(list.shadowRoot!.querySelector("b")).toBeNull();
    expect(list.shadowRoot!.querySelector("i")).toBeNull();
  });

  it("escapes an unknown lifecycle status", () => {
    list.items = [{ ...items[0]!, status: "<b>NEW</b>" as MyCompetitionView["status"] }];
    expect(list.shadowRoot!.querySelector("b")).toBeNull();
    expect(list.shadowRoot!.querySelector(".meta")!.textContent).toContain("lifecycle.<b>NEW</b>");
  });

  it("stays hidden with the hidden attribute", () => {
    list.setAttribute("hidden", "");
    expect(getComputedStyle(list).display).toBe("none");
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect(card("c2").querySelector(".chip")!.textContent).toBe("Wacht op goedkeuring");
  });
});

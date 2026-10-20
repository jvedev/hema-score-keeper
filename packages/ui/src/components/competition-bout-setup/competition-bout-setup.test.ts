import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { BoutSetupResult, SetupPersonView } from "../../models/competition-views.js";
import "./competition-bout-setup.js";
import type { CompetitionBoutSetup } from "./competition-bout-setup.js";

let setup: CompetitionBoutSetup;
let events: Array<{ type: string; detail: unknown }>;

const people: SetupPersonView[] = [
  { userId: "joris", name: "Joris Meijer", clubName: "Zwaardkring Leiden" },
  { userId: "daan", name: "Daan Mulder", clubName: "Ochs Utrecht" },
  { userId: "sanne", name: "Sanne Visser", clubName: null },
  { userId: "lotte", name: "Lotte Smit", clubName: "Ochs Utrecht" },
  { userId: "ravi", name: "Ravi Jansen", clubName: null },
  { userId: "maren", name: "Maren de Vries", clubName: null },
  { userId: "tomas", name: "Tomas Kuiper", clubName: "Ochs Utrecht" },
];

const $ = <T extends Element = HTMLElement>(selector: string) => setup.shadowRoot!.querySelector<T>(selector)!;
const $$ = <T extends Element = HTMLElement>(selector: string) => [...setup.shadowRoot!.querySelectorAll<T>(selector)];

function choose(selector: string, value: string): void {
  const select = $<HTMLSelectElement>(selector);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function search(role: "referee" | "jury" | "table", text: string): void {
  const input = $<HTMLInputElement>(`[data-role="${role}"] input`);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pick(role: "referee" | "jury" | "table", userId: string): void {
  search(role, "xx");
  setup.peopleResults = people;
  $(`[data-role="${role}"] [data-pick="${userId}"]`).click();
}

function ready(): void {
  choose("select.competition", "X");
  setup.fighters = [
    { userId: "tomas", name: "Tomas Kuiper", clubName: "Ochs Utrecht" },
    { userId: "ilse", name: "Ilse Bakker", clubName: "Zwaardkring Leiden" },
  ];
  choose("select.fighter-a", "tomas");
  choose("select.fighter-b", "ilse");
  pick("referee", "joris");
}

const startButton = () => $<HTMLButtonElement>("button.start");

beforeEach(() => {
  events = [];
  setup = document.createElement("competition-bout-setup");
  for (const type of ["setup-competition-chosen", "setup-fighters-chosen", "people-search-requested", "bout-setup-confirmed"]) {
    setup.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }));
  }
  document.body.appendChild(setup);
  setup.competitions = [
    { id: "X", name: "Lowlands Longsword Ladder" },
    { id: "Y", name: "Ochs club ladder" },
  ];
});

afterEach(() => {
  setup.remove();
  setLocale("en");
});

describe("competition-bout-setup", () => {
  it("can't start until competition, fighters and referee are chosen", () => {
    expect(startButton().disabled).toBe(true);
    ready();
    expect(startButton().disabled).toBe(false);
  });

  it("asks the app for the fighters of the chosen competition", () => {
    choose("select.competition", "Y");
    expect(events).toContainEqual({ type: "setup-competition-chosen", detail: { competitionId: "Y" } });
  });

  it("asks the app where the pair can also count once both fighters are chosen", () => {
    ready();
    expect(events).toContainEqual({ type: "setup-fighters-chosen", detail: { competitionId: "X", fighterAUserId: "tomas", fighterBUserId: "ilse" } });
  });

  it("refuses the same fighter twice", () => {
    ready();
    choose("select.fighter-b", "tomas");
    expect(startButton().disabled).toBe(true);
    expect($(".hint").textContent).toBe("Choose two different fighters.");
  });

  it("searches people for a role", () => {
    search("referee", "da");
    expect(events).toContainEqual({ type: "people-search-requested", detail: { query: "da", role: "referee" } });
  });

  it("doesn't search for a single letter", () => {
    search("jury", "d");
    expect(events.filter((event) => event.type === "people-search-requested")).toEqual([]);
  });

  it("takes at most four jury members and two table officials", () => {
    for (const userId of ["daan", "sanne", "lotte", "ravi"]) {
      pick("jury", userId);
    }
    expect($$('[data-role="jury"] .chip')).toHaveLength(4);
    expect($<HTMLInputElement>('[data-role="jury"] input').disabled).toBe(true);

    pick("table", "maren");
    search("table", "xx");
    setup.peopleResults = people;
    expect($$('[data-role="table"] [data-pick]').map((button) => button.dataset.pick)).not.toContain("maren");
  });

  it("gives everyone one role and keeps fighters out", () => {
    ready();
    search("jury", "xx");
    setup.peopleResults = people;
    const offered = $$('[data-role="jury"] [data-pick]').map((button) => button.dataset.pick);
    expect(offered).not.toContain("joris");
    expect(offered).not.toContain("tomas");
  });

  it("lets a chosen official be removed", () => {
    pick("jury", "daan");
    $('[data-role="jury"] .chip button').click();
    expect($$('[data-role="jury"] .chip')).toHaveLength(0);
  });

  it("ticks the other competitions by default and lets them be unticked", () => {
    ready();
    setup.otherCompetitions = [
      { id: "Y", name: "Ochs club ladder" },
      { id: "Z", name: "Randstad open" },
    ];
    const boxes = $$<HTMLInputElement>(".others input[type=checkbox]");
    expect(boxes.map((box) => box.checked)).toEqual([true, true]);
    boxes[1]!.click();
    pick("jury", "daan");
    pick("table", "maren");
    const ring = $<HTMLInputElement>("input.ring");
    ring.value = "Ring 2";
    ring.dispatchEvent(new Event("input", { bubbles: true }));
    startButton().click();

    const confirmed = events.find((event) => event.type === "bout-setup-confirmed")!.detail as BoutSetupResult;
    expect(confirmed).toEqual({
      competitionId: "X",
      fighterAUserId: "tomas",
      fighterBUserId: "ilse",
      refereeUserId: "joris",
      juryUserIds: ["daan"],
      tableUserIds: ["maren"],
      ring: "Ring 2",
      alsoCountIn: ["Y"],
    });
  });

  it("hides the also-counts section when there is nothing to choose", () => {
    ready();
    setup.otherCompetitions = [];
    expect($(".others").hidden).toBe(true);
  });

  it("escapes names", () => {
    setup.competitions = [{ id: "X", name: "<img src=x>" }];
    expect(setup.shadowRoot!.querySelector("img")).toBeNull();
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect(startButton().textContent).toBe("Partij starten");
  });
});

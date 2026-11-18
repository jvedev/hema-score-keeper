import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { ApiEvent, ApiEventMutationResult } from "@hema/event-admin-api";
import "./events-index-view.js";
import type { EventsIndexView } from "./events-index-view.js";

const mockEvents: ApiEvent[] = [
  {
    id: "evt-1",
    eventName: "HEMA Autumn Open 2026",
    ruleset: null,
    allFightersAreVolunteers: false,
    tournaments: [
      {
        id: "trn-1",
        eventId: "evt-1",
        name: "Open Longsword",
        order: 1,
        color: "#2563eb",
        ruleset: null,
        stages: [],
        entries: [{ id: "e1", tournamentId: "trn-1", userId: "u1", kind: "FIGHTER", seed: 1, user: { id: "u1", username: "Fighter 1", judgeVolunteer: false, juryVolunteer: false, tableVolunteer: false, otherVolunteer: false } }],
      },
    ],
    arenas: [{ id: "a1", eventId: "evt-1", name: "Ring 1", order: 1 }],
    rulesets: [],
    colors: [],
  },
  {
    id: "evt-2",
    eventName: "Winter Sabre Cup",
    ruleset: null,
    allFightersAreVolunteers: false,
    tournaments: [],
    arenas: [],
    rulesets: [],
    colors: [],
  },
];

let view: EventsIndexView;
const $$ = (selector: string) => [...view.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
const $ = (selector: string) => view.shadowRoot!.querySelector<HTMLElement>(selector);

beforeEach(() => {
  view = document.createElement("events-index-view") as EventsIndexView;
  view.events = mockEvents;
  document.body.appendChild(view);
});

afterEach(() => {
  view.remove();
  setLocale("en");
});

describe("events-index-view", () => {
  it("renders list of events with names and counts", () => {
    const titles = $$(".event-card-title").map((el) => el.textContent?.trim());
    expect(titles).toContain("HEMA Autumn Open 2026");
    expect(titles).toContain("Winter Sabre Cup");

    const card1 = $('.event-card[data-event-id="evt-1"]')!;
    expect(card1.textContent).toContain("1 tournament");
    expect(card1.textContent).toContain("1 arena");
  });

  it("shows zero components state for events with no tournaments", () => {
    const card2 = $('.event-card[data-event-id="evt-2"]')!;
    expect(card2.textContent).toContain("0 tournaments");
    expect(card2.textContent).toContain("0 arenas");
  });

  it("fires event-selected when clicking on an event card", () => {
    let selectedId = "";
    view.addEventListener("event-selected", (e: any) => {
      selectedId = e.detail.eventId;
    });

    const card1 = $('.event-card[data-event-id="evt-1"]')!;
    card1.click();
    expect(selectedId).toBe("evt-1");
  });

  it("opens create event modal when clicking new event button", () => {
    const createBtn = $("button.create-event-btn")!;
    expect(createBtn).not.toBeNull();
    createBtn.click();

    const dialog = $("dialog.create-event-dialog") as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
  });

  it("dispatches event-create-requested when submitting form", () => {
    let createPayload: any = null;
    view.addEventListener("event-create-requested", (e: any) => {
      createPayload = e.detail;
    });

    const createBtn = $("button.create-event-btn")!;
    createBtn.click();

    const form = $("form.create-event-form") as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>('input[name="eventName"]')!;
    input.value = "New Championship 2027";

    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(createPayload).toEqual({ eventName: "New Championship 2027" });
  });

  it("renders empty state when no events exist", () => {
    view.events = [];
    expect($(".events-empty-state")).not.toBeNull();
    expect($(".events-empty-state")!.textContent).toContain("No events found.");
  });

  it("renders properly in Dutch", () => {
    setLocale("nl");
    expect($(".events-header h1")!.textContent).toBe("Evenementen");
    expect($("button.create-event-btn")!.textContent).toContain("Nieuw evenement");
  });
});

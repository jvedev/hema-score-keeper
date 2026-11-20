import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { ApiEvent, ApiEventCompetition } from "@hema/event-admin-api";
import "./event-overview-view.js";
import type { EventOverviewView } from "./event-overview-view.js";

const mockEvent: ApiEvent = {
  id: "evt-1",
  eventName: "HEMA Open 2026",
  ruleset: {
    id: "r1",
    eventId: "evt-1",
    name: "Standard Longsword Rules",
    version: 1,
    definition: null,
  },
  allFightersAreVolunteers: false,
  tournaments: [
    {
      id: "trn-1",
      eventId: "evt-1",
      name: "Open Longsword",
      order: 1,
      color: "#2563eb",
      ruleset: null,
      stages: [
        {
          id: "stg-1",
          tournamentId: "trn-1",
          type: "POOL",
          name: "Pool Phase",
          ruleset: null,
          minPoolSize: 4,
          maxPoolSize: 6,
          preferredPoolSize: 5,
          eliminationParticipantCount: null,
          timeBetweenMatchesMinutes: 2,
          rounds: [],
          arenas: [],
          officials: [],
        },
      ],
      entries: [
        {
          id: "e1",
          tournamentId: "trn-1",
          userId: "u1",
          kind: "FIGHTER",
          seed: 1,
          user: { id: "u1", username: "Fighter 1", judgeVolunteer: false, juryVolunteer: false, tableVolunteer: false, otherVolunteer: false },
        },
        {
          id: "e2",
          tournamentId: "trn-1",
          userId: "u2",
          kind: "FIGHTER",
          seed: 2,
          user: { id: "u2", username: "Fighter 2", judgeVolunteer: false, juryVolunteer: false, tableVolunteer: false, otherVolunteer: false },
        },
      ],
    },
  ],
  arenas: [
    { id: "a1", eventId: "evt-1", name: "Arena Red", order: 1 },
    { id: "a2", eventId: "evt-1", name: "Arena Blue", order: 2 },
  ],
  rulesets: [],
  colors: [],
};

const mockCompetitions: ApiEventCompetition[] = [
  {
    id: "cmp-1",
    name: "Autumn Rating Cup",
    slug: "autumn-rating-cup",
    status: "RUNNING",
    date: "2026-11-20",
    visibility: "PUBLIC",
    clubId: null,
    eventId: "evt-1",
  },
];

let view: EventOverviewView;
const $$ = (selector: string) => [...view.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
const $ = (selector: string) => view.shadowRoot!.querySelector<HTMLElement>(selector);

beforeEach(() => {
  view = document.createElement("event-overview-view") as EventOverviewView;
  view.event = mockEvent;
  view.competitions = mockCompetitions;
  document.body.appendChild(view);
});

afterEach(() => {
  view.remove();
  setLocale("en");
});

describe("event-overview-view", () => {
  it("renders event header, ruleset, arenas and planning action", () => {
    expect($(".event-title")!.textContent).toBe("HEMA Open 2026");
    expect($(".ruleset-info")!.textContent).toContain("Standard Longsword Rules");
    expect($(".planning-link-btn")!.textContent).toContain("Event planning");
    expect($(".resources-summary")!.textContent).toContain("2 arenas");
  });

  it("renders tournaments list with participants and stage counts", () => {
    const tournamentCards = $$(".tournament-card");
    expect(tournamentCards).toHaveLength(1);
    expect(tournamentCards[0]!.textContent).toContain("Open Longsword");
    expect(tournamentCards[0]!.textContent).toContain("2 participants");
    expect(tournamentCards[0]!.textContent).toContain("1 stage");
  });

  it("renders attached rating competitions", () => {
    const competitionCards = $$(".competition-card");
    expect(competitionCards).toHaveLength(1);
    expect(competitionCards[0]!.textContent).toContain("Autumn Rating Cup");
  });

  it("fires tournament-selected when clicking tournament card", () => {
    let selectedTournamentId = "";
    view.addEventListener("tournament-selected", (e: any) => {
      selectedTournamentId = e.detail.tournamentId;
    });

    $(".tournament-card")!.click();
    expect(selectedTournamentId).toBe("trn-1");
  });

  it("fires competition-selected when clicking competition card", () => {
    let selectedCompetitionId = "";
    view.addEventListener("competition-selected", (e: any) => {
      selectedCompetitionId = e.detail.competitionId;
    });

    $(".competition-card")!.click();
    expect(selectedCompetitionId).toBe("cmp-1");
  });

  it("fires planning-requested when clicking planning button", () => {
    let planningEventId = "";
    view.addEventListener("planning-requested", (e: any) => {
      planningEventId = e.detail.eventId;
    });

    $(".planning-link-btn")!.click();
    expect(planningEventId).toBe("evt-1");
  });

  it("renders zero-components state properly", () => {
    view.event = {
      ...mockEvent,
      tournaments: [],
    };
    view.competitions = [];

    expect($(".zero-components-notice")).not.toBeNull();
    expect($(".zero-components-notice")!.textContent).toContain("This event has no components yet");
  });

  it("opens create tournament dialog when clicking new tournament", () => {
    $(".create-tournament-btn")!.click();
    const dialog = $("dialog.create-tournament-dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
  });

  it("creates a new competition from the add-competition dialog", () => {
    let detail: any = null;
    view.addEventListener("competition-create-requested", (e: any) => (detail = e.detail));
    $(".attach-competition-btn")!.click();
    expect(($("dialog.attach-competition-dialog") as HTMLDialogElement).open).toBe(true);
    expect($(".competition-attach-fields")!.hidden).toBe(true);
    ($("input[name='compName']") as HTMLInputElement).value = "Winter Cup";
    ($("input[name='compSlug']") as HTMLInputElement).value = "winter-cup";
    ($("input[name='compDate']") as HTMLInputElement).value = "2026-12-01";
    ($("form.attach-competition-form") as HTMLFormElement).requestSubmit();
    expect(detail).toEqual({ eventId: "evt-1", name: "Winter Cup", slug: "winter-cup", date: "2026-12-01" });
  });

  it("attaches an existing standalone competition, offering only unattached ones", () => {
    view.attachableCompetitions = [
      { ...mockCompetitions[0]!, id: "cmp-free", name: "Free Cup", eventId: null },
      { ...mockCompetitions[0]!, id: "cmp-taken", name: "Taken Cup", eventId: "evt-other" },
    ];
    let detail: any = null;
    view.addEventListener("competition-attach-requested", (e: any) => (detail = e.detail));
    $(".attach-competition-btn")!.click();
    const attachRadio = $("input[name='compMode'][value='attach']") as HTMLInputElement;
    attachRadio.checked = true;
    attachRadio.dispatchEvent(new Event("change"));
    expect($(".competition-create-fields")!.hidden).toBe(true);
    expect($(".competition-submit-btn")!.textContent).toBe("Attach");
    const options = $$("select[name='compAttach'] option").map((option) => (option as HTMLOptionElement).value);
    expect(options).toEqual(["cmp-free"]);
    ($("form.attach-competition-form") as HTMLFormElement).requestSubmit();
    expect(detail).toEqual({ eventId: "evt-1", competitionId: "cmp-free" });
  });

  it("explains when there is nothing to attach and disables attaching", () => {
    view.attachableCompetitions = [];
    $(".attach-competition-btn")!.click();
    const attachRadio = $("input[name='compMode'][value='attach']") as HTMLInputElement;
    attachRadio.checked = true;
    attachRadio.dispatchEvent(new Event("change"));
    expect($(".no-attachable-competitions")!.textContent).toContain("no standalone competitions");
    expect(($(".competition-submit-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect($(".planning-link-btn")!.textContent).toContain("Evenementenplanning");
    expect($(".tournaments-section h2")!.textContent).toBe("Toernooien");
  });
});

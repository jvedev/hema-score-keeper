import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { ApiEvent, ApiTournament } from "@hema/event-admin-api";
import "./tournament-workspace-view.js";
import type { TournamentWorkspaceView } from "./tournament-workspace-view.js";

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
      ruleset: null, // Inherits from event
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
          user: {
            id: "u1",
            username: "Fighter 1",
            judgeVolunteer: false,
            juryVolunteer: false,
            tableVolunteer: false,
            otherVolunteer: false,
          },
        },
        {
          id: "e2",
          tournamentId: "trn-1",
          userId: "u2",
          kind: "FIGHTER",
          seed: 2,
          user: {
            id: "u2",
            username: "Fighter 2",
            judgeVolunteer: false,
            juryVolunteer: false,
            tableVolunteer: false,
            otherVolunteer: false,
          },
        },
      ],
    },
  ],
  arenas: [
    { id: "a1", eventId: "evt-1", name: "Arena 1", order: 1 },
    { id: "a2", eventId: "evt-1", name: "Arena 2", order: 2 },
  ],
  rulesets: [],
  colors: [],
};

let view: TournamentWorkspaceView;
const $$ = (selector: string) => [...view.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
const $ = (selector: string) => view.shadowRoot!.querySelector<HTMLElement>(selector);

beforeEach(() => {
  setLocale("en");
  view = document.createElement("tournament-workspace-view") as TournamentWorkspaceView;
  view.event = mockEvent;
  view.tournamentId = "trn-1";
  document.body.appendChild(view);
});

afterEach(() => {
  view.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setLocale("en");
});

describe("tournament-workspace-view", () => {
  it("renders stages without a name", () => {
    const tournament = mockEvent.tournaments[0]!;
    view.event = {
      ...mockEvent,
      tournaments: [{ ...tournament, stages: [{ ...tournament.stages![0]!, name: null }] }],
    };
    $("[data-tab='stages']")!.click();
    expect($(".stage-item")).not.toBeNull();
  });

  it("renders header with tournament name, ruleset inheritance, and metadata badges", () => {
    expect($(".tournament-title")?.textContent).toContain("Open Longsword");
    expect($(".ruleset-badge")?.textContent).toContain("Standard Longsword Rules (inherited from event)");
    expect($(".participant-badge")?.textContent).toContain("2 participants");
    expect($(".stage-badge")?.textContent).toContain("1 stage");
    expect($("[data-action='edit-tournament']")).not.toBeNull();
  });

  it("renders primary navigation tabs and switches active tab on click", () => {
    const tabs = $$(".nav-tab");
    expect(tabs.length).toBe(6);
    expect(tabs.map((t) => t.dataset.tab)).toEqual([
      "overview",
      "participants",
      "stages",
      "officials",
      "access",
      "live",
    ]);

    // Overview is active by default
    expect($(".nav-tab.active")?.dataset.tab).toBe("overview");
    expect($(".tab-content-overview")).not.toBeNull();

    // Click on participants tab
    const participantsTab = tabs.find((t) => t.dataset.tab === "participants")!;
    participantsTab.click();

    expect($(".nav-tab.active")?.dataset.tab).toBe("participants");
    expect($(".tab-content-participants")).not.toBeNull();
    expect($(".tab-content-overview")).toBeNull();
  });

  it("renders overview summary cards and allows switching to participants tab from card action", () => {
    expect($(".summary-card-participants")).not.toBeNull();
    expect($(".summary-card-stages")).not.toBeNull();
    expect($(".summary-card-schedule")).not.toBeNull();
    expect($(".summary-card-live")).not.toBeNull();

    const viewParticipantsBtn = $("[data-action='view-participants']");
    expect(viewParticipantsBtn).not.toBeNull();
    viewParticipantsBtn?.click();

    expect($(".nav-tab.active")?.dataset.tab).toBe("participants");
  });

  it("renders participants tab with entries list and action triggers", () => {
    view.activeTab = "participants";

    const rows = $$(".entry-row");
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("Fighter 1");
    expect(rows[1]?.textContent).toContain("Fighter 2");

    expect($("[data-action='add-participant']")).not.toBeNull();
    expect($("[data-action='add-bulk']")).not.toBeNull();
  });

  it("edits an entry's role and seed and refreshes the tournament", async () => {
    const updated = structuredClone(mockEvent);
    updated.tournaments[0]!.entries[0]!.kind = "BOTH";
    updated.tournaments[0]!.entries[0]!.seed = 3;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(updated.tournaments[0]!.entries[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    view.shadowRoot!.querySelector<HTMLSelectElement>("[name='kind']")!.value = "BOTH";
    view.shadowRoot!.querySelector<HTMLInputElement>("[name='seed']")!.value = "3";
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='edit-entry']")).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({ tournamentId: "trn-1", kind: "BOTH", seed: 3 });
    expect($$(".entry-row")[0]!.textContent).toContain("BOTH");
  });

  it("keeps edited values after tab changes and a failed save, and allows cancellation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Save refused" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const seed = view.shadowRoot!.querySelector<HTMLInputElement>("[name='seed']")!;
    seed.value = "7";
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    view.activeTab = "overview";
    view.activeTab = "participants";
    expect(view.shadowRoot!.querySelector<HTMLInputElement>("[name='seed']")!.value).toBe("7");
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($("[role='alert']")?.textContent).toContain("Save refused"));
    expect(view.shadowRoot!.querySelector<HTMLInputElement>("[name='seed']")!.value).toBe("7");
    $("[data-action='cancel-edit-entry']")!.click();
    expect($("form[data-form='edit-entry']")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes a confirmed participant and refreshes the list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const updated = structuredClone(mockEvent);
    updated.tournaments[0]!.entries = updated.tournaments[0]!.entries.filter((entry) => entry.id !== "e1");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";

    $("[data-action='delete-entry'][data-id='e1']")!.click();

    await vi.waitFor(() => expect($$(".entry-row")).toHaveLength(1));
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/entries/e1");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect($(".entry-row")?.textContent).toContain("Fighter 2");
  });

  it("adds a new participant and displays the refreshed entry", async () => {
    const updated = structuredClone(mockEvent);
    updated.tournaments[0]!.entries.push({ ...updated.tournaments[0]!.entries[0]!, id: "e3", userId: "u3", user: { ...updated.tournaments[0]!.entries[0]!.user, id: "u3", username: "New Fighter" } });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockImplementationOnce((_url, options) => {
        const body = JSON.parse(options.body as string);
        return Promise.resolve(body.name === "New Fighter" && body.username === "New Fighter"
          ? new Response(JSON.stringify(updated.tournaments[0]!.entries[2]!.user), { status: 200 })
          : new Response(JSON.stringify({ error: "Name must be a string" }), { status: 400 }));
      })
      .mockResolvedValueOnce(new Response(JSON.stringify(updated.tournaments[0]!.entries[2]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 })));
    view.activeTab = "participants";
    $("[data-action='add-participant']")!.click();
    const input = view.shadowRoot!.querySelector<HTMLInputElement>("[name='username']");
    expect(input).not.toBeNull();
    input!.value = "New Fighter";
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-participant']")!.requestSubmit();
    await vi.waitFor(() => expect(view.shadowRoot!.textContent).toContain("New Fighter"));
  });

  it("imports multiple names without duplicating existing users or entries", async () => {
    const updated = structuredClone(mockEvent);
    const user = { ...updated.tournaments[0]!.entries[0]!.user, id: "u3", username: "New Fighter" };
    updated.tournaments[0]!.entries.push({ ...updated.tournaments[0]!.entries[0]!, id: "e3", userId: "u3", user });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([mockEvent.tournaments[0]!.entries[0]!.user]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockEvent), { status: 200 }))
      .mockImplementationOnce((_url, options) => {
        const body = JSON.parse(options.body as string);
        return Promise.resolve(body.name === "New Fighter" && body.username === "New Fighter"
          ? new Response(JSON.stringify(user), { status: 200 })
          : new Response(JSON.stringify({ error: "Name must be a string" }), { status: 400 }));
      })
      .mockResolvedValueOnce(new Response(JSON.stringify(updated.tournaments[0]!.entries[2]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    const input = view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']");
    expect(input).not.toBeNull();
    input!.value = " Fighter 1 \nNew Fighter\nnew fighter\n\n";
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.requestSubmit();
    await vi.waitFor(() => expect($$(".entry-row").map((row) => row.textContent).join(" ")).toContain("New Fighter"));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetchMock.mock.calls[3]![1]!.body as string)).toMatchObject({ tournamentId: "trn-1", userId: "u3", kind: "FIGHTER" });
  });

  it("retains names after a partial failure and safely retries", async () => {
    const user = { ...mockEvent.tournaments[0]!.entries[0]!.user, id: "u3", username: "New Fighter" };
    const partial = structuredClone(mockEvent);
    partial.tournaments[0]!.entries.push({ ...partial.tournaments[0]!.entries[0]!, id: "e3", userId: user.id, user });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([user]))
      .mockResolvedValueOnce(json(mockEvent))
      .mockResolvedValueOnce(json(partial.tournaments[0]!.entries[2]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "No access" }), { status: 403 }))
      .mockResolvedValueOnce(json(partial))
      .mockResolvedValueOnce(json([user]))
      .mockResolvedValueOnce(json(partial))
      .mockResolvedValueOnce(json({ ...user, id: "u4", username: "Second" }))
      .mockResolvedValueOnce(json({ ...partial.tournaments[0]!.entries[2], id: "e4", userId: "u4" }))
      .mockResolvedValueOnce(json(partial));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']")!.value = "New Fighter\nSecond";
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.requestSubmit();
    await vi.waitFor(() => expect($("[role='alert']")?.textContent).toContain("No access"));
    expect(view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']")!.value).toBe("New Fighter\nSecond");
    expect($$(".entry-row")).toHaveLength(3);
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='add-bulk']")).toBeNull());
    const entries = fetchMock.mock.calls.filter(([url, options]) => String(url).endsWith("/entries") && options?.method === "POST");
    expect(entries).toHaveLength(2);
  });

  it("preserves edited bulk names when switching tabs", () => {
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    const input = view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']")!;
    input.value = "First\nSecond";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    view.activeTab = "overview";
    view.activeTab = "participants";
    expect(view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']")!.value).toBe("First\nSecond");
  });

  it("cancels bulk import without making requests", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    $("[data-action='cancel-bulk']")!.click();
    expect($("form[data-form='add-bulk']")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the volunteer policy for imported fighters", async () => {
    const event = structuredClone(mockEvent);
    event.allFightersAreVolunteers = true;
    view.event = event;
    const user = { ...event.tournaments[0]!.entries[0]!.user, id: "u3", username: "New" };
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(json([user])).mockResolvedValueOnce(json(event))
      .mockResolvedValueOnce(json({ ...event.tournaments[0]!.entries[0], userId: user.id, kind: "BOTH" }))
      .mockResolvedValueOnce(json(event));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']")!.value = "New";
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='add-bulk']")).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string)).toMatchObject({ kind: "BOTH", userId: "u3" });
  });

  it("does not start a second import while one is in progress", async () => {
    let resolveUsers!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveUsers = resolve; }))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(mockEvent), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    const form = view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!;
    form.querySelector<HTMLTextAreaElement>("[name='usernames']")!.value = "Fighter 1";
    form.requestSubmit();
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveUsers(new Response(JSON.stringify([mockEvent.tournaments[0]!.entries[0]!.user]), { status: 200 }));
    await vi.waitFor(() => expect($("form[data-form='add-bulk']")).toBeNull());
  });

  it("does not show an import error in another tournament", async () => {
    let resolveUsers!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveUsers = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockEvent), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.event = { ...mockEvent, tournaments: [...mockEvent.tournaments, { ...mockEvent.tournaments[0]!, id: "trn-2", name: "Other" }] };
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    view.shadowRoot!.querySelector<HTMLTextAreaElement>("[name='usernames']")!.value = "First";
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.requestSubmit();
    view.tournamentId = "trn-2";
    resolveUsers(new Response(JSON.stringify({ error: "No access" }), { status: 403 }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect($("[role='alert']")).toBeNull();
    expect(view.shadowRoot!.textContent).toContain("Other");
  });

  it("does not remove a participant when confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='delete-entry'][data-id='e1']")!.click();
    expect(fetchMock).not.toHaveBeenCalled();
    expect($$(".entry-row")).toHaveLength(2);
  });

  it("shows a deletion error and keeps the participant visible", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })));
    view.activeTab = "participants";
    $("[data-action='delete-entry'][data-id='e1']")!.click();
    await vi.waitFor(() => expect($("[role='alert']")?.textContent ?? "").toContain("Forbidden"));
    expect($$(".entry-row")).toHaveLength(2);
  });

  it("renders a destination tournament selector in the edit form", () => {
    const twoTournaments = { ...mockEvent, tournaments: [...mockEvent.tournaments, { ...mockEvent.tournaments[0]!, id: "trn-2", name: "Open Sabre", entries: [] }] };
    view.event = twoTournaments;
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const select = view.shadowRoot!.querySelector<HTMLSelectElement>("select[name='tournamentId']");
    expect(select).not.toBeNull();
    expect([...select!.options].map((option) => `${option.value}:${option.textContent?.trim()}`)).toEqual([
      "trn-1:Open Longsword",
      "trn-2:Open Sabre",
    ]);
    expect(select!.value).toBe("trn-1");
  });

  it("moves an entry to the destination tournament and refreshes the list", async () => {
    const movedEntry = { ...mockEvent.tournaments[0]!.entries[0]!, tournamentId: "trn-2" };
    const updated = structuredClone(mockEvent);
    updated.tournaments = [
      { ...updated.tournaments[0]!, entries: updated.tournaments[0]!.entries.filter((entry) => entry.id !== "e1") },
      { ...updated.tournaments[0]!, id: "trn-2", name: "Open Sabre", entries: [movedEntry] },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(movedEntry), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.event = { ...mockEvent, tournaments: [...mockEvent.tournaments, { ...mockEvent.tournaments[0]!, id: "trn-2", name: "Open Sabre", entries: [] }] };
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const select = view.shadowRoot!.querySelector<HTMLSelectElement>("select[name='tournamentId']")!;
    select.value = "trn-2";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($$(".entry-row")).toHaveLength(1));
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({ tournamentId: "trn-2", kind: "FIGHTER", seed: 1 });
  });

  it("keeps the destination choice and shows a move error after a failed save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Entry still referenced" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    view.event = { ...mockEvent, tournaments: [...mockEvent.tournaments, { ...mockEvent.tournaments[0]!, id: "trn-2", name: "Open Sabre", entries: [] }] };
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const select = view.shadowRoot!.querySelector<HTMLSelectElement>("select[name='tournamentId']")!;
    select.value = "trn-2";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    view.activeTab = "overview";
    view.activeTab = "participants";
    expect(view.shadowRoot!.querySelector<HTMLSelectElement>("select[name='tournamentId']")!.value).toBe("trn-2");
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($("[role='alert']")?.textContent).toContain("Entry still referenced"));
    expect(view.shadowRoot!.querySelector<HTMLSelectElement>("select[name='tournamentId']")!.value).toBe("trn-2");
  });

  it("does not show a move error in another tournament", async () => {
    let resolvePatch!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePatch = resolve; }))
      .mockResolvedValue(new Response(JSON.stringify(mockEvent), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.event = { ...mockEvent, tournaments: [...mockEvent.tournaments, { ...mockEvent.tournaments[0]!, id: "trn-2", name: "Open Sabre", entries: [] }] };
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const select = view.shadowRoot!.querySelector<HTMLSelectElement>("select[name='tournamentId']")!;
    select.value = "trn-2";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    view.tournamentId = "trn-2";
    resolvePatch(new Response(JSON.stringify({ error: "Entry still referenced" }), { status: 409 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect($("[role='alert']")).toBeNull();
    expect($("[data-tab='participants']")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders the shared-person editor with name, volunteer preferences and skill ratings", () => {
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    expect(view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']")!.value).toBe("Fighter 1");
    for (const name of ["judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer"]) {
      expect(view.shadowRoot!.querySelector<HTMLInputElement>(`input[name='${name}']`)).not.toBeNull();
    }
    for (const name of ["judgeSkill", "jurySkill"]) {
      expect([...view.shadowRoot!.querySelectorAll<HTMLInputElement>(`input[name='${name}']`)]).toHaveLength(6); // levels 0–5
    }
    expect(view.shadowRoot!.querySelector("[data-scope-note]")).not.toBeNull();
  });

  it("shows the shared-account scope note in the editor", () => {
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const en = view.shadowRoot!.querySelector(`[data-scope-note]`)?.textContent ?? "";
    expect(en.length).toBeGreaterThan(0);
    setLocale("nl");
    const nl = view.shadowRoot!.querySelector(`[data-scope-note]`)?.textContent ?? "";
    expect(nl).not.toBe(en);
    expect(nl.length).toBeGreaterThan(0);
  });

  it("saves person details, entry data and skills in one request", async () => {
    const updated = structuredClone(mockEvent);
    updated.tournaments[0]!.entries[0]!.kind = "BOTH";
    updated.tournaments[0]!.entries[0]!.user = { ...updated.tournaments[0]!.entries[0]!.user, username: "Ruler Renamed" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(updated.tournaments[0]!.entries[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']")!.value = "Ruler Renamed";
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']")!.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='tableVolunteer']")!.checked = true;
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='tableVolunteer']")!.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='4']")!.checked = true;
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='4']")!.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='edit-entry']")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/entries/e1/participant");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      tournamentId: "trn-1",
      kind: "FIGHTER",
      seed: 1,
      username: "Ruler Renamed",
      judgeVolunteer: false,
      juryVolunteer: false,
      tableVolunteer: true,
      otherVolunteer: false,
      skills: [
        { skillName: "JUDGE", skillLevel: 4 },
        { skillName: "JURY", skillLevel: null },
      ],
    });
  });

  it("clears a skill by selecting level zero", async () => {
    const withSkills = structuredClone(mockEvent);
    withSkills.tournaments[0]!.entries[0]!.user!.skills = [{ id: "s1", userId: "u1", skillName: "JUDGE", skillLevel: 3 }];
    view.event = withSkills;
    const updated = structuredClone(withSkills);
    updated.tournaments[0]!.entries[0]!.user!.skills = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(updated.tournaments[0]!.entries[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    expect(view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='3']")!.checked).toBe(true);
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='0']")!.checked = true;
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='0']")!.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='edit-entry']")).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({
      skills: [
        { skillName: "JUDGE", skillLevel: null },
        { skillName: "JURY", skillLevel: null },
      ],
    });
  });

  it("retains person details after a failed save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Username taken" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const name = view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']")!;
    name.value = "New Name";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='5']")!.checked = true;
    view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='5']")!.dispatchEvent(new Event("input", { bubbles: true }));
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='edit-entry']")!.requestSubmit();
    await vi.waitFor(() => expect($("[role='alert']")?.textContent).toContain("Username taken"));
    expect(view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']")!.value).toBe("New Name");
    expect(view.shadowRoot!.querySelector<HTMLInputElement>("input[name='judgeSkill'][value='5']")!.checked).toBe(true);
  });

  it("requires a non-empty name", () => {
    view.activeTab = "participants";
    $("[data-action='edit-entry'][data-id='e1']")!.click();
    const input = view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']");
    expect(input?.hasAttribute("required")).toBe(true);
  });

  it("dispatches event when edit tournament button is clicked", () => {
    let fired = false;
    view.addEventListener("tournament-edit-requested", () => {
      fired = true;
    });

    $("[data-action='edit-tournament']")?.click();
    expect(fired).toBe(true);
  });

  it("marks a newly created entry as BOTH when the also-volunteer option is checked", async () => {
    const updated = structuredClone(mockEvent);
    const newUser = { ...updated.tournaments[0]!.entries[0]!.user, id: "u3", username: "New Fighter" };
    updated.tournaments[0]!.entries.push({ ...updated.tournaments[0]!.entries[0]!, id: "e3", userId: "u3", kind: "BOTH", user: newUser });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([mockEvent.tournaments[0]!.entries[0]!.user]))
      .mockResolvedValueOnce(json(newUser))
      .mockResolvedValueOnce(json(updated.tournaments[0]!.entries[2]))
      .mockResolvedValueOnce(json(updated)));
    view.activeTab = "participants";
    $("[data-action='add-participant']")!.click();
    const input = view.shadowRoot!.querySelector<HTMLInputElement>("input[name='username']");
    expect(input).not.toBeNull();
    input!.value = "New Fighter";
    const alsoVolunteer = view.shadowRoot!.querySelector<HTMLInputElement>("input[name='alsoVolunteer']");
    expect(alsoVolunteer).not.toBeNull();
    alsoVolunteer!.checked = true;
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-participant']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='add-participant']")).toBeNull());
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2]![1]!.body as string)).toMatchObject({ kind: "BOTH", userId: "u3" });
  });

  it("marks bulk-imported entries as BOTH when the also-volunteer option is checked", async () => {
    const user = { ...mockEvent.tournaments[0]!.entries[0]!.user, id: "u3", username: "New Fighter" };
    const updated = structuredClone(mockEvent);
    updated.tournaments[0]!.entries.push({ ...updated.tournaments[0]!.entries[0]!, id: "e3", userId: "u3", kind: "BOTH", user });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([user]))
      .mockResolvedValueOnce(json(mockEvent))
      .mockResolvedValueOnce(json(updated.tournaments[0]!.entries[2]))
      .mockResolvedValueOnce(json(updated)));
    view.activeTab = "participants";
    $("[data-action='add-bulk']")!.click();
    view.shadowRoot!.querySelector<HTMLTextAreaElement>("input[name='usernames'], textarea[name='usernames']")!.value = "New Fighter";
    const alsoVolunteer = view.shadowRoot!.querySelector<HTMLInputElement>("input[name='alsoVolunteer']");
    alsoVolunteer!.checked = true;
    view.shadowRoot!.querySelector<HTMLFormElement>("form[data-form='add-bulk']")!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='add-bulk']")).toBeNull());
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2]![1]!.body as string)).toMatchObject({ kind: "BOTH", userId: "u3" });
  });

  it("renders loading state", () => {
    view.loading = true;
    expect($(".tournament-loading")?.textContent).toContain("Loading tournament…");
  });

  it("renders error state", () => {
    view.error = "Database failure";
    expect($(".tournament-error")?.textContent).toContain("Database failure");
  });

  it("renders not found state when tournamentId does not exist in event", () => {
    view.tournamentId = "non-existent-id";
    expect($(".tournament-not-found")?.textContent).toContain("Tournament not found.");
  });

  it("renders stages tab with stages sidebar and detail pane", () => {
    view.activeTab = "stages";

    const stageItems = $$(".stage-item");
    expect(stageItems.length).toBe(1);
    expect(stageItems[0]?.textContent).toContain("Pool Phase");

    const subTabs = $$(".sub-tab");
    expect(subTabs.length).toBe(6);
    expect(subTabs[0]?.textContent).toContain("Overview");
  });

  it("dispatches stage-advance-requested when make active stage button is clicked", () => {
    // Add a second non-active stage to test make-active-stage
    const eventWithTwoStages = {
      ...mockEvent,
      tournaments: [
        {
          ...mockEvent.tournaments[0]!,
          currentStageId: "stg-1",
          stages: [
            mockEvent.tournaments[0]!.stages[0]!,
            {
              id: "stg-2",
              tournamentId: "trn-1",
              type: "ELIMINATION" as const,
              name: "Elimination Bracket",
              ruleset: null,
              minPoolSize: null,
              maxPoolSize: null,
              preferredPoolSize: null,
              eliminationParticipantCount: 8,
              timeBetweenMatchesMinutes: 2,
              rounds: [],
              arenas: [],
              officials: [],
            },
          ],
        },
      ],
    };
    view.event = eventWithTwoStages;
    view.activeTab = "stages";
    view.selectedStageId = "stg-2";

    let advanceDetail: any = null;
    view.addEventListener("stage-advance-requested", (e: any) => {
      advanceDetail = e.detail;
    });

    const advanceBtn = $("[data-action='make-active-stage']");
    expect(advanceBtn).not.toBeNull();
    advanceBtn?.click();

    expect(advanceDetail).toEqual({
      tournamentId: "trn-1",
      stageId: "stg-2",
    });
  });

  it("dispatches live-activate-requested when activate live button is clicked", () => {
    view.activeTab = "live";

    let activateFired = false;
    view.addEventListener("live-activate-requested", () => {
      activateFired = true;
    });

    $("[data-action='activate-live']")?.click();
    expect(activateFired).toBe(true);
  });

  it("updates text when locale is switched to Dutch", () => {
    setLocale("nl");
    expect($(".nav-tab.active")?.textContent).toContain("Overzicht");
    expect($(".ruleset-badge")?.textContent).toContain("overgenomen van event");
  });

  describe("Officials tab", () => {
    beforeEach(() => {
      view.activeTab = "officials";
    });

    it("shows stages with no officials", () => {
      expect($$(".officials-stage-card").length).toBe(1);
      expect($$(".officials-stage-card h4").length).toBe(1);
      expect($$(".officials-stage-card h4")[0]?.textContent).toContain("Pool Phase");
      expect($(".empty-state")?.textContent).toContain("No officials assigned");
    });

    it("shows add official button for each stage", () => {
      expect($$("[data-action='add-official']").length).toBe(1);
    });

    it("opens add official form when add button is clicked", () => {
      $("[data-action='add-official']")?.click();
      expect($("form[data-form='add-official']")).not.toBeNull();
      expect($$("select[name='entryId']").length).toBe(1);
      expect($$("select[name='role']").length).toBe(1);
    });

    it("hides add official form when cancel is clicked", () => {
      $("[data-action='add-official']")?.click();
      expect($("form[data-form='add-official']")).not.toBeNull();
      $("[data-action='cancel-add-official']")?.click();
      expect($("form[data-form='add-official']")).toBeNull();
    });
  });

  describe("Access tab", () => {
    beforeEach(() => {
      view.activeTab = "access";
    });

    it("shows add admin button", () => {
      expect($("[data-action='add-admin']")).not.toBeNull();
    });

    it("opens add admin form when add button is clicked", () => {
      $("[data-action='add-admin']")?.click();
      expect($("form[data-form='add-admin']")).not.toBeNull();
      expect($("select[name='userId']")).not.toBeNull();
    });

    it("hides add admin form when cancel is clicked", () => {
      $("[data-action='add-admin']")?.click();
      expect($("form[data-form='add-admin']")).not.toBeNull();
      $("[data-action='cancel-add-admin']")?.click();
      expect($("form[data-form='add-admin']")).toBeNull();
    });

    it("shows empty state when no admins exist", () => {
      expect($(".empty-state")?.textContent).toContain("No tournament administrators yet");
    });
  });

  describe("Live tab", () => {
    beforeEach(() => {
      view.activeTab = "live";
    });

    it("shows activate live button when not active", () => {
      expect($("[data-action='activate-live']")).not.toBeNull();
      expect($("[data-action='activate-live']")?.textContent).toContain("Activate live tournament");
    });

    it("shows empty state when not active", () => {
      expect($(".empty-state")?.textContent).toContain("Not live yet");
    });
  });
});

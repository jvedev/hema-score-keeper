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
    expect($(".stage-path-item")).not.toBeNull();
    expect($(".stage-page h3")?.textContent).toContain("Unnamed stage");
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

  it("renders the overview facts and allows switching to participants tab", () => {
    expect($(".overview-facts")).not.toBeNull();
    expect($(".tab-content-overview")!.textContent).not.toMatch(/SQLite|Database-mode/);

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

  it("renders stages tab with the stage path and one stage page without sub-tabs", () => {
    view.activeTab = "stages";

    const stageItems = $$(".stage-path-item");
    expect(stageItems.length).toBe(1);
    expect(stageItems[0]?.textContent).toContain("Pool Phase");
    expect($(".stage-page")).not.toBeNull();
    expect($$(".sub-tab").length).toBe(0);
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

  describe("Stages tab", () => {
    beforeEach(() => {
      view.activeTab = "stages";
    });

    it("shows stages with add stage button", () => {
      expect($("[data-action='add-stage']")).not.toBeNull();
      expect($$(".stage-path-item").length).toBe(1);
    });

    it("shows stage name and type in words", () => {
      expect($(".stage-path-item .stage-path-name")?.textContent).toContain("Pool Phase");
      expect($(".stage-path-item .stage-path-type")?.textContent).toContain("Pool");
      expect($(".stages-tab")!.textContent).not.toContain("POOL");
    });

    it("selects first stage by default", () => {
      expect($(".stage-path-item.selected")).not.toBeNull();
      expect($(".stage-page")).not.toBeNull();
    });

    it("shows every part of the stage on one page", () => {
      for (const section of [".stage-summary", ".stage-arenas-pane", ".stage-officials-pane", ".stage-pool-results-pane", ".stage-rounds-pane", ".stage-matches-pane"]) {
        expect($(section), section).not.toBeNull();
      }
    });

    it("shows make active stage button for non-active stages", () => {
      expect($("[data-action='make-active-stage']")).not.toBeNull();
    });

    it("shows rounds and matches on the stage page", () => {
      expect($(".stage-rounds-pane")).not.toBeNull();
      expect($(".stage-matches-pane")).not.toBeNull();
    });
  });
});

describe("stage and tournament actions", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function twoStageEvent(currentStageId: string | null = "stg-1"): ApiEvent {
    const event = structuredClone(mockEvent);
    const tournament = event.tournaments[0]!;
    tournament.currentStageId = currentStageId;
    tournament.stages.push({
      id: "stg-2",
      tournamentId: "trn-1",
      type: "ELIMINATION",
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
    });
    return event;
  }


  it("opens the new-stage form and creates the stage through the API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "stg-new" }))
      .mockResolvedValueOnce(json(mockEvent));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "stages";

    $("[data-action='add-stage']")!.click();
    const form = $("form[data-form='add-stage']") as HTMLFormElement | null;
    expect(form).not.toBeNull();
    (form!.querySelector("input[name='name']") as HTMLInputElement).value = "Second pools";
    form!.requestSubmit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock.mock.calls[0]![0]).toContain("/stages");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({ tournamentId: "trn-1", name: "Second pools" });
    expect(fetchMock.mock.calls[1]![0]).toContain("/events/evt-1");
  });

  it("opens the edit form from the stage page", () => {
    view.event = twoStageEvent();
    view.activeTab = "stages";
    view.selectedStageId = "stg-2";
    $(".stage-page [data-action='edit-stage']")!.click();
    const form = $("form[data-form='edit-stage']");
    expect(form).not.toBeNull();
    expect((form!.querySelector("input[name='name']") as HTMLInputElement).value).toBe("Elimination Bracket");
  });

  it("deletes a stage from the stage page after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(mockEvent));
    vi.stubGlobal("fetch", fetchMock);
    view.event = twoStageEvent();
    view.activeTab = "stages";

    view.selectedStageId = "stg-2";
    $(".stage-page [data-action='delete-stage']")!.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]![0]).toContain("/stages/stg-2");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("DELETE");
  });

  it("does not delete a stage when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    view.event = twoStageEvent();
    view.activeTab = "stages";
    view.selectedStageId = "stg-2";
    $(".stage-page [data-action='delete-stage']")!.click();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes a stage current through the API and shows a refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: "You don't manage this tournament." }, 403));
    vi.stubGlobal("fetch", fetchMock);
    view.event = twoStageEvent();
    view.activeTab = "stages";
    view.selectedStageId = "stg-2";

    $("[data-action='make-active-stage']")!.click();
    await vi.waitFor(() => expect($("[role='alert']")).not.toBeNull());

    expect(fetchMock.mock.calls[0]![0]).toContain("/tournaments/trn-1");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ currentStageId: "stg-2" });
    expect($("[role='alert']")?.textContent).toContain("You don't manage this tournament.");
  });

  it("shows no current-stage badge in the header when no stage is current", () => {
    view.event = twoStageEvent(null);
    expect($(".tournament-header .active-stage-badge")).toBeNull();
  });

  it("edits the tournament name and ruleset and tells the host the event changed", async () => {
    const event = structuredClone(mockEvent);
    event.rulesets = [{ id: "r2", eventId: "evt-1", name: "Sabre Rules", version: 1, definition: null }];
    const refreshed = structuredClone(event);
    refreshed.tournaments[0]!.name = "Open Longsword 2026";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(refreshed.tournaments[0]))
      .mockResolvedValueOnce(json(refreshed));
    vi.stubGlobal("fetch", fetchMock);
    view.event = event;
    let changed: ApiEvent | null = null;
    view.addEventListener("event-refreshed", (e: Event) => (changed = (e as CustomEvent<{ event: ApiEvent }>).detail.event));

    $("[data-action='edit-tournament']")!.click();
    const form = $("form[data-form='edit-tournament']") as HTMLFormElement | null;
    expect(form).not.toBeNull();
    (form!.querySelector("input[name='name']") as HTMLInputElement).value = "Open Longsword 2026";
    (form!.querySelector("select[name='rulesetId']") as HTMLSelectElement).value = "r2";
    form!.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='edit-tournament']")).toBeNull());

    expect(fetchMock.mock.calls[0]![0]).toContain("/tournaments/trn-1");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ name: "Open Longsword 2026", rulesetId: "r2" });
    expect($("form[data-form='edit-tournament']")).toBeNull();
    expect($(".tournament-title")!.textContent).toBe("Open Longsword 2026");
    expect(changed).not.toBeNull();
  });

  it("keeps the tournament form open with the server's refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "Name already used." }, 409)));
    $("[data-action='edit-tournament']")!.click();
    ($("form[data-form='edit-tournament']") as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='edit-tournament'] [role='alert']")).not.toBeNull());
    expect($("form[data-form='edit-tournament']")).not.toBeNull();
    expect($("form[data-form='edit-tournament'] [role='alert']")?.textContent).toContain("Name already used.");
  });

  it("asks before activating live scoring", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(json({ active: false, liveTournamentId: null, rings: [], bouts: [] }));
    vi.stubGlobal("fetch", fetchMock);
    let requested = false;
    view.addEventListener("live-activate-requested", () => (requested = true));
    view.activeTab = "live";
    const button = $("[data-action='activate-live']");
    if (button) {
      button.click();
      expect(window.confirm).toHaveBeenCalled();
    }
    expect(requested).toBe(false);
  });
});

describe("stage form", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function eventWithRulesets(): ApiEvent {
    const event = structuredClone(mockEvent);
    event.rulesets = [
      { id: "r1", eventId: "evt-1", name: "Standard Longsword Rules", version: 1, definition: null },
      { id: "r2", eventId: "evt-1", name: "Sabre Rules", version: 1, definition: null },
    ];
    const tournament = event.tournaments[0]!;
    tournament.stages.push({
      id: "stg-2",
      tournamentId: "trn-1",
      type: "ELIMINATION",
      name: "Bracket",
      ruleset: { id: "r2", eventId: "evt-1", name: "Sabre Rules", version: 1, definition: null },
      minPoolSize: null,
      maxPoolSize: null,
      preferredPoolSize: null,
      eliminationParticipantCount: 8,
      timeBetweenMatchesMinutes: 4,
      rounds: [],
      arenas: [],
      officials: [],
    });
    return event;
  }

  const field = <T extends HTMLElement = HTMLInputElement>(form: HTMLElement, name: string) =>
    form.querySelector<T>(`[name='${name}']`);
  const set = (form: HTMLElement, name: string, value: string) => {
    const element = field<HTMLInputElement | HTMLSelectElement>(form, name)!;
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const openCreate = () => {
    view.activeTab = "stages";
    $("[data-action='add-stage']")!.click();
    return $("form[data-form='add-stage']")!;
  };

  beforeEach(() => {
    view.event = eventWithRulesets();
  });

  it("creates a pool stage with all its settings", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "stg-new" })).mockResolvedValueOnce(json(eventWithRulesets()));
    vi.stubGlobal("fetch", fetchMock);
    const form = openCreate();
    set(form, "name", "Morning pools");
    set(form, "rulesetId", "r2");
    set(form, "minPoolSize", "3");
    set(form, "maxPoolSize", "5");
    set(form, "preferredPoolSize", "4");
    set(form, "timeBetweenMatchesMinutes", "3");
    expect(field(form, "eliminationParticipantCount")).toBeNull();
    ($("form[data-form='add-stage']") as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      tournamentId: "trn-1",
      type: "POOL",
      name: "Morning pools",
      rulesetId: "r2",
      minPoolSize: 3,
      maxPoolSize: 5,
      preferredPoolSize: 4,
      timeBetweenMatchesMinutes: 3,
    });
  });

  it("shows the elimination count instead of pool sizes for an elimination stage, keeping typed input", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "stg-new" })).mockResolvedValueOnce(json(eventWithRulesets()));
    vi.stubGlobal("fetch", fetchMock);
    let form = openCreate();
    set(form, "name", "Finals bracket");
    set(form, "type", "ELIMINATION");
    form = $("form[data-form='add-stage']")!;
    expect(field(form, "name")!.value).toBe("Finals bracket");
    expect(field(form, "minPoolSize")).toBeNull();
    expect(field(form, "preferredPoolSize")).toBeNull();
    set(form, "eliminationParticipantCount", "16");
    (form as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      tournamentId: "trn-1",
      type: "ELIMINATION",
      name: "Finals bracket",
      rulesetId: null,
      eliminationParticipantCount: 16,
      timeBetweenMatchesMinutes: null,
    });
  });

  it("refuses a preferred pool size outside the minimum and maximum without calling the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const form = openCreate();
    set(form, "minPoolSize", "4");
    set(form, "maxPoolSize", "6");
    set(form, "preferredPoolSize", "7");
    (form as HTMLFormElement).requestSubmit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect($("form[data-form='add-stage'] [role='alert']")?.textContent).toContain("between");
  });

  it("refuses a pool size that is not a whole number of at least 1", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const form = openCreate();
    set(form, "minPoolSize", "0");
    (form as HTMLFormElement).requestSubmit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect($("form[data-form='add-stage'] [role='alert']")).not.toBeNull();
  });

  it("edits a stage with every setting filled in from the stage", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "stg-2" })).mockResolvedValueOnce(json(eventWithRulesets()));
    vi.stubGlobal("fetch", fetchMock);
    view.activeTab = "stages";
    view.selectedStageId = "stg-2";
    $(".stage-page [data-action='edit-stage']")!.click();
    const form = $("form[data-form='edit-stage']")!;
    expect(field<HTMLSelectElement>(form, "type")!.value).toBe("ELIMINATION");
    expect(field<HTMLSelectElement>(form, "rulesetId")!.value).toBe("r2");
    expect(field(form, "eliminationParticipantCount")!.value).toBe("8");
    expect(field(form, "timeBetweenMatchesMinutes")!.value).toBe("4");
    set(form, "eliminationParticipantCount", "4");
    (form as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toContain("/stages/stg-2");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      type: "ELIMINATION",
      name: "Bracket",
      rulesetId: "r2",
      eliminationParticipantCount: 4,
      timeBetweenMatchesMinutes: 4,
    });
  });

  it("keeps the form and its input when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "Minimum pool size cannot exceed maximum pool size." }, 400)));
    const form = openCreate();
    set(form, "name", "Kept name");
    (form as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='add-stage'] [role='alert']")).not.toBeNull());
    expect($("form[data-form='add-stage'] [role='alert']")!.textContent).toContain("Minimum pool size");
    expect(field($("form[data-form='add-stage']")!, "name")!.value).toBe("Kept name");
  });

  it("shows only one stage form at a time", () => {
    view.activeTab = "stages";
    $("[data-action='add-stage']")!.click();
    view.selectedStageId = "stg-2";
    $(".stage-page [data-action='edit-stage']")!.click();
    expect($("form[data-form='add-stage']")).toBeNull();
    expect($("form[data-form='edit-stage']")).not.toBeNull();
  });
});

describe("stage progression", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function progressionEvent(currentStageId: string | null): ApiEvent {
    const event = structuredClone(mockEvent);
    const tournament = event.tournaments[0]!;
    const base = tournament.stages[0]!;
    // Deliberately out of fighting order.
    tournament.stages = [
      { ...base, id: "stg-final", type: "FINAL", name: "Final", minPoolSize: null, maxPoolSize: null, preferredPoolSize: null },
      { ...base, id: "stg-pool", type: "POOL", name: "Pool Phase" },
      { ...base, id: "stg-elim", type: "ELIMINATION", name: "Elimination", minPoolSize: null, maxPoolSize: null, preferredPoolSize: null, eliminationParticipantCount: 8 },
    ];
    tournament.currentStageId = currentStageId;
    return event;
  }

  it("lists the stages in fighting order", () => {
    view.event = progressionEvent("stg-pool");
    view.activeTab = "stages";
    expect($$(".stage-path-name").map((heading) => heading.textContent!.trim())).toEqual(["Pool Phase", "Elimination", "Final"]);
  });

  it("offers the next stage for the current stage and moves to it after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const moved = progressionEvent("stg-elim");
    const fetchMock = vi.fn().mockResolvedValueOnce(json(moved.tournaments[0])).mockResolvedValueOnce(json(moved));
    vi.stubGlobal("fetch", fetchMock);
    view.event = progressionEvent("stg-pool");
    view.activeTab = "stages";
    view.selectedStageId = "stg-pool";

    const button = $("[data-action='next-stage']");
    expect(button?.textContent).toContain("Elimination");
    button!.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]![0]).toContain("/tournaments/trn-1");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ currentStageId: "stg-elim" });
    await vi.waitFor(() => expect($(".stage-path-item.selected .stage-path-name")?.textContent?.trim()).toBe("Elimination"));
  });

  it("does nothing when moving on is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    view.event = progressionEvent("stg-pool");
    view.activeTab = "stages";
    view.selectedStageId = "stg-pool";
    $("[data-action='next-stage']")!.click();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the last stage instead of offering a next one", () => {
    view.event = progressionEvent("stg-final");
    view.activeTab = "stages";
    view.selectedStageId = "stg-final";
    expect($("[data-action='next-stage']")).toBeNull();
    expect($(".stage-page .last-stage-badge")?.textContent).toContain("Last stage");
  });

  it("offers only 'make current' on a stage that is not current", () => {
    view.event = progressionEvent("stg-pool");
    view.activeTab = "stages";
    view.selectedStageId = "stg-final";
    expect($("[data-action='next-stage']")).toBeNull();
    expect($("[data-action='make-active-stage']")).not.toBeNull();
  });

  it("marks the current stage on the path and in the header", () => {
    view.event = progressionEvent("stg-elim");
    view.activeTab = "stages";
    const current = $$(".stage-path-item.is-current");
    expect(current.map((row) => row.querySelector(".stage-path-name")!.textContent!.trim())).toEqual(["Elimination"]);
    expect($(".tournament-header .active-stage-badge")?.textContent).toContain("Elimination");
  });
});

describe("stage arenas and officials", () => {
  function eventWithStageArenas(): ApiEvent {
    const event = structuredClone(mockEvent);
    const stage = event.tournaments[0]!.stages[0]!;
    stage.arenas = [
      { id: "sa-2", stageId: "stg-1", arenaId: "a2", arena: { id: "a2", eventId: "evt-1", name: "Arena Blue", order: 2 } },
      { id: "sa-1", stageId: "stg-1", arenaId: "a1", arena: { id: "a1", eventId: "evt-1", name: "Arena Red", order: 1 } },
    ];
    stage.officials = [{ id: "of-1", stageId: "stg-1", entryId: "e2", role: "JUDGE" } as never];
    return event;
  }

  beforeEach(() => {
    view.event = eventWithStageArenas();
    view.activeTab = "stages";
    view.selectedStageId = "stg-1";
  });

  it("lists the stage's arenas by name in arena order", () => {
    const items = $$(".stage-arenas-pane li").map((item) => item.textContent!.trim());
    expect(items).toEqual(["Arena Red", "Arena Blue"]);
    expect($(".stage-arenas-pane")!.textContent).not.toContain("a1");
  });

  it("explains that arenas come from Event planning and links there", () => {
    expect($(".stage-arenas-pane .planning-note")?.textContent).toContain("Event planning");
    let detail: unknown = null;
    view.addEventListener("planning-requested", (e: Event) => (detail = (e as CustomEvent).detail));
    $(".stage-arenas-pane [data-action='open-planning']")!.click();
    expect(detail).toEqual({ eventId: "evt-1" });
  });

  it("shows the same note when the stage has no arenas yet", () => {
    const event = eventWithStageArenas();
    event.tournaments[0]!.stages[0]!.arenas = [];
    view.event = event;
    expect($(".stage-arenas-pane .empty-state")).not.toBeNull();
    expect($(".stage-arenas-pane [data-action='open-planning']")).not.toBeNull();
  });

  it("lists the stage's officials by name and role instead of ids", () => {
    const text = $(".stage-officials-pane li")!.textContent!;
    expect(text).toContain("Fighter 2");
    expect(text).toContain("Judge");
    expect(text).not.toContain("e2");
  });
});

describe("stage rounds and matches", () => {
  function eventWithMatches(): ApiEvent {
    const event = structuredClone(mockEvent);
    const stage = event.tournaments[0]!.stages[0]!;
    const base = { winnerEntryId: null, scoreA: null, scoreB: null, ruleset: null, scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null } as const;
    stage.rounds = [
      {
        id: "r0",
        stageId: "stg-1",
        roundNumber: 0,
        matches: [
          { ...base, id: "m1", roundId: "r0", arenaId: "a1", entryAId: "e1", entryBId: "e2", scoreA: 5, scoreB: 3, winnerEntryId: "e1", scheduledMatch: { scheduledPhaseId: "ph", order: 1 }, bracketRound: null, bracketPosition: null, bracketKind: null },
          { ...base, id: "m2", roundId: "r0", arenaId: "a2", entryAId: "e2", entryBId: "e1", scheduledMatch: { scheduledPhaseId: "ph", order: 2 }, bracketRound: null, bracketPosition: null, bracketKind: null },
        ],
      },
    ];
    return event;
  }

  beforeEach(() => {
    view.event = eventWithMatches();
    view.activeTab = "stages";
    view.selectedStageId = "stg-1";
  });

  it("numbers rounds from 1 and shows a round in progress", () => {
    const cells = [...$(".stage-rounds-pane tbody tr")!.querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    expect(cells[0]).toBe("1");
    expect(cells[1]).toBe("1 / 2");
    expect(cells[2]).toBe("In progress");
  });

  it("lists matches with names, arena names, score, winner and order", () => {
    const rows = $$(".stage-matches-pane tbody tr").map((row) => [...row.querySelectorAll("td")].slice(0, 6).map((cell) => cell.textContent!.trim()));
    expect(rows[0]).toEqual(["1", "1", "Fighter 1", "Fighter 2", "5–3", "Fighter 1"]);
    expect(rows[1]).toEqual(["1", "2", "Fighter 2", "Fighter 1", "—", "—"]);
    expect($$(".stage-matches-pane .ring-group h5").map((heading) => heading.textContent!.trim())).toEqual(["Arena 1", "Arena 2"]);
    expect($(".stage-matches-pane")!.textContent).not.toContain("a1");
    expect($$(".stage-matches-pane thead th").map((cell) => cell.textContent!.trim())).toContain("Score");
  });
});

describe("match planning", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function planningEvent(): ApiEvent {
    const event = structuredClone(mockEvent);
    const tournament = event.tournaments[0]!;
    const pool = tournament.stages[0]!;
    const open = { winnerEntryId: null, scoreA: null, scoreB: null, ruleset: null, scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null } as const;
    pool.rounds = [
      {
        id: "r-pool",
        stageId: "stg-1",
        roundNumber: 0,
        matches: [
          { ...open, id: "m1", roundId: "r-pool", arenaId: "a1", entryAId: "e1", entryBId: "e2", scheduledMatch: { scheduledPhaseId: "ph-pool", order: 1 }, bracketRound: null, bracketPosition: null, bracketKind: null },
          { ...open, id: "m2", roundId: "r-pool", arenaId: "a2", entryAId: "e2", entryBId: "e1" },
        ],
      },
    ];
    tournament.stages.push({
      ...pool,
      id: "stg-2",
      type: "ELIMINATION",
      name: "Bracket",
      minPoolSize: null,
      maxPoolSize: null,
      preferredPoolSize: null,
      eliminationParticipantCount: 2,
      rounds: [
        {
          id: "r-b",
          stageId: "stg-2",
          roundNumber: 0,
          matches: [
            { ...open, id: "b1", roundId: "r-b", arenaId: null, entryAId: "e1", entryBId: "e2" },
            { ...open, id: "b2", roundId: "r-b", arenaId: null, entryAId: "e2", entryBId: "e1", scheduledMatch: { scheduledPhaseId: "ph-b1", order: 1 }, bracketRound: null, bracketPosition: null, bracketKind: null },
          ],
        },
      ],
    });
    const arena = (id: string) => event.arenas.find((item) => item.id === id)!;
    event.schedule = {
      id: "sch",
      eventId: "evt-1",
      startTimeMinutes: 540,
      currentTimeSlotId: null,
      timeSlots: [
        { id: "ts0", scheduleId: "sch", order: 0, durationMinutes: 60, label: "09:00", color: null, isBreak: false, scheduledPhases: [{ id: "ph-pool", stageId: "stg-1", arenaId: "a1", timeSlotId: "ts0", arena: arena("a1") } as never] },
        {
          id: "ts1",
          scheduleId: "sch",
          order: 1,
          durationMinutes: 60,
          label: "10:00",
          color: null,
          isBreak: false,
          scheduledPhases: [
            { id: "ph-b1", stageId: "stg-2", arenaId: "a1", timeSlotId: "ts1", arena: arena("a1") } as never,
            { id: "ph-b2", stageId: "stg-2", arenaId: "a2", timeSlotId: "ts1", arena: arena("a2") } as never,
          ],
        },
      ],
    };
    return event;
  }

  const openPlan = (stageId: string, matchId: string) => {
    view.event = planningEvent();
    view.activeTab = "stages";
    view.selectedStageId = stageId;
    $(`[data-action='plan-match'][data-match-id='${matchId}']`)!.click();
    return $("form[data-form='plan-match']") as HTMLFormElement | null;
  };
  const setOrder = (form: HTMLFormElement, value: string) => {
    const input = form.querySelector<HTMLInputElement>("input[name='order']")!;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("changes a pool match's order on its own ring and time slot", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "m1" })).mockResolvedValueOnce(json(planningEvent()));
    vi.stubGlobal("fetch", fetchMock);
    const form = openPlan("stg-1", "m1")!;
    expect(form.textContent).toContain("09:00 · Arena 1");
    expect(form.querySelector("select[name='scheduledPhaseId']")).toBeNull();
    expect(form.querySelector<HTMLInputElement>("input[name='order']")!.value).toBe("1");
    setOrder(form, "3");
    form.requestSubmit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toContain("/matches/m1/schedule");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ scheduledPhaseId: "ph-pool", order: 3 });
    await vi.waitFor(() => expect($("form[data-form='plan-match']")).toBeNull());
  });

  it("explains that the pools must be scheduled first when a pool match has no time slot yet", () => {
    const form = openPlan("stg-1", "m2")!;
    expect(form.querySelector(".plan-hint")?.textContent).toContain("Event planning");
    expect(form.querySelector("button[type='submit']")).toBeNull();
  });

  it("places a bracket match in a chosen time slot with the next free order", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "b1" })).mockResolvedValueOnce(json(planningEvent()));
    vi.stubGlobal("fetch", fetchMock);
    const form = openPlan("stg-2", "b1")!;
    const select = form.querySelector<HTMLSelectElement>("select[name='scheduledPhaseId']")!;
    expect([...select.options].map((option) => option.textContent!.trim())).toEqual(["10:00 · Arena 1", "10:00 · Arena 2"]);
    expect(form.querySelector<HTMLInputElement>("input[name='order']")!.value).toBe("2");
    select.value = "ph-b2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const updated = $("form[data-form='plan-match']") as HTMLFormElement;
    expect(updated.querySelector<HTMLInputElement>("input[name='order']")!.value).toBe("1");
    updated.requestSubmit();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ scheduledPhaseId: "ph-b2", order: 1 });
  });

  it("takes a scheduled bracket match off the schedule", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(planningEvent()));
    vi.stubGlobal("fetch", fetchMock);
    const form = openPlan("stg-2", "b2")!;
    form.querySelector<HTMLButtonElement>("[data-action='unschedule-match']")!.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toContain("/matches/b2/schedule");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("DELETE");
  });

  it("offers no unschedule for pool matches", () => {
    const form = openPlan("stg-1", "m1")!;
    expect(form.querySelector("[data-action='unschedule-match']")).toBeNull();
  });

  it("shows the server's refusal in the planning form and keeps the typed order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "This ring order is already used in this time slot." }, 409)));
    const form = openPlan("stg-1", "m1")!;
    setOrder(form, "7");
    form.requestSubmit();
    await vi.waitFor(() => expect($("form[data-form='plan-match'] [role='alert']")).not.toBeNull());
    expect($("form[data-form='plan-match'] [role='alert']")!.textContent).toContain("already used");
    expect($("form[data-form='plan-match'] input[name='order']")!.getAttribute("value")).toBe("7");
  });
});

describe("pool results", () => {
  function eventWithPoolMatches(): ApiEvent {
    const event = structuredClone(mockEvent);
    const stage = event.tournaments[0]!.stages[0]!;
    stage.arenas = [{ id: "sa-1", stageId: "stg-1", arenaId: "a1", arena: event.arenas[0]! }];
    stage.rounds = [
      {
        id: "r0",
        stageId: "stg-1",
        roundNumber: 0,
        matches: [
          { id: "m1", roundId: "r0", arenaId: "a1", entryAId: "e1", entryBId: "e2", winnerEntryId: "e1", scoreA: 5, scoreB: 3, ruleset: null, scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null },
        ],
      },
    ];
    return event;
  }

  beforeEach(() => {
    view.event = eventWithPoolMatches();
    view.activeTab = "stages";
    view.selectedStageId = "stg-1";
  });

  type PoolResultsElement = HTMLElement & { stage?: { id: string }; event?: { id: string } };

  it("gives the pool results the event and the selected stage", () => {
    const results = $(".stage-pool-results-pane pool-results") as PoolResultsElement | null;
    expect(results?.stage?.id).toBe("stg-1");
    expect(results?.event?.id).toBe("evt-1");
    expect(results!.shadowRoot!.textContent).toContain("Fighter 1");
  });

  it("opens the pool results full screen and closes them again", () => {
    $("[data-action='open-pool-results-fullscreen']")!.click();
    const overlay = $(".pool-results-fullscreen");
    expect(overlay?.getAttribute("role")).toBe("dialog");
    expect((overlay!.querySelector("pool-results") as PoolResultsElement).stage?.id).toBe("stg-1");
    $("[data-action='close-pool-results-fullscreen']")!.click();
    expect($(".pool-results-fullscreen")).toBeNull();
  });

  it("closes the full-screen view with Escape", () => {
    $("[data-action='open-pool-results-fullscreen']")!.click();
    $(".pool-results-fullscreen")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    expect($(".pool-results-fullscreen")).toBeNull();
  });
});

describe("stage path and stage page", () => {
  function pathEvent(currentStageId: string | null): ApiEvent {
    const event = structuredClone(mockEvent);
    const tournament = event.tournaments[0]!;
    const base = tournament.stages[0]!;
    const open = { winnerEntryId: null, scoreA: null, scoreB: null, ruleset: null, scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null } as const;
    tournament.stages = [
      {
        ...base,
        rounds: [
          {
            id: "r0",
            stageId: "stg-1",
            roundNumber: 0,
            matches: [
              { ...open, id: "m1", roundId: "r0", arenaId: "a1", entryAId: "e1", entryBId: "e2", scoreA: 5, scoreB: 3, winnerEntryId: "e1" },
              { ...open, id: "m2", roundId: "r0", arenaId: "a2", entryAId: "e2", entryBId: "e1" },
            ],
          },
        ],
      },
      { ...base, id: "stg-elim", type: "ELIMINATION", name: "Elimination", minPoolSize: null, maxPoolSize: null, preferredPoolSize: null, eliminationParticipantCount: 8, rounds: [] },
      { ...base, id: "stg-final", type: "FINAL", name: "Final", minPoolSize: null, maxPoolSize: null, preferredPoolSize: null, rounds: [] },
    ];
    tournament.currentStageId = currentStageId;
    return event;
  }

  it("shows each stage's place on the path: done, current or still to come", () => {
    view.event = pathEvent("stg-elim");
    view.activeTab = "stages";
    const states = $$(".stage-path-item").map((item) => [item.querySelector(".stage-path-name")!.textContent!.trim(), item.dataset.state]);
    expect(states).toEqual([
      ["Pool Phase", "done"],
      ["Elimination", "current"],
      ["Final", "upcoming"],
    ]);
    expect($$(".stage-path-type").map((item) => item.textContent!.trim())).toEqual(["Pool", "Elimination", "Final"]);
  });

  it("opens a stage's page from the path", () => {
    view.event = pathEvent("stg-1");
    view.activeTab = "stages";
    ($$(".stage-path-item")[2]!.querySelector("button") as HTMLElement).click();
    expect($(".stage-page h3")!.textContent).toContain("Final");
    expect($(".stage-path-item.selected .stage-path-name")!.textContent).toContain("Final");
  });

  it("summarises a pool stage's settings in plain words", () => {
    view.event = pathEvent("stg-1");
    view.activeTab = "stages";
    const summary = $(".stage-summary")!.textContent!.replace(/\s+/g, " ");
    expect(summary).toContain("Fighters per pool");
    expect(summary).toContain("4–6 (preferred 5)");
    expect(summary).toContain("2 minutes between matches");
    expect(summary).toContain("Standard Longsword Rules");
    expect(summary).not.toMatch(/POOL|Min\/Max/);
  });

  it("summarises an elimination stage with its bracket size and leaves out pools", () => {
    view.event = pathEvent("stg-1");
    view.activeTab = "stages";
    view.selectedStageId = "stg-elim";
    expect($(".stage-summary")!.textContent).toContain("8 fighters in the bracket");
    expect($(".stage-pool-results-pane")).toBeNull();
  });

  it("lists the ring groups in arena order, whatever the play order", () => {
    const event = pathEvent("stg-1");
    // The Arena 2 match is scheduled first; Arena 1 still comes first.
    event.tournaments[0]!.stages[0]!.rounds[0]!.matches[1]!.scheduledMatch = { scheduledPhaseId: "ph", order: 1 };
    view.event = event;
    view.activeTab = "stages";
    expect($$(".ring-group h5").map((heading) => heading.textContent!.trim())).toEqual(["Arena 1", "Arena 2"]);
  });

  it("groups the stage's matches per ring", () => {
    view.event = pathEvent("stg-1");
    view.activeTab = "stages";
    expect($$(".ring-group h5").map((heading) => heading.textContent!.trim())).toEqual(["Arena 1", "Arena 2"]);
  });
});

describe("overview next step", () => {
  const next = () => $(".next-step")!.textContent!.replace(/\s+/g, " ");

  function withStages(stages: ApiEvent["tournaments"][number]["stages"], currentStageId: string | null): ApiEvent {
    const event = structuredClone(mockEvent);
    event.tournaments[0]!.stages = stages;
    event.tournaments[0]!.currentStageId = currentStageId;
    return event;
  }
  const base = () => structuredClone(mockEvent.tournaments[0]!.stages[0]!);
  const open = { winnerEntryId: null, scoreA: null, scoreB: null, ruleset: null, scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null } as const;

  it("asks for the first stage when there is none, and goes to Stages", () => {
    view.event = withStages([], null);
    expect(next()).toContain("Add the first stage");
    $(".next-step [data-action='go-stages']")!.click();
    expect($(".nav-tab.active")?.dataset.tab).toBe("stages");
  });

  it("asks to choose the stage to start with when none is current", () => {
    view.event = withStages([base()], null);
    expect(next()).toContain("Choose the stage to start with");
  });

  it("points to Event planning while the current pool stage has no matches", () => {
    view.event = withStages([base()], "stg-1");
    expect(next()).toContain("Event planning");
    expect($(".next-step [data-action='open-planning']")).not.toBeNull();
  });

  it("reports progress while matches are still to be fought", () => {
    const stage = base();
    stage.rounds = [{ id: "r", stageId: "stg-1", roundNumber: 0, matches: [{ ...open, id: "m1", roundId: "r", arenaId: "a1", entryAId: "e1", entryBId: "e2", scoreA: 1, scoreB: 0, winnerEntryId: "e1" }, { ...open, id: "m2", roundId: "r", arenaId: "a1", entryAId: "e2", entryBId: "e1" }] }];
    view.event = withStages([stage], "stg-1");
    expect(next()).toContain("1 of 2 matches fought in Pool Phase");
  });

  it("suggests moving on when the current stage is done", () => {
    const pool = base();
    pool.rounds = [{ id: "r", stageId: "stg-1", roundNumber: 0, matches: [{ ...open, id: "m1", roundId: "r", arenaId: "a1", entryAId: "e1", entryBId: "e2", scoreA: 1, scoreB: 0, winnerEntryId: "e1" }] }];
    const elim = { ...base(), id: "stg-2", type: "ELIMINATION" as const, name: "Elimination", rounds: [] };
    view.event = withStages([pool, elim], "stg-1");
    expect(next()).toContain("Move on to Elimination");
  });

  it("says the tournament is finished when the last stage is done", () => {
    const pool = base();
    pool.rounds = [{ id: "r", stageId: "stg-1", roundNumber: 0, matches: [{ ...open, id: "m1", roundId: "r", arenaId: "a1", entryAId: "e1", entryBId: "e2", scoreA: 1, scoreB: 0, winnerEntryId: "e1" }] }];
    view.event = withStages([pool], "stg-1");
    expect(next()).toContain("All stages are done");
  });

  it("counts fighters and volunteers in the overview facts", () => {
    const facts = $(".overview-facts")!.textContent!.replace(/\s+/g, " ");
    expect(facts).toContain("2 fighters");
    expect(facts).toContain("Standard Longsword Rules");
  });
});

describe("fill bracket", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function withBracketStage(filled: boolean): ApiEvent {
    const event = structuredClone(mockEvent);
    const tournament = event.tournaments[0]!;
    const base = tournament.stages[0]!;
    tournament.stages.push({
      ...base,
      id: "stg-elim",
      type: "ELIMINATION",
      name: "Elimination",
      minPoolSize: null,
      maxPoolSize: null,
      preferredPoolSize: null,
      eliminationParticipantCount: 8,
      rounds: filled
        ? [{ id: "r", stageId: "stg-elim", roundNumber: 0, matches: [{ id: "b1", roundId: "r", arenaId: null, entryAId: "e1", entryBId: "e2", winnerEntryId: null, scoreA: null, scoreB: null, ruleset: null, scheduledMatch: null, bracketRound: 0, bracketPosition: 0, bracketKind: "MAIN" }] }]
        : [],
    });
    return event;
  }

  const open = (filled: boolean) => {
    view.event = withBracketStage(filled);
    view.activeTab = "stages";
    view.selectedStageId = "stg-elim";
  };

  it("offers to fill an elimination stage's bracket, and only there", () => {
    open(false);
    expect($(".stage-page [data-action='fill-bracket']")?.textContent).toContain("Fill bracket from the pools");
    view.selectedStageId = "stg-1";
    expect($("[data-action='fill-bracket']")).toBeNull();
  });

  it("fills the bracket through the API and reloads the event", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "stg-elim" })).mockResolvedValueOnce(json(withBracketStage(true)));
    vi.stubGlobal("fetch", fetchMock);
    open(false);
    $("[data-action='fill-bracket']")!.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toContain("/stages/stg-elim/bracket");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("POST");
    await vi.waitFor(() => expect($("[data-action='fill-bracket']")?.textContent).toContain("Fill bracket again"));
  });

  it("asks before replacing a bracket that is already filled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    open(true);
    $("[data-action='fill-bracket']")!.click();
    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows why the server refused, on the stage page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "The pools are not finished yet: 7 of 12 matches fought." }, 409)));
    open(false);
    $("[data-action='fill-bracket']")!.click();
    await vi.waitFor(() => expect($(".stage-page [role='alert']")).not.toBeNull());
    expect($(".stage-page [role='alert']")!.textContent).toContain("7 of 12 matches fought");
  });
});


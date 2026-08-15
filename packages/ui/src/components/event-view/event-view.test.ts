import { afterEach, describe, expect, it } from "vitest";
import type { ApiEntry, ApiEvent, ApiUser } from "@hema/event-admin-api";

describe("event-view", () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = window.location.href;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.fetch = originalFetch;
    window.history.replaceState({}, "", originalUrl);
    document.body.replaceChildren();
  });

  it("renders shadow DOM content", async () => {
    installEventViewMock();
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });

  it("uses unique skill input ids for each volunteer card", async () => {
    const mock = installEventViewMock();
    mock.entries.push(
      buildVolunteerEntry("entry-1", "user-1", "Alice", [{ id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 }]),
      buildVolunteerEntry("entry-2", "user-2", "Bob", [{ id: "skill-2", userId: "user-2", skillName: "JURY", skillLevel: 3 }]),
    );

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const volunteerHost = await waitForElement<HTMLElement>(element, "event-editor-view");
    const ids = [...(volunteerHost?.querySelectorAll('.volunteer-modal-card input[type="radio"]') ?? [])]
      .map((input) => (input instanceof HTMLInputElement ? input.id : ""))
      .filter((id) => id.length > 0);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the volunteer card scrolled after saving a skill update", async () => {
    const mock = installEventViewMock();
    mock.entries.push(
      buildVolunteerEntry("entry-1", "user-1", "Alice", [{ id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 }]),
      buildVolunteerEntry("entry-2", "user-2", "Bob", [{ id: "skill-2", userId: "user-2", skillName: "JURY", skillLevel: 3 }]),
      buildVolunteerEntry("entry-3", "user-3", "Carol", [{ id: "skill-3", userId: "user-3", skillName: "TABLE", skillLevel: 1 }]),
      buildVolunteerEntry("entry-4", "user-4", "Daan", [{ id: "skill-4", userId: "user-4", skillName: "OTHER", skillLevel: 1 }]),
      buildVolunteerEntry("entry-5", "user-5", "Eva", [{ id: "skill-5", userId: "user-5", skillName: "JUDGE", skillLevel: 4 }]),
      buildVolunteerEntry("entry-6", "user-6", "Finn", [{ id: "skill-6", userId: "user-6", skillName: "JURY", skillLevel: 2 }]),
    );

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const modal = await waitForElement<HTMLElement>(element, ".modal-card");
    modal.scrollTop = 240;
    expect(modal.scrollTop).toBe(240);

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await flush();

    const rerenderedModal = await waitForElement<HTMLElement>(element, ".modal-card");
    expect(rerenderedModal.scrollTop).toBe(240);
  });

  it("creates a skill when a rating is selected without an existing skill", async () => {
    const mock = installEventViewMock();
    mock.entries.push(buildVolunteerEntry("entry-1", "user-1", "Alice", []));

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await waitForCondition(() => (mock.entries[0]?.user.skills ?? []).some((skill) => skill.skillName === "JUDGE" && skill.skillLevel === 4));

    const judgeSkills = (mock.entries[0]?.user.skills ?? []).filter((skill) => skill.skillName === "JUDGE");
    expect(judgeSkills).toHaveLength(1);
    expect(judgeSkills[0]?.skillLevel).toBe(4);
  });

  it("keeps volunteer preferences separate from skill changes", async () => {
    const mock = installEventViewMock();
    mock.entries.push(buildVolunteerEntry("entry-1", "user-1", "Alice", [
      { id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 },
    ]));

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const checkboxBefore = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeVolunteer"]');
    expect(checkboxBefore.checked).toBe(false);

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await flush();
    await flush();

    const checkboxAfter = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeVolunteer"]');
    expect(checkboxAfter.checked).toBe(false);
    expect(mock.entries[0]?.user.judgeVolunteer).toBe(false);
    expect((mock.entries[0]?.user.skills ?? []).find((skill) => skill.skillName === "JUDGE")?.skillLevel).toBe(4);
  });

  it("keeps judge skills after updating and removes duplicate judge entries", async () => {
    const mock = installEventViewMock();
    mock.entries.push(
      buildVolunteerEntry("entry-1", "user-1", "Alice", [
        { id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 },
        { id: "skill-2", userId: "user-1", skillName: "JUDGE", skillLevel: 3 },
        { id: "skill-3", userId: "user-1", skillName: "JURY", skillLevel: 1 },
      ]),
    );

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await waitForCondition(() => (mock.entries[0]?.user.skills ?? []).filter((skill) => skill.skillName === "JUDGE").length === 1);

    const judgeSkills = (mock.entries[0]?.user.skills ?? []).filter((skill) => skill.skillName === "JUDGE");
    expect(judgeSkills).toHaveLength(1);
    expect(judgeSkills[0]?.skillLevel).toBe(4);
    await waitForText(element, "Judge skill");
  });
});

function installEventViewMock() {
  const originalFetch = globalThis.fetch;
  const originalWindowFetch = window.fetch;
  const users: ApiUser[] = [];
  const entries: ApiEntry[] = [];
  const eventId = "event-1";
  const tournamentId = "tournament-1";

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const pathname = new URL(request.url).pathname;

    if (request.method === "GET" && pathname.includes("/events")) {
      return jsonResponse([buildEvent()]);
    }

    if (request.method === "GET" && pathname.includes("/users")) {
      return jsonResponse(users);
    }

    const userMatch = pathname.match(/^\/api\/v1\/users\/([^/]+)$/);
    if (userMatch) {
      const userId = userMatch[1];
      const user = users.find((candidate) => candidate.id === userId) ?? entries.map((entry) => entry.user).find((candidate) => candidate.id === userId);
      if (!user) {
        throw new Error(`Unexpected user request: ${request.method} ${request.url}`);
      }

      if (request.method === "PATCH") {
        const body = (await request.json()) as Partial<ApiUser>;
        if (typeof body.username === "string") user.username = body.username;
        if (typeof body.judgeVolunteer === "boolean") user.judgeVolunteer = body.judgeVolunteer;
        if (typeof body.juryVolunteer === "boolean") user.juryVolunteer = body.juryVolunteer;
        if (typeof body.tableVolunteer === "boolean") user.tableVolunteer = body.tableVolunteer;
        if (typeof body.otherVolunteer === "boolean") user.otherVolunteer = body.otherVolunteer;
        return jsonResponse(user);
      }
    }

    const skillMatch = pathname.match(/^\/api\/v1\/skills\/([^/]+)$/);
    if (skillMatch) {
      const skillId = skillMatch[1];
      const skill = entries.flatMap((entry) => entry.user.skills ?? []).find((candidate) => candidate.id === skillId);
      if (!skill) {
        throw new Error(`Unexpected skill request: ${request.method} ${request.url}`);
      }

      if (request.method === "PATCH") {
        const body = (await request.json()) as { skillLevel?: number };
        if (typeof body.skillLevel === "number") {
          skill.skillLevel = body.skillLevel;
        }
        return jsonResponse(skill);
      }

      if (request.method === "DELETE") {
        for (const entry of entries) {
          const currentSkills = entry.user.skills ?? [];
          const index = currentSkills.findIndex((candidate) => candidate.id === skillId);
          if (index >= 0) {
            currentSkills.splice(index, 1);
            return new Response(null, { status: 204 });
          }
        }
      }
    }

    if (request.method === "POST" && pathname === "/api/v1/skills") {
      const body = (await request.json()) as { userId: string; skillName: string; skillLevel: number };
      const entry = entries.find((candidate) => candidate.userId === body.userId);
      if (!entry) {
        throw new Error(`Unexpected skill create request: ${request.method} ${request.url}`);
      }

      const skill = {
        id: `skill-${entry.user.skills?.length ?? 0}-${body.skillName.toLowerCase()}`,
        userId: body.userId,
        skillName: body.skillName,
        skillLevel: body.skillLevel,
      };
      entry.user.skills = [...(entry.user.skills ?? []), skill];
      return jsonResponse(skill);
    }

    if (request.method === "POST" && pathname === "/api/v1/users") {
      const body = (await request.json()) as { username: string };
      const user: ApiUser = {
        id: `user-${users.length + 1}`,
        username: body.username,
        judgeVolunteer: false,
        juryVolunteer: false,
        tableVolunteer: false,
        otherVolunteer: false,
      };
      users.push(user);
      return jsonResponse(user);
    }

    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  };
  window.fetch = globalThis.fetch;

  function buildEvent(): ApiEvent {
    return {
      id: eventId,
      eventName: "Test event",
      ruleset: null,
      allFightersAreVolunteers: false,
      tournaments: [
        {
          id: tournamentId,
          eventId,
          name: "Open",
          ruleset: null,
          order: 0,
          color: "#ffcc00",
          entries,
          stages: [],
        },
      ],
      arenas: [],
    };
  }

  return {
    users,
    entries,
    restore() {
      globalThis.fetch = originalFetch;
      window.fetch = originalWindowFetch;
    },
  };
}

function buildVolunteerEntry(id: string, userId: string, username: string, skills: NonNullable<ApiUser["skills"]>): ApiEntry {
  return {
    id,
    tournamentId: "tournament-1",
    userId,
    kind: "VOLUNTEER",
    seed: null,
    user: {
      id: userId,
      username,
      judgeVolunteer: false,
      juryVolunteer: false,
      tableVolunteer: false,
      otherVolunteer: false,
      skills,
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = root.querySelector(selector);
    if (element instanceof Element) {
      return element as T;
    }
    await flush();
  }

  throw new Error(`Element not found for selector: ${selector}`);
}

async function waitForText(root: ParentNode, text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((root.textContent ?? "").includes(text)) {
      return;
    }
    await flush();
  }

  throw new Error(`Text not found: ${text}`);
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }

  throw new Error("Condition not met.");
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

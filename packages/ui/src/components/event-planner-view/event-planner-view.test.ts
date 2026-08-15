import { afterEach, describe, expect, it } from "vitest";
import { installListPlannerEventsMock } from "../../../test/mocks/list-planner-events.mock.mjs";
import { installLoadPlannerScheduleMock } from "../../../test/mocks/load-planner-schedule.mock.mjs";
import "./event-planner-view";

describe("event-planner-view", () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = window.location.href;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.replaceState({}, "", originalUrl);
    document.body.replaceChildren();
  });

  it("shows volunteer skills and wishes on hover", async () => {
    const { eventsMock, scheduleMock } = installPlannerFetchMock();

    window.history.replaceState({}, "", "/planning?eventId=event-1");
    const element = document.createElement("event-planner-view");
    document.body.appendChild(element);

    await expect.poll(() => element.shadowRoot?.querySelector(".slot-label")?.textContent).toBe("Instructie");

    expect(element.shadowRoot?.textContent).toContain("Test event");
    expect(element.shadowRoot?.textContent).toContain("09:00 - 10:00");

    element.shadowRoot?.querySelector('[data-mode="volunteers"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    await expect.poll(() => element.shadowRoot?.querySelector('[data-volunteer-hover-key="source:user-1"]')?.textContent ?? "").toContain("judge-01");
    const sourceVolunteer = element.shadowRoot?.querySelector('[data-volunteer-hover-key="source:user-1"]');
    sourceVolunteer?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));

    await expect.poll(() => element.shadowRoot?.querySelector('[data-volunteer-hover-key="source:user-1"] .volunteer-tooltip')?.textContent ?? "")
      .toContain("Wensen");
    const sourceTooltip = element.shadowRoot?.querySelector('[data-volunteer-hover-key="source:user-1"] .volunteer-tooltip')?.textContent ?? "";
    expect(sourceTooltip).toContain("judge-01");
    expect(sourceTooltip).toContain("Skills");
    expect(sourceTooltip).toContain("Judge");
    expect(sourceTooltip).toContain("Jury");
    expect(sourceTooltip).toContain("Table");
    sourceVolunteer?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, composed: true, relatedTarget: element.shadowRoot }));
    const hiddenSourceTooltip = element.shadowRoot?.querySelector('[data-volunteer-hover-key="source:user-1"] .volunteer-tooltip');
    expect(hiddenSourceTooltip ? window.getComputedStyle(hiddenSourceTooltip).display : "").toBe("none");

    await expect.poll(() => element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"]')?.textContent ?? "").toContain("jury-02");
    const assignmentVolunteer = element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"]');
    assignmentVolunteer?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));

    await expect.poll(() => element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"] .volunteer-tooltip')?.textContent ?? "")
      .toContain("Wensen");
    const assignmentTooltip = element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"] .volunteer-tooltip')?.textContent ?? "";
    expect(assignmentTooltip).toContain("jury-02");
    expect(assignmentTooltip).toContain("Skills");
    expect(assignmentTooltip).toContain("Judge");
    expect(assignmentTooltip).toContain("Table");
    expect(assignmentTooltip).not.toContain("Jury");
    assignmentVolunteer?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, composed: true, relatedTarget: element.shadowRoot }));
    const hiddenAssignmentTooltip = element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"] .volunteer-tooltip');
    expect(hiddenAssignmentTooltip ? window.getComputedStyle(hiddenAssignmentTooltip).display : "").toBe("none");

    expect(eventsMock.calls).toHaveLength(1);
    expect(scheduleMock.calls).toHaveLength(1);
  });

  it("opens the suggestions popup with event-wide pool estimates", async () => {
    const { eventsMock, scheduleMock } = installPlannerFetchMock();

    window.history.replaceState({}, "", "/planning?eventId=event-1");
    const element = document.createElement("event-planner-view");
    document.body.appendChild(element);

    await expect.poll(() => element.shadowRoot?.querySelector(".slot-label")?.textContent).toBe("Instructie");

    const suggestionsButton = await waitForElement<HTMLButtonElement>(element.shadowRoot as ShadowRoot, 'button[data-click-action="open-suggestions"]');
    suggestionsButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const modal = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, ".modal-card");
    expect(modal.textContent).toContain("Pool and elimination suggestions");
    expect(modal.textContent).toContain("Longest slot 50 min");
    expect(modal.textContent).toContain("Open");
    expect(modal.textContent).toContain("Pool sizes 5, 5, 5, 4");
    expect(modal.textContent).toContain("Pool slot lengths 50 min");
    expect(modal.textContent).toContain("Elimination length 15 min");
    expect(modal.textContent).toContain("Second");
    expect(modal.textContent).toContain("Pool sizes 4, 4, 4");
    expect(modal.textContent).toContain("Pool slot lengths 30 min");

    expect(eventsMock.calls).toHaveLength(1);
    expect(scheduleMock.calls).toHaveLength(1);
  });

  it("hides volunteer tooltips while dragging", async () => {
    const { eventsMock, scheduleMock } = installPlannerFetchMock();

    window.history.replaceState({}, "", "/planning?eventId=event-1");
    const element = document.createElement("event-planner-view");
    document.body.appendChild(element);

    await expect.poll(() => element.shadowRoot?.querySelector(".slot-label")?.textContent).toBe("Instructie");
    element.shadowRoot?.querySelector('[data-mode="volunteers"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    element.setAttribute("data-dragging", "true");
    await expect.poll(() => element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"]')?.textContent ?? "").toContain("jury-02");
    const assignmentVolunteer = element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"]');
    assignmentVolunteer?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));

    const tooltip = element.shadowRoot?.querySelector('[data-volunteer-hover-key="assignment:assignment-1"] .volunteer-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip ? window.getComputedStyle(tooltip).display : "").toBe("none");
    element.removeAttribute("data-dragging");

    expect(eventsMock.calls).toHaveLength(1);
    expect(scheduleMock.calls).toHaveLength(1);
  });

  it("marks fighter drop targets as valid or invalid while dragging", async () => {
    const { eventsMock, scheduleMock } = installPlannerFetchMock();

    window.history.replaceState({}, "", "/planning?eventId=event-1");
    const element = document.createElement("event-planner-view");
    document.body.appendChild(element);

    await expect.poll(() => element.shadowRoot?.querySelector(".slot-label")?.textContent).toBe("Instructie");

    element.shadowRoot?.querySelector('[data-mode="fighters"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(element.shadowRoot?.textContent).not.toContain("Finals");
    expect(element.shadowRoot?.querySelector('.fighter-source[data-user-id="fighter-1-3"]')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('.fighter-source[data-user-id="fighter-1-1"]')).toBeNull();
    expect(element.shadowRoot?.querySelector('.fighter-source[data-user-id="fighter-1-2"]')).toBeNull();
    const source = await waitForElement<HTMLButtonElement>(element.shadowRoot as ShadowRoot, '.fighter-source[data-user-id="fighter-1-5"]');
    source.dispatchEvent(createDragEvent("dragstart"));

    const validDropzone = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, '[data-assignment-phase-id="phase-1"][data-role="FIGHTER"]');
    const invalidDropzone = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, '[data-assignment-phase-id="phase-2"][data-role="FIGHTER"]');
    expect(validDropzone.dataset.dropPossible).toBe("true");
    expect(validDropzone.querySelectorAll(".fighter-assignment-slot").length).toBe(6);
    const filledSlots = Array.from(validDropzone.querySelectorAll(".fighter-assignment-slot-filled")).map((slot) => slot.textContent ?? "");
    expect(filledSlots.join(" ")).toContain("fighter-1-1");
    expect(filledSlots.join(" ")).toContain("fighter-1-2");
    expect(validDropzone.querySelectorAll(".fighter-assignment-slot-empty").length).toBe(4);
    expect(invalidDropzone.dataset.dropPossible).toBe("false");
    expect(invalidDropzone.querySelector(".assignment-dropzone-hint")?.textContent).toBe("This contender belongs to a different tournament.");

    source.dispatchEvent(createDragEvent("dragend"));
    expect(validDropzone.dataset.dropPossible).toBeUndefined();
    expect(invalidDropzone.dataset.dropPossible).toBeUndefined();
    expect(eventsMock.calls).toHaveLength(1);
    expect(scheduleMock.calls).toHaveLength(1);
  });

  it("randomly assigns fighters into pool slots and keeps official-assigned fighters visible", async () => {
    const { eventsMock, scheduleMock, assignmentCalls } = installPlannerFetchMock();

    window.history.replaceState({}, "", "/planning?eventId=event-1");
    const element = document.createElement("event-planner-view");
    document.body.appendChild(element);

    await expect.poll(() => element.shadowRoot?.querySelector(".slot-label")?.textContent).toBe("Instructie");
    element.shadowRoot?.querySelector('[data-mode="fighters"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const randomAssignButton = await waitForElement<HTMLButtonElement>(element.shadowRoot as ShadowRoot, 'button[data-click-action="random-assign-fighters"]');
    randomAssignButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    await expect.poll(() => element.shadowRoot?.querySelectorAll('[data-assignment-phase-id="phase-1"][data-role="FIGHTER"] .fighter-assignment-slot-filled').length).toBe(6);
    await expect.poll(() => element.shadowRoot?.querySelectorAll('[data-assignment-phase-id="phase-2"][data-role="FIGHTER"] .fighter-assignment-slot-filled').length).toBe(6);
    expect(element.shadowRoot?.querySelector('.fighter-source[data-user-id="fighter-1-3"]')).not.toBeNull();
    expect(assignmentCalls.length).toBeGreaterThan(0);
    expect(eventsMock.calls).toHaveLength(2);
    expect(scheduleMock.calls).toHaveLength(1);
  });
});

function installPlannerFetchMock() {
  const eventsMock = installListPlannerEventsMock();
  const listEventsFetch = globalThis.fetch;
  eventsMock.restore();
  const scheduleMock = installLoadPlannerScheduleMock();
  const loadScheduleFetch = globalThis.fetch;
  scheduleMock.restore();
  let scheduleState: any;
  const assignmentCalls: Array<{ scheduledPhaseId: string; userId: string; role: string }> = [];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url);
    if (request.method === "GET" && requestUrl.pathname.endsWith("/schedule")) {
      if (scheduleState) {
        return new Response(JSON.stringify(scheduleState), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const response = await loadScheduleFetch(request);
      const data = await response.json();
      data.event.tournaments = [
        {
          id: "tournament-1",
          eventId: "event-1",
          name: "Open",
          color: "#ffcc00",
          order: 0,
          ruleset: {
            id: "ruleset-1",
            eventId: "event-1",
            name: "Round robin",
            version: 1,
            definition: {
              weaponClass: "Longsword",
              matchParameters: {
                maxDurationSeconds: 180,
                stopOnTimeOut: true,
                maxPointsCap: 10,
                pointSpreadVictory: 5,
                scores: [1, 2, 3, 4],
                maxDoubles: 3,
                allowAfterBlow: true,
                countDoubles: true,
                useNetScore: true,
                penalties: [],
              },
            },
          },
          stages: [
            {
              id: "stage-1",
              tournamentId: "tournament-1",
              type: "POOL",
              name: "Pool",
              ruleset: {
                id: "ruleset-1",
                eventId: "event-1",
                name: "Round robin",
                version: 1,
                definition: {
                  weaponClass: "Longsword",
                  matchParameters: {
                    maxDurationSeconds: 180,
                    stopOnTimeOut: true,
                    maxPointsCap: 10,
                    pointSpreadVictory: 5,
                    scores: [1, 2, 3, 4],
                    maxDoubles: 3,
                    allowAfterBlow: true,
                    countDoubles: true,
                    useNetScore: true,
                    penalties: [],
                  },
                },
              },
              minPoolSize: 4,
              maxPoolSize: 6,
              preferredPoolSize: 5,
              eliminationParticipantCount: null,
              timeBetweenMatchesMinutes: 2,
              rounds: [],
              arenas: [],
              officials: [],
            },
            {
              id: "stage-1-pool-2",
              tournamentId: "tournament-1",
              type: "POOL",
              name: "Pool B",
              ruleset: {
                id: "ruleset-1",
                eventId: "event-1",
                name: "Round robin",
                version: 1,
                definition: {
                  weaponClass: "Longsword",
                  matchParameters: {
                    maxDurationSeconds: 180,
                    stopOnTimeOut: true,
                    maxPointsCap: 10,
                    pointSpreadVictory: 5,
                    scores: [1, 2, 3, 4],
                    maxDoubles: 3,
                    allowAfterBlow: true,
                    countDoubles: true,
                    useNetScore: true,
                    penalties: [],
                  },
                },
              },
              minPoolSize: 4,
              maxPoolSize: 6,
              preferredPoolSize: 5,
              eliminationParticipantCount: null,
              timeBetweenMatchesMinutes: 2,
              rounds: [],
              arenas: [],
              officials: [],
            },
            {
              id: "stage-1-elim",
              tournamentId: "tournament-1",
              type: "ELIMINATION",
              name: "Elimination",
              ruleset: {
                id: "ruleset-1",
                eventId: "event-1",
                name: "Round robin",
                version: 1,
                definition: {
                  weaponClass: "Longsword",
                  matchParameters: {
                    maxDurationSeconds: 180,
                    stopOnTimeOut: true,
                    maxPointsCap: 10,
                    pointSpreadVictory: 5,
                    scores: [1, 2, 3, 4],
                    maxDoubles: 3,
                    allowAfterBlow: true,
                    countDoubles: true,
                    useNetScore: true,
                    penalties: [],
                  },
                },
              },
              minPoolSize: null,
              maxPoolSize: null,
              preferredPoolSize: null,
              eliminationParticipantCount: 4,
              timeBetweenMatchesMinutes: 2,
              rounds: [],
              arenas: [],
              officials: [],
            },
          ],
          entries: [
            {
              id: "entry-1",
              tournamentId: "tournament-1",
              userId: "user-1",
              kind: "VOLUNTEER",
              seed: null,
              user: {
                id: "user-1",
                username: "judge-01",
                skills: [
                  { id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 3 },
                  { id: "skill-2", userId: "user-1", skillName: "JURY", skillLevel: 4 },
                  { id: "skill-3", userId: "user-1", skillName: "TABLE", skillLevel: 5 },
                ],
              },
            },
            ...Array.from({ length: 19 }, (_, index) => ({
              id: `participant-1-${index + 1}`,
              tournamentId: "tournament-1",
              userId: `fighter-1-${index + 1}`,
              kind: "FIGHTER",
              seed: index + 1,
              user: {
                id: `fighter-1-${index + 1}`,
                username: `fighter-1-${index + 1}`,
                judgeVolunteer: false,
                juryVolunteer: false,
                tableVolunteer: false,
                otherVolunteer: false,
                skills: [],
              },
            })),
          ],
        },
        {
          id: "tournament-2",
          eventId: "event-1",
          name: "Second",
          color: "#66ccff",
          order: 1,
          ruleset: {
            id: "ruleset-1",
            eventId: "event-1",
            name: "Round robin",
            version: 1,
            definition: {
              weaponClass: "Longsword",
              matchParameters: {
                maxDurationSeconds: 180,
                stopOnTimeOut: true,
                maxPointsCap: 10,
                pointSpreadVictory: 5,
                scores: [1, 2, 3, 4],
                maxDoubles: 3,
                allowAfterBlow: true,
                countDoubles: true,
                useNetScore: true,
                penalties: [],
              },
            },
          },
          stages: [
            {
              id: "stage-2",
              tournamentId: "tournament-2",
              type: "POOL",
              name: "Pool",
              ruleset: {
                id: "ruleset-1",
                eventId: "event-1",
                name: "Round robin",
                version: 1,
                definition: {
                  weaponClass: "Longsword",
                  matchParameters: {
                    maxDurationSeconds: 180,
                    stopOnTimeOut: true,
                    maxPointsCap: 10,
                    pointSpreadVictory: 5,
                    scores: [1, 2, 3, 4],
                    maxDoubles: 3,
                    allowAfterBlow: true,
                    countDoubles: true,
                    useNetScore: true,
                    penalties: [],
                  },
                },
              },
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
              id: "entry-2",
              tournamentId: "tournament-2",
              userId: "user-2",
              kind: "VOLUNTEER",
              seed: null,
              user: {
                id: "user-2",
                username: "jury-02",
                skills: [
                  { id: "skill-4", userId: "user-2", skillName: "JUDGE", skillLevel: 2 },
                  { id: "skill-5", userId: "user-2", skillName: "TABLE", skillLevel: 1 },
                ],
              },
            },
            ...Array.from({ length: 12 }, (_, index) => ({
              id: `participant-2-${index + 1}`,
              tournamentId: "tournament-2",
              userId: `fighter-2-${index + 1}`,
              kind: "FIGHTER",
              seed: index + 1,
              user: {
                id: `fighter-2-${index + 1}`,
                username: `fighter-2-${index + 1}`,
                judgeVolunteer: false,
                juryVolunteer: false,
                tableVolunteer: false,
                otherVolunteer: false,
                skills: [],
              },
            })),
          ],
        },
      ];
      data.event.arenas = [
        { id: "arena-1", eventId: "event-1", name: "Arena A", order: 1 },
        { id: "arena-2", eventId: "event-1", name: "Arena B", order: 2 },
        { id: "arena-3", eventId: "event-1", name: "Arena C", order: 3 },
        { id: "arena-4", eventId: "event-1", name: "Arena D", order: 4 },
      ];
      data.schedule.timeSlots[0].scheduledPhases = [
        {
          id: "phase-1",
          stageId: "stage-1",
          arenaId: "arena-1",
          timeSlotId: "slot-1",
          stage: {
            id: "stage-1",
            tournamentId: "tournament-1",
            type: "POOL",
            name: "Pool",
            minPoolSize: 4,
            maxPoolSize: 6,
            preferredPoolSize: 5,
            eliminationParticipantCount: null,
            timeBetweenMatchesMinutes: 2,
            ruleset: {
              id: "ruleset-1",
              eventId: "event-1",
              name: "Round robin",
              version: 1,
            },
            rounds: [],
            arenas: [],
            officials: [],
            tournament: {
              id: "tournament-1",
              eventId: "event-1",
              name: "Open",
              color: "#ffcc00",
            },
          },
          arena: {
            id: "arena-1",
            eventId: "event-1",
            name: "Arena A",
            order: 1,
          },
          assignments: [
            {
              id: "assignment-1",
              scheduledPhaseId: "phase-1",
              userId: "user-2",
              role: "JUDGE",
              user: {
                id: "user-2",
                username: "jury-02",
                skills: [
                  { id: "skill-4", userId: "user-2", skillName: "JUDGE", skillLevel: 2 },
                  { id: "skill-5", userId: "user-2", skillName: "TABLE", skillLevel: 1 },
                ],
              },
            },
            {
              id: "assignment-1b",
              scheduledPhaseId: "phase-1",
              userId: "fighter-1-1",
              role: "FIGHTER",
              user: {
                id: "fighter-1-1",
                username: "fighter-1-1",
                judgeVolunteer: false,
                juryVolunteer: false,
                tableVolunteer: false,
                otherVolunteer: false,
                skills: [],
              },
            },
            {
              id: "assignment-1c",
              scheduledPhaseId: "phase-1",
              userId: "fighter-1-2",
              role: "FIGHTER",
              user: {
                id: "fighter-1-2",
                username: "fighter-1-2",
                judgeVolunteer: false,
                juryVolunteer: false,
                tableVolunteer: false,
                otherVolunteer: false,
                skills: [],
              },
            },
          ],
        },
        {
          id: "phase-2",
          stageId: "stage-2",
          arenaId: "arena-2",
          timeSlotId: "slot-1",
          stage: {
            id: "stage-2",
            tournamentId: "tournament-2",
            type: "POOL",
            name: "Pool",
            minPoolSize: 4,
            maxPoolSize: 6,
            preferredPoolSize: 5,
            eliminationParticipantCount: null,
            timeBetweenMatchesMinutes: 2,
            ruleset: {
              id: "ruleset-1",
              eventId: "event-1",
              name: "Round robin",
              version: 1,
            },
            rounds: [],
            arenas: [],
            officials: [],
            tournament: {
              id: "tournament-2",
              eventId: "event-1",
              name: "Second",
              color: "#66ccff",
            },
          },
          arena: {
            id: "arena-2",
            eventId: "event-1",
            name: "Arena B",
            order: 2,
          },
          assignments: [
            {
              id: "assignment-2",
              scheduledPhaseId: "phase-2",
              userId: "fighter-1-3",
              role: "JURY",
              user: {
                id: "fighter-1-3",
                username: "fighter-1-3",
                judgeVolunteer: false,
                juryVolunteer: false,
                tableVolunteer: false,
                otherVolunteer: false,
                skills: [],
              },
            },
          ],
        },
      ];
      data.schedule.timeSlots.push({
        id: "slot-2",
        scheduleId: "schedule-1",
        order: 1,
        durationMinutes: 60,
        label: "Finals",
        color: "#6b7280",
        isBreak: false,
        scheduledPhases: [
          {
            id: "phase-3",
            stageId: "stage-1-elim",
            arenaId: "arena-3",
            timeSlotId: "slot-2",
            stage: {
              id: "stage-1-elim",
              tournamentId: "tournament-1",
              type: "ELIMINATION",
              name: "Elimination",
              minPoolSize: null,
              maxPoolSize: null,
              preferredPoolSize: null,
              eliminationParticipantCount: 4,
              timeBetweenMatchesMinutes: 2,
              ruleset: {
                id: "ruleset-1",
                eventId: "event-1",
                name: "Round robin",
                version: 1,
              },
              rounds: [],
              arenas: [],
              officials: [],
              tournament: {
                id: "tournament-1",
                eventId: "event-1",
                name: "Open",
                color: "#ffcc00",
              },
            },
            arena: {
              id: "arena-3",
              eventId: "event-1",
              name: "Arena C",
              order: 3,
            },
            assignments: [],
          },
        ],
      });
      scheduleState = data;
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers,
      });
    }

    if (request.method === "POST" && /\/scheduled-phases\/([^/]+)\/assignments$/.test(requestUrl.pathname)) {
      if (!scheduleState) {
        throw new Error("Schedule state was not initialized.");
      }

      const match = /\/scheduled-phases\/([^/]+)\/assignments$/.exec(requestUrl.pathname);
      const scheduledPhaseId = match?.[1] ?? "";
      const body = await request.json() as { userId: string; role: string };
      const scheduledPhase = findScheduledPhase(scheduleState, scheduledPhaseId);
      const entry = findTournamentEntry(scheduleState, body.userId);
      if (!scheduledPhase || !entry) {
        throw new Error("Assignment target not found.");
      }

      const timeSlot = scheduleState.schedule.timeSlots.find((slot: any) => slot.id === scheduledPhase.timeSlotId);
      if (!timeSlot) {
        throw new Error("Time slot not found.");
      }

      const conflict = scheduleState.schedule.timeSlots.some((slot: any) =>
        slot.scheduledPhases.some((phase: any) =>
          phase.timeSlotId === timeSlot.id && (phase.assignments ?? []).some((assignment: any) => assignment.userId === body.userId),
        ),
      );
      if (conflict) {
        return new Response(JSON.stringify({ error: "Conflict" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }

      const createdAssignment = {
        id: `assignment-${Math.random().toString(36).slice(2, 10)}`,
        scheduledPhaseId,
        userId: body.userId,
        role: body.role,
        user: entry.user,
      };
      assignmentCalls.push({ scheduledPhaseId, userId: body.userId, role: body.role });
      scheduledPhase.assignments = [...(scheduledPhase.assignments ?? []), createdAssignment];
      return new Response(JSON.stringify(createdAssignment), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return listEventsFetch(request);
  };

  return { eventsMock, scheduleMock, assignmentCalls };
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

function createDragEvent(type: string): DragEvent {
  const event = new DragEvent(type, { bubbles: true, cancelable: true });
  const data = createDataTransfer();
  Object.defineProperty(event, "dataTransfer", {
    value: data,
  });
  return event;
}

function createDataTransfer() {
  const values = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    getData(type: string) {
      return values.get(type) ?? "";
    },
    setData(type: string, value: string) {
      values.set(type, value);
    },
    clearData(type?: string) {
      if (type) {
        values.delete(type);
        return;
      }
      values.clear();
    },
  };
}

function findScheduledPhase(state: any, scheduledPhaseId: string) {
  for (const timeSlot of state.schedule.timeSlots) {
    const phase = timeSlot.scheduledPhases.find((candidate: any) => candidate.id === scheduledPhaseId);
    if (phase) {
      return phase;
    }
  }
  return undefined;
}

function findTournamentEntry(state: any, userId: string) {
  for (const tournament of state.event.tournaments) {
    const entry = tournament.entries.find((candidate: any) => candidate.userId === userId);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

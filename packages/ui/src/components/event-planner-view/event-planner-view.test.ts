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
});

function installPlannerFetchMock() {
  const eventsMock = installListPlannerEventsMock();
  const listEventsFetch = globalThis.fetch;
  eventsMock.restore();
  const scheduleMock = installLoadPlannerScheduleMock();
  const loadScheduleFetch = globalThis.fetch;
  scheduleMock.restore();

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (new URL(request.url).pathname.endsWith("/schedule")) {
      const response = await loadScheduleFetch(request);
      const data = await response.json();
      data.event.tournaments = [
        {
          id: "tournament-1",
          name: "Open",
          color: "#ffcc00",
          stages: [],
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
          ],
        },
        {
          id: "tournament-2",
          name: "Second",
          color: "#66ccff",
          stages: [],
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
          ],
        },
      ];
      data.event.arenas = [
        { id: "arena-1", eventId: "event-1", name: "Arena A", order: 1 },
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
            ruleset: "Round robin",
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
          ],
        },
      ];
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers,
      });
    }

    return listEventsFetch(request);
  };

  return { eventsMock, scheduleMock };
}

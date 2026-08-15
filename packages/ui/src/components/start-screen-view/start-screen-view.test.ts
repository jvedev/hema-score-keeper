import { afterEach, describe, expect, it } from "vitest";
import "./start-screen-view";

describe("start-screen-view", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the selected event, arena, and fights", () => {
    const element = document.createElement("start-screen-view");
    document.body.appendChild(element);
    element.configure({
      loading: false,
      error: null,
      eventOptions: [
        { id: "event-1", name: "Summer Open" },
        { id: "event-2", name: "Winter Cup" },
      ],
      selectedEventId: "event-1",
      arenaOptions: [
        { id: "arena-1", name: "Ring 1" },
        { id: "arena-2", name: "Ring 2" },
      ],
      selectedArenaId: "arena-1",
      activeTimeSlotLabel: "Open · Block 1",
      fightSummary: "2 fights",
      inactiveMessage: null,
      fights: [
        {
          id: "match-1",
          roundLabel: "Round 1",
          fighterAName: "Alex",
          fighterBName: "Blake",
          statusLabel: "Ready",
          disabled: false,
        },
      ],
    });

    const eventSelect =
      element.shadowRoot?.querySelector<HTMLSelectElement>("#event-select");
    const arenaSelect =
      element.shadowRoot?.querySelector<HTMLSelectElement>("#arena-select");
    const fightButton =
      element.shadowRoot?.querySelector<HTMLButtonElement>(".fight-button");

    expect(eventSelect?.value).toBe("event-1");
    expect(arenaSelect?.value).toBe("arena-1");
    expect(fightButton?.textContent).toContain("Alex vs Blake");
  });

  it("emits selection changes", () => {
    const element = document.createElement("start-screen-view");
    document.body.appendChild(element);
    element.configure({
      loading: false,
      error: null,
      eventOptions: [{ id: "event-1", name: "Summer Open" }],
      selectedEventId: "event-1",
      arenaOptions: [{ id: "arena-1", name: "Ring 1" }],
      selectedArenaId: "arena-1",
      activeTimeSlotLabel: null,
      fightSummary: null,
      inactiveMessage: null,
      fights: [],
    });

    let selectedEventId: string | undefined;
    let selectedArenaId: string | undefined;
    let selectedFightId: string | undefined;
    element.addEventListener("event-selected", (event) => {
      selectedEventId = event.detail.eventId;
    });
    element.addEventListener("arena-selected", (event) => {
      selectedArenaId = event.detail.arenaId;
    });
    element.addEventListener("fight-selected", (event) => {
      selectedFightId = event.detail.matchId;
    });

    const eventSelect =
      element.shadowRoot?.querySelector<HTMLSelectElement>("#event-select");
    const arenaSelect =
      element.shadowRoot?.querySelector<HTMLSelectElement>("#arena-select");
    eventSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    arenaSelect?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(selectedEventId).toBe("event-1");
    expect(selectedArenaId).toBe("arena-1");

    element.configure({
      loading: false,
      error: null,
      eventOptions: [{ id: "event-1", name: "Summer Open" }],
      selectedEventId: "event-1",
      arenaOptions: [{ id: "arena-1", name: "Ring 1" }],
      selectedArenaId: "arena-1",
      activeTimeSlotLabel: "Open · Block 1",
      fightSummary: "1 fight",
      inactiveMessage: null,
      fights: [
        {
          id: "match-1",
          roundLabel: "Round 1",
          fighterAName: "Alex",
          fighterBName: "Blake",
          statusLabel: "Ready",
          disabled: false,
        },
      ],
    });
    element.shadowRoot?.querySelector<HTMLButtonElement>(".fight-button")?.click();

    expect(selectedFightId).toBe("match-1");
  });

  it("does not emit selection for completed fights", () => {
    const element = document.createElement("start-screen-view");
    document.body.appendChild(element);
    element.configure({
      loading: false,
      error: null,
      eventOptions: [{ id: "event-1", name: "Summer Open" }],
      selectedEventId: "event-1",
      arenaOptions: [{ id: "arena-1", name: "Ring 1" }],
      selectedArenaId: "arena-1",
      activeTimeSlotLabel: "Open · Block 1",
      fightSummary: "1 fight",
      inactiveMessage: null,
      fights: [
        {
          id: "match-1",
          roundLabel: "Round 1",
          fighterAName: "Alex",
          fighterBName: "Blake",
          statusLabel: "Completed",
          disabled: true,
        },
      ],
    });

    let selectedFightId: string | undefined;
    element.addEventListener("fight-selected", (event) => {
      selectedFightId = event.detail.matchId;
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>(".fight-button")?.click();

    expect(selectedFightId).toBeUndefined();
  });
});

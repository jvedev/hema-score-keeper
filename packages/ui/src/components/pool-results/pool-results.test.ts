import { afterEach, describe, expect, it } from "vitest";
import type { ApiEvent } from "@hema/event-admin-api";
import { setLocale } from "../../i18n/i18n.js";
import "./pool-results.js";
import type { PoolResults } from "./pool-results.js";

function poolEvent(): ApiEvent {
  const user = (id: string, username: string) => ({ id, username, judgeVolunteer: false, juryVolunteer: false, tableVolunteer: false, otherVolunteer: false });
  const entry = (id: string, username: string) => ({ id, tournamentId: "t1", userId: id, kind: "FIGHTER" as const, seed: null, user: user(id, username) });
  const arena = { id: "a1", eventId: "ev", name: "Arena Red", order: 1 };
  return {
    id: "ev",
    eventName: "Event",
    ruleset: null,
    allFightersAreVolunteers: false,
    arenas: [arena],
    rulesets: [],
    colors: [],
    tournaments: [
      {
        id: "t1",
        eventId: "ev",
        name: "Open",
        order: 1,
        color: "#000",
        ruleset: null,
        entries: [entry("e1", "Alex"), entry("e2", "Casey")],
        stages: [
          {
            id: "s1",
            tournamentId: "t1",
            type: "POOL",
            name: "Pools",
            ruleset: null,
            minPoolSize: 4,
            maxPoolSize: 6,
            preferredPoolSize: 5,
            eliminationParticipantCount: null,
            timeBetweenMatchesMinutes: 2,
            arenas: [{ id: "sa", stageId: "s1", arenaId: "a1", arena }],
            officials: [],
            rounds: [
              {
                id: "r0",
                stageId: "s1",
                roundNumber: 0,
                matches: [{ id: "m1", roundId: "r0", arenaId: "a1", entryAId: "e1", entryBId: "e2", winnerEntryId: "e1", scoreA: 5, scoreB: 3, ruleset: null, scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null }],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as ApiEvent;
}

let element: PoolResults;

afterEach(() => {
  element?.remove();
  setLocale("en");
});

function mount(): PoolResults {
  element = document.createElement("pool-results") as PoolResults;
  document.body.appendChild(element);
  const event = poolEvent();
  element.setData(event, event.tournaments[0]!.stages[0]!, event.tournaments[0]!);
  return element;
}

describe("pool-results", () => {
  it("renders shadow DOM content", () => {
    const empty = document.createElement("pool-results");
    document.body.appendChild(empty);
    expect(empty.shadowRoot?.innerHTML).toContain("<");
    empty.remove();
  });

  it("shows standings with the winner first, in English", () => {
    setLocale("en");
    const root = mount().shadowRoot!;
    expect(root.querySelector(".pool-results-title")!.textContent).toBe("Pool results and standings");
    expect([...root.querySelectorAll(".standings-table th")].map((cell) => cell.textContent!.trim())).toContain("Wins");
    expect(root.querySelector(".standings-table tbody tr")!.textContent).toContain("Alex");
    expect(root.textContent).not.toMatch(/Uitslagen|Afgerond|Geen stage/);
  });

  it("speaks Dutch when the locale is Dutch, also after switching", () => {
    const root = mount().shadowRoot!;
    setLocale("nl");
    expect(root.querySelector(".pool-results-title")!.textContent).toBe("Poule-uitslagen en standen");
    expect([...root.querySelectorAll(".standings-table th")].map((cell) => cell.textContent!.trim())).toContain("Gewonnen");
    expect(root.textContent).not.toMatch(/Winner Determination|Matches Played/);
  });

  it("says in the reader's language when there is no stage", () => {
    setLocale("en");
    const empty = document.createElement("pool-results");
    document.body.appendChild(empty);
    expect(empty.shadowRoot!.textContent).toContain("No stage selected.");
    empty.remove();
  });

  it("numbers the pools in arena order, whatever order the stage lists them in", () => {
    setLocale("en");
    const event = poolEvent();
    const red = { id: "a1", eventId: "ev", name: "Arena Red", order: 1 };
    const blue = { id: "a2", eventId: "ev", name: "Arena Blue", order: 2 };
    event.arenas = [red, blue];
    const stage = event.tournaments[0]!.stages[0]!;
    stage.arenas = [
      { id: "sa2", stageId: "s1", arenaId: "a2", arena: blue },
      { id: "sa1", stageId: "s1", arenaId: "a1", arena: red },
    ];
    element = document.createElement("pool-results") as PoolResults;
    document.body.appendChild(element);
    element.setData(event, stage, event.tournaments[0]!);
    const titles = [...element.shadowRoot!.querySelectorAll(".pool-card-title")].map((title) => title.textContent!.trim());
    expect(titles).toEqual(["Pool 1 · Arena Red", "Pool 2 · Arena Blue"]);
  });
});

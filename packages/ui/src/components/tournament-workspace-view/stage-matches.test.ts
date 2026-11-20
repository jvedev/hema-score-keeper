import { describe, expect, it } from "vitest";
import type { ApiEvent, ApiMatch, ApiRound, ApiStage, ApiTournament } from "@hema/event-admin-api";
import { matchPlayed, nextFreeOrder, poolPhaseFor, roundStatus, stageMatchRows, stagePhaseOptions } from "./stage-matches.js";

const match = (id: string, overrides: Partial<ApiMatch> = {}): ApiMatch => ({
  id,
  roundId: "r0",
  arenaId: null,
  entryAId: "e1",
  entryBId: "e2",
  winnerEntryId: null,
  scoreA: null,
  scoreB: null,
  ruleset: null,
  scheduledMatch: null, bracketRound: null, bracketPosition: null, bracketKind: null,
  ...overrides,
});

const round = (id: string, roundNumber: number, matches: ApiMatch[]): ApiRound => ({ id, stageId: "s1", roundNumber, matches });

const entry = (id: string, username: string) =>
  ({ id, tournamentId: "t1", userId: id, kind: "FIGHTER", seed: null, user: { id, username, judgeVolunteer: false, juryVolunteer: false, tableVolunteer: false, otherVolunteer: false } }) as never;

function world(rounds: ApiRound[]): { event: ApiEvent; tournament: ApiTournament; stage: ApiStage } {
  const stage = { id: "s1", tournamentId: "t1", type: "POOL", name: "Pools", rounds, arenas: [], officials: [] } as unknown as ApiStage;
  const tournament = { id: "t1", stages: [stage], entries: [entry("e1", "Alex"), entry("e2", "Casey"), entry("e3", "Drew")] } as unknown as ApiTournament;
  const event = {
    id: "ev",
    arenas: [
      { id: "a1", eventId: "ev", name: "Arena Red", order: 1 },
      { id: "a2", eventId: "ev", name: "Arena Blue", order: 2 },
    ],
    tournaments: [tournament],
    schedule: {
      id: "sch",
      eventId: "ev",
      startTimeMinutes: 540,
      currentTimeSlotId: null,
      timeSlots: [
        { id: "ts2", scheduleId: "sch", order: 2, durationMinutes: 30, label: "10:00", color: null, isBreak: false, scheduledPhases: [{ id: "ph2", stageId: "s1", arenaId: "a2", timeSlotId: "ts2", arena: { id: "a2", eventId: "ev", name: "Arena Blue", order: 2 } }] },
        { id: "ts1", scheduleId: "sch", order: 1, durationMinutes: 30, label: "09:00", color: null, isBreak: false, scheduledPhases: [{ id: "ph1", stageId: "s1", arenaId: "a1", timeSlotId: "ts1", arena: { id: "a1", eventId: "ev", name: "Arena Red", order: 1 } }] },
      ],
    },
  } as unknown as ApiEvent;
  return { event, tournament, stage };
}

describe("stage matches", () => {
  it("counts a match as played once both scores are in, a draw included", () => {
    expect(matchPlayed(match("m", { scoreA: 3, scoreB: 3 }))).toBe(true);
    expect(matchPlayed(match("m", { scoreA: 3, scoreB: null }))).toBe(false);
    expect(matchPlayed(match("m"))).toBe(false);
  });

  it("gives a round's status from its matches", () => {
    expect(roundStatus(round("r", 0, []))).toBe("empty");
    expect(roundStatus(round("r", 0, [match("a"), match("b")]))).toBe("not-started");
    expect(roundStatus(round("r", 0, [match("a", { scoreA: 1, scoreB: 0 }), match("b")]))).toBe("in-progress");
    expect(roundStatus(round("r", 0, [match("a", { scoreA: 1, scoreB: 0 }), match("b", { scoreA: 2, scoreB: 2 })]))).toBe("done");
  });

  it("builds rows with names, round numbers from 1, arena names, winner or draw, and schedule", () => {
    const { event, tournament, stage } = world([
      round("r1", 1, [match("late", { roundId: "r1", arenaId: "a2", entryAId: "e3", scheduledMatch: { scheduledPhaseId: "ph2", order: 1 }, bracketRound: null, bracketPosition: null, bracketKind: null })]),
      round("r0", 0, [
        match("second", { roundId: "r0", arenaId: "a1", scoreA: 2, scoreB: 2, scheduledMatch: { scheduledPhaseId: "ph1", order: 2 }, bracketRound: null, bracketPosition: null, bracketKind: null }),
        match("first", { roundId: "r0", arenaId: "a1", scoreA: 5, scoreB: 3, winnerEntryId: "e1", scheduledMatch: { scheduledPhaseId: "ph1", order: 1 }, bracketRound: null, bracketPosition: null, bracketKind: null }),
      ]),
    ]);
    const rows = stageMatchRows(event, tournament, stage);
    expect(rows.map((row) => row.id)).toEqual(["first", "second", "late"]);
    expect(rows[0]).toMatchObject({ roundNumber: 1, left: "Alex", right: "Casey", arena: "Arena Red", score: "5–3", winner: "Alex", draw: false, played: true, slot: "09:00", order: 1 });
    expect(rows[1]).toMatchObject({ score: "2–2", winner: null, draw: true, played: true, order: 2 });
    expect(rows[2]).toMatchObject({ roundNumber: 2, left: "Drew", arena: "Arena Blue", score: null, played: false, slot: "10:00", order: 1 });
  });

  it("leaves schedule and arena empty for a match that is not placed yet", () => {
    const { event, tournament, stage } = world([round("r0", 0, [match("m", { entryBId: null })])]);
    expect(stageMatchRows(event, tournament, stage)[0]).toMatchObject({ arena: null, slot: null, order: null, right: null });
  });

  it("keeps matches that are not scheduled yet together per arena", () => {
    const { event, tournament, stage } = world([
      round("r0", 0, [match("b1", { arenaId: "a2" }), match("a1", { arenaId: "a1" }), match("b2", { arenaId: "a2" }), match("a2", { arenaId: "a1" })]),
    ]);
    expect(stageMatchRows(event, tournament, stage).map((row) => row.id)).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("lists a stage's scheduled phases in time-slot order", () => {
    const { event } = world([]);
    expect(stagePhaseOptions(event, "s1")).toEqual([
      { phaseId: "ph1", label: "09:00 · Arena Red", arenaId: "a1", timeSlotId: "ts1" },
      { phaseId: "ph2", label: "10:00 · Arena Blue", arenaId: "a2", timeSlotId: "ts2" },
    ]);
    expect(stagePhaseOptions(event, "other")).toEqual([]);
  });

  it("finds a pool match's phase from its arena and round, like the backend", () => {
    const { event } = world([]);
    expect(poolPhaseFor(event, { id: "s1" }, { arenaId: "a1" }, { roundNumber: 1 })?.phaseId).toBe("ph1");
    expect(poolPhaseFor(event, { id: "s1" }, { arenaId: "a2" }, { roundNumber: 1 })).toBeNull();
    expect(poolPhaseFor(event, { id: "s1" }, { arenaId: null }, { roundNumber: 1 })).toBeNull();
  });

  it("suggests the first free order on the ring and slot, ignoring the match being moved", () => {
    const { event } = world([
      round("r0", 0, [
        match("x", { scheduledMatch: { scheduledPhaseId: "ph1", order: 1 }, bracketRound: null, bracketPosition: null, bracketKind: null }),
        match("y", { scheduledMatch: { scheduledPhaseId: "ph1", order: 4 }, bracketRound: null, bracketPosition: null, bracketKind: null }),
        match("z", { scheduledMatch: { scheduledPhaseId: "ph2", order: 9 }, bracketRound: null, bracketPosition: null, bracketKind: null }),
      ]),
    ]);
    expect(nextFreeOrder(event, "ph1")).toBe(5);
    expect(nextFreeOrder(event, "ph1", "y")).toBe(2);
    expect(nextFreeOrder(event, "ph2")).toBe(10);
    expect(nextFreeOrder(event, "missing")).toBe(1);
  });
});

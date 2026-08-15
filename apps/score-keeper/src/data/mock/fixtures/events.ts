import type { ApiEvent } from "@hema/event-admin-api";

const defaultRuleset = {
  id: "rule-set-1",
  eventId: "event-1",
  name: "Longsword",
  version: 1,
  definition: null,
};

const ringOne = {
  id: "arena-1",
  eventId: "event-1",
  name: "Ring 1",
  order: 1,
  leftColor: "#3a8cf8",
  rightColor: "#ec0b29",
};

const ringTwo = {
  id: "arena-2",
  eventId: "event-1",
  name: "Ring 2",
  order: 2,
  leftColor: "#21c15b",
  rightColor: "#2f7dfa",
};

const openTournamentMeta = {
  id: "tournament-1",
  eventId: "event-1",
  name: "Open",
  color: "#5B8CFF",
};

const openStage = {
  id: "stage-1",
  tournamentId: "tournament-1",
  type: "POOL" as const,
  name: "Pool",
  ruleset: defaultRuleset,
  minPoolSize: 4,
  maxPoolSize: 6,
  preferredPoolSize: 5,
  eliminationParticipantCount: null,
  timeBetweenMatchesMinutes: 2,
  rounds: [
    {
      id: "round-1",
      stageId: "stage-1",
      roundNumber: 1,
      matches: [
        {
          id: "match-1",
          roundId: "round-1",
          arenaId: "arena-1",
          entryAId: "entry-1",
          entryBId: "entry-2",
          winnerEntryId: null,
          scoreA: null,
          scoreB: null,
          ruleset: defaultRuleset,
        },
        {
          id: "match-2",
          roundId: "round-1",
          arenaId: "arena-2",
          entryAId: "entry-3",
          entryBId: "entry-4",
          winnerEntryId: null,
          scoreA: null,
          scoreB: null,
          ruleset: defaultRuleset,
        },
      ],
    },
    {
      id: "round-2",
      stageId: "stage-1",
      roundNumber: 2,
      matches: [
        {
          id: "match-3",
          roundId: "round-2",
          arenaId: "arena-1",
          entryAId: "entry-3",
          entryBId: "entry-1",
          winnerEntryId: null,
          scoreA: null,
          scoreB: null,
          ruleset: defaultRuleset,
        },
        {
          id: "match-4",
          roundId: "round-2",
          arenaId: "arena-2",
          entryAId: "entry-4",
          entryBId: "entry-2",
          winnerEntryId: null,
          scoreA: null,
          scoreB: null,
          ruleset: defaultRuleset,
        },
      ],
    },
  ],
  arenas: [
    { id: "stage-arena-1", stageId: "stage-1", arenaId: "arena-1", arena: ringOne },
    { id: "stage-arena-2", stageId: "stage-1", arenaId: "arena-2", arena: ringTwo },
  ],
  officials: [],
};

const openTournament = {
  ...openTournamentMeta,
  ruleset: defaultRuleset,
  order: 1,
  entries: [
    fighterEntry("entry-1", "fighter-a", "Alex Meyer"),
    fighterEntry("entry-2", "fighter-b", "Blake Novak"),
    fighterEntry("entry-3", "fighter-c", "Casey Silva"),
    fighterEntry("entry-4", "fighter-d", "Drew Fischer"),
  ],
  stages: [openStage],
};

const activeSchedule = {
  id: "schedule-1",
  eventId: "event-1",
  startTimeMinutes: 540,
  currentTimeSlotId: "slot-1",
  timeSlots: [
    {
      id: "slot-1",
      scheduleId: "schedule-1",
      order: 1,
      durationMinutes: 30,
      label: "Block 1",
      color: "#6b7280",
      isBreak: false,
      scheduledPhases: [
        {
          id: "phase-1",
          stageId: "stage-1",
          arenaId: "arena-1",
          timeSlotId: "slot-1",
          stage: { ...openStage, tournament: openTournamentMeta },
          arena: ringOne,
          assignments: [],
        },
        {
          id: "phase-2",
          stageId: "stage-1",
          arenaId: "arena-2",
          timeSlotId: "slot-1",
          stage: { ...openStage, tournament: openTournamentMeta },
          arena: ringTwo,
          assignments: [],
        },
      ],
    },
    {
      id: "slot-2",
      scheduleId: "schedule-1",
      order: 2,
      durationMinutes: 30,
      label: "Block 2",
      color: "#6b7280",
      isBreak: false,
      scheduledPhases: [
        {
          id: "phase-3",
          stageId: "stage-1",
          arenaId: "arena-1",
          timeSlotId: "slot-2",
          stage: { ...openStage, tournament: openTournamentMeta },
          arena: ringOne,
          assignments: [],
        },
        {
          id: "phase-4",
          stageId: "stage-1",
          arenaId: "arena-2",
          timeSlotId: "slot-2",
          stage: { ...openStage, tournament: openTournamentMeta },
          arena: ringTwo,
          assignments: [],
        },
      ],
    },
  ],
};

export const events: readonly ApiEvent[] = [
  {
    id: "event-1",
    eventName: "Summer Open",
    ruleset: defaultRuleset,
    allFightersAreVolunteers: false,
    schedule: activeSchedule,
    arenas: [ringOne, ringTwo],
    rulesets: [defaultRuleset],
    tournaments: [openTournament],
  },
  {
    id: "event-2",
    eventName: "Autumn Cup",
    ruleset: null,
    allFightersAreVolunteers: false,
    arenas: [
      {
        id: "arena-3",
        eventId: "event-2",
        name: "Ring 3",
        order: 1,
      },
    ],
    rulesets: [],
    tournaments: [],
  },
];

function fighterEntry(id: string, userId: string, username: string) {
  return {
    id,
    tournamentId: "tournament-1",
    userId,
    kind: "FIGHTER" as const,
    seed: null,
    user: {
      id: userId,
      username,
      judgeVolunteer: false,
      juryVolunteer: false,
      tableVolunteer: false,
      otherVolunteer: false,
    },
  };
}

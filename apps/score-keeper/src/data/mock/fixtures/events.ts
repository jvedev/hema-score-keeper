import type { ApiEvent } from "@hema/event-admin-api";

const defaultRuleset = {
  id: "rule-set-1",
  eventId: "event-1",
  name: "Longsword",
  version: 1,
} as const;

const ringOne = {
  id: "arena-1",
  eventId: "event-1",
  name: "Ring 1",
  order: 1,
} as const;

const ringTwo = {
  id: "arena-2",
  eventId: "event-1",
  name: "Ring 2",
  order: 2,
} as const;

export const events: readonly ApiEvent[] = [
  {
    id: "event-1",
    eventName: "Summer Open",
    ruleset: defaultRuleset,
    allFightersAreVolunteers: false,
    arenas: [ringOne, ringTwo],
    rulesets: [defaultRuleset],
    tournaments: [
      {
        id: "tournament-1",
        eventId: "event-1",
        name: "Open",
        ruleset: defaultRuleset,
        order: 1,
        color: "#5B8CFF",
        entries: [
          fighterEntry("entry-1", "fighter-a", "Alex Meyer"),
          fighterEntry("entry-2", "fighter-b", "Blake Novak"),
          fighterEntry("entry-3", "fighter-c", "Casey Silva"),
          fighterEntry("entry-4", "fighter-d", "Drew Fischer"),
        ],
        stages: [
          {
            id: "stage-1",
            tournamentId: "tournament-1",
            type: "POOL",
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
          },
        ],
      },
    ],
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

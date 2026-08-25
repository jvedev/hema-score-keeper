import type { Bout, Competition, Participant } from "../../../domain/competition";

export const competitions: readonly Competition[] = [
  {
    id: "competition-1",
    name: "Autumn Longsword Open",
    startDate: "2026-09-12",
    endDate: "2026-09-13",
  },
  {
    id: "competition-2",
    name: "Winter Sabre Cup",
    startDate: "2026-12-05",
    endDate: "2026-12-06",
  },
];

export const participants: readonly Participant[] = [
  { id: "participant-1", competitionId: "competition-1", name: "Alex Meyer", linkedUserEmail: null },
  { id: "participant-2", competitionId: "competition-1", name: "Blake Novak", linkedUserEmail: null },
  { id: "participant-3", competitionId: "competition-1", name: "Casey Silva", linkedUserEmail: null },
  { id: "participant-4", competitionId: "competition-1", name: "Drew Fischer", linkedUserEmail: null },
  { id: "participant-5", competitionId: "competition-2", name: "Emery Janssen", linkedUserEmail: null },
  { id: "participant-6", competitionId: "competition-2", name: "Frankie Ruiz", linkedUserEmail: null },
];

export const bouts: readonly Bout[] = [
  {
    id: "bout-1",
    competitionId: "competition-1",
    fighterAId: "participant-1",
    fighterBId: "participant-2",
    scoreA: 5,
    scoreB: 3,
    winnerParticipantId: "participant-1",
    date: "2026-09-12",
    published: true,
  },
  {
    id: "bout-2",
    competitionId: "competition-1",
    fighterAId: "participant-3",
    fighterBId: "participant-4",
    scoreA: 2,
    scoreB: 2,
    winnerParticipantId: null,
    date: "2026-09-12",
    published: true,
  },
];

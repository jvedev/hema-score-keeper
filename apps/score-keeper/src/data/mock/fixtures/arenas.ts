import type { Arena } from "@hema/match-engine";

export const arenas: Readonly<Record<string, Arena>> = {
  "arena-1": {
    id: "arena-1",
    name: "Arena 1",
    fighters: [
      { id: "fighter-1", name: "Alex Meyer" },
      { id: "fighter-2", name: "Blake Novak" },
      { id: "fighter-3", name: "Casey Silva" },
      { id: "fighter-4", name: "Drew Fischer" },
      { id: "fighter-5", name: "Emery Janssen" },
    ],
    bouts: [
      {
        id: "bout-1",
        round: 1,
        fighterAId: "fighter-2",
        fighterBId: "fighter-5",
        status: "expected",
      },
      {
        id: "bout-2",
        round: 1,
        fighterAId: "fighter-3",
        fighterBId: "fighter-4",
        status: "expected",
      },
      {
        id: "bout-3",
        round: 2,
        fighterAId: "fighter-1",
        fighterBId: "fighter-5",
        status: "expected",
      },
      {
        id: "bout-4",
        round: 2,
        fighterAId: "fighter-2",
        fighterBId: "fighter-3",
        status: "expected",
      },
      {
        id: "bout-5",
        round: 3,
        fighterAId: "fighter-1",
        fighterBId: "fighter-4",
        status: "expected",
      },
      {
        id: "bout-6",
        round: 3,
        fighterAId: "fighter-3",
        fighterBId: "fighter-5",
        status: "expected",
      },
      {
        id: "bout-7",
        round: 4,
        fighterAId: "fighter-1",
        fighterBId: "fighter-3",
        status: "expected",
      },
      {
        id: "bout-8",
        round: 4,
        fighterAId: "fighter-2",
        fighterBId: "fighter-4",
        status: "expected",
      },
      {
        id: "bout-9",
        round: 5,
        fighterAId: "fighter-1",
        fighterBId: "fighter-2",
        status: "expected",
      },
      {
        id: "bout-10",
        round: 5,
        fighterAId: "fighter-4",
        fighterBId: "fighter-5",
        status: "expected",
      },
    ],
    fighterStyles: {
      left: {
        backgroundColor: "#3a8cf8",
        textColor: "#e4e4e5",
      },
      right: {
        backgroundColor: "#ec0b29",
        textColor: "#020621",
      },
    },
  },
};

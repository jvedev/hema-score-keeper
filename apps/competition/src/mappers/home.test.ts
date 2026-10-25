import { describe, expect, it } from "vitest";
import type { MeHome, MyCompetition, TodoBout } from "../api-types";
import { DEFAULT_HOME_BLOCKS, homeBlocks, myCompetitionsBlock, todoBlock, toMyCompetitionItems, toTodoItems, type HomeBlockSource } from "./home";

const eva = { userId: "u1", name: "Eva" };
const kees = { userId: "u2", name: "Kees" };
const lotte = { userId: "u3", name: "Lotte" };

function bout(overrides: Partial<TodoBout>): TodoBout {
  return {
    boutId: "b",
    competitionId: "X",
    competitionName: "Ladder",
    startedAt: "2026-10-20T12:00:00.000Z",
    ring: null,
    side: "A",
    fighterA: eva,
    fighterB: kees,
    scoreA: 5,
    scoreB: 3,
    winnerSide: "A",
    windowEndsAt: "2026-10-23T12:00:00.000Z",
    ...overrides,
  };
}

const competition: MyCompetition = {
  id: "X",
  name: "Ladder",
  status: "RUNNING",
  date: "2026-09-01",
  myStatus: "ACTIVE",
  rank: 2,
  rating: 1012,
  lastChange: 12,
  bouts: 4,
};

const empty: MeHome = { todo: { toApprove: [], myObjections: [], toReferee: [] }, competitions: [] };

describe("home blocks", () => {
  it("no to-do block when empty", () => {
    const blocks = homeBlocks({ ...empty, competitions: [competition] });
    expect(blocks.map((block) => block.kind)).toEqual(["my-competitions"]);
    expect(todoBlock({ ...empty, competitions: [competition] })).toBeNull();
  });

  it("puts the to-do block above my competitions", () => {
    const home: MeHome = { todo: { ...empty.todo, toApprove: [bout({ boutId: "b1" })] }, competitions: [competition] };
    expect(homeBlocks(home).map((block) => block.kind)).toEqual(["todo", "my-competitions"]);
  });

  it("points to Competitions when the fighter is in none", () => {
    expect(homeBlocks(empty)).toEqual([{ kind: "no-competitions" }]);
    const withTodo: MeHome = { ...empty, todo: { ...empty.todo, toReferee: [bout({ side: null })] } };
    expect(homeBlocks(withTodo).map((block) => block.kind)).toEqual(["todo", "no-competitions"]);
  });

  it("lets the app choose and order the blocks", () => {
    const now: HomeBlockSource = () => ({ kind: "my-competitions", items: [] });
    expect(DEFAULT_HOME_BLOCKS).toEqual([todoBlock, myCompetitionsBlock]);
    expect(homeBlocks(empty, [now, todoBlock]).map((block) => block.kind)).toEqual(["my-competitions"]);
  });
});

describe("to-do items", () => {
  it("shows each bout from the fighter's side", () => {
    const home: MeHome = {
      ...empty,
      todo: {
        toApprove: [bout({ boutId: "b1", side: "B", startedAt: "2026-10-20T10:00:00.000Z" })],
        myObjections: [bout({ boutId: "b2", side: "A", startedAt: "2026-10-19T10:00:00.000Z" })],
        toReferee: [bout({ boutId: "b3", side: null, fighterA: kees, fighterB: lotte, scoreA: 2, scoreB: 7, competitionName: null, startedAt: "2026-10-21T10:00:00.000Z" })],
      },
    };
    expect(toTodoItems(home)).toEqual([
      { kind: "objection", boutId: "b2", competitionName: "Ladder", opponentName: "Kees", ownScore: 5, opponentScore: 3, since: "2026-10-19T10:00:00.000Z" },
      { kind: "approve", boutId: "b1", competitionName: "Ladder", opponentName: "Eva", ownScore: 3, opponentScore: 5, since: "2026-10-20T10:00:00.000Z" },
      { kind: "referee", boutId: "b3", competitionName: null, opponentName: "Kees – Lotte", ownScore: 2, opponentScore: 7, since: "2026-10-21T10:00:00.000Z" },
    ]);
  });

  it("sorts everything oldest first, keeping the server's order for ties", () => {
    const same = "2026-10-20T10:00:00.000Z";
    const home: MeHome = {
      ...empty,
      todo: {
        toApprove: [bout({ boutId: "a1", startedAt: same }), bout({ boutId: "a2", startedAt: "2026-10-22T10:00:00.000Z" })],
        myObjections: [],
        toReferee: [bout({ boutId: "r1", side: null, startedAt: same }), bout({ boutId: "r0", side: null, startedAt: "2026-10-01T10:00:00.000Z" })],
      },
    };
    expect(toTodoItems(home).map((item) => item.boutId)).toEqual(["r0", "a1", "r1", "a2"]);
  });

  it("turns stored scores into numbers", () => {
    const home = { ...empty, todo: { ...empty.todo, toApprove: [bout({ scoreA: "4" as unknown as number, scoreB: "1" as unknown as number })] } };
    expect(toTodoItems(home)[0]).toMatchObject({ ownScore: 4, opponentScore: 1 });
  });
});

describe("my competitions", () => {
  it("maps each competition with my standing", () => {
    const pending: MyCompetition = { ...competition, id: "Y", name: "Cup", status: "REGISTRATION_OPEN", myStatus: "PENDING", rank: null, rating: null, lastChange: null, bouts: 0 };
    expect(toMyCompetitionItems({ ...empty, competitions: [competition, pending] })).toEqual([
      { id: "X", name: "Ladder", status: "RUNNING", myStatus: "ACTIVE", rank: 2, rating: 1012, lastChange: 12 },
      { id: "Y", name: "Cup", status: "REGISTRATION_OPEN", myStatus: "PENDING", rank: null, rating: null, lastChange: null },
    ]);
  });

  it("turns stored numbers into numbers", () => {
    const raw = { ...competition, rank: "3", rating: "998.4", lastChange: "-6" } as unknown as MyCompetition;
    expect(toMyCompetitionItems({ ...empty, competitions: [raw] })[0]).toMatchObject({ rank: 3, rating: 998.4, lastChange: -6 });
  });
});

import type { LifecycleStatusView, MyCompetitionView, TodoItemView } from "@hema/ui";
import type { MeHome, TodoBout } from "../api-types";

/**
 * One block on the home screen. The app picks which blocks to show and in what order (see `homeBlocks`),
 * so a tournament mode can later put its own "now relevant" blocks first without changing the views.
 * Add a kind here and a renderer in `screens/home.ts`.
 */
export type HomeBlock =
  | { kind: "todo"; items: TodoItemView[] }
  | { kind: "my-competitions"; items: MyCompetitionView[] }
  /** The fighter is in no competition yet: point them to Competitions. */
  | { kind: "no-competitions" };

/** Makes one block from the home data, or null when it has nothing to show. */
export type HomeBlockSource = (home: MeHome) => HomeBlock | null;

/** What to do, only when there is something to do. */
export const todoBlock: HomeBlockSource = (home) => {
  const items = toTodoItems(home);
  return items.length > 0 ? { kind: "todo", items } : null;
};

/** My competitions, or the pointer to Competitions when there are none. */
export const myCompetitionsBlock: HomeBlockSource = (home) =>
  home.competitions.length > 0 ? { kind: "my-competitions", items: toMyCompetitionItems(home) } : { kind: "no-competitions" };

/** The everyday home: to-do (if any), then my competitions. */
export const DEFAULT_HOME_BLOCKS: readonly HomeBlockSource[] = [todoBlock, myCompetitionsBlock];

export function homeBlocks(home: MeHome, sources: readonly HomeBlockSource[] = DEFAULT_HOME_BLOCKS): HomeBlock[] {
  return sources.map((source) => source(home)).filter((block): block is HomeBlock => block !== null);
}

/** Every to-do as one list, oldest first (ties keep the server's order: approve, objections, referee). */
export function toTodoItems(home: MeHome): TodoItemView[] {
  const items = [
    ...home.todo.toApprove.map((bout) => fromFighterSide("approve", bout)),
    ...home.todo.myObjections.map((bout) => fromFighterSide("objection", bout)),
    ...home.todo.toReferee.map(
      (bout): TodoItemView => ({
        kind: "referee",
        boutId: bout.boutId,
        competitionName: bout.competitionName,
        opponentName: `${bout.fighterA.name} – ${bout.fighterB.name}`,
        ownScore: Number(bout.scoreA),
        opponentScore: Number(bout.scoreB),
        since: bout.startedAt,
      }),
    ),
  ];
  // Array.prototype.sort is stable, so equal times keep their order.
  return items.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

function fromFighterSide(kind: "approve" | "objection", bout: TodoBout): TodoItemView {
  const mine = bout.side === "B" ? "B" : "A";
  return {
    kind,
    boutId: bout.boutId,
    competitionName: bout.competitionName,
    opponentName: mine === "A" ? bout.fighterB.name : bout.fighterA.name,
    ownScore: Number(mine === "A" ? bout.scoreA : bout.scoreB),
    opponentScore: Number(mine === "A" ? bout.scoreB : bout.scoreA),
    since: bout.startedAt,
  };
}

export function toMyCompetitionItems(home: MeHome): MyCompetitionView[] {
  return home.competitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
    status: competition.status as LifecycleStatusView,
    myStatus: competition.myStatus,
    rank: numberOrNull(competition.rank),
    rating: numberOrNull(competition.rating),
    lastChange: numberOrNull(competition.lastChange),
  }));
}

function numberOrNull(value: number | null): number | null {
  return value === null ? null : Number(value);
}

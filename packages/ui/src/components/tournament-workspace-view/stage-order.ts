import type { ApiStage, StageType } from "@hema/event-admin-api";

/** The order stage types follow in a tournament: pools first, the final last. */
export const STAGE_TYPE_ORDER: readonly StageType[] = ["POOL", "ELIMINATION", "SEMI_FINAL", "BRONZE_FINAL", "FINAL"];

type OrderedStage = Pick<ApiStage, "id" | "type" | "name">;

/**
 * A tournament's stages in the order they are fought: by type, then by name, then by id. This is the same
 * order the backend returns them in (`compareStageRows`), so the screen and the server agree.
 */
export function orderStages<T extends OrderedStage>(stages: readonly T[]): T[] {
  const rank = (type: StageType) => {
    const index = STAGE_TYPE_ORDER.indexOf(type);
    return index === -1 ? STAGE_TYPE_ORDER.length : index;
  };
  return [...stages].sort(
    (left, right) =>
      rank(left.type) - rank(right.type) || (left.name ?? "").localeCompare(right.name ?? "") || left.id.localeCompare(right.id),
  );
}

/** The stage after `stageId` in fighting order, or null when it is the last one (or unknown). */
export function nextStage<T extends OrderedStage>(stages: readonly T[], stageId: string): T | null {
  const ordered = orderStages(stages);
  const index = ordered.findIndex((stage) => stage.id === stageId);
  return index === -1 ? null : (ordered[index + 1] ?? null);
}

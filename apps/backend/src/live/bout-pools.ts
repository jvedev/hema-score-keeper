import type { DbExecutor } from "../db.js";

/**
 * Live bouts are grouped into pools by their scheduled phase: one stage on one ring in one time slot.
 * A bout whose phase was removed (scheduledPhaseId null) is "unscheduled" until the next projection removes it.
 */
export interface PooledBout {
  scheduledPhaseId: string | null;
}

export interface BoutPool<TBout extends PooledBout> {
  name: string;
  bouts: TBout[];
}

/** Pool display names by pool key; read them with `poolNameIn`. */
export type PoolNames = ReadonlyMap<string, string>;

const UNSCHEDULED_POOL_KEY = "";
const UNSCHEDULED_POOL_NAME = "Unscheduled";

function poolKeyOf(bout: PooledBout): string {
  return bout.scheduledPhaseId ?? UNSCHEDULED_POOL_KEY;
}

/** Whether two bouts are fought in the same pool. */
export function sameBoutPool(left: PooledBout, right: PooledBout): boolean {
  return poolKeyOf(left) === poolKeyOf(right);
}

/** The pool names of the given bouts: the stage name (or type) and the time slot label. */
export async function poolNamesOf(db: DbExecutor, bouts: readonly PooledBout[]): Promise<PoolNames> {
  const phaseIds = [...new Set(bouts.flatMap((bout) => (bout.scheduledPhaseId === null ? [] : [bout.scheduledPhaseId])))];
  if (phaseIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("ScheduledPhase")
    .innerJoin("Stage", "Stage.id", "ScheduledPhase.stageId")
    .innerJoin("ScheduleTimeSlot", "ScheduleTimeSlot.id", "ScheduledPhase.timeSlotId")
    .select(["ScheduledPhase.id as id", "Stage.name as stageName", "Stage.type as stageType", "ScheduleTimeSlot.label as slotLabel"])
    .where("ScheduledPhase.id", "in", phaseIds)
    .execute();
  return new Map(rows.map((row) => [row.id, `${row.stageName ?? row.stageType} · ${row.slotLabel}`] as const));
}

/** The display name of a bout's pool. */
export function poolNameIn(names: PoolNames, bout: PooledBout): string {
  return names.get(poolKeyOf(bout)) ?? UNSCHEDULED_POOL_NAME;
}

/** Groups bouts into their pools, in the order each pool first appears; the bouts keep their order. */
export function groupBoutsByPool<TBout extends PooledBout>(names: PoolNames, bouts: readonly TBout[]): BoutPool<TBout>[] {
  const pools = new Map<string, BoutPool<TBout>>();
  for (const bout of bouts) {
    const key = poolKeyOf(bout);
    const pool = pools.get(key) ?? { name: poolNameIn(names, bout), bouts: [] };
    pool.bouts.push(bout);
    pools.set(key, pool);
  }
  return [...pools.values()];
}

import { boutDisplay, parseRingRules, type BoutDisplay, type RingRules, type SideScore } from "@hema/competition-domain";
import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor } from "../db.js";
import { scoreOf, type ScoredExchange } from "./bout-score.js";

type LiveBoutRow = Selectable<BackendDatabase["LiveBout"]>;
const MAX_RUN_ON_SECONDS = 10;

export type RoundExchange = ScoredExchange & { round: number };

export function rulesOf(ruleset: string | null): RingRules {
  if (ruleset === null) return parseRingRules(null);
  try {
    return parseRingRules(JSON.parse(ruleset));
  } catch {
    return parseRingRules(null);
  }
}

export async function tournamentRules(db: DbExecutor, tournamentId: string): Promise<RingRules> {
  const row = await db.selectFrom("LiveTournament").select("ruleset").where("id", "=", tournamentId).executeTakeFirst();
  return rulesOf(row?.ruleset ?? null);
}

/** Each round's score (index 0 = round 1), up to the bout's current round. */
export function roundScores(exchanges: readonly RoundExchange[], currentRound: number): Array<SideScore & { doubles: number }> {
  const last = Math.max(currentRound, ...exchanges.map((exchange) => exchange.round));
  return Array.from({ length: last }, (_, index) => scoreOf(exchanges.filter((exchange) => exchange.round === index + 1)));
}

/** What a scoreboard shows for this bout now (`now` is server time; the break counts down from `periodStartedAt`). */
export function displayOf(rules: RingRules, bout: LiveBoutRow, exchanges: readonly RoundExchange[], now: Date): BoutDisplay {
  const since = bout.periodStartedAt ? (now.getTime() - Date.parse(bout.periodStartedAt)) / 1000 : 0;
  // A running clock is brought up to now from the keeper's last report (sent every 5 s), so a scoreboard shows the time
  // as it is. At most MAX_RUN_ON_SECONDS: when the keeper's reports stop, the scoreboard clock stops too.
  const ranFor = bout.clockRunning === 1 && bout.clockUpdatedAt ? Math.min(MAX_RUN_ON_SECONDS, Math.max(0, Math.floor((now.getTime() - Date.parse(bout.clockUpdatedAt)) / 1000))) : 0;
  return boutDisplay(rules, {
    phase: { round: bout.round, period: bout.period, extension: bout.extension },
    roundScores: roundScores(exchanges, bout.round),
    warnings: { left: bout.warningsLeft, right: bout.warningsRight },
    clock: { seconds: bout.clockSeconds + ranFor, running: bout.clockRunning === 1 },
    done: bout.status === "DONE",
    breakElapsedSeconds: Math.max(0, since),
  });
}

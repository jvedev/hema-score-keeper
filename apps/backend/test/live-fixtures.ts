import { expect } from "vitest";
import { insertDefaultEventColors } from "../src/events/event-colors.js";
import { bearer, type TestContext, type TestUser } from "./helpers.js";

/** One ring of the fixture; it becomes an Event-admin Arena with one scheduled phase. */
export interface LiveFixtureRing {
  key: string;
  name: string;
  /** Pins the ring's keeper link token after activation, so tests can use a known link. */
  keeperToken?: string;
  /** Pins the ring's scoreboard link token after activation. */
  scoreboardToken?: string;
}

/** One bout of the fixture; it becomes a scheduled Event-admin Match. Bouts are ordered per ring as listed. */
export interface LiveFixtureBout {
  key: string;
  ring: string;
  left: TestUser;
  right: TestUser;
}

export interface LiveFixtureInput {
  /** Tournament admin of the source tournament; activates live scoring. */
  admin: TestUser;
  name?: string;
  rings: readonly LiveFixtureRing[];
  bouts: readonly LiveFixtureBout[];
  /** Users assigned as TABLE on every ring's scheduled phase. */
  scorers?: readonly TestUser[];
}

export interface LiveFixture {
  sourceTournamentId: string;
  liveTournamentId: string;
  ringId(key: string): string;
  boutId(key: string): string;
  /** The Event-admin match of a bout. */
  matchId(key: string): string;
  /** The scheduled phase of a ring. */
  phaseId(ringKey: string): string;
}

const EVENT_ID = "fixture-event";
const TOURNAMENT_ID = "fixture-tournament";
const STAGE_ID = "fixture-stage";
const ROUND_ID = "fixture-round";
const SCHEDULE_ID = "fixture-schedule";
const SLOT_ID = "fixture-slot";
const CREATED_AT = "2026-11-17T10:00:00.000Z";

const arenaIdOf = (ringKey: string) => `arena-${ringKey}`;
const phaseIdOf = (ringKey: string) => `phase-${ringKey}`;
const matchIdOf = (boutKey: string) => `match-${boutKey}`;
const entryIdOf = (user: TestUser) => `entry-${user.id}`;

/**
 * Seeds an Event-admin tournament (one bracket stage, one time slot, one phase per ring) and activates live scoring
 * through `POST /api/v1/tournaments/:id/live`, the only way a live tournament comes into being.
 */
export async function createLiveTournament(ctx: TestContext, input: LiveFixtureInput): Promise<LiveFixture> {
  await seedSource(ctx, input);
  const activation = await ctx.app.inject({ method: "POST", url: `/api/v1/tournaments/${TOURNAMENT_ID}/live`, headers: bearer(input.admin) });
  expect(activation.statusCode, activation.body).toBe(200);
  const liveTournamentId = (activation.json() as { id: string }).id;
  await pinRingTokens(ctx, input.rings);

  const rings = await ctx.database.selectFrom("LiveRing").select(["id", "sourceArenaId"]).where("tournamentId", "=", liveTournamentId).execute();
  const bouts = await ctx.database.selectFrom("LiveBout").select(["id", "sourceMatchId"]).where("tournamentId", "=", liveTournamentId).execute();
  const ringIds = new Map(rings.map((ring) => [ring.sourceArenaId, ring.id] as const));
  const boutIds = new Map(bouts.map((bout) => [bout.sourceMatchId, bout.id] as const));
  return {
    sourceTournamentId: TOURNAMENT_ID,
    liveTournamentId,
    ringId: (key) => required(ringIds.get(arenaIdOf(key)), `ring ${key}`),
    boutId: (key) => required(boutIds.get(matchIdOf(key)), `bout ${key}`),
    matchId: matchIdOf,
    phaseId: phaseIdOf,
  };
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`The live fixture has no ${label}.`);
  return value;
}

async function seedSource(ctx: TestContext, input: LiveFixtureInput): Promise<void> {
  const { database } = ctx;
  await database.insertInto("Event").values({ id: EVENT_ID, eventName: "Fixture event", rulesetId: null, allFightersAreVolunteers: 0 }).execute();
  await insertDefaultEventColors(database, EVENT_ID);
  await database.insertInto("Tournament").values({
    id: TOURNAMENT_ID, eventId: EVENT_ID, createdByUserId: input.admin.id, name: input.name ?? "Tournament",
    rulesetId: null, currentStageId: null, order: 0, color: "#5B8CFF",
  }).execute();
  await database.insertInto("TournamentAdmin").values({ tournamentId: TOURNAMENT_ID, userId: input.admin.id, addedByUserId: input.admin.id, createdAt: CREATED_AT }).execute();
  await database.insertInto("Stage").values({
    id: STAGE_ID, tournamentId: TOURNAMENT_ID, type: "ELIMINATION", name: "Bracket", rulesetId: null,
    minPoolSize: null, maxPoolSize: null, preferredPoolSize: null, eliminationParticipantCount: null, timeBetweenMatchesMinutes: 2,
  }).execute();
  await database.insertInto("Round").values({ id: ROUND_ID, stageId: STAGE_ID, roundNumber: 1 }).execute();
  await database.insertInto("EventSchedule").values({ id: SCHEDULE_ID, eventId: EVENT_ID, startTimeMinutes: 540, currentTimeSlotId: null }).execute();
  await database.insertInto("ScheduleTimeSlot").values({ id: SLOT_ID, scheduleId: SCHEDULE_ID, order: 1, durationMinutes: 60, label: "Slot 1", color: null, isBreak: 0 }).execute();

  for (const [index, ring] of input.rings.entries()) {
    await database.insertInto("Arena").values({
      id: arenaIdOf(ring.key), eventId: EVENT_ID, name: ring.name, order: index + 1, leftColor: "#d62828", rightColor: "#2f7dfa",
    }).execute();
    await database.insertInto("ScheduledPhase").values({ id: phaseIdOf(ring.key), stageId: STAGE_ID, arenaId: arenaIdOf(ring.key), timeSlotId: SLOT_ID }).execute();
    for (const scorer of input.scorers ?? []) {
      await database.insertInto("ScheduledAssignment").values({
        id: `assignment-${ring.key}-${scorer.id}`, scheduledPhaseId: phaseIdOf(ring.key), userId: scorer.id, role: "TABLE",
      }).execute();
    }
  }

  const fighters = new Map(input.bouts.flatMap((bout) => [bout.left, bout.right]).map((user) => [user.id, user] as const));
  for (const [index, fighter] of [...fighters.values()].entries()) {
    await database.insertInto("Entry").values({ id: entryIdOf(fighter), tournamentId: TOURNAMENT_ID, userId: fighter.id, kind: "FIGHTER", seed: index + 1 }).execute();
  }

  const orderByRing = new Map<string, number>();
  for (const bout of input.bouts) {
    const order = (orderByRing.get(bout.ring) ?? 0) + 1;
    orderByRing.set(bout.ring, order);
    await database.insertInto("Match").values({
      id: matchIdOf(bout.key), roundId: ROUND_ID, arenaId: arenaIdOf(bout.ring), entryAId: entryIdOf(bout.left), entryBId: entryIdOf(bout.right),
      winnerEntryId: null, scoreA: null, scoreB: null, rulesetId: null,
    }).execute();
    await database.insertInto("ScheduledMatch").values({ matchId: matchIdOf(bout.key), scheduledPhaseId: phaseIdOf(bout.ring), order }).execute();
  }
}

async function pinRingTokens(ctx: TestContext, rings: readonly LiveFixtureRing[]): Promise<void> {
  for (const ring of rings) {
    const tokens = {
      ...(ring.keeperToken ? { keeperToken: ring.keeperToken } : {}),
      ...(ring.scoreboardToken ? { scoreboardToken: ring.scoreboardToken } : {}),
    };
    if (Object.keys(tokens).length === 0) continue;
    await ctx.database.updateTable("LiveRing").set(tokens).where("sourceArenaId", "=", arenaIdOf(ring.key)).execute();
  }
}

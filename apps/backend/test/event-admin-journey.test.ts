import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

/**
 * Phase 7 journey of the unified Event-admin, through the real HTTP routes only: an organiser creates an Event,
 * its arenas and a tournament; adds eight fighters; schedules the pools so the planner generates them; enters every
 * pool result; fills the elimination bracket and plays it to the final (winners advance on their own); and deletes
 * the Event, which removes the tournament but only detaches the rating Competition. Access is checked on the way.
 */
describe("Event-admin journey: from a new Event to a finished bracket", () => {
  let ctx: TestContext;
  let organizer: TestUser;
  let outsider: TestUser;
  const fighters: TestUser[] = [];

  beforeEach(async () => {
    ctx = await createTestContext();
    organizer = await insertUser(ctx.database, { id: "organizer", role: "COMPETITION_ADMIN", name: "Organizer" });
    outsider = await insertUser(ctx.database, { id: "outsider", role: "USER", name: "Outsider" });
    fighters.length = 0;
    for (let index = 1; index <= 8; index += 1) {
      fighters.push(await insertUser(ctx.database, { id: `fighter-${index}`, role: "USER", name: `Fighter ${index}` }));
    }
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const call = async (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object, user: TestUser = organizer) => {
    const response = await ctx.app.inject({ method, url, headers: bearer(user), ...(payload ? { payload } : {}) });
    return { status: response.statusCode, body: response.body ? (response.json() as any) : null };
  };
  const ok = async (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) => {
    const response = await call(method, url, payload);
    expect(response.status, `${method} ${url}: ${JSON.stringify(response.body)}`).toBeLessThan(300);
    return response.body;
  };

  type Match = { id: string; entryAId: string | null; entryBId: string | null; winnerEntryId: string | null; scoreA: number | null; bracketRound: number | null; bracketPosition: number | null; bracketKind: string | null };
  const stageMatches = async (eventId: string, stageId: string): Promise<Match[]> => {
    const event = await ok("GET", `/api/v1/events/${eventId}`);
    const stage = event.tournaments.flatMap((t: any) => t.stages).find((s: any) => s.id === stageId);
    return stage.rounds.flatMap((round: any) => round.matches);
  };

  it("plays a whole tournament and keeps the Competition when the Event goes", async () => {
    // Event, arenas, tournament: the organiser is Event admin and tournament admin; an outsider is neither.
    const event = await ok("POST", "/api/v1/events", { eventName: "Spring Open" });
    const eventId: string = event.id;
    expect((await call("POST", "/api/v1/arenas", { eventId, name: "Hijack", order: 9 }, outsider)).status).toBe(403);
    const red = await ok("POST", "/api/v1/arenas", { eventId, name: "Red", order: 1 });
    const blue = await ok("POST", "/api/v1/arenas", { eventId, name: "Blue", order: 2 });
    const tournament = await ok("POST", "/api/v1/tournaments", { eventId, name: "Open Longsword" });
    expect(tournament.stages.map((stage: any) => stage.type)).toEqual(["POOL", "ELIMINATION"]);
    const poolStage = tournament.stages.find((stage: any) => stage.type === "POOL");
    const bracketStage = tournament.stages.find((stage: any) => stage.type === "ELIMINATION");
    expect(tournament.currentStageId).toBe(poolStage.id);
    await ok("PATCH", `/api/v1/stages/${poolStage.id}`, { minPoolSize: 4, preferredPoolSize: 4, maxPoolSize: 4 });
    await ok("PATCH", `/api/v1/stages/${bracketStage.id}`, { eliminationParticipantCount: 4 });

    // Eight fighters (seeds 1–8); an outsider may not add entries.
    expect((await call("POST", "/api/v1/entries", { tournamentId: tournament.id, userId: fighters[0]!.id, kind: "FIGHTER" }, outsider)).status).toBe(403);
    for (const [index, fighter] of fighters.entries()) {
      await ok("POST", "/api/v1/entries", { tournamentId: tournament.id, userId: fighter.id, kind: "FIGHTER", seed: index + 1 });
    }

    // Schedule the pools on both rings in one time slot and assign the fighters as the planner does (odd seeds on
    // Red, even seeds on Blue): the planner generates two pools of four.
    const poolSlot = await ok("POST", `/api/v1/events/${eventId}/schedule/slots`, { durationMinutes: 60, label: "Pools" });
    const poolPhases: any[] = [];
    for (const arena of [red, blue]) poolPhases.push(await ok("POST", "/api/v1/scheduled-phases", { stageId: poolStage.id, arenaId: arena.id, timeSlotId: poolSlot.id }));
    for (const [index, fighter] of fighters.entries()) {
      await ok("POST", `/api/v1/scheduled-phases/${poolPhases[index % 2].id}/assignments`, { userId: fighter.id, role: "FIGHTER" });
    }
    const pools = await stageMatches(eventId, poolStage.id);
    expect(pools).toHaveLength(12);
    const fightersPerArena = new Map<string, Set<string>>();
    for (const match of pools as any[]) {
      const set = fightersPerArena.get(match.arenaId) ?? new Set();
      set.add(match.entryAId);
      set.add(match.entryBId);
      fightersPerArena.set(match.arenaId, set);
    }
    expect([...fightersPerArena.values()].map((set) => set.size)).toEqual([4, 4]);

    // Bracket cannot be filled while pools are open.
    const early = await call("POST", `/api/v1/stages/${bracketStage.id}/bracket`);
    expect(early.status).toBe(409);
    expect(early.body.error).toContain("0 of 12 matches fought");

    // Every pool match: the entry with the lower seed wins.
    const seedOf = new Map<string, number>((await ok("GET", `/api/v1/events/${eventId}`)).tournaments[0].entries.map((entry: any) => [entry.id, entry.seed]));
    const better = (a: string, b: string) => ((seedOf.get(a) ?? 99) < (seedOf.get(b) ?? 99) ? a : b);
    for (const match of pools) {
      const winner = better(match.entryAId!, match.entryBId!);
      const winnerIsA = winner === match.entryAId;
      await ok("POST", `/api/v1/matches/${match.id}/complete`, { winnerEntryId: winner, scoreA: winnerIsA ? 5 : 2, scoreB: winnerIsA ? 2 : 5, exchanges: [{ scoreA: winnerIsA ? 5 : 2, scoreB: winnerIsA ? 2 : 5, details: null }] });
    }

    // Move on to the bracket and fill it: the two pool winners and the two seconds, pools kept apart.
    await ok("PATCH", `/api/v1/tournaments/${tournament.id}`, { currentStageId: bracketStage.id });
    await ok("POST", `/api/v1/stages/${bracketStage.id}/bracket`);
    let bracket = await stageMatches(eventId, bracketStage.id);
    const semis = bracket.filter((match) => match.bracketRound === 0);
    expect(semis).toHaveLength(2);
    // Pool winners are seeds 1 (Red) and 2 (Blue), seconds 3 (Red) and 4 (Blue): 1 v 4 and 2 v 3, pools apart.
    const bySeed = (match: Match) => [seedOf.get(match.entryAId!), seedOf.get(match.entryBId!)];
    expect(semis.sort((a, b) => a.bracketPosition! - b.bracketPosition!).map(bySeed)).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(bracket.filter((match) => match.bracketRound === 1).map((match) => match.bracketKind).sort()).toEqual(["BRONZE", "MAIN"]);

    // Plan the semi-finals on the red ring, then play them: winners to the final, losers to the bronze match.
    const finalsSlot = await ok("POST", `/api/v1/events/${eventId}/schedule/slots`, { durationMinutes: 60, label: "Finals" });
    const finalsPhase = await ok("POST", "/api/v1/scheduled-phases", { stageId: bracketStage.id, arenaId: red.id, timeSlotId: finalsSlot.id });
    for (const [order, semi] of semis.entries()) await ok("PUT", `/api/v1/matches/${semi.id}/schedule`, { scheduledPhaseId: finalsPhase.id, order: order + 1 });
    for (const semi of semis) {
      await ok("POST", `/api/v1/matches/${semi.id}/complete`, { winnerEntryId: semi.entryAId, scoreA: 5, scoreB: 3, exchanges: [{ scoreA: 5, scoreB: 3, details: null }] });
    }
    bracket = await stageMatches(eventId, bracketStage.id);
    const final = bracket.find((match) => match.bracketKind === "MAIN" && match.bracketRound === 1)!;
    const bronze = bracket.find((match) => match.bracketKind === "BRONZE")!;
    expect([final.entryAId, final.entryBId]).toEqual([semis[0]!.entryAId, semis[1]!.entryAId]);
    expect([bronze.entryAId, bronze.entryBId]).toEqual([semis[0]!.entryBId, semis[1]!.entryBId]);
    expect((await call("POST", `/api/v1/stages/${bracketStage.id}/bracket`)).status).toBe(409);

    // The final decides the tournament; the pool results are still there.
    await ok("POST", `/api/v1/matches/${final.id}/complete`, { winnerEntryId: final.entryBId, scoreA: 4, scoreB: 6, exchanges: [{ scoreA: 4, scoreB: 6, details: null }] });
    expect((await stageMatches(eventId, bracketStage.id)).find((match) => match.id === final.id)!.winnerEntryId).toBe(final.entryBId);
    expect((await stageMatches(eventId, poolStage.id)).every((match) => match.winnerEntryId !== null)).toBe(true);

    // A rating Competition for the Event survives the Event's deletion, detached and with its admin.
    const competition = await ok("POST", `/api/v1/events/${eventId}/competitions`, { name: "Spring Ladder", slug: "spring-ladder", date: "2027-04-01" });
    expect((await call("DELETE", `/api/v1/events/${eventId}`, undefined, outsider)).status).toBe(403);
    await ok("DELETE", `/api/v1/events/${eventId}`);
    expect((await call("GET", `/api/v1/events/${eventId}`)).status).toBe(404);
    expect(await ctx.database.selectFrom("Tournament").select("id").where("id", "=", tournament.id).executeTakeFirst()).toBeUndefined();
    const kept = await ok("GET", `/api/v1/competitions/${competition.id}`);
    expect(kept).toMatchObject({ name: "Spring Ladder", eventId: null, eventName: null });
  });
});

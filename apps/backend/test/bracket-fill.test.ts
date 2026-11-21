import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

/**
 * Two pools of four (pool A on arena a1, pool B on a2); in each pool the lower-numbered fighter wins every
 * match, pool A by bigger margins, so seeding by pool place gives f1, f5, f2, f6, f3, f7, f4, f8.
 */
describe("filling an elimination bracket", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let outsider: TestUser;

  async function setup(options: { bracketCount?: number | null; poolsFinished?: boolean; bracket?: Record<string, unknown>; finalStages?: boolean } = {}) {
    const db = ctx.database;
    await db.insertInto("Event").values({ id: "ev", eventName: "Day", rulesetId: null, allFightersAreVolunteers: 0 }).execute();
    await db.insertInto("Arena").values([
      { id: "a2", eventId: "ev", name: "Blue", order: 2 },
      { id: "a1", eventId: "ev", name: "Red", order: 1 },
    ] as never).execute();
    await db
      .insertInto("Ruleset")
      .values({ id: "rs", eventId: "ev", name: "Rules", version: 1, definition: options.bracket ? JSON.stringify({ bracket: options.bracket }) : null })
      .execute();
    await db
      .insertInto("Tournament")
      .values({ id: "t", eventId: "ev", createdByUserId: admin.id, name: "Open", rulesetId: "rs", currentStageId: null, order: 0, color: "#000000" })
      .execute();
    await db.insertInto("TournamentAdmin").values({ tournamentId: "t", userId: admin.id, addedByUserId: admin.id, createdAt: "2026-11-20T10:00:00.000Z" }).execute();
    const stage = (id: string, type: string, eliminationParticipantCount: number | null = null) => ({
      id,
      tournamentId: "t",
      type,
      name: id,
      rulesetId: null,
      minPoolSize: type === "POOL" ? 4 : null,
      maxPoolSize: type === "POOL" ? 4 : null,
      preferredPoolSize: type === "POOL" ? 4 : null,
      eliminationParticipantCount,
      timeBetweenMatchesMinutes: 2,
    });
    await db
      .insertInto("Stage")
      .values([
        stage("pools", "POOL"),
        stage("bracket", "ELIMINATION", options.bracketCount === undefined ? 8 : options.bracketCount),
        ...(options.finalStages ? [stage("bronze", "BRONZE_FINAL"), stage("final", "FINAL")] : []),
      ] as never)
      .execute();
    for (let index = 1; index <= 8; index += 1) {
      await insertUser(db, { id: `u${index}`, role: "USER", name: `Fighter ${index}` });
      await db.insertInto("Entry").values({ id: `f${index}`, tournamentId: "t", userId: `u${index}`, kind: "FIGHTER", seed: null } as never).execute();
    }
    await db.insertInto("Round").values({ id: "pool-round", stageId: "pools", roundNumber: 0 }).execute();
    let matchNumber = 0;
    for (const [arenaId, fighters, margin] of [
      ["a1", ["f1", "f2", "f3", "f4"], 5],
      ["a2", ["f5", "f6", "f7", "f8"], 3],
    ] as const) {
      for (let i = 0; i < fighters.length; i += 1) {
        for (let j = i + 1; j < fighters.length; j += 1) {
          matchNumber += 1;
          const finished = options.poolsFinished !== false || matchNumber > 1;
          await db
            .insertInto("Match")
            .values({
              id: `pm${matchNumber}`,
              roundId: "pool-round",
              arenaId,
              entryAId: fighters[i]!,
              entryBId: fighters[j]!,
              winnerEntryId: finished ? fighters[i]! : null,
              scoreA: finished ? margin : null,
              scoreB: finished ? 0 : null,
              rulesetId: null,
            })
            .execute();
        }
      }
    }
  }

  const fill = (stageId = "bracket", user: TestUser = admin) =>
    ctx.app.inject({ method: "POST", url: `/api/v1/stages/${stageId}/bracket`, headers: bearer(user) });

  async function bracketMatches(stageIds: string[] = ["bracket"]) {
    return ctx.database
      .selectFrom("Match")
      .innerJoin("Round", "Round.id", "Match.roundId")
      .select(["Match.id", "Round.stageId", "Round.roundNumber", "Match.bracketRound", "Match.bracketPosition", "Match.bracketKind", "Match.entryAId", "Match.entryBId"])
      .where("Round.stageId", "in", stageIds)
      .orderBy("Match.bracketRound")
      .orderBy("Match.bracketKind", "desc")
      .orderBy("Match.bracketPosition")
      .execute();
  }

  beforeEach(async () => {
    ctx = await createTestContext();
    admin = await insertUser(ctx.database, { id: "admin", role: "USER" });
    outsider = await insertUser(ctx.database, { id: "outsider", role: "USER" });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("seeds eight fighters from two pools and lays out the whole bracket with a bronze match", async () => {
    await setup();
    const response = await fill();
    expect(response.statusCode).toBe(200);
    expect(response.json().rounds.map((round: { roundNumber: number }) => round.roundNumber)).toEqual([0, 1, 2]);
    const matches = await bracketMatches();
    expect(matches.map((m) => [m.bracketRound, m.bracketPosition, m.bracketKind, m.entryAId, m.entryBId])).toEqual([
      [0, 0, "MAIN", "f1", "f8"],
      [0, 1, "MAIN", "f6", "f3"],
      [0, 2, "MAIN", "f5", "f4"],
      [0, 3, "MAIN", "f2", "f7"],
      [1, 0, "MAIN", null, null],
      [1, 1, "MAIN", null, null],
      [2, 0, "MAIN", null, null],
      [2, 0, "BRONZE", null, null],
    ]);
  });

  it("gives the top seeds a bye straight into the second round", async () => {
    await setup({ bracketCount: 6 });
    expect((await fill()).statusCode).toBe(200);
    const matches = await bracketMatches();
    expect(matches.filter((m) => m.bracketRound === 0).map((m) => [m.bracketPosition, m.entryAId, m.entryBId])).toEqual([
      [1, "f6", "f3"],
      [3, "f2", "f7"],
    ]);
    // Seeds 1 (f1) and 2 (f5) have the byes.
    expect(matches.filter((m) => m.bracketRound === 1).map((m) => [m.bracketPosition, m.entryAId, m.entryBId])).toEqual([
      [0, "f1", null],
      [1, "f5", null],
    ]);
  });

  it("refuses while the pools are not finished", async () => {
    await setup({ poolsFinished: false });
    const response = await fill();
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("11 of 12 matches fought");
    expect(await bracketMatches()).toEqual([]);
  });

  it("refuses a stage that is not an elimination stage, and people who do not manage the tournament", async () => {
    await setup();
    expect((await fill("pools")).statusCode).toBe(409);
    expect((await fill("bracket", outsider)).statusCode).toBe(403);
  });

  it("fills again while nothing was fought, and refuses once a bracket match has a result", async () => {
    await setup();
    await fill();
    const first = (await bracketMatches()).map((m) => m.id);
    expect((await fill()).statusCode).toBe(200);
    const second = await bracketMatches();
    expect(second).toHaveLength(first.length);
    expect(second.some((m) => first.includes(m.id))).toBe(false);

    await ctx.database.updateTable("Match").set({ scoreA: 3, scoreB: 1, winnerEntryId: "f1" }).where("id", "=", second[0]!.id).execute();
    const refused = await fill();
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toContain("has started");
  });

  it("leaves out the bronze match when the ruleset says so", async () => {
    await setup({ bracket: { bronzeMatch: false } });
    await fill();
    expect((await bracketMatches()).some((m) => m.bracketKind === "BRONZE")).toBe(false);
  });

  it("puts the final and the bronze match in their own stages when the ruleset asks for it", async () => {
    await setup({ bracket: { separateFinalStages: true }, finalStages: true });
    expect((await fill()).statusCode).toBe(200);
    const matches = await bracketMatches(["bracket", "bronze", "final"]);
    expect(matches.filter((m) => m.stageId === "bracket").map((m) => m.bracketRound)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(matches.filter((m) => m.stageId === "final").map((m) => [m.roundNumber, m.bracketRound, m.bracketKind])).toEqual([[0, 2, "MAIN"]]);
    expect(matches.filter((m) => m.stageId === "bronze").map((m) => [m.roundNumber, m.bracketRound, m.bracketKind])).toEqual([[0, 2, "BRONZE"]]);
  });

  it("explains what is missing when the ruleset wants separate final stages that do not exist", async () => {
    await setup({ bracket: { separateFinalStages: true } });
    const response = await fill();
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("no Final stage");
  });

  it("refuses an unknown rule name from the ruleset", async () => {
    await setup({ bracket: { pairing: "random" } });
    const response = await fill();
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('Unknown pairing rule "random"');
  });

  describe("advancing winners", () => {
    const complete = (matchId: string, winner: string, scoreA = 3, scoreB = 1) =>
      ctx.app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/complete`,
        headers: bearer(admin),
        payload: { winnerEntryId: winner, scoreA, scoreB, exchanges: [{ scoreA, scoreB, details: null }] },
      });
    const at = async (round: number, position: number, kind = "MAIN") =>
      (await bracketMatches()).find((m) => m.bracketRound === round && m.bracketPosition === position && m.bracketKind === kind)!;

    it("moves winners to the next round and semi-final losers to the bronze match", async () => {
      await setup();
      await fill();
      // Quarter-finals: f1-f8, f6-f3, f5-f4, f2-f7.
      for (const [position, winner] of [[0, "f1"], [1, "f3"], [2, "f5"], [3, "f2"]] as const) {
        expect((await complete((await at(0, position)).id, winner)).statusCode).toBe(200);
      }
      expect(await at(1, 0)).toMatchObject({ entryAId: "f1", entryBId: "f3" });
      expect(await at(1, 1)).toMatchObject({ entryAId: "f5", entryBId: "f2" });

      await complete((await at(1, 0)).id, "f3");
      await complete((await at(1, 1)).id, "f5");
      expect(await at(2, 0)).toMatchObject({ entryAId: "f3", entryBId: "f5" });
      expect(await at(2, 0, "BRONZE")).toMatchObject({ entryAId: "f1", entryBId: "f2" });
    });

    it("moves a fighter with a bye on when the second-round opponent is decided", async () => {
      await setup({ bracketCount: 6 });
      await fill();
      // Round 1 position 1 was f6-f3; its winner joins f1 (bye) in round 2 position 0, side B.
      await complete((await at(0, 1)).id, "f3");
      expect(await at(1, 0)).toMatchObject({ entryAId: "f1", entryBId: "f3" });
    });

    it("refuses a result that would change who plays in a match that has already started", async () => {
      await setup();
      await fill();
      for (const [position, winner] of [[0, "f1"], [1, "f3"]] as const) await complete((await at(0, position)).id, winner);
      const semi = await at(1, 0);
      await complete(semi.id, "f1");
      // Correcting the quarter-final to f6 would change the semi-final that is already fought: refused, nothing changes.
      await ctx.database.updateTable("Match").set({ scoreA: null, scoreB: null, winnerEntryId: null }).where("id", "=", (await at(0, 1)).id).execute();
      await ctx.database.deleteFrom("Exchange").where("matchId", "=", (await at(0, 1)).id).execute();
      const refused = await complete((await at(0, 1)).id, "f6");
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toContain("already started");
      expect((await at(1, 0)).entryBId).toBe("f3");
      const quarter = await ctx.database.selectFrom("Match").select("winnerEntryId").where("id", "=", (await at(0, 1)).id).executeTakeFirstOrThrow();
      expect(quarter.winnerEntryId).toBeNull();
    });

    it("leaves pool matches alone", async () => {
      await setup({ poolsFinished: false });
      expect((await complete("pm1", "f1")).statusCode).toBe(200);
      expect(await bracketMatches()).toEqual([]);
    });
  });
});


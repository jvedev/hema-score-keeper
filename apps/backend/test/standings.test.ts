import { replayRatings } from "@hema/competition-domain";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer } from "./helpers.js";
import { boutAction, countedBout, createBoutWorld, recordBout, type BoutWorld } from "./bout-fixtures.js";

let world: BoutWorld;

interface Standing {
  participantId: string;
  name: string;
  userId: string | null;
  rating: number;
  bouts: number;
  wins: number;
  losses: number;
  position: number;
}

async function standings(competitionId: string): Promise<Record<string, Standing>> {
  const response = await world.ctx.app.inject({ method: "GET", url: `/api/v1/competitions/${competitionId}/standings` });
  expect(response.statusCode).toBe(200);
  return Object.fromEntries((response.json() as Standing[]).map((row) => [row.userId ?? row.participantId, row]));
}

const pid = (competitionId: string, userId: string): string => `${competitionId}:${userId}`;

beforeEach(async () => {
  world = await createBoutWorld();
});

describe("competition standings", () => {
  it("replays counted bouts in order", async () => {
    await countedBout(world); // f1 beats f2
    world.clock.advance(60_000);
    await countedBout(world, { scoreA: 1, scoreB: 4, winnerSide: "B" }); // f2 beats f1

    const expected = replayRatings([
      { id: "1", fighterAId: "a", fighterBId: "b", winnerId: "a", foughtAt: "2026-10-15T20:00:00.000Z", counts: true },
      { id: "2", fighterAId: "a", fighterBId: "b", winnerId: "b", foughtAt: "2026-10-15T20:01:00.000Z", counts: true },
    ]).ratings;
    const rows = await standings("X");
    expect(rows.f1!.rating).toBe(expected.get("a"));
    expect(rows.f2!.rating).toBe(expected.get("b"));
    expect(rows.f1).toMatchObject({ bouts: 2, wins: 1, losses: 1, name: "f1" });
    expect(rows.f3).toMatchObject({ rating: 1000, bouts: 0 });
  });

  it("objection removes the bout from every competition", async () => {
    const id = await countedBout(world);
    expect((await standings("X")).f1!.rating).toBe(1016);
    expect((await standings("Y")).f1!.rating).toBe(1016);

    await boutAction(world, "f2", id, "objection", { reason: "Double" });
    expect((await standings("X")).f1!.rating).toBe(1000);
    expect((await standings("Y")).f2!.rating).toBe(1000);

    await boutAction(world, "ownerY", id, "resolution", { kind: "restore" });
    expect((await standings("X")).f1!.rating).toBe(1016);
    expect((await standings("Y")).f1!.rating).toBe(1016);
  });

  it("mixes legacy and new bouts in date order", async () => {
    await world.ctx.database
      .insertInto("CompetitionBout")
      .values({
        id: "legacy-1",
        competitionId: "X",
        fighterAId: pid("X", "f1"),
        fighterBId: pid("X", "f2"),
        scoreA: 5,
        scoreB: 2,
        winnerParticipantId: pid("X", "f1"),
        date: "2026-10-01",
        published: 1,
        details: "{}",
      })
      .execute();
    await countedBout(world, { scoreA: 1, scoreB: 4, winnerSide: "B" }); // 2026-10-15, f2 beats f1

    const expected = replayRatings([
      { id: "legacy-1", fighterAId: "a", fighterBId: "b", winnerId: "a", foughtAt: "2026-10-01", counts: true },
      { id: "new", fighterAId: "a", fighterBId: "b", winnerId: "b", foughtAt: "2026-10-15T20:00:00.000Z", counts: true },
    ]).ratings;
    const rows = await standings("X");
    expect(rows.f1!.rating).toBe(expected.get("a"));

    const history = await world.ctx.app.inject({ method: "GET", url: "/api/v1/competitions/X/bout-history" });
    expect(history.statusCode).toBe(200);
    const entries = history.json() as Array<{ id: string; source: string; status: string; ratingChange: unknown }>;
    expect(entries.map((entry) => entry.source)).toEqual(["BOUT", "LEGACY"]);
    expect(entries[1]).toMatchObject({ id: "legacy-1", status: "FINAL" });
    expect(entries[0]!.ratingChange).not.toBeNull();
  });

  it("lists voided and unapproved bouts without counting them", async () => {
    await recordBout(world); // still SCORED
    const voided = await countedBout(world);
    await boutAction(world, "ref", voided, "void", { reason: "Injury" });

    expect((await standings("X")).f1).toMatchObject({ rating: 1000, bouts: 0 });
    const history = await world.ctx.app.inject({ method: "GET", url: "/api/v1/competitions/X/bout-history" });
    const statuses = (history.json() as Array<{ status: string; ratingChange: unknown }>).map((entry) => [entry.status, entry.ratingChange]);
    expect(statuses.sort()).toEqual([
      ["SCORED", null],
      ["VOIDED", null],
    ]);
  });

  it("tells the history who approved, the ring and where the bout started", async () => {
    await countedBout(world, { ring: "Ring 2" });
    const history = await world.ctx.app.inject({ method: "GET", url: "/api/v1/competitions/X/bout-history" });
    expect((history.json() as Array<Record<string, unknown>>)[0]).toMatchObject({
      approvals: { referee: true, A: false, B: false },
      ring: "Ring 2",
      startedInCompetitionId: "X",
    });
  });

  it("keeps the old ranking endpoint in line with standings", async () => {
    await countedBout(world);
    const ranking = await world.ctx.app.inject({ method: "GET", url: "/api/v1/competitions/X/ranking" });
    const byParticipant = Object.fromEntries((ranking.json() as Array<{ participantId: string; rating: number }>).map((row) => [row.participantId, row.rating]));
    expect(byParticipant[pid("X", "f1")]).toBe(1016);
    expect(byParticipant[pid("X", "f2")]).toBe(984);
  });

  it("keeps a fighter who left in the standings, marked left", async () => {
    await countedBout(world, { alsoCountIn: [] });
    const response = await world.ctx.app.inject({ method: "DELETE", url: "/api/v1/competitions/X/signup", headers: bearer(world.users.f2!) });
    expect(response.json()).toEqual({ status: "LEFT" });

    const rows = await standings("X");
    expect(rows.f2).toMatchObject({ rating: 984, bouts: 1, left: true });
    expect(rows.f1).toMatchObject({ rating: 1016, left: false });
  });

  describe("a fighter who left and asked to come back", () => {
    async function leaveAndAskBack(): Promise<Record<string, Standing>> {
      await world.ctx.database
        .insertInto("CompetitionBout")
        .values({
          id: "legacy-1",
          competitionId: "X",
          fighterAId: pid("X", "f1"),
          fighterBId: pid("X", "f2"),
          scoreA: 5,
          scoreB: 2,
          winnerParticipantId: pid("X", "f1"),
          date: "2026-10-01",
          published: 1,
          details: "{}",
        })
        .execute();
      await countedBout(world, { alsoCountIn: [] });
      await world.ctx.app.inject({ method: "DELETE", url: "/api/v1/competitions/X/signup", headers: bearer(world.users.f2!) });
      const before = await standings("X");
      await world.ctx.database.updateTable("Competition").set({ signupsNeedApproval: 1 }).where("id", "=", "X").execute();
      const again = await world.ctx.app.inject({ method: "POST", url: "/api/v1/competitions/X/signup", headers: bearer(world.users.f2!), payload: {} });
      expect(again.json()).toEqual({ status: "PENDING" });
      return before;
    }

    async function expectHistoryKept(before: Record<string, Standing>): Promise<void> {
      const after = await standings("X");
      expect(after.f2).toMatchObject({ participantId: pid("X", "f2"), rating: before.f2!.rating, bouts: 2, left: true });
      expect(after.f1!.rating).toBe(before.f1!.rating);
      const legacy = await world.ctx.database.selectFrom("CompetitionBout").select("id").where("id", "=", "legacy-1").executeTakeFirst();
      expect(legacy).toBeDefined();
    }

    it("declining keeps their history", async () => {
      const before = await leaveAndAskBack();
      const response = await world.ctx.app.inject({
        method: "POST",
        url: `/api/v1/competitions/X/participants/${encodeURIComponent(pid("X", "f2"))}/decision`,
        headers: bearer(world.users.ownerX!),
        payload: { accept: false },
      });
      expect(response.json()).toEqual({ participantId: pid("X", "f2"), status: "LEFT" });
      await expectHistoryKept(before);
    });

    it("withdrawing keeps their history", async () => {
      const before = await leaveAndAskBack();
      const response = await world.ctx.app.inject({ method: "DELETE", url: "/api/v1/competitions/X/signup", headers: bearer(world.users.f2!) });
      expect(response.json()).toEqual({ status: "LEFT" });
      await expectHistoryKept(before);
    });
  });

  it("leaves pending sign-ups out of the standings", async () => {
    await world.ctx.database.updateTable("CompetitionParticipant").set({ status: "PENDING" }).where("id", "=", pid("X", "f3")).execute();
    expect((await standings("X")).f3).toBeUndefined();
  });
});

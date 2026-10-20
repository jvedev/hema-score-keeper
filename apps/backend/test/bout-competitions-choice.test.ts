import { beforeEach, describe, expect, it } from "vitest";
import { bearer, insertCompetition } from "./helpers.js";
import { createBoutWorld, type BoutWorld } from "./bout-fixtures.js";

let world: BoutWorld;

function record(overrides: Record<string, unknown>) {
  return world.ctx.app.inject({
    method: "POST",
    url: "/api/v1/bouts",
    headers: bearer(world.users.ref!),
    payload: {
      fighterAUserId: "f1",
      fighterBUserId: "f2",
      refereeUserId: "ref",
      startedAt: world.clock.now().toISOString(),
      scoreA: 5,
      scoreB: 3,
      winnerSide: "A",
      startedInCompetitionId: "X",
      ...overrides,
    },
  });
}

function options(query: string) {
  return world.ctx.app.inject({
    method: "GET",
    url: `/api/v1/bouts/competition-options?${query}`,
    headers: bearer(world.users.ref!),
  });
}

const competitionIds = (response: { json(): unknown }) => (response.json() as { competitionIds: string[] }).competitionIds;

beforeEach(async () => {
  world = await createBoutWorld();
  // N: running, both enrolled, but doesn't accept bouts fought for other competitions.
  await insertCompetition(world.ctx.database, { id: "N", status: "RUNNING", userIds: ["f1", "f2"] });
  await world.ctx.database.updateTable("Competition").set({ acceptsOtherBouts: 0 }).where("id", "=", "N").execute();
  // C: closed, both enrolled.
  await insertCompetition(world.ctx.database, { id: "C", status: "CLOSED", userIds: ["f1", "f2"] });
});

describe("choosing where a bout counts", () => {
  it("counts in the competition it was fought for and the ticked ones", async () => {
    expect(competitionIds(await record({ alsoCountIn: ["Y"] }))).toEqual(["X", "Y"]);
  });

  it("counts only where it was fought when nothing is ticked", async () => {
    expect(competitionIds(await record({ alsoCountIn: [] }))).toEqual(["X"]);
    expect(competitionIds(await record({}))).toEqual(["X"]);
  });

  it("refuses competitions that don't accept", async () => {
    expect((await record({ alsoCountIn: ["N"] })).statusCode).toBe(400);
    expect((await record({ alsoCountIn: ["C"] })).statusCode).toBe(400);
    expect((await record({ fighterBUserId: "f3", alsoCountIn: ["Y"] })).statusCode).toBe(400);
  });

  it("needs the competition the bout is fought for", async () => {
    expect((await record({ startedInCompetitionId: undefined })).statusCode).toBe(400);
    expect((await record({ startedInCompetitionId: "C" })).statusCode).toBe(400);
    expect((await record({ startedInCompetitionId: "W" })).statusCode).toBe(400);
  });
});

describe("GET /api/v1/bouts/competition-options", () => {
  it("returns the ruleset to fight with and the competitions it can also count in", async () => {
    await world.ctx.database.updateTable("Competition").set({ rulesetJson: JSON.stringify({ weaponClass: "longsword" }) }).where("id", "=", "X").execute();
    const response = await options("fighterA=f1&fighterB=f2&startedIn=X");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      startedIn: { id: "X", name: "X", rulesetJson: { weaponClass: "longsword" } },
      others: [{ id: "Y", name: "Y" }],
    });
  });

  it("refuses a competition the pair can't fight for", async () => {
    expect((await options("fighterA=f1&fighterB=f2&startedIn=C")).statusCode).toBe(400);
    expect((await options("fighterA=f1&fighterB=f2&startedIn=W")).statusCode).toBe(400);
  });

  it("needs a login", async () => {
    const response = await world.ctx.app.inject({ method: "GET", url: "/api/v1/bouts/competition-options?fighterA=f1&fighterB=f2&startedIn=X" });
    expect(response.statusCode).toBe(401);
  });
});

describe("the accept-other-bouts setting", () => {
  it("can be switched off by the owner", async () => {
    const response = await world.ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/competitions/Y",
      headers: bearer(world.users.ownerY!),
      payload: { acceptsOtherBouts: false },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { acceptsOtherBouts: boolean }).acceptsOtherBouts).toBe(false);
  });
});

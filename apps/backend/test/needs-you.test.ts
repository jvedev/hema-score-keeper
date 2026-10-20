import { beforeEach, describe, expect, it } from "vitest";
import { bearer } from "./helpers.js";
import { boutAction, countedBout, createBoutWorld, recordBout, type BoutWorld } from "./bout-fixtures.js";

let world: BoutWorld;

interface NeedsYou {
  objections: Array<{ boutId: string; competitionName: string; fighterA: string; fighterB: string; objectedBy: string; reason: string | null }>;
  awaitingReferee: Array<{ boutId: string; competitionName: string; refereeName: string; scoreA: number; scoreB: number }>;
}

async function needsYou(as: string) {
  return world.ctx.app.inject({ method: "GET", url: "/api/v1/admin/needs-you", headers: bearer(world.users[as]!) });
}

beforeEach(async () => {
  world = await createBoutWorld();
});

describe("GET /api/v1/admin/needs-you", () => {
  it("lists open objections for the competitions an admin manages", async () => {
    const id = await countedBout(world, { alsoCountIn: [] });
    await boutAction(world, "f2", id, "objection", { reason: "Last exchange was a double" });

    const response = await needsYou("ownerX");
    expect(response.statusCode).toBe(200);
    expect((response.json() as NeedsYou).objections).toEqual([
      expect.objectContaining({ boutId: id, competitionName: "X", fighterA: "F1", fighterB: "F2", objectedBy: "B", reason: "Last exchange was a double" }),
    ]);
  });

  it("shows nothing to admins of other competitions", async () => {
    const id = await countedBout(world, { alsoCountIn: [] });
    await boutAction(world, "f2", id, "objection", { reason: "Double" });
    expect(await needsYou("ownerW").then((response) => response.json())).toEqual({ objections: [], awaitingReferee: [] });
  });

  it("lists bouts still waiting for the referee", async () => {
    const id = await recordBout(world, { alsoCountIn: [] });
    const awaiting = (await needsYou("ownerX").then((response) => response.json()) as NeedsYou).awaitingReferee;
    expect(awaiting).toEqual([expect.objectContaining({ boutId: id, refereeName: "REF", scoreA: 5, scoreB: 3 })]);
  });

  it("lists a bout that counts in two of my competitions once", async () => {
    await world.ctx.database.insertInto("CompetitionAdmin").values({ competitionId: "Y", userId: "ownerX", role: "CO_ADMIN" }).execute();
    await recordBout(world); // counts in X and Y
    expect((await needsYou("ownerX").then((response) => response.json()) as NeedsYou).awaitingReferee).toHaveLength(1);
  });

  it("shows everything to a system admin", async () => {
    await recordBout(world);
    expect((await needsYou("sys").then((response) => response.json()) as NeedsYou).awaitingReferee).toHaveLength(1);
  });

  it("refuses plain users", async () => {
    expect((await needsYou("f1")).statusCode).toBe(403);
  });
});

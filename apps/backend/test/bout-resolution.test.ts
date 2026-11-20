import { beforeEach, describe, expect, it } from "vitest";
import { bearer } from "./helpers.js";
import { boutAction, countedBout, createBoutWorld, type BoutWorld } from "./bout-fixtures.js";

let world: BoutWorld;
let boutId: string;

function resolve(as: string, payload: Record<string, unknown>) {
  return boutAction(world, as, boutId, "resolution", payload);
}

beforeEach(async () => {
  world = await createBoutWorld();
  boutId = await countedBout(world); // f1 vs f2: counts in X and Y
  await boutAction(world, "f2", boutId, "objection", { reason: "Last exchange was a double" });
});

describe("resolving an objection", () => {
  it("lets an admin of the Event that X belongs to resolve it, even with a USER account", async () => {
    const { database } = world.ctx;
    await database.insertInto("Event").values({ id: "ev", eventName: "Ev", rulesetId: null, allFightersAreVolunteers: 0 }).execute();
    await database.updateTable("Competition").set({ eventId: "ev" }).where("id", "=", "X").execute();
    await database
      .insertInto("EventAdmin")
      .values({ eventId: "ev", userId: "outsider", addedByUserId: "outsider", createdAt: "2026-11-20T10:00:00.000Z" })
      .execute();
    const response = await resolve("outsider", { kind: "restore" });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("COUNTED");
  });

  it("refuses an Event admin when none of the bout's competitions belong to their Event", async () => {
    const { database } = world.ctx;
    await database.insertInto("Event").values({ id: "ev", eventName: "Ev", rulesetId: null, allFightersAreVolunteers: 0 }).execute();
    await database
      .insertInto("EventAdmin")
      .values({ eventId: "ev", userId: "outsider", addedByUserId: "outsider", createdAt: "2026-11-20T10:00:00.000Z" })
      .execute();
    expect((await resolve("outsider", { kind: "restore" })).statusCode).toBe(403);
  });

  it("restores the bout", async () => {
    const response = await resolve("ownerX", { kind: "restore" });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("COUNTED");
  });

  it("corrects the result, keeps the old one and starts a new window", async () => {
    world.clock.advance(60 * 60 * 1000);
    const response = await resolve("ownerX", {
      kind: "correct",
      result: { scoreA: 4, scoreB: 4, winnerSide: null, warningsA: 0, warningsB: 0, exchanges: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "COUNTED",
      revision: 2,
      scoreA: 4,
      scoreB: 4,
      winnerSide: null,
      windowEndsAt: "2026-10-18T21:00:00.000Z",
      objection: null,
    });

    const revisions = await world.ctx.app.inject({
      method: "GET",
      url: `/api/v1/bouts/${boutId}/revisions`,
      headers: bearer(world.users.f1!),
    });
    expect(revisions.statusCode).toBe(200);
    expect(revisions.json()).toEqual([
      {
        revision: 1,
        scoreA: 5,
        scoreB: 3,
        winnerSide: "A",
        warningsA: 0,
        warningsB: 0,
        exchanges: [],
        replacedAt: "2026-10-15T21:00:00.000Z",
        replacedBy: { userId: "ownerX", name: "ownerX" },
      },
    ]);
  });

  it("validates a correction like a new result", async () => {
    const response = await resolve("ownerX", {
      kind: "correct",
      result: { scoreA: 2, scoreB: 3, winnerSide: "A", exchanges: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it("voids the bout with a reason", async () => {
    expect((await resolve("ownerX", { kind: "void" })).statusCode).toBe(400);
    const response = await resolve("ownerX", { kind: "void", reason: "Fighters agreed to refight" });
    expect((response.json() as { status: string }).status).toBe("VOIDED");
  });

  it("forbids admins of other competitions", async () => {
    expect((await resolve("ownerW", { kind: "restore" })).statusCode).toBe(403);
    expect((await resolve("f1", { kind: "restore" })).statusCode).toBe(403);
    expect((await resolve("coY", { kind: "restore" })).statusCode).toBe(200);
  });

  it("refuses to resolve a bout that isn't objected", async () => {
    await resolve("ownerX", { kind: "restore" });
    expect((await resolve("ownerX", { kind: "restore" })).statusCode).toBe(409);
  });

  it("rejects an unknown resolution", async () => {
    expect((await resolve("ownerX", { kind: "shrug" })).statusCode).toBe(400);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { bearer, insertClub, insertCompetition, insertUser } from "./helpers.js";
import { boutAction, countedBout, createBoutWorld, recordBout, type BoutWorld } from "./bout-fixtures.js";

let world: BoutWorld;

const WARNING_EXCHANGES = [
  { atSeconds: 10, kind: "SCORE", side: "A", points: 3, reason: null },
  { atSeconds: 20, kind: "WARNING", side: "B", points: 0, reason: "Strike to the back of the head" },
  { atSeconds: 30, kind: "SCORE", side: "A", points: 2, reason: null },
];

function get(as: string | null, url: string) {
  return world.ctx.app.inject({ method: "GET", url, headers: as === null ? {} : bearer(world.users[as]!) });
}

interface Todo {
  boutId: string;
  side: "A" | "B" | null;
  startedAt: string;
  competitionName: string | null;
}
interface Home {
  todo: { toApprove: Todo[]; myObjections: Todo[]; toReferee: Todo[] };
  competitions: Array<{ id: string; myStatus: string; rank: number | null; rating: number | null; lastChange: number | null }>;
}

async function home(as: string): Promise<Home> {
  const response = await get(as, "/api/v1/me/home");
  expect(response.statusCode).toBe(200);
  return response.json() as Home;
}

beforeEach(async () => {
  world = await createBoutWorld();
});

describe("fighter view of a bout", () => {
  it("fighter view hides others' warnings", async () => {
    const id = await countedBout(world, { warningsB: 1, exchanges: WARNING_EXCHANGES });
    const url = `/api/v1/competitions/X/bouts/${id}/view`;

    // f3 is in the competition but not in this bout.
    const response = await get("f3", url);
    const outsider = response.json() as { warningsA: unknown; warningsB: unknown; exchanges: Array<{ kind: string }>; scoreA: number };
    expect(outsider.warningsA).toBeNull();
    expect(outsider.warningsB).toBeNull();
    expect(outsider.exchanges.map((exchange) => exchange.kind)).toEqual(["SCORE", "SCORE"]);
    expect(outsider.scoreA).toBe(5);
    expect(response.body).not.toContain("back of the head");
    expect((await get(null, url)).body).not.toContain("back of the head");

    // Table officials may see the bout, but not its private details.
    const tableView = await get("table", url);
    expect(tableView.statusCode).toBe(200);
    const table = tableView.json() as { warningsA: unknown; warningsB: unknown; exchanges: Array<{ kind: string }> };
    expect(table.warningsA).toBeNull();
    expect(table.warningsB).toBeNull();
    expect(table.exchanges.map((exchange) => exchange.kind)).not.toContain("WARNING");
    expect(tableView.body).not.toContain("back of the head");

    for (const involved of ["f1", "f2", "ref", "jury1", "ownerX", "ownerY", "sys"]) {
      const view = (await get(involved, url)).json() as { warningsB: number; exchanges: Array<{ kind: string }> };
      expect(view.warningsB, involved).toBe(1);
      expect(view.exchanges.map((exchange) => exchange.kind), involved).toContain("WARNING");
    }
  });

  it("objection reason only for those involved", async () => {
    const id = await countedBout(world);
    expect((await boutAction(world, "f2", id, "objection", { reason: "The third point was a double hit" })).statusCode).toBe(200);
    const url = `/api/v1/competitions/X/bouts/${id}/view`;

    const outsider = (await get("f3", url)).json() as { status: string; objection: { by: string; reason: unknown } | null };
    expect(outsider.status).toBe("OBJECTED");
    expect(outsider.objection).toMatchObject({ by: "B", reason: null });
    expect((await get("f3", url)).body).not.toContain("double hit");
    expect((await get(null, url)).body).not.toContain("double hit");

    expect((await get("table", url)).body).not.toContain("double hit");
    expect(((await get("table", url)).json() as { objection: { reason: unknown } }).objection.reason).toBeNull();

    for (const involved of ["f1", "f2", "ref", "jury1", "ownerX", "sys"]) {
      const view = (await get(involved, url)).json() as { objection: { reason: string } };
      expect(view.objection.reason, involved).toBe("The third point was a double hit");
    }
  });

  it("is open to anyone who may see the competition, and only for bouts in it", async () => {
    const id = await recordBout(world, { alsoCountIn: [] }); // X only
    expect((await get(null, `/api/v1/competitions/X/bouts/${id}/view`)).statusCode).toBe(200);
    expect((await get("outsider", `/api/v1/competitions/X/bouts/${id}/view`)).statusCode).toBe(200);
    expect((await get("f3", `/api/v1/competitions/Y/bouts/${id}/view`)).statusCode).toBe(404);
    expect((await get("f3", "/api/v1/competitions/X/bouts/nope/view")).statusCode).toBe(404);

    await world.ctx.database.updateTable("Competition").set({ visibility: "CLUB_ONLY" }).where("id", "=", "X").execute();
    expect((await get("outsider", `/api/v1/competitions/X/bouts/${id}/view`)).statusCode).toBe(404);
  });
});

describe("standings warnings", () => {
  it("only show on the viewer's own row, for admins on every row", async () => {
    await countedBout(world, { warningsA: 1, warningsB: 2, exchanges: WARNING_EXCHANGES });
    const warnings = async (as: string | null) =>
      Object.fromEntries(
        ((await get(as, "/api/v1/competitions/X/standings")).json() as Array<{ userId: string; warnings: number | null }>).map((row) => [
          row.userId,
          row.warnings,
        ]),
      );

    expect(await warnings("f1")).toEqual({ f1: 1, f2: null, f3: null });
    expect(await warnings("f2")).toEqual({ f1: null, f2: 2, f3: null });
    expect(await warnings("f3")).toEqual({ f1: null, f2: null, f3: 0 });
    expect(await warnings(null)).toEqual({ f1: null, f2: null, f3: null });
    expect(await warnings("ownerX")).toEqual({ f1: 1, f2: 2, f3: 0 });
    expect(await warnings("sys")).toEqual({ f1: 1, f2: 2, f3: 0 });
    // A competition admin elsewhere has no extra rights here.
    expect(await warnings("ownerW")).toEqual({ f1: null, f2: null, f3: null });
  });
});

describe("GET /me/home", () => {
  it("needs a login", async () => {
    expect((await get(null, "/api/v1/me/home")).statusCode).toBe(401);
    expect((await get(null, "/api/v1/me/joinable")).statusCode).toBe(401);
  });

  it("has an empty to-do when there is nothing to do", async () => {
    const result = await home("outsider");
    expect(result.todo).toEqual({ toApprove: [], myObjections: [], toReferee: [] });
    expect(result.competitions).toEqual([]);
  });

  it("lists bouts to approve, to referee and own objections, oldest first", async () => {
    const first = await recordBout(world); // f1 vs f2, ref
    world.clock.advance(60_000);
    const second = await recordBout(world, { fighterAUserId: "f3", fighterBUserId: "f1", scoreA: 1, scoreB: 4, winnerSide: "B", alsoCountIn: [] });

    // Not yet approved by the referee: the referee has them to do, fighters don't.
    expect((await home("ref")).todo.toReferee.map((item) => item.boutId)).toEqual([first, second]);
    expect((await home("f1")).todo.toApprove).toEqual([]);

    for (const id of [first, second]) {
      await boutAction(world, "ref", id, "referee-approval", { fightersApprovedOnSpot: { A: false, B: false } });
    }
    expect((await home("ref")).todo.toReferee).toEqual([]);

    const f1 = await home("f1");
    expect(f1.todo.toApprove.map((item) => [item.boutId, item.side])).toEqual([
      [first, "A"],
      [second, "B"],
    ]);
    expect(f1.todo.toApprove[0]).toMatchObject({ competitionName: "X" });
    expect((await home("f3")).todo.toApprove.map((item) => item.boutId)).toEqual([second]);
    expect((await home("outsider")).todo.toApprove).toEqual([]);

    // Approved: gone from the list. Objection: moves to my objections.
    await boutAction(world, "f1", first, "approval");
    expect((await home("f1")).todo.toApprove.map((item) => item.boutId)).toEqual([second]);
    await boutAction(world, "f1", second, "objection", { reason: "Wrong score" });
    const after = await home("f1");
    expect(after.todo.toApprove).toEqual([]);
    expect(after.todo.myObjections.map((item) => item.boutId)).toEqual([second]);
    // The other fighter doesn't have that objection as theirs.
    expect((await home("f3")).todo.myObjections).toEqual([]);
  });

  it("drops bouts whose three days have passed", async () => {
    const id = await recordBout(world);
    await boutAction(world, "ref", id, "referee-approval", { fightersApprovedOnSpot: { A: false, B: false } });
    expect((await home("f2")).todo.toApprove).toHaveLength(1);
    world.clock.advance(3 * 24 * 60 * 60 * 1000 + 1000);
    expect((await home("f2")).todo.toApprove).toEqual([]);
  });

  it("shows my competitions with my status, rank, rating and last change", async () => {
    await countedBout(world); // f1 beats f2 in X and Y
    const db = world.ctx.database;
    await insertCompetition(db, { id: "Z", status: "RUNNING", userIds: [], adminUserId: "ownerW" });
    await db
      .insertInto("CompetitionParticipant")
      .values({
        id: "Z:f1",
        competitionId: "Z",
        name: "f1",
        displayName: null,
        linkedUserEmail: null,
        linkedUserEmailHash: null,
        clubId: null,
        userId: "f1",
        kind: "MEMBER",
        status: "PENDING",
      })
      .execute();
    await db.updateTable("CompetitionParticipant").set({ status: "LEFT" }).where("id", "=", "Y:f1").execute();

    const byId = Object.fromEntries((await home("f1")).competitions.map((competition) => [competition.id, competition]));
    expect(Object.keys(byId).sort()).toEqual(["X", "Y", "Z"]);
    expect(byId.X).toMatchObject({ myStatus: "ACTIVE", rank: 1, rating: 1016, lastChange: 16 });
    expect(byId.Y).toMatchObject({ myStatus: "LEFT", rank: 1, rating: 1016 });
    expect(byId.Z).toMatchObject({ myStatus: "PENDING", rank: null, rating: null, lastChange: null });
    expect((await home("f2")).competitions.find((competition) => competition.id === "X")).toMatchObject({ rank: 3, rating: 984 });
  });
});

describe("GET /me/joinable", () => {
  it("lists what checkJoin lets me into", async () => {
    const db = world.ctx.database;
    await insertClub(db, { id: "c1" });
    world.users.member = await insertUser(db, { id: "member", role: "USER", clubId: "c1" });
    await insertCompetition(db, { id: "open", status: "REGISTRATION_OPEN", userIds: [], adminUserId: "ownerW" });
    await insertCompetition(db, { id: "full", status: "REGISTRATION_OPEN", userIds: ["f1"], adminUserId: "ownerW" });
    await db.updateTable("Competition").set({ placeLimit: 1 }).where("id", "=", "full").execute();
    await insertCompetition(db, { id: "draft", status: "DRAFT", userIds: [], adminUserId: "ownerW" });
    await insertCompetition(db, { id: "closed", status: "CLOSED", userIds: [], adminUserId: "ownerW" });
    await insertCompetition(db, { id: "clubOnly", status: "REGISTRATION_OPEN", userIds: [], adminUserId: "ownerW" });
    await db.updateTable("Competition").set({ scopeKind: "CLUB", scopeValuesJson: '["c1"]' }).where("id", "=", "clubOnly").execute();
    await insertCompetition(db, { id: "hidden", status: "REGISTRATION_OPEN", userIds: [], adminUserId: "ownerW" });
    await db.updateTable("Competition").set({ visibility: "CLUB_ONLY", clubId: "c1" }).where("id", "=", "hidden").execute();

    const ids = async (as: string) =>
      ((await get(as, "/api/v1/me/joinable")).json() as Array<{ id: string }>).map((competition) => competition.id).filter((id) => id !== "competition-1").sort(); // competition-1 is the seeded demo competition

    // Running competitions count too; W, X and Y are not full. f1 is already in X, Y and full.
    expect(await ids("outsider")).toEqual(["W", "X", "Y", "open"]);
    expect(await ids("member")).toEqual(["W", "X", "Y", "clubOnly", "hidden", "open"]);
    expect(await ids("f1")).toEqual(["W", "open"]);
    // Leaving makes a competition joinable again.
    await db.updateTable("CompetitionParticipant").set({ status: "LEFT" }).where("id", "=", "X:f1").execute();
    expect(await ids("f1")).toEqual(["W", "X", "open"]);
  });
});

describe("table officials", () => {
  it("get no warnings or objection reason from GET /bouts/:id either", async () => {
    const id = await countedBout(world, { warningsB: 1, exchanges: WARNING_EXCHANGES });
    await boutAction(world, "f2", id, "objection", { reason: "The third point was a double hit" });
    const table = await get("table", `/api/v1/bouts/${id}`);
    expect(table.statusCode).toBe(200);
    expect(table.body).not.toContain("double hit");
    expect(table.body).not.toContain("back of the head");
    expect((table.json() as { warningsB: unknown }).warningsB).toBeNull();
    expect((await get("jury1", `/api/v1/bouts/${id}`)).body).toContain("double hit");
    expect((await get("table", `/api/v1/bouts/${id}/revisions`)).statusCode).toBe(200);
  });
});

describe("the recorder", () => {
  it("sees the warnings they entered, though neither referee nor jury", async () => {
    const response = await world.ctx.app.inject({
      method: "POST",
      url: "/api/v1/bouts",
      headers: bearer(world.users.outsider!),
      payload: {
        fighterAUserId: "f1",
        fighterBUserId: "f2",
        refereeUserId: "ref",
        juryUserIds: [],
        tableUserIds: [],
        startedAt: world.clock.now().toISOString(),
        scoreA: 5,
        scoreB: 3,
        winnerSide: "A",
        warningsB: 1,
        exchanges: WARNING_EXCHANGES,
        startedInCompetitionId: "X",
        alsoCountIn: [],
      },
    });
    const id = (response.json() as { id: string }).id;
    for (const url of [`/api/v1/bouts/${id}`, `/api/v1/competitions/X/bouts/${id}/view`]) {
      const view = (await get("outsider", url)).json() as { warningsB: number; exchanges: Array<{ kind: string }> };
      expect(view.warningsB, url).toBe(1);
      expect(view.exchanges.map((exchange) => exchange.kind), url).toContain("WARNING");
    }
    expect(((await get("f3", `/api/v1/competitions/X/bouts/${id}/view`)).json() as { warningsB: unknown }).warningsB).toBeNull();
  });
});

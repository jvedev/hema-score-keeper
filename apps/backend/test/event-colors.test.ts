import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertEventAdmin, insertUser, type TestContext, type TestUser } from "./helpers.js";
import { createLiveTournament } from "./live-fixtures.js";

const RED = "#d62828";
const BLUE = "#2f7dfa";

interface PaletteColor {
  id: string;
  name: string | null;
  preset: string | null;
  hex: string;
  order: number;
}

describe("Event colour palette", () => {
  let ctx: TestContext;
  let creator: TestUser;
  let coAdmin: TestUser;
  let other: TestUser;
  let systemAdmin: TestUser;
  let eventId: string;

  function send(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, as: TestUser | null, payload?: unknown) {
    return ctx.app.inject({ method, url, payload: payload as object | undefined, headers: as ? bearer(as) : {} });
  }

  async function palette(): Promise<PaletteColor[]> {
    const events = (await send("GET", "/api/v1/events", creator)).json() as Array<{ id: string; colors: PaletteColor[] }>;
    return events.find((event) => event.id === eventId)!.colors;
  }

  async function addColor(as: TestUser | null, name: unknown, hex: unknown) {
    return send("POST", `/api/v1/events/${eventId}/colors`, as, { name, hex });
  }

  beforeEach(async () => {
    ctx = await createTestContext();
    creator = await insertUser(ctx.database, { id: "creator", role: "USER", name: "Creator" });
    coAdmin = await insertUser(ctx.database, { id: "co-admin", role: "USER", name: "Co admin" });
    other = await insertUser(ctx.database, { id: "other", role: "USER", name: "Other" });
    systemAdmin = await insertUser(ctx.database, { id: "system", role: "SYSTEM_ADMIN", name: "System" });
    eventId = (await send("POST", "/api/v1/events", creator, { eventName: "Cup" })).json().id as string;
    await insertEventAdmin(ctx.database, { eventId, userId: coAdmin.id, addedByUserId: creator.id });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("a new Event starts with red and blue, named by the apps", async () => {
    expect(await palette()).toEqual([
      expect.objectContaining({ name: null, preset: "RED", hex: RED, order: 0 }),
      expect.objectContaining({ name: null, preset: "BLUE", hex: BLUE, order: 1 }),
    ]);
  });

  it("event admins and system admins manage the palette; others may not", async () => {
    expect((await addColor(null, "Geel", "#ffd400")).statusCode).toBe(401);
    expect((await addColor(other, "Geel", "#ffd400")).statusCode).toBe(403);
    const added = await addColor(coAdmin, " Geel ", "#FFD400");
    expect(added.statusCode).toBe(200);
    expect(added.json().colors.at(-1)).toMatchObject({ name: "Geel", preset: null, hex: "#ffd400", order: 2 });
    expect((await addColor(systemAdmin, "Wit", "#ffffff")).statusCode).toBe(200);
    expect((await send("POST", "/api/v1/events/nope/colors", creator, { name: "X", hex: "#000000" })).statusCode).toBe(404);

    const [red] = await palette();
    expect((await send("PATCH", `/api/v1/event-colors/${red!.id}`, other, { name: "Rood" })).statusCode).toBe(403);
    expect((await send("PATCH", `/api/v1/event-colors/${red!.id}`, creator, { name: "Scharlaken" })).json().colors[0]).toMatchObject({ name: "Scharlaken", preset: "RED" });
    expect((await send("PATCH", "/api/v1/event-colors/nope", creator, { name: "X" })).statusCode).toBe(404);
  });

  it("validates names and colours", async () => {
    expect((await addColor(creator, "", "#ffd400")).statusCode).toBe(400);
    expect((await addColor(creator, undefined, "#ffd400")).statusCode).toBe(400);
    expect((await addColor(creator, "x".repeat(41), "#ffd400")).statusCode).toBe(400);
    expect((await addColor(creator, "Geel", "yellow")).statusCode).toBe(400);
    expect((await addColor(creator, "Rood bis", RED.toUpperCase())).statusCode).toBe(409);
    const [red] = await palette();
    expect((await send("PATCH", `/api/v1/event-colors/${red!.id}`, creator, { hex: BLUE })).statusCode).toBe(409);
    expect((await send("PATCH", `/api/v1/event-colors/${red!.id}`, creator, { hex: "#12345" })).statusCode).toBe(400);
  });

  it("reorders with a full list of the event's colours", async () => {
    await addColor(creator, "Geel", "#ffd400");
    const [red, blue, yellow] = await palette();
    const order = (colorIds: unknown) => send("PUT", `/api/v1/events/${eventId}/colors/order`, creator, { colorIds });
    expect((await order([yellow!.id, red!.id]))).toMatchObject({ statusCode: 400 });
    expect((await order([yellow!.id, red!.id, red!.id]))).toMatchObject({ statusCode: 400 });
    expect((await order([yellow!.id, red!.id, "nope"]))).toMatchObject({ statusCode: 400 });
    expect((await send("PUT", `/api/v1/events/${eventId}/colors/order`, other, { colorIds: [yellow!.id, red!.id, blue!.id] })).statusCode).toBe(403);
    const reordered = await order([yellow!.id, red!.id, blue!.id]);
    expect(reordered.json().colors.map((color: PaletteColor) => color.hex)).toEqual(["#ffd400", RED, BLUE]);
  });

  it("keeps at least two colours and refuses to remove one in use", async () => {
    const [red, blue] = await palette();
    expect((await send("DELETE", `/api/v1/event-colors/${blue!.id}`, creator)).json()).toMatchObject({ reason: "TOO_FEW_COLORS" });
    await addColor(creator, "Geel", "#ffd400");
    const yellow = (await palette())[2]!;
    // An arena with the defaults uses red and blue.
    await send("POST", "/api/v1/arenas", creator, { eventId, name: "Arena 1" });
    const inUse = await send("DELETE", `/api/v1/event-colors/${red!.id}`, creator);
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json()).toMatchObject({ reason: "COLOR_IN_USE" });
    expect((await send("DELETE", `/api/v1/event-colors/${yellow.id}`, other)).statusCode).toBe(403);
    const removed = await send("DELETE", `/api/v1/event-colors/${yellow.id}`, creator);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().colors).toHaveLength(2);
  });

  it("arenas default to the first two colours and only take palette colours that differ", async () => {
    const created = await send("POST", "/api/v1/arenas", creator, { eventId, name: "Arena 1" });
    expect(created.json()).toMatchObject({ leftColor: RED, rightColor: BLUE });
    const arenaId = created.json().id as string;
    expect((await send("POST", "/api/v1/arenas", creator, { eventId, name: "Arena 2", leftColor: "#21c15b" })).statusCode).toBe(400);
    expect((await send("POST", "/api/v1/arenas", creator, { eventId, name: "Arena 2", leftColor: BLUE, rightColor: BLUE })).statusCode).toBe(400);
    expect((await send("PATCH", `/api/v1/arenas/${arenaId}`, creator, { leftColor: "#000000" })).statusCode).toBe(400);
    expect((await send("PATCH", `/api/v1/arenas/${arenaId}`, creator, { leftColor: BLUE })).statusCode).toBe(400);
    expect((await send("PATCH", `/api/v1/arenas/${arenaId}`, creator, { leftColor: BLUE.toUpperCase(), rightColor: RED })).json()).toMatchObject({ leftColor: BLUE, rightColor: RED });
    expect((await send("PATCH", `/api/v1/arenas/${arenaId}`, creator, { name: "Arena A" })).json()).toMatchObject({ name: "Arena A", leftColor: BLUE });
  });

  it("a changed colour follows into the arenas and live rings that use it", async () => {
    await ctx.app.close();
    ctx = await createTestContext();
    const admin = await insertUser(ctx.database, { id: "admin", role: "SYSTEM_ADMIN" });
    const tournamentAdmin = await insertUser(ctx.database, { id: "t-admin", role: "USER" });
    const left = await insertUser(ctx.database, { id: "l", role: "USER" });
    const right = await insertUser(ctx.database, { id: "r", role: "USER" });
    const live = await createLiveTournament(ctx, { admin: tournamentAdmin, rings: [{ key: "one", name: "Ring 1" }], bouts: [{ key: "b", ring: "one", left, right }] });
    const red = await ctx.database.selectFrom("EventColor").selectAll().where("hex", "=", RED).executeTakeFirstOrThrow();
    const changed = await send("PATCH", `/api/v1/event-colors/${red.id}`, admin, { hex: "#b00020" });
    expect(changed.statusCode).toBe(200);
    expect(await ctx.database.selectFrom("Arena").select(["leftColor", "rightColor"]).where("eventId", "=", red.eventId).execute()).toEqual([{ leftColor: "#b00020", rightColor: BLUE }]);
    expect(await ctx.database.selectFrom("LiveRing").select(["leftColor", "rightColor"]).where("id", "=", live.ringId("one")).executeTakeFirstOrThrow()).toEqual({ leftColor: "#b00020", rightColor: BLUE });
  });
});

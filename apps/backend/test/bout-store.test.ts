import { OBJECTION_WINDOW_MS } from "@hema/competition-domain";
import { beforeEach, describe, expect, it } from "vitest";
import { lifecycleColumns, loadBout, toLifecycle } from "../src/bouts/bout-store.js";
import { HttpError } from "../src/http.js";
import { createTestContext, insertUser, type TestContext } from "./helpers.js";

const start = new Date("2026-10-15T20:00:00.000Z");
const at = (ms: number): Date => new Date(start.getTime() + ms);

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
  for (const id of ["f1", "f2", "ref"]) {
    await insertUser(ctx.database, { id, role: "USER" });
  }
  await ctx.database
    .insertInto("Bout")
    .values({
      id: "bout-1",
      fighterAUserId: "f1",
      fighterBUserId: "f2",
      refereeUserId: "ref",
      tableUserId: null,
      ring: null,
      startedAt: start.toISOString(),
      scoreA: 5,
      scoreB: 3,
      winnerSide: "A",
      warningsA: 0,
      warningsB: 0,
      exchangesJson: "[]",
      startedInCompetitionId: null,
      createdByUserId: "ref",
      status: "COUNTED",
      revision: 1,
      windowStartedAt: start.toISOString(),
      fighterApprovedA: 1,
      fighterApprovedB: 0,
      objectionBy: null,
      objectionAt: null,
      objectionReason: null,
      voidReason: null,
    })
    .execute();
});

describe("bout store", () => {
  it("maps a row to the domain lifecycle and back", async () => {
    const row = await loadBout(ctx.database, "bout-1", at(1000));
    const lifecycle = toLifecycle(row);

    expect(lifecycle).toEqual({
      status: "COUNTED",
      revision: 1,
      windowStartedAt: start.toISOString(),
      fighterApproved: { A: true, B: false },
      objection: null,
      voidReason: null,
    });
    expect(lifecycleColumns(lifecycle)).toEqual({
      status: "COUNTED",
      revision: 1,
      windowStartedAt: start.toISOString(),
      fighterApprovedA: 1,
      fighterApprovedB: 0,
      objectionBy: null,
      objectionAt: null,
      voidReason: null,
    });
  });

  it("leaves a bout inside its window alone", async () => {
    expect((await loadBout(ctx.database, "bout-1", at(60 * 60 * 1000))).status).toBe("COUNTED");
  });

  it("settles and saves a bout whose window has passed", async () => {
    expect((await loadBout(ctx.database, "bout-1", at(OBJECTION_WINDOW_MS))).status).toBe("FINAL");
    const stored = await ctx.database.selectFrom("Bout").select("status").where("id", "=", "bout-1").executeTakeFirstOrThrow();
    expect(stored.status).toBe("FINAL");
  });

  it("answers 404 for an unknown bout", async () => {
    await expect(loadBout(ctx.database, "nope", start)).rejects.toMatchObject({ statusCode: 404 });
    await expect(loadBout(ctx.database, "nope", start)).rejects.toBeInstanceOf(HttpError);
  });
});

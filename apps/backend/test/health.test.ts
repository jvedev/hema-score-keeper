import { describe, expect, it } from "vitest";
import { createTestContext, insertClub } from "./helpers.js";

describe("test harness", () => {
  it("serves the health check from an in-memory app", async () => {
    const { app } = await createTestContext();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("gives every context its own database", async () => {
    const first = await createTestContext();
    const second = await createTestContext();
    await insertClub(first.database, { id: "club-1" });

    const inSecond = await second.database.selectFrom("Club").selectAll().where("id", "=", "club-1").execute();
    expect(inSecond).toEqual([]);
  });
});

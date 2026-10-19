import { beforeEach, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

describe("old bout routes", () => {
  it.each([
    ["POST", "/api/v1/competitions/competition-1/bouts"],
    ["PUT", "/api/v1/competitions/competition-1/bouts/bout-1"],
    ["DELETE", "/api/v1/competitions/competition-1/bouts/bout-1"],
  ] as const)("%s %s is gone", async (method, url) => {
    const response = await ctx.app.inject({ method, url, payload: {} });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: "Recording bouts moved to the score-keeper." });
  });

  it("still lists legacy bouts", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/competitions/competition-1/bouts" });
    expect(response.statusCode).toBe(200);
    expect((response.json() as unknown[]).length).toBeGreaterThan(0);
  });
});

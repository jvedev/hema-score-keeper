import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
let owner: TestUser;
let otherAdmin: TestUser;

interface CompetitionResponse {
  id: string;
  name: string;
  status: string;
  scope: { kind: string; values: string[] };
  rulesetJson: unknown;
}

async function createDraft(): Promise<CompetitionResponse> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/v1/competitions",
    headers: bearer(owner),
    payload: { name: "Ladder", slug: `ladder-${Math.random().toString(36).slice(2)}`, date: "2027-01-10" },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as CompetitionResponse;
}

function transition(id: string, action: string, user = owner) {
  return ctx.app.inject({
    method: "POST",
    url: `/api/v1/competitions/${id}/transitions`,
    headers: bearer(user),
    payload: { action },
  });
}

function patch(id: string, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: "PATCH", url: `/api/v1/competitions/${id}`, headers: bearer(owner), payload });
}

async function runToRunning(id: string): Promise<void> {
  expect((await transition(id, "OPEN_REGISTRATION")).statusCode).toBe(200);
  expect((await transition(id, "START")).statusCode).toBe(200);
}

beforeEach(async () => {
  ctx = await createTestContext();
  owner = await insertUser(ctx.database, { id: "owner", role: "COMPETITION_ADMIN" });
  otherAdmin = await insertUser(ctx.database, { id: "other", role: "COMPETITION_ADMIN" });
});

describe("competition lifecycle", () => {
  it("walks a draft through the whole lifecycle", async () => {
    const { id, scope } = await createDraft();
    expect(scope).toEqual({ kind: "OPEN", values: [] });

    const statuses: string[] = [];
    for (const action of ["OPEN_REGISTRATION", "START", "CLOSE", "REOPEN", "CLOSE", "ARCHIVE"]) {
      const response = await transition(id, action);
      expect(response.statusCode).toBe(200);
      statuses.push((response.json() as CompetitionResponse).status);
    }
    expect(statuses).toEqual(["REGISTRATION_OPEN", "RUNNING", "CLOSED", "RUNNING", "CLOSED", "ARCHIVED"]);
  });

  it("won't open registration without a usable scope, and says why", async () => {
    const { id } = await createDraft();
    expect((await patch(id, { scope: { kind: "CLUB", values: [] } })).statusCode).toBe(200);

    const response = await transition(id, "OPEN_REGISTRATION");
    expect(response.statusCode).toBe(409);
    expect((response.json() as { details: { checklist: { scopeAndDatesSet: boolean } } }).details.checklist.scopeAndDatesSet).toBe(false);
  });

  it("refuses a transition that isn't allowed", async () => {
    const { id } = await createDraft();
    await runToRunning(id);
    expect((await transition(id, "ARCHIVE")).statusCode).toBe(409);
  });

  it("rejects an unknown action", async () => {
    const { id } = await createDraft();
    expect((await transition(id, "EXPLODE")).statusCode).toBe(400);
  });

  it("forbids transitions by an admin of another competition", async () => {
    const { id } = await createDraft();
    expect((await transition(id, "OPEN_REGISTRATION", otherAdmin)).statusCode).toBe(403);
  });

  it("doesn't let PATCH change the status", async () => {
    const { id } = await createDraft();
    expect((await patch(id, { status: "RUNNING" })).statusCode).toBe(400);
  });

  it("refuses ruleset change once running", async () => {
    const { id } = await createDraft();
    await runToRunning(id);

    const response = await patch(id, { name: "New name", rulesetJson: { weaponClass: "sabre" } });
    expect(response.statusCode).toBe(409);

    const current = (await ctx.app.inject({ method: "GET", url: `/api/v1/competitions/${id}` })).json() as CompetitionResponse;
    expect(current.name).toBe("Ladder");
  });

  it("allows a ruleset change while drafting", async () => {
    const { id } = await createDraft();
    const response = await patch(id, { rulesetJson: { weaponClass: "sabre" } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as CompetitionResponse).rulesetJson).toEqual({ weaponClass: "sabre" });
  });

  it("stores a valid scope and rejects an unknown kind", async () => {
    const { id } = await createDraft();
    const ok = await patch(id, { scope: { kind: "COUNTRY", values: ["NL"] } });
    expect(ok.statusCode).toBe(200);

    const fetched = (await ctx.app.inject({ method: "GET", url: `/api/v1/competitions/${id}` })).json() as CompetitionResponse;
    expect(fetched.scope).toEqual({ kind: "COUNTRY", values: ["NL"] });

    expect((await patch(id, { scope: { kind: "MOON", values: [] } })).statusCode).toBe(400);
  });
});

describe("legacy statuses", () => {
  it("answers 409 instead of crashing on a status outside the lifecycle", async () => {
    const { id } = await createDraft();
    await ctx.database.updateTable("Competition").set({ status: "ACTIVE" }).where("id", "=", id).execute();

    const response = await transition(id, "CLOSE");
    expect(response.statusCode).toBe(409);
  });

  it("treats a legacy status as locked for ruleset changes", async () => {
    const { id } = await createDraft();
    await ctx.database.updateTable("Competition").set({ status: "ACTIVE" }).where("id", "=", id).execute();
    expect((await patch(id, { rulesetJson: { weaponClass: "sabre" } })).statusCode).toBe(409);
  });
});

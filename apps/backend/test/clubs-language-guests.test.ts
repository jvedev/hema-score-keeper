import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, insertClub, insertUser, type TestContext, type TestUser } from "./helpers.js";

let ctx: TestContext;
let clubAdmin: TestUser;
let otherClubAdmin: TestUser;
let member: TestUser;

interface ClubResponse {
  id: string;
  area: string | null;
  countryCode: string | null;
}

function createClub(payload: Record<string, unknown>, as: TestUser = clubAdmin) {
  return ctx.app.inject({ method: "POST", url: "/api/v1/clubs", headers: bearer(as), payload });
}

function patchClub(id: string, payload: Record<string, unknown>, as: TestUser = clubAdmin) {
  return ctx.app.inject({ method: "PATCH", url: `/api/v1/clubs/${id}`, headers: bearer(as), payload });
}

function setLanguage(language: unknown, as: TestUser = member) {
  return ctx.app.inject({ method: "PATCH", url: "/api/v1/auth/me", headers: bearer(as), payload: { language } });
}

beforeEach(async () => {
  ctx = await createTestContext();
  await insertClub(ctx.database, { id: "club-1" });
  await insertClub(ctx.database, { id: "club-2" });
  clubAdmin = await insertUser(ctx.database, { id: "club-admin", role: "COMPETITION_ADMIN", clubId: "club-1" });
  otherClubAdmin = await insertUser(ctx.database, { id: "other-admin", role: "COMPETITION_ADMIN", clubId: "club-2" });
  member = await insertUser(ctx.database, { id: "member", role: "USER", clubId: "club-1" });
});

describe("club area and country", () => {
  it("stores the country code in upper case", async () => {
    const response = await createClub({ name: "Ochs", slug: "ochs", countryCode: "nl", area: "Randstad" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ countryCode: "NL", area: "Randstad" });
  });

  it("rejects a country code that isn't two letters", async () => {
    expect((await createClub({ name: "Ochs", slug: "ochs", countryCode: "NLD" })).statusCode).toBe(400);
  });

  it("lets the club's own admin set the area", async () => {
    const response = await patchClub("club-1", { area: "Randstad" });
    expect(response.statusCode).toBe(200);
    expect((response.json() as ClubResponse).area).toBe("Randstad");
  });

  it("stops admins of other clubs and members from changing a club", async () => {
    expect((await patchClub("club-1", { area: "Elsewhere" }, otherClubAdmin)).statusCode).toBe(403);
    expect((await patchClub("club-1", { area: "Elsewhere" }, member)).statusCode).toBe(403);
  });
});

describe("user language", () => {
  it("defaults to English", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: bearer(member) });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { language: string }).language).toBe("en");
  });

  it("switches to Dutch", async () => {
    expect((await setLanguage("nl")).statusCode).toBe(200);
    const me = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: bearer(member) });
    expect((me.json() as { language: string }).language).toBe("nl");
  });

  it("rejects languages the app doesn't ship", async () => {
    expect((await setLanguage("de")).statusCode).toBe(400);
  });
});

describe("guests", () => {
  async function competitionId(): Promise<string> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/competitions",
      headers: bearer(clubAdmin),
      payload: { name: "Ladder", slug: "ladder", date: "2027-01-10" },
    });
    return (response.json() as { id: string }).id;
  }

  it("no longer accepts new guests", async () => {
    const id = await competitionId();
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${id}/participants`,
      headers: bearer(clubAdmin),
      payload: { name: "Walk-in", kind: "GUEST" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("still accepts members", async () => {
    const id = await competitionId();
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${id}/participants`,
      headers: bearer(clubAdmin),
      payload: { name: "Member", kind: "MEMBER", userId: "member" },
    });
    expect(response.statusCode).toBe(200);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminClient, ApiError, SessionExpiredError } from "./admin-client";

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

let calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }>;
let responses: Array<{ status: number; body: unknown }>;
let client: AdminClient;

const loginBody = { user: { id: "u1", name: "Maren", language: "en", role: "COMPETITION_ADMIN" }, accessToken: "a1", refreshToken: "r1" };

beforeEach(() => {
  calls = [];
  responses = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method ?? "GET", authorization: headers.get("Authorization"), body: init.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  });
  client = new AdminClient("/api/v1", new MemoryStorage() as unknown as Storage);
});

async function signedIn(): Promise<void> {
  responses.push({ status: 200, body: loginBody });
  await client.login("maren", "secret");
  calls = [];
}

describe("AdminClient", () => {
  it("signs in and remembers the user", async () => {
    responses.push({ status: 200, body: loginBody });
    const session = await client.login("maren", "secret");
    expect(session.user).toEqual({ id: "u1", name: "Maren", language: "en", role: "COMPETITION_ADMIN" });
    expect(client.currentSession()?.accessToken).toBe("a1");
  });

  it("refreshes once on 401 and retries", async () => {
    await signedIn();
    responses.push({ status: 401, body: {} }, { status: 200, body: { ...loginBody, accessToken: "a2", refreshToken: "r2" } }, { status: 200, body: [] });
    expect(await client.competitions()).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual(["/api/v1/competitions/admin", "/api/v1/auth/refresh", "/api/v1/competitions/admin"]);
    expect(calls[2]!.authorization).toBe("Bearer a2");
  });

  it("shares one refresh between requests that fail together", async () => {
    await signedIn();
    responses.push(
      { status: 401, body: {} },
      { status: 401, body: {} },
      { status: 200, body: { ...loginBody, accessToken: "a2", refreshToken: "r2" } },
      { status: 200, body: [] },
      { status: 200, body: [] },
    );
    expect(await Promise.all([client.competitions(), client.clubs()])).toEqual([[], []]);
    expect(calls.filter((call) => call.url === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(calls.slice(-2).map((call) => call.authorization)).toEqual(["Bearer a2", "Bearer a2"]);
    expect(client.currentSession()?.refreshToken).toBe("r2");
  });

  it("gives up when refreshing fails", async () => {
    await signedIn();
    responses.push({ status: 401, body: {} }, { status: 401, body: {} });
    await expect(client.needsYou()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(client.currentSession()).toBeNull();
  });

  it("keeps the server's error and details", async () => {
    await signedIn();
    responses.push({ status: 409, body: { error: "The competition isn't ready.", details: { checklist: { ready: false } } } });
    const error = await client.transition("c1", "OPEN_REGISTRATION").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("The competition isn't ready.");
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).details).toEqual({ checklist: { ready: false } });
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/competitions/c1/transitions", body: { action: "OPEN_REGISTRATION" } });
  });

  it("resolves an objection with the given body", async () => {
    await signedIn();
    responses.push({ status: 200, body: { id: "b1", status: "COUNTED" } });
    await client.resolveObjection("b1", { kind: "restore" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/bouts/b1/resolution", body: { kind: "restore" } });
  });

  it("calls the endpoints the screens need", async () => {
    await signedIn();
    await client.needsYou();
    await client.standings("c 1");
    await client.boutHistory("c1");
    await client.bout("b1");
    await client.admins("c1");
    await client.addAdmin("c1", "u2");
    await client.removeAdmin("c1", "u2");
    await client.transferOwnership("c1", "u2");
    await client.patchCompetition("c1", { name: "New" });
    await client.addParticipant("c1", { name: "Tomas", userId: "u3" });
    await client.searchPeople("da v");
    await client.setLanguage("nl");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /api/v1/admin/needs-you",
      "GET /api/v1/competitions/c%201/standings",
      "GET /api/v1/competitions/c1/bout-history",
      "GET /api/v1/bouts/b1",
      "GET /api/v1/competitions/c1/admins",
      "POST /api/v1/competitions/c1/admins",
      "DELETE /api/v1/competitions/c1/admins/u2",
      "POST /api/v1/competitions/c1/owner",
      "PATCH /api/v1/competitions/c1",
      "POST /api/v1/competitions/c1/participants",
      "GET /api/v1/people?q=da%20v",
      "PATCH /api/v1/auth/me",
    ]);
  });
});

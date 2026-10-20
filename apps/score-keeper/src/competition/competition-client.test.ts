import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitionClient, SessionExpiredError } from "./competition-client";

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

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

let calls: Call[];
let responses: Array<{ status: number; body: unknown }>;
let storage: MemoryStorage;
let client: CompetitionClient;

const loginBody = {
  user: { id: "u1", name: "Maren de Vries", language: "nl" },
  accessToken: "access-1",
  refreshToken: "refresh-1",
};

beforeEach(() => {
  calls = [];
  responses = [];
  storage = new MemoryStorage();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method ?? "GET",
      authorization: headers.get("Authorization"),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  });
  client = new CompetitionClient("/api/v1", storage as unknown as Storage);
});

async function loggedIn(): Promise<void> {
  responses.push({ status: 200, body: loginBody });
  await client.login("maren", "secret");
  calls = [];
}

describe("CompetitionClient", () => {
  it("logs in and keeps the session", async () => {
    responses.push({ status: 200, body: loginBody });
    const session = await client.login("maren", "secret");

    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/login", method: "POST", body: { username: "maren", password: "secret", rememberMe: true } });
    expect(session.user).toEqual({ id: "u1", name: "Maren de Vries", language: "nl" });
    expect(new CompetitionClient("/api/v1", storage as unknown as Storage).currentSession()?.accessToken).toBe("access-1");
  });

  it("sends the access token", async () => {
    await loggedIn();
    responses.push({ status: 200, body: [] });
    await client.searchPeople("da");
    expect(calls[0]!.authorization).toBe("Bearer access-1");
  });

  it("refreshes once on 401", async () => {
    await loggedIn();
    responses.push({ status: 401, body: { error: "expired" } });
    responses.push({ status: 200, body: { ...loginBody, accessToken: "access-2", refreshToken: "refresh-2" } });
    responses.push({ status: 200, body: [{ id: "X", name: "Ladder", status: "RUNNING" }] });

    expect(await client.runningCompetitions()).toEqual([{ id: "X", name: "Ladder" }]);
    expect(calls.map((call) => call.url)).toEqual(["/api/v1/competitions", "/api/v1/auth/refresh", "/api/v1/competitions"]);
    expect(calls[1]!.body).toEqual({ refreshToken: "refresh-1" });
    expect(calls[2]!.authorization).toBe("Bearer access-2");
  });

  it("gives up and forgets the session when refreshing fails", async () => {
    await loggedIn();
    responses.push({ status: 401, body: {} });
    responses.push({ status: 401, body: {} });
    await expect(client.runningCompetitions()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(client.currentSession()).toBeNull();
  });

  it("lists only running competitions", async () => {
    await loggedIn();
    responses.push({
      status: 200,
      body: [
        { id: "X", name: "Ladder", status: "RUNNING" },
        { id: "D", name: "Draft", status: "DRAFT" },
      ],
    });
    expect(await client.runningCompetitions()).toEqual([{ id: "X", name: "Ladder" }]);
  });

  it("lists participants who have an account", async () => {
    await loggedIn();
    responses.push({
      status: 200,
      body: [
        { id: "p1", name: "Tomas Kuiper", userId: "tomas" },
        { id: "p2", name: "Old guest", userId: null },
      ],
    });
    expect(await client.participants("X")).toEqual([{ userId: "tomas", name: "Tomas Kuiper", clubName: null }]);
    expect(calls[0]!.url).toBe("/api/v1/competitions/X/participants");
  });

  it("encodes the search text", async () => {
    await loggedIn();
    responses.push({ status: 200, body: [] });
    await client.searchPeople("de vries&co");
    expect(calls[0]!.url).toBe("/api/v1/people?q=de%20vries%26co");
  });

  it("records a bout and approves it as referee", async () => {
    await loggedIn();
    responses.push({ status: 200, body: { id: "b1", status: "SCORED" } });
    responses.push({ status: 200, body: { id: "b1", status: "FINAL" } });
    const bout = await client.recordBout({ fighterAUserId: "a" });
    await client.approveAsReferee(bout.id, { A: true, B: true });
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "/api/v1/bouts"],
      ["POST", "/api/v1/bouts/b1/referee-approval"],
    ]);
    expect(calls[1]!.body).toEqual({ fightersApprovedOnSpot: { A: true, B: true } });
  });

  it("reports the server's error message", async () => {
    await loggedIn();
    responses.push({ status: 400, body: { error: "Start time is in the future." } });
    await expect(client.recordBout({})).rejects.toThrow("Start time is in the future.");
  });

  it("logs out and forgets the session", async () => {
    await loggedIn();
    await client.logout();
    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/logout", body: { refreshToken: "refresh-1" } });
    expect(client.currentSession()).toBeNull();
  });
});

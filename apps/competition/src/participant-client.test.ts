import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ParticipantClient } from "./participant-client";

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
let storage: MemoryStorage;
let client: ParticipantClient;

const user = { id: "u1", name: "Eva", username: "eva", language: "en", role: "USER", clubId: "club-1" };
const loginBody = { user, accessToken: "a1", refreshToken: "r1" };
const emptyHome = { todo: { toApprove: [], myObjections: [], toReferee: [] }, competitions: [] };

beforeEach(() => {
  calls = [];
  responses = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method ?? "GET", authorization: headers.get("Authorization"), body: init.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  });
  storage = new MemoryStorage();
  client = new ParticipantClient("/api/v1", storage as unknown as Storage);
});

async function signedIn(): Promise<void> {
  responses.push({ status: 200, body: loginBody });
  await client.login("eva", "secret");
  calls = [];
}

describe("ParticipantClient", () => {
  it("signs in and remembers the fighter", async () => {
    responses.push({ status: 200, body: loginBody });
    const session = await client.login("eva", "secret");
    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/login", method: "POST", authorization: null, body: { username: "eva", password: "secret", rememberMe: true } });
    expect(session.user).toEqual({ id: "u1", name: "Eva", language: "en", clubId: "club-1" });
    expect(new ParticipantClient("/api/v1", storage as unknown as Storage).currentSession()?.accessToken).toBe("a1");
  });

  it("signs up with a club, then saves the chosen language on the account", async () => {
    responses.push({ status: 200, body: loginBody }, { status: 200, body: { ...user, language: "nl" } });
    const session = await client.signUp({ name: "Eva", username: "eva", password: "secret", clubSlug: "hema-utrecht", language: "nl" });
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "/api/v1/auth/register"],
      ["PATCH", "/api/v1/auth/me"],
    ]);
    expect(calls[0]!.body).toEqual({ name: "Eva", username: "eva", password: "secret", clubSlug: "hema-utrecht" });
    expect(calls[0]!.authorization).toBeNull();
    expect(calls[1]!.body).toEqual({ language: "nl" });
    expect(calls[1]!.authorization).toBe("Bearer a1");
    expect(session.user.language).toBe("nl");
    expect(client.currentSession()?.user.language).toBe("nl");
  });

  it("keeps the new account when saving the language fails", async () => {
    responses.push({ status: 200, body: loginBody }, { status: 500, body: { error: "boom" } });
    const session = await client.signUp({ name: "Eva", username: "eva", password: "secret", clubSlug: "hema-utrecht", language: "nl" });
    expect(session.accessToken).toBe("a1");
    expect(session.user.language).toBe("nl");
  });

  it("reports a refused sign-up with the server's message", async () => {
    responses.push({ status: 409, body: { error: 'Username "eva" is already taken.' } });
    await expect(client.signUp({ name: "Eva", username: "eva", password: "x", clubSlug: "c", language: "en" })).rejects.toMatchObject({
      status: 409,
      message: 'Username "eva" is already taken.',
    });
    expect(client.currentSession()).toBeNull();
  });

  // The refresh itself is tested in @hema/api-session; this checks the client goes through it.
  it("shares one refresh between requests that fail together", async () => {
    await signedIn();
    responses.push(
      { status: 401, body: {} },
      { status: 401, body: {} },
      { status: 200, body: { ...loginBody, accessToken: "a2", refreshToken: "r2" } },
      { status: 200, body: emptyHome },
      { status: 200, body: { status: "ACTIVE" } },
    );
    expect(await Promise.all([client.home(), client.signup("c1")])).toEqual([emptyHome, { status: "ACTIVE" }]);
    expect(calls.filter((call) => call.url === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(calls.slice(-2).map((call) => call.authorization)).toEqual(["Bearer a2", "Bearer a2"]);
    expect(client.currentSession()?.refreshToken).toBe("r2");
  });

  it("keeps the server's error and details", async () => {
    await signedIn();
    responses.push({ status: 409, body: { error: "This competition is full.", details: { reason: "FULL" } } });
    const error = await client.signup("c1", "CODE").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "This competition is full.", details: { reason: "FULL" } });
  });

  it("signs up for a competition with or without an invite code", async () => {
    await signedIn();
    responses.push({ status: 200, body: { status: "PENDING" } }, { status: 200, body: { status: "ACTIVE" } });
    expect(await client.signup("c 1", "AbC")).toEqual({ status: "PENDING" });
    await client.signup("c2");
    expect(calls[0]).toMatchObject({ url: "/api/v1/competitions/c%201/signup", method: "POST", body: { inviteCode: "AbC" } });
    expect(calls[1]).toMatchObject({ url: "/api/v1/competitions/c2/signup", method: "POST", body: {} });
  });

  it("reads an invite and the clubs without a login", async () => {
    const preview = { competitionId: "c1", name: "Ladder", status: "RUNNING", date: "2026-10-01", joinable: true };
    responses.push({ status: 200, body: preview }, { status: 200, body: [] });
    expect(await client.invite("a/b")).toEqual(preview);
    expect(await client.clubs()).toEqual([]);
    expect(calls.map((call) => [call.url, call.authorization])).toEqual([
      ["/api/v1/invites/a%2Fb", null],
      ["/api/v1/clubs", null],
    ]);
  });

  it("reads the home data", async () => {
    await signedIn();
    responses.push({ status: 200, body: emptyHome });
    await client.home();
    expect(calls[0]).toMatchObject({ url: "/api/v1/me/home", method: "GET", authorization: "Bearer a1" });
  });

  it("saves the language on the account and in the session", async () => {
    await signedIn();
    responses.push({ status: 200, body: { ...user, language: "nl" } });
    await client.setLanguage("nl");
    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/me", method: "PATCH", body: { language: "nl" } });
    expect(client.currentSession()?.user.language).toBe("nl");
  });

  it("lists the competitions the fighter can join", async () => {
    await signedIn();
    responses.push({ status: 200, body: [] });
    expect(await client.joinable()).toEqual([]);
    expect(calls[0]).toMatchObject({ url: "/api/v1/me/joinable", method: "GET", authorization: "Bearer a1" });
  });

  it("leaves a competition (or withdraws a pending sign-up)", async () => {
    await signedIn();
    responses.push({ status: 200, body: { status: "LEFT" } });
    expect(await client.leave("c 1")).toEqual({ status: "LEFT" });
    expect(calls[0]).toMatchObject({ url: "/api/v1/competitions/c%201/signup", method: "DELETE", body: undefined });
  });

  it("reads a competition, its fighters, standings and bout history", async () => {
    await signedIn();
    responses.push({ status: 200, body: { id: "c1" } }, { status: 200, body: [] }, { status: 200, body: [] }, { status: 200, body: [] });
    await client.competition("c/1");
    await client.participants("c/1");
    await client.standings("c/1");
    await client.boutHistory("c/1");
    expect(calls.map((call) => [call.method, call.url, call.authorization])).toEqual([
      ["GET", "/api/v1/competitions/c%2F1", "Bearer a1"],
      ["GET", "/api/v1/competitions/c%2F1/participants", "Bearer a1"],
      ["GET", "/api/v1/competitions/c%2F1/standings", "Bearer a1"],
      ["GET", "/api/v1/competitions/c%2F1/bout-history", "Bearer a1"],
    ]);
  });

  it("reads a bout through the fighter-safe view of its competition", async () => {
    await signedIn();
    responses.push({ status: 200, body: { id: "b1" } });
    await client.boutView("c1", "b/1");
    expect(calls[0]).toMatchObject({ url: "/api/v1/competitions/c1/bouts/b%2F1/view", method: "GET" });
  });

  it("approves, objects with a reason, withdraws and approves as referee", async () => {
    await signedIn();
    await client.approveBout("b1");
    await client.objectToBout("b1", "It was a double");
    await client.withdrawObjection("b1");
    await client.approveAsReferee("b 1");
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ["POST", "/api/v1/bouts/b1/approval", {}],
      ["POST", "/api/v1/bouts/b1/objection", { reason: "It was a double" }],
      ["POST", "/api/v1/bouts/b1/objection/withdrawal", {}],
      // Later, in the app: the fighters aren't there to approve on the spot.
      ["POST", "/api/v1/bouts/b%201/referee-approval", { fightersApprovedOnSpot: { A: false, B: false } }],
    ]);
    expect(calls.every((call) => call.authorization === "Bearer a1")).toBe(true);
  });

  it("reads the account for the profile", async () => {
    await signedIn();
    responses.push({ status: 200, body: user });
    expect(await client.me()).toEqual(user);
    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/me", method: "GET" });
  });

  it("signs out and forgets the session", async () => {
    await signedIn();
    await client.logout();
    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/logout", method: "POST", body: { refreshToken: "r1" } });
    expect(client.currentSession()).toBeNull();
    expect(new ParticipantClient("/api/v1", storage as unknown as Storage).currentSession()).toBeNull();
  });

});

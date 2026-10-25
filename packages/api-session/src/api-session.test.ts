import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiSession, SessionExpiredError, type AuthResponse } from "./api-session";

class MemoryStorage {
  readonly items = new Map<string, string>();
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

interface TestUser {
  id: string;
  name: string;
  language: "en" | "nl";
}

let calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }>;
/** `onCall` runs when the request is sent, e.g. to act as another tab in the meantime. */
let responses: Array<{ status: number; body: unknown; onCall?: () => void }>;
let storage: MemoryStorage;
let session: ApiSession<TestUser>;

const auth = (accessToken: string, refreshToken: string): AuthResponse => ({ user: { id: "u1", name: "Eva", language: "nl" }, accessToken, refreshToken });

function create(): ApiSession<TestUser> {
  return new ApiSession<TestUser>({
    baseUrl: "/api/v1",
    storage: storage as unknown as Storage,
    storageKey: "test.session",
    toUser: (user) => ({ id: user.id, name: user.name, language: user.language === "nl" ? "nl" : "en" }),
  });
}

beforeEach(() => {
  calls = [];
  responses = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method ?? "GET", authorization: headers.get("Authorization"), body: init.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift() ?? { status: 200, body: {} };
    next.onCall?.();
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  });
  storage = new MemoryStorage();
  session = create();
});

function signedIn(): void {
  session.store(auth("a1", "r1"));
}

describe("ApiSession", () => {
  it("stores a session, maps the user and reads it back after a reload", () => {
    const stored = session.store(auth("a1", "r1"));
    expect(stored).toEqual({ accessToken: "a1", refreshToken: "r1", user: { id: "u1", name: "Eva", language: "nl" } });
    expect(create().current()).toEqual(stored);
  });

  it("sends JSON with the access token, or without it when asked", async () => {
    signedIn();
    await session.send("POST", "/things", { a: 1 });
    await session.send("GET", "/open", undefined, false);
    expect(calls).toMatchObject([
      { url: "/api/v1/things", method: "POST", authorization: "Bearer a1", body: { a: 1 } },
      { url: "/api/v1/open", method: "GET", authorization: null, body: undefined },
    ]);
  });

  it("refreshes once on 401 and retries", async () => {
    signedIn();
    responses.push({ status: 401, body: {} }, { status: 200, body: auth("a2", "r2") }, { status: 200, body: [] });
    expect(await session.send("GET", "/things")).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual(["/api/v1/things", "/api/v1/auth/refresh", "/api/v1/things"]);
    expect(calls[1]).toMatchObject({ authorization: null, body: { refreshToken: "r1" } });
    expect(calls[2]!.authorization).toBe("Bearer a2");
  });

  it("shares one refresh between requests that fail together", async () => {
    signedIn();
    responses.push(
      { status: 401, body: {} },
      { status: 401, body: {} },
      { status: 200, body: auth("a2", "r2") },
      { status: 200, body: [1] },
      { status: 200, body: [2] },
    );
    expect(await Promise.all([session.send("GET", "/one"), session.send("GET", "/two")])).toEqual([[1], [2]]);
    expect(calls.filter((call) => call.url === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(calls.slice(-2).map((call) => call.authorization)).toEqual(["Bearer a2", "Bearer a2"]);
    expect(session.current()?.refreshToken).toBe("r2");
  });

  it("does not refresh again when another request already did", async () => {
    signedIn();
    // The first request fails with the old token, but by the time it sees the 401 the token is already new.
    responses.push({ status: 401, body: {} }, { status: 200, body: "ok" });
    const pending = session.send("GET", "/late");
    session.store(auth("a2", "r2"));
    expect(await pending).toBe("ok");
    expect(calls.map((call) => call.url)).toEqual(["/api/v1/late", "/api/v1/late"]);
    expect(calls[1]!.authorization).toBe("Bearer a2");
  });

  it("gives up and forgets the session when refreshing fails", async () => {
    signedIn();
    responses.push({ status: 401, body: {} }, { status: 401, body: {} });
    await expect(session.send("GET", "/things")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(session.current()).toBeNull();
    expect(storage.items.has("test.session")).toBe(false);
  });

  it("gives up when the retry is still refused", async () => {
    signedIn();
    responses.push({ status: 401, body: {} }, { status: 200, body: auth("a2", "r2") }, { status: 401, body: {} });
    await expect(session.send("GET", "/things")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(session.current()).toBeNull();
  });

  describe("with other tabs sharing the stored session", () => {
    it("uses the session another tab already refreshed instead of spending a used refresh token", async () => {
      signedIn();
      create().store(auth("a2", "r2"));
      responses.push({ status: 401, body: {} }, { status: 200, body: "ok" });
      expect(await session.send("GET", "/things")).toBe("ok");
      expect(calls.map((call) => call.url)).toEqual(["/api/v1/things", "/api/v1/things"]);
      expect(calls[1]!.authorization).toBe("Bearer a2");
      expect(session.current()?.refreshToken).toBe("r2");
    });

    it("keeps the other tab's session when its own refresh loses the race", async () => {
      signedIn();
      responses.push(
        { status: 401, body: {} },
        // Another tab spends r1 first and stores its new session while this tab's refresh is on its way.
        { status: 401, body: {}, onCall: () => create().store(auth("a2", "r2")) },
        { status: 200, body: "ok" },
      );
      expect(await session.send("GET", "/things")).toBe("ok");
      expect(calls.map((call) => call.url)).toEqual(["/api/v1/things", "/api/v1/auth/refresh", "/api/v1/things"]);
      expect(calls[2]!.authorization).toBe("Bearer a2");
      expect(create().current()?.refreshToken).toBe("r2");
    });

    it("does not remove a newer stored session when the retry is refused", async () => {
      signedIn();
      responses.push(
        { status: 401, body: {} },
        { status: 200, body: auth("a2", "r2") },
        // Another tab signs in again before this tab's retry is refused.
        { status: 401, body: {}, onCall: () => create().store(auth("b1", "s1")) },
      );
      await expect(session.send("GET", "/things")).rejects.toBeInstanceOf(SessionExpiredError);
      expect(session.current()).toBeNull();
      expect(create().current()?.refreshToken).toBe("s1");
    });

    describe("after sitting idle longer than the access token lives", () => {
      /** A backend whose access tokens expire after 15 minutes and whose refresh tokens are single use. */
      function fakeServer() {
        let now = 0;
        let issued = 0;
        const accessExpiresAt = new Map<string, number>();
        const unusedRefreshTokens = new Set<string>();
        const issue = (): AuthResponse => {
          issued += 1;
          accessExpiresAt.set(`a${issued}`, now + 15);
          unusedRefreshTokens.add(`r${issued}`);
          return auth(`a${issued}`, `r${issued}`);
        };
        vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
          const headers = new Headers(init.headers);
          const body = init.body ? (JSON.parse(String(init.body)) as { refreshToken?: string }) : undefined;
          calls.push({ url, method: init.method ?? "GET", authorization: headers.get("Authorization"), body });
          const reply = (status: number, payload: unknown) =>
            new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
          if (url.endsWith("/auth/refresh")) {
            return unusedRefreshTokens.delete(body?.refreshToken ?? "") ? reply(200, issue()) : reply(401, { error: "Invalid refresh token." });
          }
          const token = headers.get("Authorization")?.replace("Bearer ", "") ?? "";
          return (accessExpiresAt.get(token) ?? -1) > now ? reply(200, "ok") : reply(401, { error: "Expired." });
        });
        return {
          issue,
          idle: (minutes: number) => (now += minutes),
          revokeRefreshTokens: () => unusedRefreshTokens.clear(),
          refreshedWith: () => calls.filter((call) => call.url.endsWith("/auth/refresh")).map((call) => (call.body as { refreshToken: string }).refreshToken),
        };
      }

      /** Tab A and tab B share one login; tab B refreshes once, then both sit idle past the access token's lifetime. */
      function twoIdleTabs(server: ReturnType<typeof fakeServer>) {
        const tabA = session;
        tabA.store(server.issue());
        const tabB = create();
        server.idle(16);
        return { tabA, tabB };
      }

      it("refreshes the adopted session when its access token expired too, and keeps every tab signed in", async () => {
        const server = fakeServer();
        const { tabA, tabB } = twoIdleTabs(server);
        expect(await tabB.send("GET", "/things")).toBe("ok");
        server.idle(16);

        expect(await tabA.send("GET", "/things")).toBe("ok");
        expect(server.refreshedWith()).toEqual(["r1", "r2"]);
        expect(tabA.current()?.refreshToken).toBe("r3");
        expect(create().current()?.refreshToken).toBe("r3");
        // Tab B picks up the session tab A stored instead of spending its used refresh token.
        expect(await tabB.send("GET", "/things")).toBe("ok");
        expect(server.refreshedWith()).toEqual(["r1", "r2"]);
      });

      it("shares the second refresh between requests that fail together", async () => {
        const server = fakeServer();
        const { tabA, tabB } = twoIdleTabs(server);
        await tabB.send("GET", "/things");
        server.idle(16);

        expect(await Promise.all([tabA.send("GET", "/one"), tabA.send("GET", "/two")])).toEqual(["ok", "ok"]);
        expect(server.refreshedWith()).toEqual(["r1", "r2"]);
        expect(tabA.current()?.refreshToken).toBe("r3");
      });

      it("signs out once, without looping, when the second refresh fails too", async () => {
        const server = fakeServer();
        const { tabA, tabB } = twoIdleTabs(server);
        await tabB.send("GET", "/things");
        server.idle(16);
        server.revokeRefreshTokens();
        const removeItem = vi.spyOn(storage, "removeItem");
        const before = calls.length;

        await expect(tabA.send("GET", "/things")).rejects.toBeInstanceOf(SessionExpiredError);
        expect(calls.slice(before).map((call) => call.url)).toEqual(["/api/v1/things", "/api/v1/things", "/api/v1/auth/refresh"]);
        expect(server.refreshedWith()).toEqual(["r1", "r2"]);
        expect(removeItem).toHaveBeenCalledTimes(1);
        expect(tabA.current()).toBeNull();
        expect(create().current()).toBeNull();
      });
    });
  });

  it("does not refresh for requests sent without a login", async () => {
    responses.push({ status: 401, body: { error: "Wrong password." } });
    const error = await session.send("POST", "/auth/login", {}, false).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 401, message: "Wrong password." });
    expect(calls).toHaveLength(1);
  });

  it("keeps the server's error and details", async () => {
    signedIn();
    responses.push({ status: 409, body: { error: "Full.", details: { reason: "FULL" } } });
    const error = await session.send("POST", "/x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "Full.", details: { reason: "FULL" } });
  });

  it("updates the stored user", () => {
    signedIn();
    session.update({ language: "en" });
    expect(create().current()?.user.language).toBe("en");
  });

  it("signs out: forgets first, then tells the server", async () => {
    signedIn();
    await session.logout();
    expect(calls[0]).toMatchObject({ url: "/api/v1/auth/logout", method: "POST", body: { refreshToken: "r1" } });
    expect(session.current()).toBeNull();
    expect(create().current()).toBeNull();
  });

  it("ignores a damaged stored session", () => {
    storage.setItem("test.session", "{not json");
    expect(create().current()).toBeNull();
  });
});

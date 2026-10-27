import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminClient, ApiError } from "./admin-client";

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
  contentType: string | null;
  body: unknown;
}

let calls: Call[];
let reply: () => Response;
let client: AdminClient;

beforeEach(async () => {
  calls = [];
  reply = () => new Response("{}", { status: 200 });
  client = new AdminClient("/api/v1", new MemoryStorage() as unknown as Storage);
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method ?? "GET", authorization: headers.get("Authorization"), contentType: headers.get("Content-Type"), body: init.body });
    return url.endsWith("/auth/login")
      ? new Response(JSON.stringify({ user: { id: "u1", name: "Maren", language: "en", role: "USER" }, accessToken: "a1", refreshToken: "r1" }), { status: 200 })
      : reply();
  });
  await client.login("maren", "secret");
  calls = [];
});

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

describe("live tournament endpoints", () => {
  it("lists and creates tournaments", async () => {
    reply = json({ tournaments: [{ id: "t1", name: "Open", googleSpreadsheetId: null, createdAt: "x" }] });
    expect(await client.liveTournaments()).toEqual([{ id: "t1", name: "Open", googleSpreadsheetId: null, createdAt: "x" }]);
    reply = json({ id: "t2" });
    expect(await client.createLiveTournament({ name: "Open", googleSpreadsheetId: "sheet" })).toEqual({ id: "t2" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(["GET /api/v1/live-tournaments", "POST /api/v1/live-tournaments"]);
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ name: "Open", googleSpreadsheetId: "sheet" });
    expect(calls[0]!.authorization).toBe("Bearer a1");
  });

  it("uploads the workbook as an octet-stream body", async () => {
    const report = { added: 2, updated: 0, skipped: [], errors: [] };
    reply = json(report);
    const file = new Blob([new Uint8Array([80, 75])]);
    expect(await client.importWorkbook("t 1", file)).toEqual(report);
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/live-tournaments/t%201/import/xlsx", contentType: "application/octet-stream" });
    expect(calls[0]!.body).toBe(file);
  });

  it("imports from Google and keeps the 502 or 503 message", async () => {
    reply = json({ added: 1, updated: 0, skipped: [], errors: [] });
    await client.importGoogle("t1");
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/live-tournaments/t1/import/google" });
    reply = json({ error: "Google is not set up." }, 503);
    const error = await client.importGoogle("t1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, message: "Google is not set up." });
  });

  it("reads the sync status, the rings and the tournament", async () => {
    reply = json({ targets: [{ target: "LOCAL", state: "OK", lastSuccessAt: null, lastError: null, lastErrorAt: null, pending: 0, failed: 0 }] });
    expect(await client.syncStatus("t1")).toHaveLength(1);
    reply = json({ rings: [{ id: "r1", keeperToken: "tok" }] });
    expect(await client.liveRings("t1")).toEqual([{ id: "r1", keeperToken: "tok" }]);
    reply = json({ id: "t1", name: "Open", rings: [] });
    await client.liveTournament("t1");
    expect(calls.map((call) => call.url)).toEqual(["/api/v1/live-tournaments/t1/sync", "/api/v1/live-tournaments/t1/rings", "/api/v1/live-tournaments/t1"]);
  });

  it("rotates a ring token", async () => {
    reply = json({ ring: { id: "r1", keeperToken: "new", activeKeeper: null } });
    expect(await client.rotateRingToken("r 1")).toEqual({ id: "r1", keeperToken: "new", activeKeeper: null });
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/live-rings/r%201/rotate-token" });
  });

  it("downloads the backup with the token, as a blob", async () => {
    reply = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    const blob = await client.downloadBackup("t1");
    expect(blob.size).toBe(3);
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/v1/live-tournaments/t1/backup.xlsx", authorization: "Bearer a1" });
    reply = json({ error: "There is no backup file for this tournament yet." }, 404);
    await expect(client.downloadBackup("t1")).rejects.toMatchObject({ status: 404 });
  });
});

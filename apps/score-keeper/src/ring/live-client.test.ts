import { ApiError } from "@hema/api-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveClient, forgetRingClaim, getDeviceId, readRingClaims } from "./live-client";
import { MemoryStorage } from "./test-support";

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

let calls: Call[];
let responses: Array<{ status: number; body: unknown }>;
let storage: MemoryStorage;

beforeEach(() => {
  calls = [];
  responses = [];
  storage = new MemoryStorage();
  storage.setItem("hema-score-keeper.session", JSON.stringify({ accessToken: "a1", refreshToken: "r1", user: { id: "u1", name: "Maren", language: "en" } }));
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  });
});

describe("device id and claims", () => {
  it("generates the device id once and keeps it", () => {
    const first = getDeviceId(storage);
    expect(first).toMatch(/[0-9a-f-]{36}/);
    expect(getDeviceId(storage)).toBe(first);
    expect(storage.getItem("hema-score-keeper.device-id")).toBe(first);
  });

  it("stores a claim per ring when the claim succeeds", async () => {
    const client = new LiveClient("/api/v1", storage, () => new Date("2026-10-26T10:00:00Z"));
    responses.push({ status: 200, body: { ring: { id: "r1" } } });
    await client.claim("tok", "ring-1");
    expect(readRingClaims(storage)).toEqual({ "ring-1": "2026-10-26T10:00:00.000Z" });
    expect(client.hasClaim("ring-1")).toBe(true);
    expect(client.claimToken("ring-1")).toBe("tok");
    forgetRingClaim(storage, "ring-1");
    expect(readRingClaims(storage)).toEqual({});
    expect(client.claimToken("ring-1")).toBeNull();
  });

  it("does not store a claim when the ring is actively kept (needs confirmation)", async () => {
    const client = new LiveClient("/api/v1", storage);
    responses.push({ status: 409, body: { error: "x", reason: "ACTIVE_KEEPER", activeKeeper: { userName: "Bo", since: "t" } } });
    await expect(client.claim("tok", "ring-1")).rejects.toBeInstanceOf(ApiError);
    expect(readRingClaims(storage)).toEqual({});
  });
});

describe("LiveClient writes", () => {
  it("sends the ring token and device id on every write", async () => {
    const client = new LiveClient("/api/v1", storage);
    const device = getDeviceId(storage);
    await client.claim("tok", "ring-1", { confirm: true });
    await client.startBout("tok", "b1");
    await client.postExchange("tok", "b1", { clientExchangeId: "c1", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, isDouble: false, firstScorer: null });
    await client.undo("tok", "b1", "e1");
    await client.setClock("tok", "b1", { seconds: 12, running: true });
    await client.finishBout("tok", "b1");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /api/v1/live-rings/by-token/tok/claim",
      "POST /api/v1/live-bouts/b1/start",
      "POST /api/v1/live-bouts/b1/exchanges",
      "POST /api/v1/live-bouts/b1/undo",
      "POST /api/v1/live-bouts/b1/clock",
      "POST /api/v1/live-bouts/b1/finish",
    ]);
    for (const call of calls) {
      expect(call.headers.get("X-Ring-Token")).toBe("tok");
      expect(call.headers.get("X-Device-Id")).toBe(device);
      expect(call.headers.get("Authorization")).toBe("Bearer a1");
    }
    expect(calls[0]!.body).toEqual({ deviceId: device, confirm: true });
    expect(calls[3]!.body).toEqual({ expectedExchangeId: "e1" });
    expect(calls[4]!.body).toEqual({ seconds: 12, running: true });
  });

  it("asks for the ring with this device's id, so the server can say whether it keeps the ring", async () => {
    const client = new LiveClient("/api/v1", storage);
    await client.ringByToken("tok");
    expect(calls[0]!.headers.get("X-Device-Id")).toBe(getDeviceId(storage));
    expect(calls[0]!.headers.get("X-Ring-Token")).toBeNull();
  });

  it("keeps the server's reason and active keeper on a refusal", async () => {
    const client = new LiveClient("/api/v1", storage);
    responses.push({ status: 409, body: { error: "Taken", reason: "TAKEN_OVER", activeKeeper: null } });
    const error = await client.startBout("tok", "b1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).body).toMatchObject({ reason: "TAKEN_OVER", activeKeeper: null });
  });
});

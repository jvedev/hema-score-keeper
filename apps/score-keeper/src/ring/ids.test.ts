import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "./ids";
import { getDeviceId } from "./live-client";
import { MemoryStorage } from "./test-support";

afterEach(() => vi.unstubAllGlobals());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("uses crypto.randomUUID when there is one", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "fixed" });
    expect(newId()).toBe("fixed");
  });

  it("falls back to getRandomValues when randomUUID is missing (plain-http origins)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.map((_, index) => index * 7) });
    expect(newId()).toMatch(UUID);
  });

  it("falls back to Math.random when there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    const first = newId();
    expect(first).toMatch(UUID);
    expect(newId()).not.toBe(first);
  });

  it("the device id uses it too", () => {
    vi.stubGlobal("crypto", {});
    expect(getDeviceId(new MemoryStorage())).toMatch(UUID);
  });
});

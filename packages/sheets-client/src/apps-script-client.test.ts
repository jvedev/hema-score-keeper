import { describe, expect, it } from "vitest";
import { AppsScriptClient } from "./apps-script-client";
import { installAppsScriptListCompetitionsMock } from "../test/mocks/apps-script-list-competitions.mock.mjs";
import { installAppsScriptAddParticipantMock } from "../test/mocks/apps-script-add-participant.mock.mjs";
import { installAppsScriptFailureMock } from "../test/mocks/apps-script-failure.mock.mjs";

const BASE_URL = "https://script.google.com/macros/s/test-deployment/exec";

describe("AppsScriptClient", () => {
  it("issues a GET request with the action as a query parameter", async () => {
    const mock = installAppsScriptListCompetitionsMock();
    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL });
      const result = await client.get("listCompetitions");

      expect(result).toEqual([
        { name: "Autumn Open", startDate: "2026-09-12", endDate: "2026-09-13", spreadsheetId: "sheet-1" },
      ]);
      expect(mock.calls).toHaveLength(1);
    } finally {
      mock.restore();
    }
  });

  it("rejects a write action when no id token is available", async () => {
    const client = new AppsScriptClient({ baseUrl: BASE_URL, getIdToken: () => null });

    await expect(client.post("addParticipant", { name: "New Fighter" })).rejects.toThrow(
      'Action "addParticipant" requires a signed-in user.',
    );
  });

  it("sends a text/plain POST body carrying the action and id token to avoid a CORS preflight", async () => {
    const mock = installAppsScriptAddParticipantMock();
    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL, getIdToken: () => "token-123" });
      const result = await client.post("addParticipant", { name: "New Fighter" });

      expect(result).toEqual({ id: "participant-9", name: "New Fighter", linkedUserEmail: null });
      expect(mock.calls).toHaveLength(1);
      const request = mock.calls[0]!;
      expect(request.headers.get("content-type")).toContain("text/plain");
      const body = JSON.parse(await request.text());
      expect(body).toEqual({ action: "addParticipant", idToken: "token-123", name: "New Fighter" });
    } finally {
      mock.restore();
    }
  });

  it("throws the server-provided error message when the action fails", async () => {
    const mock = installAppsScriptFailureMock();
    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL });
      await expect(client.get("listCompetitions")).rejects.toThrow("Spreadsheet not found.");
    } finally {
      mock.restore();
    }
  });

  it("returns a cached GET response without hitting the network again within the TTL", async () => {
    const mock = installAppsScriptListCompetitionsMock();
    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL });
      const first = await client.get("listCompetitions");
      const second = await client.get("listCompetitions");

      expect(second).toEqual(first);
      expect(mock.calls).toHaveLength(1);
    } finally {
      mock.restore();
    }
  });

  it("refetches when the caller explicitly bypasses the cache, and updates it for later reads", async () => {
    const mock = installAppsScriptListCompetitionsMock();
    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL });
      await client.get("listCompetitions");
      await client.get("listCompetitions", {}, { bypassCache: true });
      await client.get("listCompetitions");

      expect(mock.calls).toHaveLength(2);
    } finally {
      mock.restore();
    }
  });

  it("refetches once the cached entry has expired", async () => {
    const mock = installAppsScriptListCompetitionsMock();
    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL, cacheTtlMs: 0 });
      await client.get("listCompetitions");
      await client.get("listCompetitions");

      expect(mock.calls).toHaveLength(2);
    } finally {
      mock.restore();
    }
  });

  it("caches GET responses separately per distinct params", async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ ok: true, data: { calls } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL });
      await client.get("getRanking", { spreadsheetId: "sheet-a" });
      await client.get("getRanking", { spreadsheetId: "sheet-b" });
      await client.get("getRanking", { spreadsheetId: "sheet-a" });

      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("clears the cache after a successful write so the next read is fresh", async () => {
    let getCalls = 0;
    let postCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method === "GET") {
        getCalls++;
        return new Response(JSON.stringify({ ok: true, data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      postCalls++;
      return new Response(
        JSON.stringify({ ok: true, data: { id: "participant-9", name: "New Fighter", linkedUserEmail: null } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const client = new AppsScriptClient({ baseUrl: BASE_URL, getIdToken: () => "token-123" });
      await client.get("listCompetitions");
      await client.get("listCompetitions");
      expect(getCalls).toBe(1);

      await client.post("addParticipant", { name: "New Fighter" });
      expect(postCalls).toBe(1);

      await client.get("listCompetitions");
      expect(getCalls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

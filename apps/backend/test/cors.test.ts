import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";

describe("CORS", () => {
  // The score-keeper is hosted apart from the API, so a ring write is cross-origin and its preflight must allow the ring headers.
  it("preflight allows the ring keeper headers", async () => {
    const { app } = await createTestContext();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/live-bouts/b1/exchanges",
      headers: { origin: "http://localhost:5180", "access-control-request-method": "POST", "access-control-request-headers": "x-ring-token, x-device-id, content-type, authorization" },
    });
    expect(response.statusCode).toBe(204);
    const allowed = String(response.headers["access-control-allow-headers"]).toLowerCase().split(/\s*,\s*/);
    expect(allowed).toEqual(expect.arrayContaining(["content-type", "authorization", "x-ring-token", "x-device-id"]));
  });
});

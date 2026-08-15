import { afterEach, describe, expect, it } from "vitest";
import type { ApiEntry, ApiEvent, ApiUser } from "@hema/event-admin-api";

describe("event-view", () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = window.location.href;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.fetch = originalFetch;
    window.history.replaceState({}, "", originalUrl);
    document.body.replaceChildren();
  });

  it("renders shadow DOM content", async () => {
    installEventViewMock();
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

function installEventViewMock() {
  const originalFetch = globalThis.fetch;
  const originalWindowFetch = window.fetch;
  const users: ApiUser[] = [];
  const entries: ApiEntry[] = [];
  const eventId = "event-1";
  const tournamentId = "tournament-1";

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const pathname = new URL(request.url).pathname;

    if (request.method === "GET" && pathname.includes("/events")) {
      return jsonResponse([buildEvent()]);
    }

    if (request.method === "GET" && pathname.includes("/users")) {
      return jsonResponse(users);
    }

    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  };
  window.fetch = globalThis.fetch;

  function buildEvent(): ApiEvent {
    return {
      id: eventId,
      eventName: "Test event",
      ruleset: null,
      allFightersAreVolunteers: false,
      tournaments: [
        {
          id: tournamentId,
          eventId,
          name: "Open",
          ruleset: null,
          order: 0,
          color: "#ffcc00",
          entries,
          stages: [],
        },
      ],
      arenas: [],
    };
  }

  return {
    users,
    entries,
    restore() {
      globalThis.fetch = originalFetch;
      window.fetch = originalWindowFetch;
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

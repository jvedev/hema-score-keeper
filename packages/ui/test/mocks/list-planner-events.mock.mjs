export const listPlannerEventsResponse = [
  {
    "id": "event-1",
    "eventName": "Test event",
    "ruleset": null,
    "allFightersAreVolunteers": false,
    "rulesets": [],
    "tournaments": [],
    "arenas": []
  }
];

export function installListPlannerEventsMock() {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url);
    const matchesUrl = request.url === "/api/v1/events" || requestUrl.pathname + requestUrl.search === "/api/v1/events";

    if (request.method !== "GET" || !matchesUrl) {
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }

    calls.push(request);

    return new Response(JSON.stringify(listPlannerEventsResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

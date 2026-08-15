export const loadPlannerScheduleResponse = {
  "event": {
    "id": "event-1",
    "eventName": "Test event",
    "ruleset": null,
    "allFightersAreVolunteers": false,
    "rulesets": [],
    "tournaments": [],
    "arenas": []
  },
  "schedule": {
    "id": "schedule-1",
    "eventId": "event-1",
    "startTimeMinutes": 540,
    "timeSlots": [
      {
        "id": "slot-1",
        "scheduleId": "schedule-1",
        "order": 0,
        "durationMinutes": 60,
        "label": "Instructie",
        "color": "#6b7280",
        "isBreak": false,
        "scheduledPhases": []
      }
    ]
  }
};

export function installLoadPlannerScheduleMock() {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url);
    const matchesUrl = request.url === "/api/v1/events/event-1/schedule" || requestUrl.pathname + requestUrl.search === "/api/v1/events/event-1/schedule";

    if (request.method !== "GET" || !matchesUrl) {
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }

    calls.push(request);

    return new Response(JSON.stringify(loadPlannerScheduleResponse), {
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

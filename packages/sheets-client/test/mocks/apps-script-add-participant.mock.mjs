export const appsScriptAddParticipantResponse = {
  "ok": true,
  "data": {
    "id": "participant-9",
    "name": "New Fighter",
    "linkedUserEmail": null
  }
};

export function installAppsScriptAddParticipantMock() {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url);
    const matchesUrl = request.url === "https://script.google.com/macros/s/test-deployment/exec" || requestUrl.pathname + requestUrl.search === "https://script.google.com/macros/s/test-deployment/exec";

    if (request.method !== "POST" || !matchesUrl) {
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }

    calls.push(request);

    return new Response(JSON.stringify(appsScriptAddParticipantResponse), {
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

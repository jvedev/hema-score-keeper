export const appsScriptFailureResponse = {
  "ok": false,
  "error": "Spreadsheet not found."
};

export function installAppsScriptFailureMock() {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url);
    const matchesUrl = request.url === "https://script.google.com/macros/s/test-deployment/exec?action=listCompetitions" || requestUrl.pathname + requestUrl.search === "https://script.google.com/macros/s/test-deployment/exec?action=listCompetitions";

    if (request.method !== "GET" || !matchesUrl) {
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }

    calls.push(request);

    return new Response(JSON.stringify(appsScriptFailureResponse), {
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

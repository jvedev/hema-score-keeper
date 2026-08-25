export const appsScriptListCompetitionsResponse = {
  "ok": true,
  "data": [
    {
      "name": "Autumn Open",
      "startDate": "2026-09-12",
      "endDate": "2026-09-13",
      "spreadsheetId": "sheet-1"
    }
  ]
};

export function installAppsScriptListCompetitionsMock() {
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

    return new Response(JSON.stringify(appsScriptListCompetitionsResponse), {
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

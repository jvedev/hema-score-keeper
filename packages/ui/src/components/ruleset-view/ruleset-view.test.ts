import { afterEach, describe, expect, it } from "vitest";
import type { ApiRulesetDefinition, ApiRulesetDetail } from "@hema/event-admin-api";
import "./ruleset-view";

describe("ruleset-view", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
  });

  it("renders the ruleset list and saves a ruleset definition from the popup", async () => {
    const requests: Array<{ method: string; url: string; body?: unknown }> = [];
    installRulesetViewMock(requests);
    const element = document.createElement("ruleset-view");
    element.setAttribute("event-id", "event-1");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    const rulesetCard = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, ".ruleset-card");
    expect(rulesetCard.textContent).toContain("Standard v1");

    const addButton = await waitForElement<HTMLButtonElement>(element.shadowRoot as ShadowRoot, 'button[data-action="new-ruleset"]');
    addButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const modal = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, ".modal-card");
    expect(modal.textContent).toContain("Create ruleset");
    expect(modal.textContent).toContain("Weapon class");

    setInputValue(element.shadowRoot as ShadowRoot, 'input[name="name"]', "Offhand");
    setInputValue(element.shadowRoot as ShadowRoot, 'input[name="weaponClass"]', "Longsword");
    setInputValue(element.shadowRoot as ShadowRoot, 'input[name="maxDurationSeconds"]', "240");
    setInputValue(element.shadowRoot as ShadowRoot, 'input[name="scores"]', "1, 2, 3");

    const addPenaltyButton = await waitForElement<HTMLButtonElement>(element.shadowRoot as ShadowRoot, 'button[data-action="add-penalty"]');
    addPenaltyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    setInputValue(element.shadowRoot as ShadowRoot, 'input[name="penalty-description-0"]', "Late hit");
    setInputValue(element.shadowRoot as ShadowRoot, 'input[name="penalty-values-0"]', "0, 1");
    const penaltyCheckbox = await waitForElement<HTMLInputElement>(element.shadowRoot as ShadowRoot, 'input[name="penalty-disqualify-0"]');
    penaltyCheckbox.checked = true;

    const form = await waitForElement<HTMLFormElement>(element.shadowRoot as ShadowRoot, 'form[data-action="ruleset-editor"]');
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    await flush();

    const postRequest = requests.find((request) => request.method === "POST");
    expect(postRequest).toBeDefined();
    expect(postRequest?.body).toMatchObject({
      name: "Offhand",
      definition: {
        weaponClass: "Longsword",
        matchParameters: {
          maxDurationSeconds: 240,
          scores: [1, 2, 3],
          penalties: [
            {
              description: "Late hit",
              penalties: [0, 1],
              disqualify: true,
            },
          ],
        },
      },
    });

    const cards = await waitForElements<HTMLElement>(element.shadowRoot as ShadowRoot, ".ruleset-card", 2);
    expect(cards.some((card) => card.textContent?.includes("Offhand v2"))).toBe(true);
  });
});

function installRulesetViewMock(requests: Array<{ method: string; url: string; body?: unknown }>) {
  let rulesets: ApiRulesetDetail[] = [
    {
      id: "ruleset-1",
      eventId: "event-1",
      name: "Standard",
      version: 1,
      definition: {
        weaponClass: "Longsword",
        matchParameters: {
          maxDurationSeconds: 180,
          stopOnTimeOut: true,
          maxPointsCap: 10,
          pointSpreadVictory: 5,
          scores: [1, 2, 3, 4],
          maxDoubles: 3,
          allowAfterBlow: true,
          countDoubles: true,
          useNetScore: true,
          penalties: [],
        },
      },
      matchCount: 1,
      locked: true,
    },
  ];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const pathname = new URL(request.url).pathname;
    const body = await readJsonBody(request);
    requests.push({ method: request.method, url: request.url, body });

    if (request.method === "GET" && pathname === "/api/v1/events/event-1/rulesets") {
      return jsonResponse(rulesets);
    }

    if (request.method === "POST" && pathname === "/api/v1/events/event-1/rulesets") {
      const definition = typeof body === "object" && body && "definition" in body
        ? (body as { definition: ApiRulesetDefinition | null }).definition
        : null;
      const created: ApiRulesetDetail = {
        id: "ruleset-2",
        eventId: "event-1",
        name: typeof body === "object" && body && "name" in body ? String((body as { name?: string }).name) : "Untitled",
        version: 2,
        definition,
        matchCount: 0,
        locked: false,
      };
      rulesets = [...rulesets, created];
      return jsonResponse(created);
    }

    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = root.querySelector(selector);
    if (element instanceof Element) {
      return element as T;
    }
    await flush();
  }

  throw new Error(`Element not found for selector: ${selector}`);
}

async function waitForElements<T extends Element>(root: ParentNode, selector: string, count: number): Promise<T[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const elements = root.querySelectorAll(selector);
    if (elements.length >= count) {
      return Array.from(elements) as T[];
    }
    await flush();
  }

  throw new Error(`Elements not found for selector: ${selector}`);
}

function setInputValue(root: ParentNode, selector: string, value: string): void {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Input not found for selector: ${selector}`);
  }
  element.value = value;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  return request.json();
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

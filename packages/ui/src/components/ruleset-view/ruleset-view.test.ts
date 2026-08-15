import { afterEach, describe, expect, it } from "vitest";
import "./ruleset-view";

describe("ruleset-view", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
  });

  it("renders the ruleset list and opens the popup from the plus button", async () => {
    installRulesetViewMock();
    const element = document.createElement("ruleset-view");
    element.setAttribute("event-id", "event-1");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    const rulesetCard = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, ".ruleset-card");
    expect(rulesetCard.textContent).toContain("Standard");

    const addButton = await waitForElement<HTMLButtonElement>(element.shadowRoot as ShadowRoot, 'button[data-action="new-ruleset"]');
    addButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const modal = await waitForElement<HTMLElement>(element.shadowRoot as ShadowRoot, ".modal-card");
    expect(modal.textContent).toContain("Nieuwe ruleset");
    expect(modal.textContent).toContain("Naam");
  });
});

function installRulesetViewMock() {
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const pathname = new URL(request.url).pathname;

    if (request.method === "GET" && pathname === "/api/v1/events/event-1/rulesets") {
      return jsonResponse([
        {
          id: "ruleset-1",
          eventId: "event-1",
          name: "Standard",
          version: 1,
          matchCount: 1,
          locked: true,
        },
      ]);
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

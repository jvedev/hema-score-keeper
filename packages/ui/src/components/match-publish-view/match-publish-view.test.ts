import { describe, expect, it } from "vitest";
import "./match-publish-view";

describe("match-publish-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("match-publish-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

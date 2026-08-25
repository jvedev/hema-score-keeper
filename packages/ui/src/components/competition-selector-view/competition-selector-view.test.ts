import { describe, expect, it } from "vitest";
import "./competition-selector-view";

describe("competition-selector-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("competition-selector-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

import { describe, expect, it } from "vitest";
import "./ranking-view";

describe("ranking-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("ranking-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

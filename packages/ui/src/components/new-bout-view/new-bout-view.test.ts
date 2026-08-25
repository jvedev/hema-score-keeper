import { describe, expect, it } from "vitest";
import "./new-bout-view";

describe("new-bout-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("new-bout-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

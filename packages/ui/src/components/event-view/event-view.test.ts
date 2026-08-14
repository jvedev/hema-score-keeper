import { describe, expect, it } from "vitest";
import "./event-view";

describe("event-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("event-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

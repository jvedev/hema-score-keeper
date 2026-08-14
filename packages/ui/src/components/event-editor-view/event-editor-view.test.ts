import { describe, expect, it } from "vitest";
import "./event-editor-view";

describe("event-editor-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("event-editor-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

import { describe, expect, it } from "vitest";
import "./participants-view";

describe("participants-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("participants-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

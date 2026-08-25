import { describe, expect, it } from "vitest";
import "./bouts-view";

describe("bouts-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("bouts-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

import { describe, expect, it } from "vitest";
import "./bout-details-view";

describe("bout-details-view", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("bout-details-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

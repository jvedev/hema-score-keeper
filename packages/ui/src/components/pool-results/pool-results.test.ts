import { describe, expect, it } from "vitest";
import "./pool-results";

describe("pool-results", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("pool-results");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});

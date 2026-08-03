import { describe, expect, it } from "vitest";
import "./score-edit-view";

describe("score-edit-view", () => {
  it("opens with the supplied fighter and score", () => {
    const element = document.createElement("score-edit-view");
    document.body.appendChild(element);

    element.open(4, "Fighter A");

    expect(element.hasAttribute("open")).toBe(true);
    expect(element.shadowRoot?.querySelector(".name")?.textContent).toBe(
      "Fighter A",
    );
    expect(element.shadowRoot?.querySelector(".value")?.textContent).toBe("4");

    element.remove();
  });
});

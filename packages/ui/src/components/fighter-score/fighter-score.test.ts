import { describe, expect, it } from "vitest";
import "./fighter-score";

describe("fighter-score", () => {
  it("renders attributes and can reset the score", () => {
    const element = document.createElement("fighter-score");
    element.setAttribute("name", "Fighter B");
    element.setAttribute("score", "5");
    element.setAttribute("background-color", "#ffffff");
    element.setAttribute("text-color", "#000000");
    document.body.appendChild(element);

    expect(element.score).toBe(5);
    expect(element.shadowRoot?.querySelector(".name-text")?.textContent).toBe(
      "Fighter B",
    );
    const panel = element.shadowRoot?.querySelector<HTMLElement>(".panel");
    expect(panel?.style.getPropertyValue("--fighter-background-color")).toBe(
      "#ffffff",
    );
    expect(panel?.style.getPropertyValue("--fighter-text-color")).toBe(
      "#000000",
    );

    element.reset();
    expect(element.score).toBe(0);

    element.remove();
  });
});

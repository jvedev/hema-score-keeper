import { describe, expect, it } from "vitest";
import "./fight-view";

describe("fight-view", () => {
  it("renders the fight controls", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    expect(element.shadowRoot?.querySelector("#hit-button")?.textContent).toBe(
      "Hit",
    );
    expect(
      element.shadowRoot?.querySelector("#timeout-button")?.textContent?.trim(),
    ).toBe("Start");

    element.remove();
  });

  it("applies arena properties", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    element.configureArena({
      name: "Finals",
      leftFighterStyle: {
        backgroundColor: "#ff0000",
        textColor: "#ffffff",
      },
      rightFighterStyle: {
        backgroundColor: "#0000ff",
        textColor: "#ffff00",
      },
    });

    expect(element.shadowRoot?.querySelector("#arena-name")?.textContent).toBe(
      "Finals",
    );
    expect(
      element.style.getPropertyValue("--hema-left-background-color"),
    ).toBe("#ff0000");
    expect(element.style.getPropertyValue("--hema-left-text-color")).toBe(
      "#ffffff",
    );
    expect(
      element.style.getPropertyValue("--hema-right-background-color"),
    ).toBe(
      "#0000ff",
    );
    expect(element.style.getPropertyValue("--hema-right-text-color")).toBe(
      "#ffff00",
    );

    element.remove();
  });
});

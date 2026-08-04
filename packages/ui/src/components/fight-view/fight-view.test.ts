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

  it("updates both displayed fighter scores", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    element.setScores({ fighterAScore: 3, fighterBScore: 1 });

    const fighterA =
      element.shadowRoot?.querySelector<HTMLElementTagNameMap["fighter-score"]>(
        "#fighter-left",
      );
    const fighterB =
      element.shadowRoot?.querySelector<HTMLElementTagNameMap["fighter-score"]>(
        "#fighter-right",
      );
    expect(fighterA?.score).toBe(3);
    expect(fighterB?.score).toBe(1);

    element.remove();
  });

  it("disables match actions when the match is inactive", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    element.setMatchActive(false);

    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#hit-button")
        ?.disabled,
    ).toBe(true);
    const forfeit =
      element.shadowRoot?.querySelector<HTMLElementTagNameMap["confirm-button"]>(
        "#forfeit-button",
      );
    expect(
      forfeit?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.disabled,
    ).toBe(true);

    element.remove();
  });
});

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
      fighterAName: "Alice",
      fighterBName: "Bob",
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
      element.shadowRoot
        ?.querySelector<HTMLElementTagNameMap["fighter-score"]>("#fighter-left")
        ?.getAttribute("name"),
    ).toBe("Alice");
    expect(
      element.shadowRoot
        ?.querySelector<HTMLElementTagNameMap["fighter-score"]>("#fighter-right")
        ?.getAttribute("name"),
    ).toBe("Bob");
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

  it("keeps the fight in start mode before the match begins", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    element.setMatchActive(true);
    element.setMatchStarted(false);

    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#hit-button")
        ?.disabled,
    ).toBe(true);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#warning-button")
        ?.disabled,
    ).toBe(true);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
        ?.disabled,
    ).toBe(false);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
        ?.classList.contains("starting"),
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

  it("enables the action buttons after the match starts", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    element.setMatchActive(true);
    element.setMatchStarted(false);

    element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
      ?.click();

    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#hit-button")
        ?.disabled,
    ).toBe(false);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#warning-button")
        ?.disabled,
    ).toBe(false);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
        ?.textContent?.trim(),
    ).toBe("Timeout");
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
        ?.classList.contains("starting"),
    ).toBe(false);

    element.remove();
  });
});

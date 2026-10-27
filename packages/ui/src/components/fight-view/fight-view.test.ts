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
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#end-match-button")
        ?.hidden,
    ).toBe(false);

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

  it("reports the clock when the match is ended", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);
    element.setMatchStarted(true);
    const ended: unknown[] = [];
    element.addEventListener("end-match-requested", (event) => ended.push((event as CustomEvent).detail));
    const button = element.shadowRoot!.querySelector<HTMLButtonElement>("#end-match-button")!;
    button.disabled = false;
    button.click();
    expect(ended).toHaveLength(1);
    expect(ended[0]).toEqual({ elapsedTimeSeconds: expect.any(Number) });
    element.remove();
  });

  it("updates both displayed fighter scores", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);

    element.setScores({ fighterAScore: -3, fighterBScore: 1 });

    const fighterA =
      element.shadowRoot?.querySelector<HTMLElementTagNameMap["fighter-score"]>(
        "#fighter-left",
      );
    const fighterB =
      element.shadowRoot?.querySelector<HTMLElementTagNameMap["fighter-score"]>(
        "#fighter-right",
      );
    expect(fighterA?.score).toBe(-3);
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
        ?.hidden,
    ).toBe(true);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#warning-button")
        ?.hidden,
    ).toBe(true);
    expect(
      getComputedStyle(
        element.shadowRoot?.querySelector<HTMLButtonElement>("#hit-button") ??
          document.createElement("button"),
      ).display,
    ).toBe("none");
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
        ?.disabled,
    ).toBe(false);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#timeout-button")
        ?.classList.contains("starting"),
    ).toBe(true);
    expect(
      element.shadowRoot?.querySelector<HTMLElement>(".button-stack")
        ?.classList.contains("pre-start"),
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
        ?.hidden,
    ).toBe(false);
    expect(
      element.shadowRoot?.querySelector<HTMLButtonElement>("#warning-button")
        ?.hidden,
    ).toBe(false);
    expect(
      getComputedStyle(
        element.shadowRoot?.querySelector<HTMLButtonElement>("#hit-button") ??
          document.createElement("button"),
      ).display,
    ).not.toBe("none");
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


  it("ring mode hides reset and forfeit and locks the score correction", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);
    const root = element.shadowRoot!;

    element.setRingMode(true);
    expect(root.querySelector<HTMLElement>("#reset-button")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("#forfeit-button")?.hidden).toBe(true);
    expect(root.querySelector("#fighter-left")?.hasAttribute("locked")).toBe(true);
    expect(root.querySelector("#fighter-right")?.hasAttribute("locked")).toBe(true);
    expect(root.querySelector('slot[name="ring-bar"]')).not.toBeNull();
    // The bout time is not edited by hand in ring mode (keeper or read-only).
    expect(root.querySelector("#timer")?.hasAttribute("locked")).toBe(true);

    element.setRingMode(false);
    expect(root.querySelector<HTMLElement>("#reset-button")?.hidden).toBe(false);
    expect(root.querySelector("#fighter-left")?.hasAttribute("locked")).toBe(false);
    element.remove();
  });

  it("opens paused at a stored clock and reports each pause and resume", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);
    const root = element.shadowRoot!;
    element.setMatchDuration(120);
    element.setMatchActive(true);
    element.setClock(75, true);
    expect(element.clockSeconds).toBe(75);
    expect(element.clockRunning).toBe(false);
    expect(root.querySelector("#timer")?.shadowRoot?.querySelector(".digits")?.textContent).toBe("00:45");
    expect(root.querySelector<HTMLButtonElement>("#hit-button")?.disabled).toBe(false);

    const reports: Array<{ elapsedTimeSeconds: number; running: boolean }> = [];
    element.addEventListener("clock-toggled", (event) => reports.push(event.detail));
    root.querySelector<HTMLButtonElement>("#timeout-button")!.click();
    root.querySelector<HTMLButtonElement>("#timeout-button")!.click();
    expect(reports).toEqual([
      { elapsedTimeSeconds: 75, running: true },
      { elapsedTimeSeconds: 75, running: false },
    ]);
    element.remove();
  });

  it("read-only stops the clock and disables every control", () => {
    const element = document.createElement("fight-view");
    document.body.appendChild(element);
    const root = element.shadowRoot!;
    element.setMatchActive(true);
    element.setClock(10, true);
    root.querySelector<HTMLButtonElement>("#timeout-button")!.click();
    expect(element.clockRunning).toBe(true);

    element.setReadOnly(true);
    expect(element.clockRunning).toBe(false);
    for (const id of ["#hit-button", "#warning-button", "#timeout-button", "#end-match-button"]) {
      expect(root.querySelector<HTMLButtonElement>(id)?.disabled).toBe(true);
    }
    expect(root.querySelector("#fighter-left")?.hasAttribute("locked")).toBe(true);
    expect(root.querySelector("#timer")?.hasAttribute("locked")).toBe(true);
    // Disabled buttons look dimmed in the read-only view, and normally again afterwards.
    expect(Number(getComputedStyle(root.querySelector("#hit-button")!).opacity)).toBeLessThan(1);

    element.setReadOnly(false);
    expect(Number(getComputedStyle(root.querySelector("#hit-button")!).opacity)).toBe(1);
    expect(root.querySelector("#timer")?.hasAttribute("locked")).toBe(false);
    expect(root.querySelector<HTMLButtonElement>("#hit-button")?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>("#end-match-button")?.disabled).toBe(false);
    element.remove();
  });
});

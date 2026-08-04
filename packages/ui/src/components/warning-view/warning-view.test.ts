import { describe, expect, it } from "vitest";
import "./warning-view";

describe("warning-view", () => {
  it("walks through fighter, warning and deduction steps", () => {
    const element = document.createElement("warning-view");
    document.body.appendChild(element);
    element.configure({
      fighterA: {
        name: "Fighter A",
        backgroundColor: "#fff",
        textColor: "#000",
      },
      fighterB: {
        name: "Fighter B",
        backgroundColor: "#000",
        textColor: "#fff",
      },
      penalties: [
        {
          description: "Ring out",
          penalties: [1],
          disqualify: false,
        },
      ],
    });
    element.open(20);

    (element.shadowRoot?.querySelector(".fighter-a") as HTMLButtonElement).click();
    (
      element.shadowRoot?.querySelector(".penalty-option") as HTMLButtonElement
    ).click();

    expect(
      element.shadowRoot?.querySelector(".deduction-option")?.textContent,
    ).toBe("1 point");

    element.remove();
  });

  it("dispatches a confirmed warning match event", () => {
    const element = document.createElement("warning-view");
    document.body.appendChild(element);
    element.configure({
      fighterA: {
        name: "Fighter A",
        backgroundColor: "#fff",
        textColor: "#000",
      },
      fighterB: {
        name: "Fighter B",
        backgroundColor: "#000",
        textColor: "#fff",
      },
      penalties: [
        {
          description: "Ring out",
          penalties: [1],
          disqualify: false,
        },
      ],
    });
    let detail:
      | import("../../events/match-event").MatchEventDetail
      | undefined;
    window.addEventListener(
      "match-event",
      (event) => {
        detail = event.detail;
      },
      { once: true },
    );
    element.open(25);

    (element.shadowRoot?.querySelector(".fighter-b") as HTMLButtonElement).click();
    (
      element.shadowRoot?.querySelector(".penalty-option") as HTMLButtonElement
    ).click();
    (
      element.shadowRoot?.querySelector(".deduction-option") as HTMLButtonElement
    ).click();
    const confirm = element.shadowRoot?.querySelector("confirm-button");
    const confirmButton = confirm?.shadowRoot?.querySelector("button");
    confirmButton?.click();
    confirmButton?.click();

    expect(detail).toEqual({
      elapsedTimeSeconds: 25,
      type: "warning",
      fighter: "B",
      description: "Ring out",
      pointsDeducted: 1,
    });

    element.remove();
  });
});

import { describe, expect, it } from "vitest";
import "./select-bout-view";

describe("select-bout-view", () => {
  it("renders bouts and emits the selected bout id", () => {
    const element = document.createElement("select-bout-view");
    document.body.appendChild(element);
    element.configure({
      arenaName: "Arena 1",
      fighterCount: 5,
      bouts: [
        {
          id: "bout-1",
          sequenceNumber: 1,
          round: 1,
          fighterAName: "Alex",
          fighterBName: "Blake",
        },
      ],
    });
    let selectedBoutId: string | undefined;
    element.addEventListener("bout-selected", (event) => {
      selectedBoutId = event.detail.boutId;
    });

    const button =
      element.shadowRoot?.querySelector<HTMLButtonElement>(".bout-button");
    expect(button?.textContent).toContain("Bout 1");
    expect(button?.textContent).toContain("Alex vs Blake");
    button?.click();
    expect(selectedBoutId).toBe("bout-1");
  });
});

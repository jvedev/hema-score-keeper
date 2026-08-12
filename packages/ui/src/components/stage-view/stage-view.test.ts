import { describe, expect, it } from "vitest";
import "./stage-view";

describe("stage-view", () => {
  it("renders the sample tournament stage", () => {
    const element = document.createElement("stage-view");
    document.body.appendChild(element);

    expect(element.shadowRoot?.querySelector("h1")?.textContent).toContain(
      "Tournament admin",
    );
    expect(
      element.shadowRoot?.querySelectorAll("[data-drag-kind='participant']")
        .length,
    ).toBe(23);

    element.remove();
  });

  it("creates a pool from an empty arena and timeslot cell", () => {
    const element = document.createElement("stage-view");
    document.body.appendChild(element);

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>("[data-action='create-pool']")
      ?.click();

    expect(element.shadowRoot?.querySelector(".pool-card")).not.toBeNull();

    element.remove();
  });
});

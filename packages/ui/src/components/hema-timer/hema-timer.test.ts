import { describe, expect, it } from "vitest";
import "./hema-timer";

describe("hema-timer", () => {
  it("renders its configured duration", () => {
    const element = document.createElement("hema-timer");
    element.setAttribute("seconds", "90");
    document.body.appendChild(element);

    expect(element.shadowRoot?.querySelector(".digits")?.textContent).toBe(
      "01:30",
    );
    expect(element.remainingSeconds).toBe(90);

    element.remove();
  });
});

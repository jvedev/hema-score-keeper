import { describe, expect, it } from "vitest";
import "./confirm-button";

describe("confirm-button", () => {
  it("requires two clicks before confirming", () => {
    const element = document.createElement("confirm-button");
    element.setAttribute("label", "Reset");
    document.body.appendChild(element);
    let confirmationCount = 0;
    element.addEventListener("confirmed", () => confirmationCount++);
    const button = element.shadowRoot?.querySelector("button");

    button?.click();
    expect(confirmationCount).toBe(0);
    button?.click();
    expect(confirmationCount).toBe(1);
    expect(button?.textContent).toBe("Reset");

    element.remove();
  });
});

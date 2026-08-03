import { describe, expect, it } from "vitest";
import "./action-dialog";

describe("action-dialog", () => {
  it("exposes explicit open and close behavior", () => {
    const element = document.createElement("action-dialog");
    element.setAttribute("heading", "Hit");
    document.body.appendChild(element);

    element.open();
    expect(element.hasAttribute("open")).toBe(true);
    expect(element.shadowRoot?.querySelector("h2")?.textContent).toBe("Hit");

    element.close();
    expect(element.hasAttribute("open")).toBe(false);

    element.remove();
  });
});

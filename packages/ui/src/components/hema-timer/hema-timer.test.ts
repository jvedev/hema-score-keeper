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

  it("a double tap opens the time edit, unless the timer is locked", () => {
    const element = document.createElement("hema-timer");
    document.body.appendChild(element);
    const face = element.shadowRoot!.querySelector<HTMLElement>(".face")!;
    const adjust = element.shadowRoot!.querySelector(".adjust")!;
    element.setAttribute("locked", "");
    face.click();
    face.click();
    expect(adjust.classList.contains("open")).toBe(false);
    element.removeAttribute("locked");
    face.click();
    face.click();
    expect(adjust.classList.contains("open")).toBe(true);
    element.remove();
  });

  it("hides the double-tap hint while locked", () => {
    const element = document.createElement("hema-timer");
    document.body.appendChild(element);
    const hint = element.shadowRoot!.querySelector<HTMLElement>(".hint")!;
    expect(getComputedStyle(hint).display).not.toBe("none");
    element.setAttribute("locked", "");
    expect(getComputedStyle(hint).display).toBe("none");
    element.remove();
  });
});

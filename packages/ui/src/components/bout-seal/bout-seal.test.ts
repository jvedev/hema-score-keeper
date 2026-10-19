import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import "./bout-seal.js";

const mounted: HTMLElement[] = [];

function mount(attributes: Record<string, string> = {}): HTMLElement {
  const seal = document.createElement("bout-seal");
  for (const [name, value] of Object.entries(attributes)) {
    seal.setAttribute(name, value);
  }
  document.body.appendChild(seal);
  mounted.push(seal);
  return seal;
}

const svg = (seal: HTMLElement) => seal.shadowRoot!.querySelector("svg")!;
const filledSectors = (seal: HTMLElement) => seal.shadowRoot!.querySelectorAll(".sector.on").length;

afterEach(() => {
  mounted.splice(0).forEach((seal) => seal.remove());
  setLocale("en");
});

describe("bout-seal", () => {
  it("shows three empty sectors for a scored bout", () => {
    const seal = mount();
    expect(seal.shadowRoot!.querySelectorAll(".sector")).toHaveLength(3);
    expect(filledSectors(seal)).toBe(0);
    expect(svg(seal).getAttribute("role")).toBe("img");
    expect(svg(seal).getAttribute("aria-label")).toBe("Scored, waiting for the referee");
  });

  it("fills a sector per approval", () => {
    const seal = mount({ status: "COUNTED", "referee-approved": "", "fighter-a-approved": "" });
    expect(filledSectors(seal)).toBe(2);
    expect(svg(seal).getAttribute("aria-label")).toBe("Counts; waiting for fighters");
  });

  it("shows a final bout as a solid mark without sectors", () => {
    const seal = mount({ status: "FINAL" });
    expect(svg(seal).classList.contains("final")).toBe(true);
    expect(seal.shadowRoot!.querySelectorAll(".sector")).toHaveLength(0);
  });

  it("marks voided and objected bouts", () => {
    expect(svg(mount({ status: "VOIDED" })).classList.contains("void")).toBe(true);
    const objected = mount({ status: "OBJECTED", "referee-approved": "" });
    expect(svg(objected).classList.contains("objected")).toBe(true);
    expect(filledSectors(objected)).toBe(1);
  });

  it("updates when an attribute changes after mounting", () => {
    const seal = mount({ status: "COUNTED", "referee-approved": "" });
    seal.setAttribute("fighter-b-approved", "");
    expect(filledSectors(seal)).toBe(2);
    seal.setAttribute("status", "FINAL");
    expect(svg(seal).classList.contains("final")).toBe(true);
  });

  it("supports a large size", () => {
    expect(svg(mount({ size: "lg" })).getAttribute("width")).toBe("44");
  });

  it("renders in Dutch", () => {
    const seal = mount({ status: "FINAL" });
    setLocale("nl");
    expect(svg(seal).getAttribute("aria-label")).toBe("Definitief");
  });
});

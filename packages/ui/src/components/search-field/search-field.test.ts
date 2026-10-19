import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import "./search-field.js";

const mounted: HTMLElement[] = [];

function mount(attributes: Record<string, string> = {}) {
  const field = document.createElement("search-field");
  for (const [name, value] of Object.entries(attributes)) {
    field.setAttribute(name, value);
  }
  document.body.appendChild(field);
  mounted.push(field);
  const queries: string[] = [];
  field.addEventListener("search-changed", (event) => queries.push(event.detail.query));
  const input = field.shadowRoot!.querySelector("input")!;
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { field, input, queries, type };
}

afterEach(() => {
  mounted.splice(0).forEach((field) => field.remove());
  setLocale("en");
});

describe("search-field", () => {
  it("reports the query in lower case", () => {
    const { queries, type } = mount();
    type("Ochs");
    expect(queries).toEqual(["ochs"]);
  });

  it("normalises the query", () => {
    const { queries, type } = mount();
    type("  OCHS  ");
    expect(queries).toEqual(["ochs"]);
  });

  it("clears with the clear button and with Escape", () => {
    const { field, input, queries, type } = mount();
    type("ochs");
    field.shadowRoot!.querySelector<HTMLButtonElement>("button.clear")!.click();
    expect(input.value).toBe("");
    type("leiden");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(input.value).toBe("");
    expect(queries).toEqual(["ochs", "", "leiden", ""]);
  });

  it("only shows the clear button with text", () => {
    const { field, type } = mount();
    const clear = field.shadowRoot!.querySelector<HTMLButtonElement>("button.clear")!;
    expect(clear.hidden).toBe(true);
    type("x");
    expect(clear.hidden).toBe(false);
  });

  it("shows a counter while searching", () => {
    const { field, type } = mount({ count: "3", total: "6" });
    const counter = () => field.shadowRoot!.querySelector(".count")!.textContent;
    expect(counter()).toBe("");
    type("ochs");
    expect(counter()).toBe("3 of 6");
    field.setAttribute("count", "1");
    expect(counter()).toBe("1 of 6");
  });

  it("exposes and accepts its value", () => {
    const { field, input } = mount();
    field.value = "Tomas";
    expect(input.value).toBe("Tomas");
    expect(field.value).toBe("Tomas");
  });

  it("has a Dutch placeholder", () => {
    const { field } = mount();
    setLocale("nl");
    expect(field.shadowRoot!.querySelector("input")!.placeholder).toBe("Zoeken");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { BaseComponent } from "../components/base-component/base-component.js";
import { currentLocale, formatDateTime, formatSigned, LOCALE_CHANGE_EVENT, setLocale, t } from "./i18n.js";
import { en } from "./messages/en.js";
import { nl } from "./messages/nl.js";

afterEach(() => {
  setLocale("en");
});

describe("currentLocale", () => {
  it.each([
    ["", "en"],
    ["nl-NL", "nl"],
    ["nl", "nl"],
    ["de", "en"],
  ])("reads %j as %s", (lang, expected) => {
    document.documentElement.lang = lang;
    expect(currentLocale()).toBe(expected);
  });
});

describe("t", () => {
  it("fills placeholders in the current language", () => {
    expect(t("common.noResults", { query: "ochs" })).toBe("Nothing matches “ochs”.");
    setLocale("nl");
    expect(t("common.noResults", { query: "ochs" })).toBe("Niets gevonden voor “ochs”.");
  });

  it("returns the key itself for an unknown key", () => {
    expect(t("lifecycle.SOMETHING_NEW" as Parameters<typeof t>[0])).toBe("lifecycle.SOMETHING_NEW");
    setLocale("nl");
    expect(t("no.such.key" as Parameters<typeof t>[0], { name: "x" })).toBe("no.such.key");
  });
});

describe("setLocale", () => {
  it("sets the page language and announces the change once", () => {
    let calls = 0;
    const listener = () => calls++;
    window.addEventListener(LOCALE_CHANGE_EVENT, listener);
    setLocale("nl");
    window.removeEventListener(LOCALE_CHANGE_EVENT, listener);

    expect(document.documentElement.lang).toBe("nl");
    expect(calls).toBe(1);
  });
});

describe("formatting", () => {
  it("signs numbers with a real minus", () => {
    expect(formatSigned(16)).toBe("+16");
    expect(formatSigned(-14)).toBe("−14");
    expect(formatSigned(0)).toBe("0");
  });

  it("formats date and time per language", () => {
    const english = formatDateTime("2026-10-15T18:40:00.000Z", "dateTime", "Europe/Amsterdam");
    expect(english).toContain("2026");
    expect(english).toContain("20:40");
    expect(english).toContain("Oct");
    setLocale("nl");
    expect(formatDateTime("2026-10-15T18:40:00.000Z", "date", "Europe/Amsterdam")).toContain("okt");
  });
});

describe("catalogs", () => {
  it("have the same keys and no empty Dutch text", () => {
    expect(Object.keys(nl).sort()).toEqual(Object.keys(en).sort());
    expect(Object.values(nl).filter((value) => value.trim() === "")).toEqual([]);
  });
});

class LocaleProbe extends BaseComponent {
  connectedCallback(): void {
    const draw = () => this.render("", `<span>${t("common.search")}</span>`);
    draw();
    this.onLocaleChange(draw);
  }
}
customElements.define("locale-probe", LocaleProbe);

describe("BaseComponent.onLocaleChange", () => {
  it("re-renders on locale change", () => {
    const probe = document.createElement("locale-probe");
    document.body.appendChild(probe);
    expect(probe.shadowRoot?.querySelector("span")?.textContent).toBe("Search");

    setLocale("nl");
    expect(probe.shadowRoot?.querySelector("span")?.textContent).toBe("Zoeken");

    probe.remove();
    setLocale("en");
    expect(probe.shadowRoot?.querySelector("span")?.textContent).toBe("Zoeken");
  });
});

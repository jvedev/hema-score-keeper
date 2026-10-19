import { afterEach, describe, expect, it } from "vitest";
import * as ui from "../../index.js";
import { setLocale } from "../../i18n/i18n.js";
import type { BoutDetailView } from "../../models/competition-views.js";
import "./bout-details.js";

const bout: BoutDetailView = {
  boutId: "b1",
  status: "FINAL",
  approvals: { referee: true, A: true, B: true },
  fighterA: { userId: "f1", name: "Ilse Bakker" },
  fighterB: { userId: "f2", name: "Tomas Kuiper" },
  scoreA: 3,
  scoreB: 5,
  startedAt: "2026-10-15T18:40:00.000Z",
  location: "Ochs Utrecht, ring 2",
  rulesetLabel: "Longsword v2 · 3:00 · first to 7",
  officials: {
    referee: { userId: "ref", name: "Joris Meijer" },
    jury: [{ userId: "j1", name: "Sanne Visser" }],
    table: { userId: "t", name: "Daan Mulder" },
  },
  exchanges: [
    { atSeconds: 12, kind: "SCORE", side: "B", points: 1, reason: null },
    { atSeconds: 82, kind: "WARNING", side: "A", points: 0, reason: "grappling after halt" },
  ],
  windowEndsAt: null,
  objection: null,
  voidReason: null,
};

const mounted: HTMLElement[] = [];

function mount(data: BoutDetailView = bout, attributes: Record<string, string> = {}): HTMLElement {
  const details = document.createElement("bout-details");
  for (const [name, value] of Object.entries(attributes)) {
    details.setAttribute(name, value);
  }
  details.bout = data;
  document.body.appendChild(details);
  mounted.push(details);
  return details;
}

const text = (details: HTMLElement) => details.shadowRoot!.textContent ?? "";
const exchanges = (details: HTMLElement) => details.shadowRoot!.querySelector("bout-exchanges")!;

afterEach(() => {
  mounted.splice(0).forEach((details) => details.remove());
  setLocale("en");
});

describe("bout-details", () => {
  it("shows both fighters and the score", () => {
    const details = mount();
    expect(details.shadowRoot!.querySelector(".score")!.textContent).toBe("3–5");
    expect(text(details)).toContain("Ilse Bakker");
    expect(text(details)).toContain("Tomas Kuiper");
    expect(details.shadowRoot!.querySelector("bout-seal")!.getAttribute("status")).toBe("FINAL");
  });

  it("passes show-warnings on to the exchanges", () => {
    expect(exchanges(mount()).hasAttribute("show-warnings")).toBe(false);
    const withWarnings = mount(bout, { "show-warnings": "" });
    expect(exchanges(withWarnings).hasAttribute("show-warnings")).toBe(true);
    expect(exchanges(withWarnings).shadowRoot!.textContent).toContain("grappling after halt");
  });

  it("shows the objection and the objection window", () => {
    const objected = mount({ ...bout, status: "OBJECTED", objection: { by: "B", reason: "Last exchange was a double" } });
    expect(objected.shadowRoot!.querySelector(".notice")!.textContent).toBe("Tomas Kuiper objected: Last exchange was a double");

    const counted = mount({ ...bout, status: "COUNTED", windowEndsAt: "2026-10-18T18:40:00.000Z" });
    expect(counted.shadowRoot!.querySelector(".notice")!.textContent).toContain("Fighters can object until");
  });

  it("shows why a bout was voided", () => {
    const voided = mount({ ...bout, status: "VOIDED", voidReason: "Sanne injured" });
    expect(voided.shadowRoot!.querySelector(".notice")!.textContent).toBe("Voided: Sanne injured");
  });

  it("lists the table official with the details, not in the grid", () => {
    const details = mount();
    expect(details.shadowRoot!.querySelector(".meta")!.textContent).toContain("Daan Mulder");
    expect(details.shadowRoot!.querySelector("officials-grid")!.shadowRoot!.textContent).not.toContain("Daan Mulder");
  });

  it("renders in Dutch", () => {
    const details = mount();
    setLocale("nl");
    expect(details.shadowRoot!.querySelector(".meta")!.textContent).toContain("Wanneer");
    expect(details.shadowRoot!.querySelector("officials-grid")!.shadowRoot!.textContent).toContain("Scheidsrechter");
  });

  it("is exported from the package with the translation helpers", () => {
    expect(typeof ui.t).toBe("function");
    expect(typeof ui.setLocale).toBe("function");
    for (const name of ["BoutSeal", "SearchField", "ParticipantTable", "OfficialsGrid", "BoutExchanges", "FighterHistory", "BoutDetailsPanel"]) {
      expect(ui, name).toHaveProperty(name);
    }
  });
});

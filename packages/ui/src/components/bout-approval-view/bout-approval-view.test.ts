import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import "./bout-approval-view.js";
import type { BoutApprovalView, BoutSaveRequestedDetail } from "./bout-approval-view.js";

let view: BoutApprovalView;
let saves: BoutSaveRequestedDetail[];

const toggle = (name: "referee" | "A" | "B") => view.shadowRoot!.querySelector<HTMLInputElement>(`input[data-approval="${name}"]`)!;
const saveButton = () => view.shadowRoot!.querySelector<HTMLButtonElement>("button.save")!;

beforeEach(() => {
  saves = [];
  view = document.createElement("bout-approval-view");
  view.addEventListener("bout-save-requested", (event) => saves.push(event.detail));
  view.summary = { fighterA: "Ilse Bakker", fighterB: "Tomas Kuiper", scoreA: 3, scoreB: 5, winnerSide: "B", refereeName: "Joris Meijer" };
  document.body.appendChild(view);
});

afterEach(() => {
  view.remove();
  setLocale("en");
});

describe("bout-approval-view", () => {
  it("shows the result", () => {
    expect(view.shadowRoot!.querySelector(".score")!.textContent).toBe("3–5");
    expect(view.shadowRoot!.textContent).toContain("Tomas Kuiper");
  });

  it("only lets fighters agree once the referee approves", () => {
    expect(toggle("A").disabled).toBe(true);
    toggle("referee").click();
    expect(toggle("A").disabled).toBe(false);
    toggle("A").click();
    toggle("B").click();
    toggle("referee").click();
    expect(toggle("A").checked).toBe(false);
    expect(toggle("B").checked).toBe(false);
    expect(toggle("A").disabled).toBe(true);
  });

  it("saves once with the approvals", () => {
    toggle("referee").click();
    toggle("B").click();
    saveButton().click();
    expect(saves).toEqual([{ refereeApproves: true, fighterAApproves: false, fighterBApproves: true }]);
  });

  it("can save without any approval", () => {
    saveButton().click();
    expect(saves).toEqual([{ refereeApproves: false, fighterAApproves: false, fighterBApproves: false }]);
  });

  it("doesn't save twice while saving", () => {
    view.setSaving(true);
    expect(saveButton().disabled).toBe(true);
    saveButton().click();
    expect(saves).toEqual([]);
    view.setSaving(false);
    expect(saveButton().disabled).toBe(false);
  });

  it("shows an error", () => {
    view.setError("The server didn't answer.");
    expect(view.shadowRoot!.querySelector(".error")!.textContent).toBe("The server didn't answer.");
    view.setError(null);
    expect(view.shadowRoot!.querySelector<HTMLElement>(".error")!.hidden).toBe(true);
  });

  it("names the people in the toggles", () => {
    const labels = [...view.shadowRoot!.querySelectorAll("label.approval")].map((label) => label.textContent!.trim());
    expect(labels).toEqual(["Joris Meijer approves as referee", "Ilse Bakker agrees now", "Tomas Kuiper agrees now"]);
  });

  it("really disappears when hidden", () => {
    view.hidden = true;
    expect(getComputedStyle(view).display).toBe("none");
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect(saveButton().textContent).toBe("Partij opslaan");
  });
});

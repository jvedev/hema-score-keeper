import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { BoutDetailView } from "../../models/competition-views.js";
import "./objection-review.js";
import type { ObjectionReview } from "./objection-review.js";

const bout: BoutDetailView = {
  boutId: "b1",
  status: "OBJECTED",
  approvals: { referee: true, A: false, B: false },
  fighterA: { userId: "daan", name: "Daan Mulder" },
  fighterB: { userId: "tomas", name: "Tomas Kuiper" },
  scoreA: 4,
  scoreB: 6,
  startedAt: "2026-10-15T19:00:00.000Z",
  location: "Ring 1",
  rulesetLabel: null,
  officials: { referee: { userId: "joris", name: "Joris Meijer" }, jury: [], table: [] },
  exchanges: [],
  windowEndsAt: null,
  objection: { by: "A", reason: "Last exchange was a double" },
  voidReason: null,
};

let review: ObjectionReview;
let events: Array<{ type: string; detail: unknown }>;
const $ = <T extends Element = HTMLElement>(selector: string) => review.shadowRoot!.querySelector<T>(selector)!;

function setInput(selector: string, value: string): void {
  const input = $<HTMLInputElement | HTMLSelectElement>(selector);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  events = [];
  review = document.createElement("objection-review");
  for (const type of ["objection-restore-requested", "objection-correct-requested", "objection-void-requested"]) {
    review.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }));
  }
  review.bout = bout;
  document.body.appendChild(review);
});

afterEach(() => {
  review.remove();
  setLocale("en");
});

describe("objection-review", () => {
  it("shows the objection and the bout", () => {
    expect($(".objection").textContent).toContain("Daan Mulder objected");
    expect($(".objection").textContent).toContain("Last exchange was a double");
    expect($("bout-details")).not.toBeNull();
  });

  it("restores once", () => {
    $<HTMLButtonElement>("button.restore").click();
    expect(events).toEqual([{ type: "objection-restore-requested", detail: null }]);
  });

  it("corrects to a draw", () => {
    setInput("input.score-b", "4");
    setInput("select.winner", "");
    $<HTMLButtonElement>("button.correct").click();
    expect(events).toEqual([{ type: "objection-correct-requested", detail: { scoreA: 4, scoreB: 4, winnerSide: null } }]);
  });

  it("refuses a winner with the lower score", () => {
    setInput("select.winner", "A");
    $<HTMLButtonElement>("button.correct").click();
    expect(events).toEqual([]);
    expect($(".hint").textContent).toBe("The winner can't have the lower score.");
  });

  it("refuses a draw with different scores", () => {
    setInput("select.winner", "");
    $<HTMLButtonElement>("button.correct").click();
    expect(events).toEqual([]);
    expect($(".hint").textContent).toBe("A draw needs equal scores.");
  });

  it("needs a reason to void", () => {
    $<HTMLButtonElement>("button.void").click();
    expect(events).toEqual([]);
    setInput("input.void-reason", "Fighters agreed to refight");
    $<HTMLButtonElement>("button.void").click();
    expect(events).toEqual([{ type: "objection-void-requested", detail: { reason: "Fighters agreed to refight" } }]);
  });

  it("blocks every action while busy", () => {
    review.setBusy(true);
    for (const selector of ["button.restore", "button.correct", "button.void"]) {
      expect($<HTMLButtonElement>(selector).disabled).toBe(true);
    }
  });

  it("shows an error", () => {
    review.setError("The server didn't answer.");
    expect($(".error").textContent).toBe("The server didn't answer.");
  });

  it("legacy bout details", () => {
    review.bout = { ...bout, officials: { referee: { userId: "", name: "" }, jury: [], table: [] }, exchanges: [], location: null };
    expect($("bout-details")).not.toBeNull();
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect($("button.restore").textContent).toBe("Uitslag behouden");
  });
});

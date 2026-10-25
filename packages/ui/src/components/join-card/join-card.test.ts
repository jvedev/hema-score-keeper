import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import type { JoinCardView } from "../../models/competition-views.js";
import "./join-card.js";
import type { JoinCard } from "./join-card.js";

const open: JoinCardView = {
  id: "c1",
  name: "Lowlands Ladder",
  status: "RUNNING",
  scopeLabel: "Country: Netherlands",
  placesLeft: 5,
  signupsNeedApproval: false,
  myStatus: null,
  joinable: true,
};

let card: JoinCard;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => card.shadowRoot!.querySelector<T>(selector);
const buttons = () => [...card.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.dataset.action);

beforeEach(() => {
  card = document.createElement("join-card");
  card.competition = open;
  document.body.appendChild(card);
});

afterEach(() => {
  card.remove();
  setLocale("en");
});

describe("join-card", () => {
  it("shows the competition, scope line and place info", () => {
    expect($(".name")!.textContent).toBe("Lowlands Ladder");
    expect($(".status")!.textContent).toBe("Running");
    expect($(".scope")!.textContent).toBe("Open to: Country: Netherlands");
    expect($(".places")!.textContent).toBe("5 places left");
    expect(buttons()).toEqual(["join"]);
  });

  it("words place info for one place and no limit", () => {
    card.competition = { ...open, placesLeft: 1 };
    expect($(".places")!.textContent).toBe("1 place left");
    card.competition = { ...open, placesLeft: null };
    expect($(".places")!.textContent).toBe("No limit on places");
  });

  it("mentions that the organiser accepts sign-ups", () => {
    card.competition = { ...open, signupsNeedApproval: true };
    expect($(".approval")!.textContent).toBe("The organiser accepts sign-ups.");
  });

  it("fires join-requested and leave-requested", () => {
    const seen: string[] = [];
    card.addEventListener("join-requested", (event) => seen.push(`join ${event.detail.competitionId}`));
    card.addEventListener("leave-requested", (event) => seen.push(`leave ${event.detail.competitionId}`));
    $('button[data-action="join"]')!.click();
    card.competition = { ...open, myStatus: "ACTIVE" };
    $('button[data-action="leave"]')!.click();
    expect(seen).toEqual(["join c1", "leave c1"]);
  });

  it("shows a pending state with a way to withdraw", () => {
    card.competition = { ...open, myStatus: "PENDING" };
    expect($(".state")!.textContent).toBe("Waiting for the organiser to accept you.");
    expect($('button[data-action="leave"]')!.textContent).toBe("Withdraw request");
    expect(buttons()).toEqual(["leave"]);
  });

  it("shows that you are in", () => {
    card.competition = { ...open, myStatus: "ACTIVE" };
    expect($(".state")!.textContent).toBe("You're in this competition.");
    expect($('button[data-action="leave"]')!.textContent).toBe("Leave");
  });

  it("offers no Leave once the competition is closed or archived, but still lets a pending sign-up be withdrawn", () => {
    for (const status of ["CLOSED", "ARCHIVED"] as const) {
      card.competition = { ...open, status, joinable: false, myStatus: "ACTIVE" };
      expect($(".state")!.textContent).toBe("You're in this competition.");
      expect(buttons()).toEqual([]);
      card.competition = { ...open, status, joinable: false, myStatus: "PENDING" };
      expect(buttons()).toEqual(["leave"]);
    }
  });

  it("lets someone who left join again", () => {
    card.competition = { ...open, myStatus: "LEFT" };
    expect(buttons()).toEqual(["join"]);
  });

  it("explains instead of offering Join when it can't be joined", () => {
    card.competition = { ...open, joinable: false };
    expect(buttons()).toEqual([]);
    expect($(".state")!.textContent).toBe("Joining is not possible right now.");
  });

  it("disables the buttons while busy", () => {
    card.setAttribute("busy", "");
    expect($<HTMLButtonElement>('button[data-action="join"]')!.disabled).toBe(true);
    card.removeAttribute("busy");
    expect($<HTMLButtonElement>('button[data-action="join"]')!.disabled).toBe(false);
  });

  it("renders nothing without a competition", () => {
    card.competition = null;
    expect($(".name")).toBeNull();
  });

  it("escapes text and coerces places", () => {
    card.competition = { ...open, name: "<b>x</b>", placesLeft: "<i>3</i>" as unknown as number };
    expect(card.shadowRoot!.querySelector("b")).toBeNull();
    expect(card.shadowRoot!.querySelector("i")).toBeNull();
  });

  it("escapes an unknown lifecycle status", () => {
    card.competition = { ...open, status: "<b>NEW</b>" as JoinCardView["status"] };
    expect(card.shadowRoot!.querySelector("b")).toBeNull();
    expect($(".status")!.textContent).toBe("lifecycle.<b>NEW</b>");
  });

  it("stays hidden with the hidden attribute", () => {
    card.setAttribute("hidden", "");
    expect(getComputedStyle(card).display).toBe("none");
  });

  it("renders in Dutch", () => {
    setLocale("nl");
    expect($('button[data-action="join"]')!.textContent).toBe("Meedoen");
    expect($(".places")!.textContent).toBe("5 plekken vrij");
  });
});

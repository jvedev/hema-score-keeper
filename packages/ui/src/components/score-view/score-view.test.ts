import { describe, expect, it } from "vitest";
import "./score-view";

describe("score-view", () => {
  it("renders rule-set score options for both fighters", () => {
    const element = document.createElement("score-view");
    document.body.appendChild(element);
    element.configure({
      scores: [1, 3],
      fighterA: {
        name: "A",
        score: 0,
        backgroundColor: "#fff",
        textColor: "#000",
      },
      fighterB: {
        name: "B",
        score: 0,
        backgroundColor: "#000",
        textColor: "#fff",
      },
    });
    element.open(150);

    const options = element.shadowRoot?.querySelectorAll(
      '.score-options[data-fighter="a"] button',
    );
    expect([...options ?? []].map((button) => button.textContent)).toEqual([
      "No score",
      "1",
      "3",
      "Low quality",
    ]);
    expect(
      element.shadowRoot
        ?.querySelector('.score-options[data-fighter="a"]')
        ?.getAttribute("aria-label"),
    ).toBe("A score");

    element.remove();
  });

  it("dispatches an afterblow match event with elapsed time", () => {
    const element = document.createElement("score-view");
    document.body.appendChild(element);
    element.open(150);
    let detail:
      | import("../../events/match-event").MatchEventDetail
      | undefined;
    window.addEventListener(
      "match-event",
      (event) => {
        detail = event.detail;
      },
      { once: true },
    );

    const fighterAOptions = element.shadowRoot?.querySelectorAll(
      '.score-options[data-fighter="a"] button',
    );
    const fighterBOptions = element.shadowRoot?.querySelectorAll(
      '.score-options[data-fighter="b"] button',
    );
    (fighterAOptions?.[1] as HTMLButtonElement).click();
    (fighterBOptions?.[2] as HTMLButtonElement).click();
    (
      element.shadowRoot?.querySelector(".first-a") as HTMLButtonElement
    ).click();

    expect(detail).toEqual({
      elapsedTimeSeconds: 150,
      fighterAScore: 1,
      fighterBScore: 2,
      details: {
        fighterA: { outcome: "score" },
        fighterB: { outcome: "score" },
      },
      type: "afterblow",
      firstFighter: "A",
    });

    element.remove();
  });

  it("preserves low-quality and no-score outcomes in the match event", () => {
    const element = document.createElement("score-view");
    document.body.appendChild(element);
    element.open(42);
    let detail:
      | import("../../events/match-event").MatchEventDetail
      | undefined;
    window.addEventListener(
      "match-event",
      (event) => {
        detail = event.detail;
      },
      { once: true },
    );

    const fighterAOptions = element.shadowRoot?.querySelectorAll(
      '.score-options[data-fighter="a"] button',
    );
    (fighterAOptions?.[fighterAOptions.length - 1] as HTMLButtonElement).click();
    (
      element.shadowRoot?.querySelector(".no-score") as HTMLButtonElement
    ).click();

    expect(detail).toEqual({
      elapsedTimeSeconds: 42,
      fighterAScore: 0,
      fighterBScore: 0,
      details: {
        fighterA: { outcome: "low-quality" },
        fighterB: { outcome: "no-score" },
      },
      type: "no-score",
    });

    element.remove();
  });
});

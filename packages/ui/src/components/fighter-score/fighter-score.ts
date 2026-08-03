import css from "./fighter-score.css?raw";
import html from "./fighter-score.html?raw";
import { BaseComponent } from "../base-component/base-component";
import { registerDoubleTap } from "../../utils/double-tap";
import "../score-edit-view/score-edit-view";

export class FighterScore extends BaseComponent {
  static readonly observedAttributes = [
    "name",
    "score",
    "background-color",
    "text-color",
  ];

  #panel!: HTMLElement;
  #name!: HTMLElement;
  #score!: HTMLElement;
  #editor!: import("../score-edit-view/score-edit-view").ScoreEditView;
  #ready = false;

  get score(): number {
    return Number.parseInt(this.#score.textContent ?? "0", 10);
  }

  connectedCallback(): void {
    this.render(css, html);
    this.#panel = this.queryRoot(".panel");
    this.#name = this.queryRoot(".name-text");
    this.#score = this.queryRoot(".score");
    this.#editor = this.queryRoot("score-edit-view");
    this.#ready = true;
    this.#syncAttributes();

    registerDoubleTap(
      this.#panel,
      () => this.#editor.open(this.score, this.#name.textContent ?? ""),
      this.signal,
    );
    this.registerEvent<CustomEvent<{ score: number }>>(
      this.#editor,
      "score-change",
      (event) => {
        event.stopPropagation();
        this.#score.textContent = String(event.detail.score);
        this.dispatchEvent(
          new CustomEvent("score-change", {
            bubbles: true,
            detail: event.detail,
          }),
        );
      },
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  attributeChangedCallback(): void {
    if (this.#ready) this.#syncAttributes();
  }

  reset(): void {
    this.#score.textContent = "0";
  }

  #syncAttributes(): void {
    this.#name.textContent = this.getAttribute("name") ?? "";
    this.#score.textContent = this.getAttribute("score") ?? "0";
    this.#panel.style.setProperty(
      "--fighter-background-color",
      this.getAttribute("background-color") ?? "#999",
    );
    this.#panel.style.setProperty(
      "--fighter-text-color",
      this.getAttribute("text-color") ?? "#fff",
    );
  }
}

if (!customElements.get("fighter-score")) {
  customElements.define("fighter-score", FighterScore);
}

declare global {
  interface HTMLElementTagNameMap {
    "fighter-score": FighterScore;
  }
}

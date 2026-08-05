import css from "./score-edit-view.css?raw";
import html from "./score-edit-view.html?raw";
import { BaseComponent } from "../base-component/base-component";

export class ScoreEditView extends BaseComponent {
  #score = 0;
  #value!: HTMLElement;
  #name!: HTMLElement;

  connectedCallback(): void {
    this.render(css, html);
    this.#value = this.queryRoot(".value");
    this.#name = this.queryRoot(".name");
    this.registerEvent(this.queryRoot(".minus"), "click", () => this.#step(-1));
    this.registerEvent(this.queryRoot(".plus"), "click", () => this.#step(1));
    this.registerEvent(this.queryRoot(".done"), "click", () => this.close());
    this.registerEvent(this.queryRoot(".backdrop"), "click", () => this.close());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  open(score: number, fighterName: string): void {
    this.#score = score;
    this.#value.textContent = String(this.#score);
    this.#name.textContent = fighterName;
    this.setAttribute("open", "");
  }

  close(): void {
    this.removeAttribute("open");
  }

  #step(delta: number): void {
    this.#score += delta;
    this.#value.textContent = String(this.#score);
    this.dispatchEvent(
      new CustomEvent("score-change", {
        bubbles: true,
        detail: { score: this.#score },
      }),
    );
  }
}

if (!customElements.get("score-edit-view")) {
  customElements.define("score-edit-view", ScoreEditView);
}

declare global {
  interface HTMLElementTagNameMap {
    "score-edit-view": ScoreEditView;
  }
}

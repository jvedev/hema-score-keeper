import css from "./confirm-button.css?raw";
import html from "./confirm-button.html?raw";
import { BaseComponent } from "../base-component/base-component";

export class ConfirmButton extends BaseComponent {
  static readonly observedAttributes = ["label", "confirm-label"];

  #confirming = false;
  #timeoutId: number | undefined;
  #button!: HTMLButtonElement;
  #ready = false;

  connectedCallback(): void {
    this.render(css, html);
    this.#button = this.queryRoot("button");
    this.#ready = true;
    this.#reset();
    this.registerEvent(this.#button, "click", () => this.#handleClick());
  }

  override disconnectedCallback(): void {
    if (this.#timeoutId !== undefined) window.clearTimeout(this.#timeoutId);
    super.disconnectedCallback();
  }

  attributeChangedCallback(): void {
    if (this.#ready && !this.#confirming) this.#reset();
  }

  #handleClick(): void {
    if (!this.#confirming) {
      this.#confirming = true;
      this.#button.classList.add("confirming");
      this.#button.textContent =
        this.getAttribute("confirm-label") ?? "Tap again to confirm";
      this.#timeoutId = window.setTimeout(() => this.#reset(), 2500);
      return;
    }

    if (this.#timeoutId !== undefined) window.clearTimeout(this.#timeoutId);
    this.#reset();
    this.dispatchEvent(new CustomEvent("confirmed", { bubbles: true }));
  }

  #reset(): void {
    this.#confirming = false;
    this.#timeoutId = undefined;
    this.#button.classList.remove("confirming");
    this.#button.textContent = this.getAttribute("label") ?? "Confirm";
  }
}

if (!customElements.get("confirm-button")) {
  customElements.define("confirm-button", ConfirmButton);
}

declare global {
  interface HTMLElementTagNameMap {
    "confirm-button": ConfirmButton;
  }
}

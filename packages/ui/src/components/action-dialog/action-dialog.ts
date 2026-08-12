import css from "./action-dialog.css?raw";
import html from "./action-dialog.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export class ActionDialog extends BaseComponent {
  static readonly observedAttributes = ["heading", "description"];

  #heading!: HTMLElement;
  #description!: HTMLElement;
  #ready = false;

  connectedCallback(): void {
    this.render(css, html);
    this.#heading = this.queryRoot("h2");
    this.#description = this.queryRoot("p");
    this.#ready = true;
    this.#syncContent();
    this.registerEvent(this.queryRoot(".close"), "click", () => this.close());
    this.registerEvent(this.queryRoot(".backdrop"), "click", () => this.close());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  attributeChangedCallback(): void {
    if (this.#ready) this.#syncContent();
  }

  open(): void {
    this.setAttribute("open", "");
  }

  close(): void {
    this.removeAttribute("open");
  }

  #syncContent(): void {
    this.#heading.textContent = this.getAttribute("heading") ?? "";
    this.#description.textContent = this.getAttribute("description") ?? "";
  }
}

if (!customElements.get("action-dialog")) {
  customElements.define("action-dialog", ActionDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "action-dialog": ActionDialog;
  }
}

import css from "./search-field.css?raw";
import html from "./search-field.html?raw";
import { t, type MessageKey } from "../../i18n/i18n.js";
import { BaseComponent } from "../base-component/base-component.js";

export interface SearchChangedDetail {
  /** Trimmed and lower-cased; "" when cleared. */
  query: string;
}

/** A search box that reports a normalised query; optionally shows "3 of 6" while searching. */
export class SearchField extends BaseComponent {
  static readonly observedAttributes = ["placeholder-key", "count", "total"];

  #input: HTMLInputElement | null = null;
  #clear: HTMLButtonElement | null = null;
  #count: HTMLElement | null = null;

  connectedCallback(): void {
    this.render(css, html);
    this.#input = this.queryRoot<HTMLInputElement>("input");
    this.#clear = this.queryRoot<HTMLButtonElement>("button.clear");
    this.#count = this.queryRoot<HTMLElement>(".count");
    this.registerEvent(this.#input, "input", () => this.#changed());
    this.registerEvent<KeyboardEvent>(this.#input, "keydown", (event) => {
      if (event.key === "Escape" && this.#input!.value !== "") {
        this.#reset();
      }
    });
    this.registerEvent(this.#clear, "click", () => {
      this.#reset();
      this.#input!.focus();
    });
    this.onLocaleChange(() => this.#updateLabels());
    this.#updateLabels();
  }

  attributeChangedCallback(): void {
    this.#updateLabels();
  }

  get value(): string {
    return this.#input?.value ?? "";
  }

  set value(value: string) {
    if (this.#input) {
      this.#input.value = value;
      this.#updateLabels();
    }
  }

  #reset(): void {
    this.#input!.value = "";
    this.#changed();
  }

  #changed(): void {
    this.#updateLabels();
    this.dispatchEvent(
      new CustomEvent<SearchChangedDetail>("search-changed", {
        bubbles: true,
        composed: true,
        detail: { query: this.value.trim().toLowerCase() },
      }),
    );
  }

  #updateLabels(): void {
    if (!this.#input || !this.#clear || !this.#count) {
      return;
    }
    const placeholder = t((this.getAttribute("placeholder-key") as MessageKey | null) ?? "common.search");
    this.#input.placeholder = placeholder;
    this.#input.setAttribute("aria-label", placeholder);
    this.#clear.textContent = t("common.clear");
    const searching = this.value.trim() !== "";
    this.#clear.hidden = !searching;
    const count = this.getAttribute("count");
    const total = this.getAttribute("total");
    this.#count.textContent = searching && count !== null && total !== null ? t("search.count", { count, total }) : "";
  }
}

if (!customElements.get("search-field")) {
  customElements.define("search-field", SearchField);
}

declare global {
  interface HTMLElementTagNameMap {
    "search-field": SearchField;
  }
  interface HTMLElementEventMap {
    "search-changed": CustomEvent<SearchChangedDetail>;
  }
}

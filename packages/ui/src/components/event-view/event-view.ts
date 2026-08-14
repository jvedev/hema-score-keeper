import css from "./event-view.css?raw";
import html from "./event-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";
import "../event-editor-view/event-editor-view.js";
import { mountEventView, unmountEventView } from "./event-view-controller.js";

export class EventView extends BaseComponent {
  #mounted = false;

  connectedCallback(): void {
    this.render(css, html);
    mountEventView(this);
    this.#mounted = true;
  }

  override disconnectedCallback(): void {
    if (this.#mounted) {
      unmountEventView(this);
      this.#mounted = false;
    }
    super.disconnectedCallback();
  }
}

if (!customElements.get("event-view")) {
  customElements.define("event-view", EventView);
}

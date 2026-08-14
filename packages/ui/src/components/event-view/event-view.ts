import css from "./event-view.css?raw";
import html from "./event-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export class EventView extends BaseComponent {
  connectedCallback(): void {
    this.render(css, html);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

if (!customElements.get("event-view")) {
  customElements.define("event-view", EventView);
}

import css from "./event-editor-view.css?raw";
import html from "./event-editor-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export class EventEditorView extends BaseComponent {
  connectedCallback(): void {
    this.render(css, html);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

if (!customElements.get("event-editor-view")) {
  customElements.define("event-editor-view", EventEditorView);
}

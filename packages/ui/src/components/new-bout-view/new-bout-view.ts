import css from "./new-bout-view.css?raw";
import html from "./new-bout-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface NewBoutParticipantOption {
  id: string;
  name: string;
}

export interface NewBoutConfig {
  participants: readonly NewBoutParticipantOption[];
  preselectedParticipantId: string | null;
}

export class NewBoutView extends BaseComponent {
  #config: NewBoutConfig = { participants: [], preselectedParticipantId: null };

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: NewBoutConfig): void {
    this.#config = config;
    this.#render();
  }

  #render(): void {
    this.render(css, html);
    this.registerEvent(this.queryRoot<HTMLButtonElement>("#back-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("back-requested", { bubbles: true }));
    });

    const fighterASelect = this.queryRoot<HTMLSelectElement>("#fighter-a-select");
    const fighterBSelect = this.queryRoot<HTMLSelectElement>("#fighter-b-select");
    const createButton = this.queryRoot<HTMLButtonElement>("#create-button");
    const message = this.queryRoot<HTMLElement>("#message");

    fighterASelect.replaceChildren();
    fighterBSelect.replaceChildren();
    message.textContent = "";
    message.classList.remove("is-error");

    const preselected = this.#config.preselectedParticipantId;

    for (const select of [fighterASelect, fighterBSelect]) {
      for (const participant of this.#config.participants) {
        const option = document.createElement("option");
        option.value = participant.id;
        option.textContent = participant.name;
        select.append(option);
      }
    }

    const fighterADefault = preselected ?? this.#config.participants[0]?.id;
    const fighterBDefault = this.#config.participants.find(
      (participant) => participant.id !== fighterADefault,
    );

    if (fighterADefault) {
      fighterASelect.value = fighterADefault;
    }
    if (fighterBDefault) {
      fighterBSelect.value = fighterBDefault.id;
    }

    const canCreate = this.#config.participants.length >= 2;
    fighterASelect.disabled = !canCreate;
    fighterBSelect.disabled = !canCreate;
    createButton.disabled = !canCreate;
    if (!canCreate) {
      message.textContent = "Add at least two participants before creating a bout.";
    }

    this.registerEvent(createButton, "click", () => {
      const fighterAId = fighterASelect.value;
      const fighterBId = fighterBSelect.value;
      if (!fighterAId || !fighterBId) return;
      if (fighterAId === fighterBId) {
        message.textContent = "Choose two different participants.";
        message.classList.add("is-error");
        return;
      }
      this.dispatchEvent(
        new CustomEvent("bout-create-requested", {
          bubbles: true,
          detail: { fighterAId, fighterBId },
        }),
      );
    });
  }
}

if (!customElements.get("new-bout-view")) {
  customElements.define("new-bout-view", NewBoutView);
}

declare global {
  interface HTMLElementEventMap {
    "bout-create-requested": CustomEvent<{ fighterAId: string; fighterBId: string }>;
  }

  interface HTMLElementTagNameMap {
    "new-bout-view": NewBoutView;
  }
}

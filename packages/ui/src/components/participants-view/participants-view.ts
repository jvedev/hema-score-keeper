import css from "./participants-view.css?raw";
import html from "./participants-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface ParticipantListEntry {
  id: string;
  name: string;
  isMe: boolean;
}

export interface ParticipantsViewConfig {
  loading: boolean;
  error: string | null;
  competitionName: string;
  participants: readonly ParticipantListEntry[];
  canRegisterSelf: boolean;
}

export class ParticipantsView extends BaseComponent {
  #config: ParticipantsViewConfig = {
    loading: true,
    error: null,
    competitionName: "",
    participants: [],
    canRegisterSelf: false,
  };
  #submitting = false;
  #submitError: string | null = null;
  #addButton?: HTMLButtonElement;
  #registerButton?: HTMLButtonElement;
  #submitErrorElement?: HTMLElement;

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: ParticipantsViewConfig): void {
    this.#config = config;
    this.#submitting = false;
    this.#submitError = null;
    this.#render();
  }

  setSubmitting(isSubmitting: boolean): void {
    this.#submitting = isSubmitting;
    this.#applySubmitState();
  }

  setSubmitError(message: string | null): void {
    this.#submitError = message;
    this.#applySubmitState();
  }

  #applySubmitState(): void {
    if (this.#addButton) this.#addButton.disabled = this.#submitting;
    if (this.#registerButton) this.#registerButton.disabled = this.#submitting;
    if (this.#submitErrorElement) {
      this.#submitErrorElement.textContent = this.#submitError ?? "";
      this.#submitErrorElement.hidden = !this.#submitError;
    }
  }

  #render(): void {
    this.render(css, html);
    this.queryRoot<HTMLElement>("#competition-name").textContent = this.#config.competitionName;

    this.registerEvent(this.queryRoot<HTMLButtonElement>("#back-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("back-requested", { bubbles: true }));
    });
    this.registerEvent(this.queryRoot<HTMLButtonElement>("#view-ranking-button"), "click", () => {
      this.dispatchEvent(new CustomEvent("view-ranking-requested", { bubbles: true }));
    });
    const refreshButton = this.queryRoot<HTMLButtonElement>("#refresh-button");
    refreshButton.disabled = this.#config.loading;
    this.registerEvent(refreshButton, "click", () => {
      this.dispatchEvent(new CustomEvent("refresh-requested", { bubbles: true }));
    });

    const registerSection = this.queryRoot<HTMLElement>("#register-self-section");
    registerSection.hidden = !this.#config.canRegisterSelf;
    const registerInput = this.queryRoot<HTMLInputElement>("#register-self-input");
    this.#registerButton = this.queryRoot<HTMLButtonElement>("#register-self-button");
    this.registerEvent(this.#registerButton, "click", () => {
      if (this.#submitting) return;
      const name = registerInput.value.trim();
      if (!name) return;
      this.dispatchEvent(
        new CustomEvent("self-register-requested", { bubbles: true, detail: { name } }),
      );
      registerInput.value = "";
    });

    const addInput = this.queryRoot<HTMLInputElement>("#add-participant-input");
    this.#addButton = this.queryRoot<HTMLButtonElement>("#add-participant-button");
    this.registerEvent(this.#addButton, "click", () => {
      if (this.#submitting) return;
      const name = addInput.value.trim();
      if (!name) return;
      this.dispatchEvent(
        new CustomEvent("participant-add-requested", { bubbles: true, detail: { name } }),
      );
      addInput.value = "";
    });

    this.#submitErrorElement = this.queryRoot<HTMLElement>("#submit-error");
    this.#applySubmitState();

    const message = this.queryRoot<HTMLElement>("#message");
    const list = this.queryRoot<HTMLElement>("#participant-list");
    list.replaceChildren();
    message.textContent = "";
    message.classList.remove("is-error");

    if (this.#config.loading) {
      message.textContent = "Loading participants...";
      return;
    }
    if (this.#config.error) {
      message.textContent = this.#config.error;
      message.classList.add("is-error");
      return;
    }
    if (this.#config.participants.length === 0) {
      message.textContent = "No participants yet — add the first one below.";
    }

    for (const participant of this.#config.participants) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "participant-row";
      row.classList.toggle("is-me", participant.isMe);

      const name = document.createElement("strong");
      name.textContent = participant.name;
      row.append(name);

      if (participant.isMe) {
        const badge = document.createElement("span");
        badge.className = "me-badge";
        badge.textContent = "You";
        row.append(badge);
      }

      this.registerEvent(row, "click", () => {
        this.dispatchEvent(
          new CustomEvent("participant-selected", {
            bubbles: true,
            detail: { participantId: participant.id },
          }),
        );
      });
      list.append(row);
    }
  }
}

if (!customElements.get("participants-view")) {
  customElements.define("participants-view", ParticipantsView);
}

declare global {
  interface HTMLElementEventMap {
    "self-register-requested": CustomEvent<{ name: string }>;
    "participant-add-requested": CustomEvent<{ name: string }>;
    "view-ranking-requested": CustomEvent<void>;
    "refresh-requested": CustomEvent<void>;
  }

  interface HTMLElementTagNameMap {
    "participants-view": ParticipantsView;
  }
}

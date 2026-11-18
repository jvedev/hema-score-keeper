import css from "./events-index-view.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import { LOCALE_CHANGE_EVENT, t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import type { ApiEvent } from "@hema/event-admin-api";

export class EventsIndexView extends BaseComponent {
  #events: ApiEvent[] = [];
  #loading = false;
  #error: string | null = null;
  #baseUrl = "";

  static get observedAttributes() {
    return ["base-url"];
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === "base-url") {
      this.#baseUrl = newValue ?? "";
      this.renderView();
    }
  }

  get events(): ApiEvent[] {
    return this.#events;
  }

  set events(value: ApiEvent[]) {
    this.#events = value;
    this.renderView();
  }

  get loading(): boolean {
    return this.#loading;
  }

  set loading(value: boolean) {
    this.#loading = value;
    this.renderView();
  }

  get error(): string | null {
    return this.#error;
  }

  set error(value: string | null) {
    this.#error = value;
    this.renderView();
  }

  connectedCallback(): void {
    this.renderView();
    this.registerEvent(window, LOCALE_CHANGE_EVENT, () => this.renderView());
  }

  private renderView(): void {
    const html = `
      <div class="events-index-container">
        <header class="events-header">
          <h1>${t("events.title")}</h1>
          <button type="button" class="create-event-btn">
            + ${t("events.create")}
          </button>
        </header>

        ${this.#error ? `<div class="events-error" role="alert">${escapeHtml(this.#error)}</div>` : ""}

        ${
          this.#loading
            ? `<div class="events-loading">${t("events.loading")}</div>`
            : this.#events.length === 0
              ? `
                <div class="events-empty-state">
                  <h3>${t("events.empty")}</h3>
                  <p>${t("events.emptyHint")}</p>
                  <button type="button" class="create-event-btn">
                    + ${t("events.create")}
                  </button>
                </div>
              `
              : `
                <div class="events-grid">
                  ${this.#events
                    .map((evt) => {
                      const tournamentCount = evt.tournaments?.length ?? 0;
                      const arenaCount = evt.arenas?.length ?? 0;
                      const tournamentText =
                        tournamentCount === 1
                          ? t("events.tournamentsCountOne")
                          : t("events.tournamentsCount", { count: tournamentCount });
                      const arenaText =
                        arenaCount === 1
                          ? t("events.arenasCountOne")
                          : t("events.arenasCount", { count: arenaCount });

                      return `
                        <div
                          class="event-card"
                          data-event-id="${escapeHtml(evt.id)}"
                          role="button"
                          tabindex="0"
                        >
                          <h2 class="event-card-title">${escapeHtml(evt.eventName)}</h2>
                          <div class="event-card-counts">
                            <span class="badge">${escapeHtml(tournamentText)}</span>
                            <span class="badge">${escapeHtml(arenaText)}</span>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              `
        }

        <dialog class="create-event-dialog">
          <form method="dialog" class="create-event-form">
            <h2>${t("events.createModalTitle")}</h2>
            <div class="form-group">
              <label for="eventNameInput">${t("events.nameLabel")}</label>
              <input id="eventNameInput" name="eventName" required autocomplete="off" />
            </div>
            <div class="form-actions">
              <button type="button" class="btn-secondary cancel-dialog-btn">${t("events.cancel")}</button>
              <button type="submit" class="btn-primary">${t("events.createSubmit")}</button>
            </div>
          </form>
        </dialog>
      </div>
    `;

    this.render(css, html);
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const createBtns = this.root.querySelectorAll<HTMLButtonElement>(".create-event-btn");
    const dialog = this.root.querySelector<HTMLDialogElement>("dialog.create-event-dialog");
    const cancelBtn = this.root.querySelector<HTMLButtonElement>(".cancel-dialog-btn");
    const form = this.root.querySelector<HTMLFormElement>("form.create-event-form");

    createBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (dialog) {
          form?.reset();
          dialog.showModal();
          dialog.querySelector<HTMLInputElement>("input[name='eventName']")?.focus();
        }
      });
    });

    cancelBtn?.addEventListener("click", () => {
      dialog?.close();
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector<HTMLInputElement>("input[name='eventName']");
      const eventName = input?.value.trim();
      if (!eventName) return;
      dialog?.close();
      this.dispatchEvent(
        new CustomEvent("event-create-requested", {
          detail: { eventName },
          bubbles: true,
          composed: true,
        }),
      );
    });

    const cards = this.root.querySelectorAll<HTMLElement>(".event-card");
    cards.forEach((card) => {
      const eventId = card.dataset.eventId;
      if (!eventId) return;

      const triggerSelect = () => {
        this.dispatchEvent(
          new CustomEvent("event-selected", {
            detail: { eventId },
            bubbles: true,
            composed: true,
          }),
        );
      };

      card.addEventListener("click", triggerSelect);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          triggerSelect();
        }
      });
    });
  }
}

if (!customElements.get("events-index-view")) {
  customElements.define("events-index-view", EventsIndexView);
}

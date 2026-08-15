import css from "./start-screen-view.css?raw";
import html from "./start-screen-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface StartScreenEventOption {
  id: string;
  name: string;
}

export interface StartScreenArenaOption {
  id: string;
  name: string;
}

export interface StartScreenFight {
  id: string;
  roundLabel: string;
  fighterAName: string;
  fighterBName: string;
  statusLabel: string;
  disabled: boolean;
}

export interface StartScreenConfig {
  loading: boolean;
  error: string | null;
  eventOptions: readonly StartScreenEventOption[];
  selectedEventId: string | null;
  arenaOptions: readonly StartScreenArenaOption[];
  selectedArenaId: string | null;
  activeTimeSlotLabel: string | null;
  fightSummary: string | null;
  inactiveMessage: string | null;
  fights: readonly StartScreenFight[];
}

export class StartScreenView extends BaseComponent {
  #config: StartScreenConfig = {
    loading: true,
    error: null,
    eventOptions: [],
    selectedEventId: null,
    arenaOptions: [],
    selectedArenaId: null,
    activeTimeSlotLabel: null,
    fightSummary: null,
    inactiveMessage: null,
    fights: [],
  };

  connectedCallback(): void {
    this.#render();
  }

  configure(config: StartScreenConfig): void {
    this.#config = config;
    this.#render();
  }

  #render(): void {
    this.render(css, html);
    const config = this.#config;
    const statusCopy = this.queryRoot<HTMLElement>("#status-copy");
    const stageBadge = this.queryRoot<HTMLElement>("#stage-badge");
    const fightBadge = this.queryRoot<HTMLElement>("#fight-badge");
    const message = this.queryRoot<HTMLElement>("#message");
    const fightSummary = this.queryRoot<HTMLElement>("#fight-summary");
    const eventSelect = this.queryRoot<HTMLSelectElement>("#event-select");
    const arenaSelect = this.queryRoot<HTMLSelectElement>("#arena-select");
    const fightList = this.queryRoot<HTMLElement>("#fight-list");

    eventSelect.replaceChildren();
    arenaSelect.replaceChildren();
    fightList.replaceChildren();
    message.textContent = "";
    message.classList.remove("is-error");

    if (config.loading) {
      statusCopy.textContent = "Loading events...";
      stageBadge.textContent = "Loading";
      fightBadge.textContent = "";
    } else if (config.error) {
      statusCopy.textContent = config.error;
      statusCopy.classList.add("is-error");
      stageBadge.textContent = "Error";
      fightBadge.textContent = "";
      message.textContent = config.error;
      message.classList.add("is-error");
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "fight-button";
      retryButton.textContent = "Retry loading events";
      this.registerEvent(retryButton, "click", () => {
        this.dispatchEvent(new CustomEvent("reload-requested", { bubbles: true }));
      });
      fightList.append(retryButton);
      eventSelect.disabled = true;
      arenaSelect.disabled = true;
      return;
    } else {
      statusCopy.textContent = config.inactiveMessage ?? "Choose an event and arena to load the active time slot fights.";
      statusCopy.classList.toggle("is-error", Boolean(config.inactiveMessage));
      stageBadge.textContent = config.activeTimeSlotLabel ?? "No active time slot";
      fightBadge.textContent = config.fightSummary ?? "";
    }

    eventSelect.disabled = config.loading || config.eventOptions.length === 0;
    arenaSelect.disabled = config.loading || config.arenaOptions.length === 0;

    for (const eventOption of config.eventOptions) {
      const option = document.createElement("option");
      option.value = eventOption.id;
      option.textContent = eventOption.name;
      if (eventOption.id === config.selectedEventId) {
        option.selected = true;
      }
      eventSelect.append(option);
    }

    for (const arenaOption of config.arenaOptions) {
      const option = document.createElement("option");
      option.value = arenaOption.id;
      option.textContent = arenaOption.name;
      if (arenaOption.id === config.selectedArenaId) {
        option.selected = true;
      }
      arenaSelect.append(option);
    }

    if (!config.loading && config.eventOptions.length === 0) {
      message.textContent = "No events are available.";
    } else if (!config.loading && config.arenaOptions.length === 0) {
      message.textContent = "This event has no arenas.";
    } else if (!config.loading && config.fights.length === 0 && !config.inactiveMessage) {
      message.textContent = "No fights are assigned to this arena yet.";
    } else if (config.inactiveMessage) {
      message.textContent = config.inactiveMessage;
      message.classList.add("is-error");
    }

    fightSummary.textContent = config.fightSummary ?? "";

    for (const fight of config.fights) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fight-button";

      const meta = document.createElement("span");
      meta.className = "fight-meta";
      meta.textContent = fight.roundLabel;

      const title = document.createElement("strong");
      title.className = "fight-title";
      title.textContent = `${fight.fighterAName} vs ${fight.fighterBName}`;

      const status = document.createElement("span");
      status.className = "fight-status";
      status.textContent = fight.statusLabel;

      button.append(meta, title, status);
      button.disabled = fight.disabled;
      button.classList.toggle("is-disabled", fight.disabled);
      if (!fight.disabled) {
        this.registerEvent(button, "click", () => {
          this.dispatchEvent(
            new CustomEvent("fight-selected", {
              bubbles: true,
              detail: { matchId: fight.id },
            }),
          );
        });
      }
      fightList.append(button);
    }

    this.registerEvent(eventSelect, "change", () => {
      this.dispatchEvent(
        new CustomEvent("event-selected", {
          bubbles: true,
          detail: { eventId: eventSelect.value },
        }),
      );
    });

    this.registerEvent(arenaSelect, "change", () => {
      this.dispatchEvent(
        new CustomEvent("arena-selected", {
          bubbles: true,
          detail: { arenaId: arenaSelect.value },
        }),
      );
    });
  }
}

if (!customElements.get("start-screen-view")) {
  customElements.define("start-screen-view", StartScreenView);
}

declare global {
  interface HTMLElementEventMap {
    "arena-selected": CustomEvent<{ arenaId: string }>;
    "event-selected": CustomEvent<{ eventId: string }>;
    "fight-selected": CustomEvent<{ matchId: string }>;
    "reload-requested": CustomEvent<void>;
  }

  interface HTMLElementTagNameMap {
    "start-screen-view": StartScreenView;
  }
}

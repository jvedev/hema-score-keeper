import css from "./competition-selector-view.css?raw";
import html from "./competition-selector-view.html?raw";
import { BaseComponent } from "../base-component/base-component.js";

export interface CompetitionOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
}

export type CompetitionSelectorTab = "my" | "archive" | "public";

export interface CompetitionSelectorTabOption {
  key: CompetitionSelectorTab;
  label: string;
  count: number;
}

export interface CompetitionSelectorConfig {
  loading: boolean;
  error: string | null;
  activeTab: CompetitionSelectorTab;
  tabs: readonly CompetitionSelectorTabOption[];
  competitions: readonly CompetitionOption[];
}

export class CompetitionSelectorView extends BaseComponent {
  #config: CompetitionSelectorConfig = {
    loading: true,
    error: null,
    activeTab: "my",
    tabs: [],
    competitions: [],
  };

  connectedCallback(): void {
    this.#render();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: CompetitionSelectorConfig): void {
    this.#config = config;
    this.#render();
  }

  #render(): void {
    this.render(css, html);
    const message = this.queryRoot<HTMLElement>("#message");
    const list = this.queryRoot<HTMLElement>("#competition-list");
    list.replaceChildren();
    message.textContent = "";
    message.classList.remove("is-error");

    if (this.#config.loading) {
      message.textContent = "Loading competitions...";
      return;
    }
    if (this.#config.error) {
      message.textContent = this.#config.error;
      message.classList.add("is-error");
      return;
    }

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    for (const tab of this.#config.tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tab-button${tab.key === this.#config.activeTab ? " is-active" : ""}`;
      button.textContent = `${tab.label} (${tab.count})`;
      this.registerEvent(button, "click", () => {
        this.dispatchEvent(
          new CustomEvent("tab-selected", {
            bubbles: true,
            detail: { tab: tab.key },
          }),
        );
      });
      tabs.append(button);
    }
    if (tabs.childElementCount > 0) {
      list.before(tabs);
    }

    if (this.#config.competitions.length === 0) {
      message.textContent = "No competitions are available in this section.";
      return;
    }

    for (const competition of this.#config.competitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "competition-button";

      const name = document.createElement("strong");
      name.textContent = competition.name;
      const dates = document.createElement("span");
      dates.textContent = `${competition.startDate} – ${competition.endDate}`;
      button.append(name, dates);

      this.registerEvent(button, "click", () => {
        this.dispatchEvent(
          new CustomEvent("competition-selected", {
            bubbles: true,
            detail: { competitionId: competition.id },
          }),
        );
      });
      list.append(button);
    }
  }
}

if (!customElements.get("competition-selector-view")) {
  customElements.define("competition-selector-view", CompetitionSelectorView);
}

declare global {
  interface HTMLElementEventMap {
    "competition-selected": CustomEvent<{ competitionId: string }>;
    "tab-selected": CustomEvent<{ tab: CompetitionSelectorTab }>;
  }

  interface HTMLElementTagNameMap {
    "competition-selector-view": CompetitionSelectorView;
  }
}

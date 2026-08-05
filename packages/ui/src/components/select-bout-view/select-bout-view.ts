import css from "./select-bout-view.css?raw";
import html from "./select-bout-view.html?raw";
import { BaseComponent } from "../base-component/base-component";

export interface SelectableBout {
  id: string;
  sequenceNumber: number;
  round: number;
  fighterAName: string;
  fighterBName: string;
}

export interface SelectBoutConfig {
  arenaName: string;
  fighterCount: number;
  bouts: readonly SelectableBout[];
}

export class SelectBoutView extends BaseComponent {
  connectedCallback(): void {
    this.render(css, html);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  configure(config: SelectBoutConfig): void {
    this.queryRoot("#arena-name").textContent = config.arenaName;
    this.queryRoot("#fighter-count").textContent =
      `${config.fighterCount} fighters`;

    const boutList = this.queryRoot("#bout-list");
    boutList.replaceChildren();
    for (const bout of config.bouts) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bout-button";

      const round = document.createElement("span");
      round.textContent = `Bout ${bout.sequenceNumber} · Round ${bout.round}`;
      const fighters = document.createElement("strong");
      fighters.textContent = `${bout.fighterAName} vs ${bout.fighterBName}`;
      button.append(round, fighters);

      this.registerEvent(button, "click", () => {
        this.dispatchEvent(
          new CustomEvent("bout-selected", {
            bubbles: true,
            detail: { boutId: bout.id },
          }),
        );
      });
      boutList.append(button);
    }
  }
}

if (!customElements.get("select-bout-view")) {
  customElements.define("select-bout-view", SelectBoutView);
}

declare global {
  interface HTMLElementEventMap {
    "bout-selected": CustomEvent<{ boutId: string }>;
  }

  interface HTMLElementTagNameMap {
    "select-bout-view": SelectBoutView;
  }
}

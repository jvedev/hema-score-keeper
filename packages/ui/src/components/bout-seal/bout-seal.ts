import css from "./bout-seal.css?raw";
import { t, type MessageKey } from "../../i18n/i18n.js";
import { BaseComponent } from "../base-component/base-component.js";

export type BoutSealStatus = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";

const STATUSES: readonly BoutSealStatus[] = ["SCORED", "COUNTED", "OBJECTED", "FINAL", "VOIDED"];
const LABELS: Record<BoutSealStatus, MessageKey> = {
  SCORED: "seal.scored",
  COUNTED: "seal.counted",
  OBJECTED: "seal.objected",
  FINAL: "seal.final",
  VOIDED: "seal.voided",
};
const SIZES = { sm: 18, lg: 44 } as const;
const CENTER = 12;
const RADIUS = 10;

/** One sector per party: referee on top, fighter A bottom-left, fighter B bottom-right (degrees, y down). */
const SECTORS = [
  { party: "referee", from: -150, to: -30 },
  { party: "fighter-b", from: -30, to: 90 },
  { party: "fighter-a", from: 90, to: 210 },
] as const;

/**
 * The seal from the design: a circle in three parts showing who approved a bout.
 * Green with a check once final, a rust slash when voided, a rust ring while objected.
 */
export class BoutSeal extends BaseComponent {
  static readonly observedAttributes = ["status", "referee-approved", "fighter-a-approved", "fighter-b-approved", "size"];

  connectedCallback(): void {
    this.#draw();
    this.onLocaleChange(() => this.#draw());
  }

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.#draw();
    }
  }

  get status(): BoutSealStatus {
    const value = this.getAttribute("status") as BoutSealStatus | null;
    return value !== null && STATUSES.includes(value) ? value : "SCORED";
  }

  #draw(): void {
    const status = this.status;
    const size = SIZES[this.getAttribute("size") === "lg" ? "lg" : "sm"];
    const label = t(LABELS[status]);
    const body = status === "FINAL" ? this.#finalMark() : this.#sectors(status);
    const svg = `<svg class="${status.toLowerCase() === "voided" ? "void" : status.toLowerCase()}" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${label}">${body}</svg>`;
    this.render(css, svg);
  }

  #finalMark(): string {
    return `<circle class="disc" cx="${CENTER}" cy="${CENTER}" r="${RADIUS + 0.8}"></circle><path class="check" d="M7.5 12.5l3 3 6-6.5"></path>`;
  }

  #sectors(status: BoutSealStatus): string {
    const wedges = SECTORS.map(({ party, from, to }) => {
      const on = this.hasAttribute(`${party}-approved`) ? " on" : "";
      const [x1, y1] = point(from);
      const [x2, y2] = point(to);
      return `<path class="sector${on}" data-party="${party}" d="M${CENTER} ${CENTER}L${x1} ${y1}A${RADIUS} ${RADIUS} 0 0 1 ${x2} ${y2}Z"></path>`;
    }).join("");
    const dividers = SECTORS.map(({ from }) => {
      const [x, y] = point(from);
      return `<line class="divider" x1="${CENTER}" y1="${CENTER}" x2="${x}" y2="${y}"></line>`;
    }).join("");
    const slash = status === "VOIDED" ? `<line class="slash" x1="5" y1="19" x2="19" y2="5"></line>` : "";
    return `${wedges}${status === "VOIDED" ? "" : dividers}<circle class="ring" cx="${CENTER}" cy="${CENTER}" r="${RADIUS}"></circle>${slash}`;
  }
}

function point(degrees: number): [string, string] {
  const radians = (degrees * Math.PI) / 180;
  return [(CENTER + RADIUS * Math.cos(radians)).toFixed(2), (CENTER + RADIUS * Math.sin(radians)).toFixed(2)];
}

if (!customElements.get("bout-seal")) {
  customElements.define("bout-seal", BoutSeal);
}

declare global {
  interface HTMLElementTagNameMap {
    "bout-seal": BoutSeal;
  }
}

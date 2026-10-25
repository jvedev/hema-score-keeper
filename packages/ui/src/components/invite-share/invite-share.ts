import qrcode from "qrcode-generator";
import css from "./invite-share.css?raw";
import { t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";

export interface InviteCopiedDetail {
  link: string;
}

/** Modules of white around the code; phones need it to find the code on a dark page. */
const QUIET_ZONE = 4;
const COPIED_FEEDBACK_MS = 2000;

/**
 * An invite link with a copy button and a QR code, drawn here as inline SVG (dark modules on a white
 * plate with a quiet zone, so it scans in the dark theme). Set the link with the `link` attribute
 * or property. Fires `invite-copied` with `{ link }` after a successful copy.
 */
export class InviteShare extends BaseComponent {
  static readonly observedAttributes = ["link"];

  #resetTimer: ReturnType<typeof setTimeout> | undefined;

  get link(): string {
    return this.getAttribute("link") ?? "";
  }

  set link(value: string) {
    this.setAttribute("link", value);
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      if ((event.target as Element | null)?.closest("button.copy")) {
        void this.#copy();
      }
    });
    this.onLocaleChange(() => this.#draw());
    this.#draw();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#resetTimer);
  }

  attributeChangedCallback(): void {
    this.#draw();
  }

  #draw(): void {
    if (!this.isConnected) {
      return;
    }
    clearTimeout(this.#resetTimer);
    const link = this.link;
    if (link === "") {
      this.render(css, "");
      return;
    }
    this.render(
      css,
      `<section class="share">
        <h3>${t("invite.title")}</h3>
        <div class="row">
          <input class="link" type="text" readonly value="${escapeHtml(link)}" aria-label="${t("invite.link")}" />
          <button type="button" class="copy">${t("invite.copy")}</button>
        </div>
        <p class="note" role="status"></p>
        ${this.#qr(link)}
      </section>`,
    );
  }

  /** The QR code as SVG, or nothing when the link is too long to encode. */
  #qr(link: string): string {
    try {
      const code = qrcode(0, "M");
      code.addData(link);
      code.make();
      const count = code.getModuleCount();
      const size = count + QUIET_ZONE * 2;
      let modules = "";
      for (let row = 0; row < count; row++) {
        for (let column = 0; column < count; column++) {
          if (code.isDark(row, column)) {
            modules += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
          }
        }
      }
      return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${t("invite.qr")}" shape-rendering="crispEdges">
        <rect class="bg" width="${size}" height="${size}" fill="#fff"></rect>
        <path class="modules" fill="#000" d="${modules}"></path>
      </svg>`;
    } catch {
      return "";
    }
  }

  async #copy(): Promise<void> {
    const link = this.link;
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = this.#copyBySelection();
    }
    const button = this.root.querySelector<HTMLButtonElement>("button.copy");
    const note = this.root.querySelector<HTMLElement>(".note");
    if (!button || !note) {
      return;
    }
    if (copied) {
      button.textContent = t("invite.copied");
      note.textContent = "";
      this.dispatchEvent(new CustomEvent<InviteCopiedDetail>("invite-copied", { bubbles: true, composed: true, detail: { link } }));
      this.#resetTimer = setTimeout(() => {
        button.textContent = t("invite.copy");
      }, COPIED_FEEDBACK_MS);
    } else {
      note.textContent = t("invite.copyFailed");
    }
  }

  /** Old browsers and insecure pages have no Clipboard API; select the field and ask the browser to copy. */
  #copyBySelection(): boolean {
    const input = this.root.querySelector<HTMLInputElement>("input.link");
    if (!input) {
      return false;
    }
    input.focus();
    input.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

if (!customElements.get("invite-share")) {
  customElements.define("invite-share", InviteShare);
}

declare global {
  interface HTMLElementTagNameMap {
    "invite-share": InviteShare;
  }
  interface HTMLElementEventMap {
    "invite-copied": CustomEvent<InviteCopiedDetail>;
  }
}

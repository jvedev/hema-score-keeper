import css from "./bout-approval-view.css?raw";
import { t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";

export interface BoutApprovalSummary {
  fighterA: string;
  fighterB: string;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  refereeName: string;
}

export interface BoutSaveRequestedDetail {
  refereeApproves: boolean;
  fighterAApproves: boolean;
  fighterBApproves: boolean;
}

/**
 * After a competition bout: shows the result and lets whoever runs the score-keeper register the
 * referee's approval and, if they agree on the spot, both fighters'. Fires `bout-save-requested`.
 */
export class BoutApprovalView extends BaseComponent {
  #summary: BoutApprovalSummary | null = null;
  #saving = false;
  #error: string | null = null;
  #approvals = { referee: false, A: false, B: false };

  set summary(summary: BoutApprovalSummary | null) {
    this.#summary = summary;
    this.#approvals = { referee: false, A: false, B: false };
    this.#error = null;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent(this.root, "change", (event) => {
      const input = event.target as HTMLInputElement;
      const which = input.dataset.approval as "referee" | "A" | "B" | undefined;
      if (!which) {
        return;
      }
      this.#approvals[which] = input.checked;
      if (which === "referee" && !input.checked) {
        // Fighters can only agree on top of the referee's approval.
        this.#approvals.A = false;
        this.#approvals.B = false;
      }
      this.#syncToggles();
    });
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      if ((event.target as HTMLElement).closest("button.save") && !this.#saving) {
        this.dispatchEvent(
          new CustomEvent<BoutSaveRequestedDetail>("bout-save-requested", {
            bubbles: true,
            composed: true,
            detail: { refereeApproves: this.#approvals.referee, fighterAApproves: this.#approvals.A, fighterBApproves: this.#approvals.B },
          }),
        );
      }
    });
    this.onLocaleChange(() => this.#draw());
    this.#draw();
  }

  setSaving(saving: boolean): void {
    this.#saving = saving;
    this.#syncButton();
  }

  setError(message: string | null): void {
    this.#error = message;
    const error = this.root.querySelector<HTMLElement>(".error");
    if (error) {
      error.hidden = message === null;
      error.textContent = message ?? "";
    }
  }

  #draw(): void {
    const summary = this.#summary;
    if (!this.isConnected || !summary) {
      return;
    }
    const winner =
      summary.winnerSide === null
        ? t("approval.draw")
        : t("approval.winner", { name: escapeHtml(summary.winnerSide === "A" ? summary.fighterA : summary.fighterB) });
    const toggle = (key: "referee" | "A" | "B", label: string) =>
      `<label class="approval"><input type="checkbox" data-approval="${key}" />${label}</label>`;

    this.render(
      css,
      `<p class="eyebrow">${t("approval.title")}</p>
      <div class="versus">
        <span class="name">${escapeHtml(summary.fighterA)}</span>
        <span class="score">${summary.scoreA}–${summary.scoreB}</span>
        <span class="name">${escapeHtml(summary.fighterB)}</span>
      </div>
      <p class="winner">${winner}</p>
      <div class="approvals">
        ${toggle("referee", t("approval.referee", { name: escapeHtml(summary.refereeName) }))}
        ${toggle("A", t("approval.fighter", { name: escapeHtml(summary.fighterA) }))}
        ${toggle("B", t("approval.fighter", { name: escapeHtml(summary.fighterB) }))}
      </div>
      <p class="note">${t("approval.note")}</p>
      <p class="error" role="alert" hidden></p>
      <button type="button" class="save"></button>`,
    );
    this.#syncToggles();
    this.#syncButton();
    this.setError(this.#error);
  }

  #syncToggles(): void {
    for (const key of ["referee", "A", "B"] as const) {
      const input = this.root.querySelector<HTMLInputElement>(`input[data-approval="${key}"]`);
      if (input) {
        input.checked = this.#approvals[key];
        input.disabled = key !== "referee" && !this.#approvals.referee;
      }
    }
  }

  #syncButton(): void {
    const button = this.root.querySelector<HTMLButtonElement>("button.save");
    if (button) {
      button.disabled = this.#saving;
      button.textContent = this.#saving ? t("approval.saving") : t("approval.save");
    }
  }
}

if (!customElements.get("bout-approval-view")) {
  customElements.define("bout-approval-view", BoutApprovalView);
}

declare global {
  interface HTMLElementTagNameMap {
    "bout-approval-view": BoutApprovalView;
  }
  interface HTMLElementEventMap {
    "bout-save-requested": CustomEvent<BoutSaveRequestedDetail>;
  }
}

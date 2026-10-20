import css from "./objection-review.css?raw";
import { t, type MessageKey } from "../../i18n/i18n.js";
import type { BoutDetailView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";
import type { BoutDetailsPanel } from "../bout-details/bout-details.js";
import "../bout-details/bout-details.js";

export interface ObjectionCorrection {
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
}

/**
 * An admin settles an objection: keep the result, correct the final score, or void the bout.
 * Fires `objection-restore-requested`, `objection-correct-requested` and `objection-void-requested`.
 */
export class ObjectionReview extends BaseComponent {
  #bout: BoutDetailView | null = null;
  #busy = false;
  #error: string | null = null;

  set bout(bout: BoutDetailView | null) {
    this.#bout = bout;
    this.#draw();
  }

  connectedCallback(): void {
    this.registerEvent<MouseEvent>(this.root, "click", (event) => {
      const target = event.target as HTMLElement;
      if (this.#busy) {
        return;
      }
      if (target.closest("button.restore")) {
        this.#emit("objection-restore-requested", undefined);
      } else if (target.closest("button.correct")) {
        this.#correct();
      } else if (target.closest("button.void")) {
        this.#void();
      }
    });
    this.onLocaleChange(() => this.#draw());
    this.#draw();
  }

  setBusy(busy: boolean): void {
    this.#busy = busy;
    this.queryRootAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = busy;
    });
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
    const bout = this.#bout;
    if (!this.isConnected || !bout) {
      return;
    }
    const objector = bout.objection ? (bout.objection.by === "A" ? bout.fighterA : bout.fighterB).name : "";
    const objection = bout.objection
      ? bout.objection.reason
        ? t("details.objected", { name: escapeHtml(objector), reason: escapeHtml(bout.objection.reason) })
        : t("details.objectedNoReason", { name: escapeHtml(objector) })
      : "";
    const winner = bout.scoreA > bout.scoreB ? "A" : bout.scoreB > bout.scoreA ? "B" : "";

    this.render(
      css,
      `<p class="eyebrow">${t("review.title")}</p>
      <p class="objection">${objection}</p>
      <section class="action">
        <button type="button" class="restore">${t("review.restore")}</button>
        <p class="note">${t("review.restoreNote")}</p>
      </section>
      <section class="action">
        <h3>${t("review.correctTitle")}</h3>
        <div class="scores">
          <label>${escapeHtml(bout.fighterA.name)}<input class="score-a" type="number" inputmode="numeric" step="1" value="${bout.scoreA}" /></label>
          <label>${escapeHtml(bout.fighterB.name)}<input class="score-b" type="number" inputmode="numeric" step="1" value="${bout.scoreB}" /></label>
        </div>
        <label>${t("review.winner")}
          <select class="winner">
            <option value="A"${winner === "A" ? " selected" : ""}>${escapeHtml(bout.fighterA.name)}</option>
            <option value="B"${winner === "B" ? " selected" : ""}>${escapeHtml(bout.fighterB.name)}</option>
            <option value=""${winner === "" ? " selected" : ""}>${t("review.draw")}</option>
          </select>
        </label>
        <button type="button" class="correct">${t("review.correct")}</button>
        <p class="note">${t("review.correctNote")}</p>
      </section>
      <section class="action">
        <h3>${t("review.voidTitle")}</h3>
        <label>${t("review.voidReason")}<input class="void-reason" type="text" autocomplete="off" /></label>
        <button type="button" class="void">${t("review.void")}</button>
      </section>
      <p class="hint" aria-live="polite"></p>
      <p class="error" role="alert" hidden></p>
      <bout-details show-warnings show-lead-graph></bout-details>`,
    );
    this.queryRoot<BoutDetailsPanel>("bout-details").bout = bout;
    this.setBusy(this.#busy);
    this.setError(this.#error);
  }

  #correct(): void {
    const scoreA = Number(this.queryRoot<HTMLInputElement>("input.score-a").value);
    const scoreB = Number(this.queryRoot<HTMLInputElement>("input.score-b").value);
    const value = this.queryRoot<HTMLSelectElement>("select.winner").value;
    const winnerSide = value === "A" || value === "B" ? value : null;
    let problem: MessageKey | null = null;
    if (winnerSide === null && scoreA !== scoreB) {
      problem = "review.drawEqual";
    } else if ((winnerSide === "A" && scoreA < scoreB) || (winnerSide === "B" && scoreB < scoreA)) {
      problem = "review.lowerWinner";
    }
    this.#hint(problem);
    if (problem === null && Number.isInteger(scoreA) && Number.isInteger(scoreB)) {
      this.#emit("objection-correct-requested", { scoreA, scoreB, winnerSide } satisfies ObjectionCorrection);
    }
  }

  #void(): void {
    const reason = this.queryRoot<HTMLInputElement>("input.void-reason").value.trim();
    this.#hint(reason === "" ? "review.needsReason" : null);
    if (reason !== "") {
      this.#emit("objection-void-requested", { reason });
    }
  }

  #hint(key: MessageKey | null): void {
    this.queryRoot<HTMLElement>(".hint").textContent = key === null ? "" : t(key);
  }

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }
}

if (!customElements.get("objection-review")) {
  customElements.define("objection-review", ObjectionReview);
}

declare global {
  interface HTMLElementTagNameMap {
    "objection-review": ObjectionReview;
  }
  interface HTMLElementEventMap {
    "objection-restore-requested": CustomEvent<undefined>;
    "objection-correct-requested": CustomEvent<ObjectionCorrection>;
    "objection-void-requested": CustomEvent<{ reason: string }>;
  }
}

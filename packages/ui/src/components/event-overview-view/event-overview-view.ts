import css from "./event-overview-view.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import { LOCALE_CHANGE_EVENT, t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import type { ApiEvent, ApiEventCompetition } from "@hema/event-admin-api";

export class EventOverviewView extends BaseComponent {
  #event: ApiEvent | null = null;
  #competitions: ApiEventCompetition[] = [];
  #attachableCompetitions: ApiEventCompetition[] = [];
  #loading = false;
  #error: string | null = null;

  get event(): ApiEvent | null {
    return this.#event;
  }

  set event(value: ApiEvent | null) {
    this.#event = value;
    this.renderView();
  }

  get competitions(): ApiEventCompetition[] {
    return this.#competitions;
  }

  set competitions(value: ApiEventCompetition[]) {
    this.#competitions = value;
    this.renderView();
  }

  /** Standalone Competitions the signed-in user manages, offered by "attach an existing competition". */
  get attachableCompetitions(): ApiEventCompetition[] {
    return this.#attachableCompetitions;
  }

  set attachableCompetitions(value: ApiEventCompetition[]) {
    this.#attachableCompetitions = value;
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
    if (this.#loading) {
      this.render(css, `<div class="event-loading">${t("events.loading")}</div>`);
      return;
    }

    if (this.#error) {
      this.render(css, `<div class="event-error" role="alert">${escapeHtml(this.#error)}</div>`);
      return;
    }

    if (!this.#event) {
      this.render(css, `<div class="event-empty">${t("events.empty")}</div>`);
      return;
    }

    const evt = this.#event;
    const tournamentList = evt.tournaments ?? [];
    const compList = this.#competitions;
    const attachable = this.#attachableCompetitions.filter((cmp) => cmp.eventId === null);
    const totalComponents = tournamentList.length + compList.length;

    const arenaCount = evt.arenas?.length ?? 0;
    const arenaText =
      arenaCount === 1 ? t("events.arenasCountOne") : t("events.arenasCount", { count: arenaCount });

    const rulesetName = evt.ruleset?.name ?? t("events.noRuleset");

    const html = `
      <div class="event-overview-container">
        <header class="event-overview-header">
          <div class="event-title-group">
            <h1 class="event-title">${escapeHtml(evt.eventName)}</h1>
            <div class="ruleset-info">
              <span>${t("events.rulesetLabel")}: <strong>${escapeHtml(rulesetName)}</strong></span>
            </div>
          </div>
          <div class="header-actions">
            <button type="button" class="planning-link-btn">
              ${t("events.planningLink")}
            </button>
          </div>
        </header>

        <div class="resources-summary">
          <div class="resource-item">
            <span>🏟️</span>
            <span>${escapeHtml(arenaText)}</span>
          </div>
        </div>

        ${
          totalComponents === 0
            ? `
              <div class="zero-components-notice">
                <p>${t("events.zeroComponents")}</p>
              </div>
            `
            : ""
        }

        <div class="components-container">
          <section class="tournaments-section">
            <div class="section-header">
              <h2>${t("events.tournaments")}</h2>
              <button type="button" class="btn-secondary-action create-tournament-btn">
                + ${t("events.addTournament")}
              </button>
            </div>

            ${
              tournamentList.length === 0
                ? `<p class="empty-subtext">${t("events.zeroComponents")}</p>`
                : `
                  <div class="cards-grid">
                    ${tournamentList
                      .map((trn) => {
                        const fighterCount = trn.entries?.filter((e) => e.kind !== "VOLUNTEER").length ?? 0;
                        const stagesCount = trn.stages?.length ?? 0;
                        const participantText =
                          fighterCount === 1
                            ? t("events.participantsOne")
                            : t("events.participants", { count: fighterCount });
                        const stageText =
                          stagesCount === 1
                            ? t("events.stagesOne")
                            : t("events.stages", { count: stagesCount });

                        return `
                          <div
                            class="tournament-card"
                            data-tournament-id="${escapeHtml(trn.id)}"
                            role="button"
                            tabindex="0"
                          >
                            <h3 class="card-title">${escapeHtml(trn.name)}</h3>
                            <div class="card-meta">
                              <span class="badge">${escapeHtml(participantText)}</span>
                              <span class="badge">${escapeHtml(stageText)}</span>
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>
                `
            }
          </section>

          <section class="competitions-section">
            <div class="section-header">
              <h2>${t("events.competitions")}</h2>
              <button type="button" class="btn-secondary-action attach-competition-btn">
                + ${t("events.addCompetition")}
              </button>
            </div>

            ${
              compList.length === 0
                ? `<p class="empty-subtext">${t("events.zeroComponents")}</p>`
                : `
                  <div class="cards-grid">
                    ${compList
                      .map((cmp) => {
                        return `
                          <div
                            class="competition-card"
                            data-competition-id="${escapeHtml(cmp.id)}"
                            role="button"
                            tabindex="0"
                          >
                            <h3 class="card-title">${escapeHtml(cmp.name)}</h3>
                            <div class="card-meta">
                              <span class="badge">${escapeHtml(cmp.status)}</span>
                              <span class="badge">${escapeHtml(cmp.date)}</span>
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>
                `
            }
          </section>
        </div>

        <dialog class="create-tournament-dialog">
          <form method="dialog" class="create-tournament-form">
            <h2>${t("events.addTournament")}</h2>
            <div class="form-group">
              <label for="tournamentNameInput">${t("events.nameLabel")}</label>
              <input id="tournamentNameInput" name="tournamentName" required autocomplete="off" />
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel cancel-tournament-btn">${t("events.cancel")}</button>
              <button type="submit" class="btn-submit">${t("events.createSubmit")}</button>
            </div>
          </form>
        </dialog>

        <dialog class="attach-competition-dialog">
          <form method="dialog" class="attach-competition-form">
            <h2>${t("events.addCompetition")}</h2>
            <fieldset class="competition-mode">
              <label><input type="radio" name="compMode" value="create" checked /> ${t("events.competitionModeCreate")}</label>
              <label><input type="radio" name="compMode" value="attach" /> ${t("events.competitionModeAttach")}</label>
            </fieldset>
            <div class="competition-create-fields">
              <div class="form-group">
                <label for="compNameInput">${t("events.competitionNameLabel")}</label>
                <input id="compNameInput" name="compName" autocomplete="off" />
              </div>
              <div class="form-group">
                <label for="compSlugInput">${t("events.slugLabel")}</label>
                <input id="compSlugInput" name="compSlug" autocomplete="off" />
              </div>
              <div class="form-group">
                <label for="compDateInput">${t("events.dateLabel")}</label>
                <input id="compDateInput" name="compDate" type="date" />
              </div>
            </div>
            <div class="competition-attach-fields" hidden>
              ${
                attachable.length === 0
                  ? `<p class="empty-subtext no-attachable-competitions">${t("events.noAttachableCompetitions")}</p>`
                  : `<div class="form-group">
                      <label for="compAttachSelect">${t("events.competitionSelectLabel")}</label>
                      <select id="compAttachSelect" name="compAttach">
                        ${attachable
                          .map((cmp) => `<option value="${escapeHtml(cmp.id)}">${escapeHtml(cmp.name)} (${escapeHtml(cmp.date)})</option>`)
                          .join("")}
                      </select>
                    </div>`
              }
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel cancel-competition-btn">${t("events.cancel")}</button>
              <button type="submit" class="btn-submit competition-submit-btn">${t("events.createCompetitionSubmit")}</button>
            </div>
          </form>
        </dialog>
      </div>
    `;

    this.render(css, html);
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const planningBtn = this.root.querySelector<HTMLButtonElement>(".planning-link-btn");
    planningBtn?.addEventListener("click", () => {
      if (!this.#event) return;
      this.dispatchEvent(
        new CustomEvent("planning-requested", {
          detail: { eventId: this.#event.id },
          bubbles: true,
          composed: true,
        }),
      );
    });

    const tournamentCards = this.root.querySelectorAll<HTMLElement>(".tournament-card");
    tournamentCards.forEach((card) => {
      const tournamentId = card.dataset.tournamentId;
      if (!tournamentId) return;

      const select = () => {
        this.dispatchEvent(
          new CustomEvent("tournament-selected", {
            detail: { tournamentId },
            bubbles: true,
            composed: true,
          }),
        );
      };
      card.addEventListener("click", select);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    });

    const competitionCards = this.root.querySelectorAll<HTMLElement>(".competition-card");
    competitionCards.forEach((card) => {
      const competitionId = card.dataset.competitionId;
      if (!competitionId) return;

      const select = () => {
        this.dispatchEvent(
          new CustomEvent("competition-selected", {
            detail: { competitionId },
            bubbles: true,
            composed: true,
          }),
        );
      };
      card.addEventListener("click", select);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    });

    // Tournament dialog
    const createTournamentBtn = this.root.querySelector<HTMLButtonElement>(".create-tournament-btn");
    const tournamentDialog = this.root.querySelector<HTMLDialogElement>("dialog.create-tournament-dialog");
    const cancelTournamentBtn = this.root.querySelector<HTMLButtonElement>(".cancel-tournament-btn");
    const tournamentForm = this.root.querySelector<HTMLFormElement>("form.create-tournament-form");

    createTournamentBtn?.addEventListener("click", () => {
      tournamentForm?.reset();
      tournamentDialog?.showModal();
      tournamentDialog?.querySelector<HTMLInputElement>("input[name='tournamentName']")?.focus();
    });

    cancelTournamentBtn?.addEventListener("click", () => {
      tournamentDialog?.close();
    });

    tournamentForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = tournamentForm.querySelector<HTMLInputElement>("input[name='tournamentName']");
      const name = input?.value.trim();
      if (!name || !this.#event) return;
      tournamentDialog?.close();
      this.dispatchEvent(
        new CustomEvent("tournament-create-requested", {
          detail: { eventId: this.#event.id, name },
          bubbles: true,
          composed: true,
        }),
      );
    });

    // Competition dialog
    const attachCompetitionBtn = this.root.querySelector<HTMLButtonElement>(".attach-competition-btn");
    const compDialog = this.root.querySelector<HTMLDialogElement>("dialog.attach-competition-dialog");
    const cancelCompBtn = this.root.querySelector<HTMLButtonElement>(".cancel-competition-btn");
    const compForm = this.root.querySelector<HTMLFormElement>("form.attach-competition-form");

    const createFields = compDialog?.querySelector<HTMLElement>(".competition-create-fields");
    const attachFields = compDialog?.querySelector<HTMLElement>(".competition-attach-fields");
    const compSubmit = compDialog?.querySelector<HTMLButtonElement>(".competition-submit-btn");
    const selectedMode = () =>
      compForm?.querySelector<HTMLInputElement>("input[name='compMode']:checked")?.value === "attach" ? "attach" : "create";
    const showMode = () => {
      const attach = selectedMode() === "attach";
      if (createFields) createFields.hidden = attach;
      if (attachFields) attachFields.hidden = !attach;
      createFields?.querySelectorAll<HTMLInputElement>("input").forEach((input) => (input.required = !attach));
      if (compSubmit) {
        compSubmit.textContent = attach ? t("events.attachCompetitionSubmit") : t("events.createCompetitionSubmit");
        compSubmit.disabled = attach && !compForm?.querySelector("select[name='compAttach']");
      }
    };
    compForm?.querySelectorAll<HTMLInputElement>("input[name='compMode']").forEach((radio) => radio.addEventListener("change", showMode));

    attachCompetitionBtn?.addEventListener("click", () => {
      compForm?.reset();
      showMode();
      compDialog?.showModal();
      compDialog?.querySelector<HTMLInputElement>("input[name='compName']")?.focus();
    });

    cancelCompBtn?.addEventListener("click", () => {
      compDialog?.close();
    });

    compForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.#event) return;
      if (selectedMode() === "attach") {
        const competitionId = compForm.querySelector<HTMLSelectElement>("select[name='compAttach']")?.value;
        if (!competitionId) return;
        compDialog?.close();
        this.dispatchEvent(
          new CustomEvent("competition-attach-requested", {
            detail: { eventId: this.#event.id, competitionId },
            bubbles: true,
            composed: true,
          }),
        );
        return;
      }
      const name = compForm.querySelector<HTMLInputElement>("input[name='compName']")?.value.trim();
      const slug = compForm.querySelector<HTMLInputElement>("input[name='compSlug']")?.value.trim();
      const date = compForm.querySelector<HTMLInputElement>("input[name='compDate']")?.value.trim();
      if (!name || !slug || !date) return;
      compDialog?.close();
      this.dispatchEvent(
        new CustomEvent("competition-create-requested", {
          detail: { eventId: this.#event.id, name, slug, date },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }
}

if (!customElements.get("event-overview-view")) {
  customElements.define("event-overview-view", EventOverviewView);
}

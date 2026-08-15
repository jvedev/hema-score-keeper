import css from "./ruleset-view.css?raw";
import { createApiClient, type ApiRulesetDetail } from "@hema/event-admin-api";
import { BaseComponent } from "../base-component/base-component.js";
import "../event-editor-view/event-editor-view.js";

interface RulesetDraft {
  name: string;
}

interface EditorState {
  mode: "create" | "edit";
  rulesetId?: string;
  baseRulesetId?: string;
}

const defaultDraft = (): RulesetDraft => ({
  name: "",
});

export class RulesetView extends BaseComponent {
  #api = createApiClient();
  #eventId = "";
  #loading = false;
  #error = "";
  #rulesets: ApiRulesetDetail[] = [];
  #editor: EditorState | undefined;
  #draft = defaultDraft();

  connectedCallback(): void {
    this.#eventId = this.getAttribute("event-id") ?? "";
    this.renderRulesetView();
    this.registerEvent(this.root, "click", (event) => this.handleClick(event));
    this.registerEvent(this.root, "submit", (event) => {
      event.preventDefault();
      void this.handleSubmit(event);
    });
    void this.load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  private async load(): Promise<void> {
    if (!this.#eventId) {
      this.#error = "Er is geen event geselecteerd voor dit ruleset-overzicht.";
      this.renderRulesetView();
      return;
    }

    this.#loading = true;
    this.#error = "";
    this.renderRulesetView();

    try {
      this.#rulesets = await this.#api.listRulesets(this.#eventId);
      this.pruneEditorSelection();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "De rulesets konden niet worden geladen.";
    } finally {
      this.#loading = false;
      this.renderRulesetView();
    }
  }

  private handleClick(event: Event): void {
    const origin = event.composedPath()[0];
    const target = origin instanceof Element ? origin.closest<HTMLElement>("[data-action]") : null;
    if (!target) {
      if (origin instanceof Element && origin.classList.contains("modal-backdrop")) {
        this.closeEditor();
      }
      return;
    }

    const id = target.dataset.id;
    switch (target.dataset.action) {
      case "refresh":
        void this.load();
        return;
      case "new-ruleset":
        this.openNewRuleset();
        return;
      case "edit-ruleset":
        if (id) {
          this.openRuleset(id);
        }
        return;
      case "duplicate-ruleset":
        if (id) {
          this.openRulesetCopy(id);
        } else {
          this.openNewRuleset();
        }
        return;
      case "close-editor":
        this.closeEditor();
        return;
      default:
        return;
    }
  }

  private async handleSubmit(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLFormElement)) {
      return;
    }

    if (!this.#eventId || !this.#editor) {
      return;
    }

    const selected = this.selectedRuleset;
    if (this.#editor.mode === "edit" && selected?.locked) {
      return;
    }

    try {
      const formData = new FormData(event.target);
      const draft = {
        name: readFormString(formData, "name"),
      };

      let result: ApiRulesetDetail;
      if (this.#editor.mode === "edit" && selected) {
        result = await this.#api.updateRuleset(selected.id, draft);
      } else {
        result = await this.#api.createRuleset(this.#eventId, {
          ...draft,
          ...(this.#editor.baseRulesetId ? { baseRulesetId: this.#editor.baseRulesetId } : {}),
        });
      }

      this.#editor = undefined;
      this.#draft = defaultDraft();
      this.dispatchRulesetChanged();
      this.#rulesets = this.#rulesets.filter((ruleset) => ruleset.id !== result.id).concat(result);
      this.#rulesets.sort(compareRulesets);
      this.renderRulesetView();
      await this.load();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "De ruleset kon niet worden opgeslagen.";
      this.renderRulesetView();
    }
  }

  private openNewRuleset(): void {
    this.#editor = { mode: "create" };
    this.#draft = defaultDraft();
    this.renderRulesetView();
  }

  private openRuleset(id: string): void {
    const selected = this.#rulesets.find((ruleset) => ruleset.id === id);
    if (!selected) {
      return;
    }

    this.#editor = { mode: "edit", rulesetId: selected.id };
    this.#draft = draftFromRuleset(selected);
    this.renderRulesetView();
  }

  private openRulesetCopy(id: string): void {
    const selected = this.#rulesets.find((ruleset) => ruleset.id === id);
    if (!selected) {
      return;
    }

    this.#editor = { mode: "create", baseRulesetId: selected.id };
    this.#draft = draftFromRuleset(selected);
    this.renderRulesetView();
  }

  private closeEditor(): void {
    this.#editor = undefined;
    this.#draft = defaultDraft();
    this.renderRulesetView();
  }

  private pruneEditorSelection(): void {
    if (!this.#editor || this.#editor.mode !== "edit" || !this.#editor.rulesetId) {
      return;
    }

    const selected = this.#rulesets.find((ruleset) => ruleset.id === this.#editor?.rulesetId);
    if (!selected) {
      this.closeEditor();
    }
  }

  private get selectedRuleset(): ApiRulesetDetail | undefined {
    if (!this.#editor || this.#editor.mode !== "edit" || !this.#editor.rulesetId) {
      return undefined;
    }

    return this.#rulesets.find((ruleset) => ruleset.id === this.#editor?.rulesetId);
  }

  private renderRulesetView(): void {
    this.render(css, this.renderView());
  }

  private renderView(): string {
    return `
      <section class="ruleset-view">
        <header class="ruleset-header">
          <div>
            <h2>Rulesets</h2>
            <p>Beheer event-gebonden rulesetversies.</p>
          </div>
          <div class="ruleset-actions">
            <button type="button" class="button icon-button" data-action="new-ruleset" title="Nieuwe ruleset" aria-label="Nieuwe ruleset">+</button>
            <button type="button" class="button secondary" data-action="refresh">Verversen</button>
          </div>
        </header>

        ${this.#error ? `<div class="error-banner">${escapeHtml(this.#error)}</div>` : ""}
        ${this.#loading ? `<div class="empty-state">Rulesets worden geladen…</div>` : ""}
        ${!this.#loading && this.#rulesets.length === 0
          ? `<div class="empty-state">Nog geen rulesets voor dit event. Gebruik + om de eerste ruleset aan te maken.</div>`
          : ""}

        ${!this.#loading && this.#rulesets.length > 0
          ? `
            <div class="ruleset-list">
              ${this.#rulesets.map((ruleset) => this.renderRulesetCard(ruleset)).join("")}
            </div>
          `
          : ""}

        ${this.renderEditor()}
      </section>
    `;
  }

  private renderRulesetCard(ruleset: ApiRulesetDetail): string {
    const isActive = Boolean(this.#editor && this.#editor.mode === "edit" && this.#editor.rulesetId === ruleset.id);
    return `
      <article class="ruleset-card${isActive ? " is-active" : ""}" data-action="edit-ruleset" data-id="${escapeHtml(ruleset.id)}">
        <div class="ruleset-card-header">
          <div>
            <div class="ruleset-card-title">${escapeHtml(this.rulesetTitle(ruleset))}</div>
            <div class="ruleset-card-subtitle">Versie ${ruleset.version}</div>
          </div>
          <div class="card-actions">
            <button type="button" class="button secondary icon-button" data-action="edit-ruleset" data-id="${escapeHtml(ruleset.id)}" title="Bewerk ${escapeHtml(ruleset.name)}" aria-label="Bewerk ${escapeHtml(ruleset.name)}">&#9998;</button>
          </div>
        </div>
        <div class="badge-row">
          <span class="badge badge-muted">Versie ${ruleset.version}</span>
          <span class="badge badge-muted">${ruleset.locked ? "In gebruik" : "Bewerkbaar"}</span>
          <span class="badge badge-muted">${ruleset.matchCount} matches</span>
        </div>
      </article>
    `;
  }

  private renderEditor(): string {
    if (!this.#editor) {
      return "";
    }

    const selected = this.selectedRuleset;
    const isEdit = this.#editor.mode === "edit" && Boolean(selected);
    const locked = Boolean(selected?.locked && isEdit);
    const title = this.#editor.mode === "create"
      ? this.#editor.baseRulesetId
        ? `Nieuwe versie van ${escapeHtml(this.findRulesetTitle(this.#editor.baseRulesetId) ?? "ruleset")}`
        : "Nieuwe ruleset"
      : `Ruleset bewerken`;
    const description = this.#editor.mode === "create"
      ? this.#editor.baseRulesetId
        ? "Pas de naam aan en sla als nieuwe versie op."
        : "Maak een nieuwe ruleset aan voor dit event."
      : locked
        ? "Deze versie is al in een match gebruikt en kan niet meer worden gewijzigd."
        : "Werk de naam bij en sla de wijzigingen op.";

    return `
      <event-editor-view>
        <section class="modal-backdrop" role="presentation">
          <div class="modal-card ruleset-modal-card" role="dialog" aria-modal="true" aria-labelledby="ruleset-editor-title">
            <header class="modal-header">
              <div>
                <div class="eyebrow">Rulesetbeheer</div>
                <h2 id="ruleset-editor-title">${title}</h2>
                <p class="editor-note">${escapeHtml(description)}</p>
              </div>
              <div class="modal-actions">
                ${this.#editor.mode === "edit" && locked
                  ? `<button type="button" class="button secondary" data-action="duplicate-ruleset" data-id="${escapeHtml(selected?.id ?? "")}">Nieuwe versie maken</button>`
                  : ""}
                <button type="button" class="button secondary" data-action="close-editor">Sluiten</button>
              </div>
            </header>

            <form class="ruleset-form" data-action="ruleset-editor">
              ${this.#editor.baseRulesetId
                ? `<input type="hidden" name="baseRulesetId" value="${escapeHtml(this.#editor.baseRulesetId)}" />`
                : ""}

              <label class="field">
                <span>Naam</span>
                <input class="text-input" name="name" type="text" value="${escapeHtml(this.#draft.name)}" required ${locked ? "disabled" : ""} />
              </label>

              <div class="modal-actions">
                <button type="submit" class="button" ${locked ? "disabled" : ""}>
                  ${this.#editor.mode === "create" ? "Ruleset aanmaken" : "Wijzigingen opslaan"}
                </button>
                <button type="button" class="button secondary" data-action="close-editor">Sluiten</button>
              </div>

              ${selected
                ? `
                  <div class="ruleset-meta">
                    <span class="badge">Versie ${selected.version}</span>
                    <span class="badge badge-muted">${selected.locked ? "In gebruik" : "Bewerkbaar"}</span>
                    <span class="badge badge-muted">${selected.matchCount} matches</span>
                  </div>
                `
                : ""}
            </form>
          </div>
        </section>
      </event-editor-view>
    `;
  }

  private rulesetTitle(ruleset: ApiRulesetDetail): string {
    return `${ruleset.name} v${ruleset.version}`;
  }

  private findRulesetTitle(id: string): string | undefined {
    const ruleset = this.#rulesets.find((candidate) => candidate.id === id);
    return ruleset ? this.rulesetTitle(ruleset) : undefined;
  }

  private dispatchRulesetChanged(): void {
    this.dispatchEvent(new CustomEvent("rulesets-changed", { bubbles: true, composed: true }));
  }
}

function draftFromRuleset(ruleset: ApiRulesetDetail): RulesetDraft {
  return {
    name: ruleset.name,
  };
}

function compareRulesets(left: ApiRulesetDetail, right: ApiRulesetDetail): number {
  const nameCompare = left.name.localeCompare(right.name);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return right.version - left.version;
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string") {
    throw new Error(`${name} is verplicht.`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${name} is verplicht.`);
  }

  return trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (!customElements.get("ruleset-view")) {
  customElements.define("ruleset-view", RulesetView);
}

import css from "./ruleset-view.css?raw";
import {
  createApiClient,
  type ApiRulesetDefinition,
  type ApiRulesetDetail,
} from "@hema/event-admin-api";
import { BaseComponent } from "../base-component/base-component.js";
import "../event-editor-view/event-editor-view.js";

interface RulesetDraft {
  name: string;
  definition: RulesetDefinitionDraft;
}

interface RulesetDefinitionDraft {
  weaponClass: string;
  matchParameters: MatchParametersDraft;
}

interface MatchParametersDraft {
  maxDurationSeconds: string;
  stopOnTimeOut: boolean;
  maxPointsCap: string;
  pointSpreadVictory: string;
  scores: string;
  maxDoubles: string;
  allowAfterBlow: boolean;
  countDoubles: boolean;
  useNetScore: boolean;
  penalties: PenaltyDraft[];
}

interface PenaltyDraft {
  description: string;
  penalties: string;
  disqualify: boolean;
}

interface EditorState {
  mode: "create" | "edit";
  rulesetId?: string;
  baseRulesetId?: string;
}

const defaultDraft = (): RulesetDraft => ({
  name: "",
  definition: draftFromDefinition(defaultRulesetDefinition()),
});

const defaultPenaltyDraft = (): PenaltyDraft => ({
  description: "",
  penalties: "",
  disqualify: false,
});

const defaultRulesetDefinition = (): ApiRulesetDefinition => ({
  weaponClass: "",
  matchParameters: {
    maxDurationSeconds: 180,
    stopOnTimeOut: true,
    maxPointsCap: 10,
    pointSpreadVictory: 5,
    scores: [1, 2, 3, 4],
    maxDoubles: 3,
    allowAfterBlow: true,
    countDoubles: true,
    useNetScore: true,
    penalties: [],
  },
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
      this.#error = "No event is selected for this ruleset view.";
      this.renderRulesetView();
      return;
    }

    this.#loading = true;
    this.#error = "";
    this.renderRulesetView();

    try {
      this.#rulesets = (await this.#api.listRulesets(this.#eventId)).sort(compareRulesets);
      this.pruneEditorSelection();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "Rulesets could not be loaded.";
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

    const form = target.closest<HTMLFormElement>('[data-action="ruleset-editor"]');
    switch (target.dataset.action) {
      case "refresh":
        void this.load();
        return;
      case "new-ruleset":
        this.openNewRuleset();
        return;
      case "edit-ruleset":
        if (target.dataset.id) {
          this.openRuleset(target.dataset.id);
        }
        return;
      case "duplicate-ruleset":
        if (target.dataset.id) {
          this.openRulesetCopy(target.dataset.id);
        } else {
          this.openNewRuleset();
        }
        return;
      case "add-penalty":
        this.addPenalty(form);
        return;
      case "remove-penalty":
        if (target.dataset.index !== undefined) {
          this.removePenalty(Number(target.dataset.index), form);
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

    const selected = this.editorRuleset;
    if (this.#editor.mode === "edit" && selected?.locked) {
      return;
    }

    try {
      const formData = new FormData(event.target);
      this.#draft = readDraftFromForm(formData, this.#draft.definition.matchParameters.penalties.length);
      const definition = definitionFromDraft(this.#draft.definition);
      const body = {
        name: readRequiredTextFromValue(readFormText(formData, "name"), "Ruleset name"),
        definition,
      };

      if (this.#editor.mode === "edit" && selected) {
        await this.#api.updateRuleset(selected.id, body);
      } else {
        await this.#api.createRuleset(this.#eventId, {
          ...body,
          ...(this.#editor.baseRulesetId ? { baseRulesetId: this.#editor.baseRulesetId } : {}),
        });
      }

      this.#editor = undefined;
      this.#draft = defaultDraft();
      this.dispatchRulesetChanged();
      await this.load();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The ruleset could not be saved.";
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

  private addPenalty(form: HTMLFormElement | null): void {
    if (form) {
      this.#draft = readDraftFromForm(new FormData(form), this.#draft.definition.matchParameters.penalties.length);
    }

    this.#draft = {
      ...this.#draft,
      definition: {
        ...this.#draft.definition,
        matchParameters: {
          ...this.#draft.definition.matchParameters,
          penalties: [...this.#draft.definition.matchParameters.penalties, defaultPenaltyDraft()],
        },
      },
    };
    this.renderRulesetView();
  }

  private removePenalty(index: number, form: HTMLFormElement | null): void {
    if (form) {
      this.#draft = readDraftFromForm(new FormData(form), this.#draft.definition.matchParameters.penalties.length);
    }

    const penalties = this.#draft.definition.matchParameters.penalties.filter((_, currentIndex) => currentIndex !== index);
    this.#draft = {
      ...this.#draft,
      definition: {
        ...this.#draft.definition,
        matchParameters: {
          ...this.#draft.definition.matchParameters,
          penalties,
        },
      },
    };
    this.renderRulesetView();
  }

  private get editorRuleset(): ApiRulesetDetail | undefined {
    if (!this.#editor) {
      return undefined;
    }

    if (this.#editor.mode === "edit" && this.#editor.rulesetId) {
      return this.#rulesets.find((ruleset) => ruleset.id === this.#editor?.rulesetId);
    }

    if (this.#editor.mode === "create" && this.#editor.baseRulesetId) {
      return this.#rulesets.find((ruleset) => ruleset.id === this.#editor?.baseRulesetId);
    }

    return undefined;
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
            <p>Create, edit, and version rulesets for this event.</p>
          </div>
          <div class="ruleset-actions">
            <button type="button" class="button icon-button" data-action="new-ruleset" title="New ruleset" aria-label="New ruleset">+</button>
            <button type="button" class="button secondary" data-action="refresh">Refresh</button>
          </div>
        </header>

        ${this.#error ? `<div class="error-banner">${escapeHtml(this.#error)}</div>` : ""}
        ${this.#loading ? `<div class="empty-state">Rulesets are loading...</div>` : ""}
        ${!this.#loading && this.#rulesets.length === 0
          ? `<div class="empty-state">No rulesets yet. Use + to create the first one.</div>`
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
    const definition = ruleset.definition ?? defaultRulesetDefinition();
    return `
      <article class="ruleset-card${isActive ? " is-active" : ""}" data-action="edit-ruleset" data-id="${escapeHtml(ruleset.id)}">
        <div class="ruleset-card-header">
          <div>
            <div class="ruleset-card-title">${escapeHtml(this.rulesetTitle(ruleset))}</div>
            <div class="ruleset-card-subtitle">${escapeHtml(definition.weaponClass || "No weapon class")}</div>
          </div>
          <div class="card-actions">
            <button type="button" class="button secondary icon-button" data-action="edit-ruleset" data-id="${escapeHtml(ruleset.id)}" title="Edit ${escapeHtml(ruleset.name)}" aria-label="Edit ${escapeHtml(ruleset.name)}">&#9998;</button>
          </div>
        </div>
        <div class="badge-row">
          <span class="badge badge-muted">Version ${ruleset.version}</span>
          <span class="badge badge-muted">Matches ${ruleset.matchCount}</span>
          <span class="badge badge-muted">${definition.matchParameters.penalties.length} penalty rules</span>
          <span class="badge badge-muted">${ruleset.locked ? "Locked" : "Editable"}</span>
        </div>
      </article>
    `;
  }

  private renderEditor(): string {
    if (!this.#editor) {
      return "";
    }

    const selected = this.editorRuleset;
    const isEdit = this.#editor.mode === "edit" && Boolean(selected);
    const locked = Boolean(selected?.locked && isEdit);
    const title = this.#editor.mode === "create"
      ? this.#editor.baseRulesetId
        ? `New version of ${escapeHtml(this.rulesetLabel(selected) ?? "ruleset")}`
        : "Create ruleset"
      : "Edit ruleset";
    const description = this.#editor.mode === "create"
      ? this.#editor.baseRulesetId
        ? "Change the name or definition and save it as a new version."
        : "Create a new ruleset for this event."
      : locked
        ? "This version is already used in a match and cannot be changed."
        : "Update the ruleset definition and save your changes.";

    return `
      <event-editor-view>
        <section class="modal-backdrop" role="presentation">
          <div class="modal-card ruleset-modal-card" role="dialog" aria-modal="true" aria-labelledby="ruleset-editor-title">
            <header class="modal-header">
              <div>
                <div class="eyebrow">Ruleset management</div>
                <h2 id="ruleset-editor-title">${title}</h2>
                <p class="editor-note">${escapeHtml(description)}</p>
              </div>
              <div class="modal-actions">
                ${this.#editor.mode === "edit" && locked
                  ? `<button type="button" class="button secondary" data-action="duplicate-ruleset" data-id="${escapeHtml(selected?.id ?? "")}">Create new version</button>`
                  : ""}
                <button type="button" class="button secondary" data-action="close-editor">Close</button>
              </div>
            </header>

            <form class="ruleset-form" data-action="ruleset-editor">
              ${this.#editor.baseRulesetId
                ? `<input type="hidden" name="baseRulesetId" value="${escapeHtml(this.#editor.baseRulesetId)}" />`
                : ""}

              <div class="field-grid">
                <label class="field">
                  <span>Name</span>
                  <input class="text-input" name="name" type="text" value="${escapeHtml(this.#draft.name)}" required ${locked ? "disabled" : ""} />
                </label>

                <label class="field">
                  <span>Weapon class</span>
                  <input class="text-input" name="weaponClass" type="text" value="${escapeHtml(this.#draft.definition.weaponClass)}" required ${locked ? "disabled" : ""} />
                </label>
              </div>

              <section class="field-group">
                <div class="field-group-header">
                  <div>
                    <h3>Match parameters</h3>
                    <p>These values are stored in JSON.</p>
                  </div>
                </div>

                <div class="field-grid">
                  <label class="field">
                    <span>Maximum duration (seconds)</span>
                    <input class="text-input" name="maxDurationSeconds" type="number" min="0" step="1" value="${escapeHtml(this.#draft.definition.matchParameters.maxDurationSeconds)}" ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field">
                    <span>Maximum points cap</span>
                    <input class="text-input" name="maxPointsCap" type="number" min="0" step="1" value="${escapeHtml(this.#draft.definition.matchParameters.maxPointsCap)}" ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field">
                    <span>Point spread victory</span>
                    <input class="text-input" name="pointSpreadVictory" type="number" min="0" step="1" value="${escapeHtml(this.#draft.definition.matchParameters.pointSpreadVictory)}" ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field">
                    <span>Max doubles</span>
                    <input class="text-input" name="maxDoubles" type="number" min="0" step="1" value="${escapeHtml(this.#draft.definition.matchParameters.maxDoubles)}" ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field">
                    <span>Scores</span>
                    <input class="text-input" name="scores" type="text" value="${escapeHtml(this.#draft.definition.matchParameters.scores)}" placeholder="1, 2, 3, 4" ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Stop on timeout</span>
                    <input type="checkbox" name="stopOnTimeOut" ${this.#draft.definition.matchParameters.stopOnTimeOut ? "checked" : ""} ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Allow after blow</span>
                    <input type="checkbox" name="allowAfterBlow" ${this.#draft.definition.matchParameters.allowAfterBlow ? "checked" : ""} ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Count doubles</span>
                    <input type="checkbox" name="countDoubles" ${this.#draft.definition.matchParameters.countDoubles ? "checked" : ""} ${locked ? "disabled" : ""} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Use net score</span>
                    <input type="checkbox" name="useNetScore" ${this.#draft.definition.matchParameters.useNetScore ? "checked" : ""} ${locked ? "disabled" : ""} />
                  </label>
                </div>
              </section>

              <section class="field-group">
                <div class="field-group-header">
                  <div>
                    <h3>Penalty rules</h3>
                    <p>Add as many penalty rules as needed.</p>
                  </div>
                </div>

                <div class="penalty-list">
                  ${this.#draft.definition.matchParameters.penalties.length > 0
                    ? this.#draft.definition.matchParameters.penalties.map((penalty, index) => this.renderPenaltyRow(penalty, index, locked)).join("")
                    : `<div class="empty-state penalty-empty">No penalty rules yet.</div>`}
                </div>

                <div class="field-actions">
                  <button type="button" class="button secondary" data-action="add-penalty" ${locked ? "disabled" : ""}>+ Add penalty</button>
                </div>
              </section>

              <div class="modal-actions">
                <button type="submit" class="button" ${locked ? "disabled" : ""}>
                  ${this.#editor.mode === "create" ? "Create ruleset" : "Save changes"}
                </button>
                <button type="button" class="button secondary" data-action="close-editor">Close</button>
              </div>

              ${selected
                ? `
                  <div class="ruleset-meta">
                    <span class="badge">Version ${selected.version}</span>
                    <span class="badge badge-muted">${selected.locked ? "Locked" : "Editable"}</span>
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

  private renderPenaltyRow(penalty: PenaltyDraft, index: number, locked: boolean): string {
    return `
      <article class="penalty-row">
        <label class="field">
          <span>Description</span>
          <input class="text-input" name="${penaltyDescriptionName(index)}" type="text" value="${escapeHtml(penalty.description)}" required ${locked ? "disabled" : ""} />
        </label>

        <label class="field">
          <span>Penalty values</span>
          <input class="text-input" name="${penaltyValuesName(index)}" type="text" value="${escapeHtml(penalty.penalties)}" placeholder="0, 1, 2" ${locked ? "disabled" : ""} />
        </label>

        <label class="field checkbox-field">
          <span>Disqualifies fighter</span>
          <input type="checkbox" name="${penaltyDisqualifyName(index)}" ${penalty.disqualify ? "checked" : ""} ${locked ? "disabled" : ""} />
        </label>

        <div class="penalty-row-actions">
          <button type="button" class="button secondary icon-button" data-action="remove-penalty" data-index="${index}" title="Remove penalty" aria-label="Remove penalty" ${locked ? "disabled" : ""}>−</button>
        </div>
      </article>
    `;
  }

  private rulesetTitle(ruleset: ApiRulesetDetail): string {
    return `${ruleset.name} v${ruleset.version}`;
  }

  private rulesetLabel(ruleset: ApiRulesetDetail | undefined): string | undefined {
    return ruleset ? this.rulesetTitle(ruleset) : undefined;
  }

  private dispatchRulesetChanged(): void {
    this.dispatchEvent(new CustomEvent("rulesets-changed", { bubbles: true, composed: true }));
  }
}

function draftFromRuleset(ruleset: ApiRulesetDetail): RulesetDraft {
  return {
    name: ruleset.name,
    definition: draftFromDefinition(ruleset.definition ?? defaultRulesetDefinition()),
  };
}

function draftFromDefinition(definition: ApiRulesetDefinition): RulesetDefinitionDraft {
  return {
    weaponClass: definition.weaponClass,
    matchParameters: {
      maxDurationSeconds: String(definition.matchParameters.maxDurationSeconds),
      stopOnTimeOut: definition.matchParameters.stopOnTimeOut,
      maxPointsCap: String(definition.matchParameters.maxPointsCap),
      pointSpreadVictory: String(definition.matchParameters.pointSpreadVictory),
      scores: definition.matchParameters.scores.join(", "),
      maxDoubles: String(definition.matchParameters.maxDoubles),
      allowAfterBlow: definition.matchParameters.allowAfterBlow,
      countDoubles: definition.matchParameters.countDoubles,
      useNetScore: definition.matchParameters.useNetScore,
      penalties: definition.matchParameters.penalties.map((penalty) => ({
        description: penalty.description,
        penalties: penalty.penalties.join(", "),
        disqualify: penalty.disqualify,
      })),
    },
  };
}

function definitionFromDraft(draft: RulesetDefinitionDraft): ApiRulesetDefinition {
  return {
    weaponClass: readRequiredTextFromValue(draft.weaponClass, "Weapon class"),
    matchParameters: {
      maxDurationSeconds: readRequiredIntegerFromValue(draft.matchParameters.maxDurationSeconds, "Maximum duration"),
      stopOnTimeOut: draft.matchParameters.stopOnTimeOut,
      maxPointsCap: readRequiredIntegerFromValue(draft.matchParameters.maxPointsCap, "Maximum points cap"),
      pointSpreadVictory: readRequiredIntegerFromValue(draft.matchParameters.pointSpreadVictory, "Point spread victory"),
      scores: readIntegerList(draft.matchParameters.scores, "Scores"),
      maxDoubles: readRequiredIntegerFromValue(draft.matchParameters.maxDoubles, "Max doubles"),
      allowAfterBlow: draft.matchParameters.allowAfterBlow,
      countDoubles: draft.matchParameters.countDoubles,
      useNetScore: draft.matchParameters.useNetScore,
      penalties: draft.matchParameters.penalties.map((penalty, index) => ({
        description: readRequiredTextFromValue(penalty.description, `Penalty ${index + 1} description`),
        penalties: readIntegerList(penalty.penalties, `Penalty ${index + 1} values`),
        disqualify: penalty.disqualify,
      })),
    },
  };
}

function readDraftFromForm(formData: FormData, penaltyCount: number): RulesetDraft {
  return {
    name: readFormText(formData, "name"),
    definition: {
      weaponClass: readFormText(formData, "weaponClass"),
      matchParameters: {
        maxDurationSeconds: readFormText(formData, "maxDurationSeconds"),
        stopOnTimeOut: readFormBoolean(formData, "stopOnTimeOut"),
        maxPointsCap: readFormText(formData, "maxPointsCap"),
        pointSpreadVictory: readFormText(formData, "pointSpreadVictory"),
        scores: readFormText(formData, "scores"),
        maxDoubles: readFormText(formData, "maxDoubles"),
        allowAfterBlow: readFormBoolean(formData, "allowAfterBlow"),
        countDoubles: readFormBoolean(formData, "countDoubles"),
        useNetScore: readFormBoolean(formData, "useNetScore"),
        penalties: Array.from({ length: penaltyCount }, (_, index) => ({
          description: readFormText(formData, penaltyDescriptionName(index)),
          penalties: readFormText(formData, penaltyValuesName(index)),
          disqualify: readFormBoolean(formData, penaltyDisqualifyName(index)),
        })),
      },
    },
  };
}

function readFormText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readFormBoolean(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

function readRequiredTextFromValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function readRequiredIntegerFromValue(value: string, label: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return parsed;
}

function readIntegerList(value: string, label: string): number[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split(",").map((item) => {
    const candidate = item.trim();
    if (candidate.length === 0) {
      throw new Error(`${label} must not contain empty values.`);
    }

    const parsed = Number(candidate);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${label} must contain non-negative integers.`);
    }

    return parsed;
  });
}

function penaltyDescriptionName(index: number): string {
  return `penalty-description-${index}`;
}

function penaltyValuesName(index: number): string {
  return `penalty-values-${index}`;
}

function penaltyDisqualifyName(index: number): string {
  return `penalty-disqualify-${index}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compareRulesets(left: ApiRulesetDetail, right: ApiRulesetDetail): number {
  const nameCompare = left.name.localeCompare(right.name);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return right.version - left.version;
}

if (!customElements.get("ruleset-view")) {
  customElements.define("ruleset-view", RulesetView);
}

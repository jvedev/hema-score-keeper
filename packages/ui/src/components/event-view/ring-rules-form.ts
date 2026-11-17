import type { ApiRingOvertimeAfter, ApiRingRules } from "@hema/event-admin-api";
import { t, type MessageKey } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";

/** The whole-number inputs of the ring rules form. Ranges match `parseRingRules` in `@hema/competition-domain`. */
export type NumericRingRuleField =
  | "maxDurationSeconds"
  | "maxDoubles"
  | "maxPointsCap"
  | "lastExchangeSeconds"
  | "rounds"
  | "breakSeconds"
  | "extensions"
  | "extensionSeconds";

export type RingRuleField = NumericRingRuleField | "scores" | "overtimeAfter";

interface NumericFieldSpec {
  readonly name: NumericRingRuleField;
  readonly label: MessageKey;
  readonly min: number;
  readonly max: number;
}

const NUMERIC_FIELDS: Readonly<Record<NumericRingRuleField, NumericFieldSpec>> = {
  maxDurationSeconds: { name: "maxDurationSeconds", label: "liveRules.duration", min: 1, max: 3600 },
  maxDoubles: { name: "maxDoubles", label: "liveRules.maxDoubles", min: 0, max: 99 },
  maxPointsCap: { name: "maxPointsCap", label: "liveRules.pointCap", min: 0, max: 999 },
  lastExchangeSeconds: { name: "lastExchangeSeconds", label: "liveRules.lastExchange", min: 0, max: 3600 },
  rounds: { name: "rounds", label: "liveRules.rounds", min: 1, max: 9 },
  breakSeconds: { name: "breakSeconds", label: "liveRules.break", min: 0, max: 3600 },
  extensions: { name: "extensions", label: "liveRules.extensions", min: 0, max: 9 },
  extensionSeconds: { name: "extensionSeconds", label: "liveRules.extensionSeconds", min: 1, max: 3600 },
};

const SCORE_MIN = 1;
const SCORE_MAX = 10;

/** The form as typed: kept as text so an invalid entry can be shown back unchanged. */
export type RingRulesFormValues = Readonly<Record<NumericRingRuleField | "scores" | "overtimeAfter", string>> & {
  readonly suddenDeath: boolean;
};

export type RingRulesParseResult =
  | { readonly ok: true; readonly rules: ApiRingRules }
  | { readonly ok: false; readonly invalidFields: readonly RingRuleField[] };

/** What the rules form shows under its save button. */
export type RingRulesFeedback =
  | { readonly kind: "saved" }
  | { readonly kind: "invalid"; readonly fields: readonly RingRuleField[] }
  | { readonly kind: "error"; readonly message: string };

export function ringRulesFormValues(rules: ApiRingRules): RingRulesFormValues {
  const { format } = rules;
  return {
    maxDurationSeconds: String(rules.maxDurationSeconds),
    scores: rules.scores.join(", "),
    maxDoubles: String(rules.maxDoubles),
    maxPointsCap: String(rules.maxPointsCap),
    lastExchangeSeconds: String(format.lastExchangeSeconds),
    rounds: String(format.rounds),
    breakSeconds: String(format.breakSeconds),
    overtimeAfter: format.overtimeAfter,
    extensions: String(format.extensions),
    extensionSeconds: String(format.extensionSeconds),
    suddenDeath: format.suddenDeath,
  };
}

export function readRingRulesForm(form: FormData): RingRulesFormValues {
  const text = (name: string): string => String(form.get(name) ?? "");
  return {
    maxDurationSeconds: text("maxDurationSeconds"),
    scores: text("scores"),
    maxDoubles: text("maxDoubles"),
    maxPointsCap: text("maxPointsCap"),
    lastExchangeSeconds: text("lastExchangeSeconds"),
    rounds: text("rounds"),
    breakSeconds: text("breakSeconds"),
    overtimeAfter: text("overtimeAfter"),
    extensions: text("extensions"),
    extensionSeconds: text("extensionSeconds"),
    suddenDeath: form.get("suddenDeath") === "on",
  };
}

/**
 * The typed form back into rules. Unlike the backend, which silently replaces an out-of-range value with the
 * default, this rejects it so the admin sees what is wrong. Penalties are not edited here and stay as they are.
 */
export function parseRingRulesForm(values: RingRulesFormValues, current: ApiRingRules): RingRulesParseResult {
  const invalidFields: RingRuleField[] = [];
  const whole = (name: NumericRingRuleField): number => {
    const value = parseWholeNumber(values[name]);
    const spec = NUMERIC_FIELDS[name];
    if (value === null || value < spec.min || value > spec.max) {
      invalidFields.push(name);
      return 0;
    }
    return value;
  };
  const maxDurationSeconds = whole("maxDurationSeconds");
  const scores = parseScores(values.scores);
  if (scores === null) invalidFields.push("scores");
  const maxDoubles = whole("maxDoubles");
  const maxPointsCap = whole("maxPointsCap");
  const lastExchangeSeconds = whole("lastExchangeSeconds");
  const rounds = whole("rounds");
  const breakSeconds = whole("breakSeconds");
  const overtimeAfter = isOvertimeAfter(values.overtimeAfter) ? values.overtimeAfter : null;
  if (overtimeAfter === null) invalidFields.push("overtimeAfter");
  const extensions = whole("extensions");
  const extensionSeconds = whole("extensionSeconds");
  if (invalidFields.length > 0 || scores === null || overtimeAfter === null) {
    return { ok: false, invalidFields };
  }
  return {
    ok: true,
    rules: {
      maxDurationSeconds,
      scores,
      maxDoubles,
      maxPointsCap,
      penalties: current.penalties.map((penalty) => ({ ...penalty, penalties: [...penalty.penalties] })),
      format: { rounds, breakSeconds, lastExchangeSeconds, overtimeAfter, extensions, extensionSeconds, suddenDeath: values.suddenDeath },
    },
  };
}

function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function parseScores(raw: string): number[] | null {
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0) return null;
  const scores = parts.map(parseWholeNumber);
  return scores.every((score): score is number => score !== null && score >= SCORE_MIN && score <= SCORE_MAX) ? scores : null;
}

function isOvertimeAfter(value: string): value is ApiRingOvertimeAfter {
  return value === "EVERY_ROUND" || value === "LAST_ROUND";
}

/** The message for one invalid field, naming the field and the allowed values. */
export function ringRuleErrorMessage(field: RingRuleField): string {
  if (field === "scores") return t("liveRules.invalidScores", { field: t("liveRules.scores"), min: SCORE_MIN, max: SCORE_MAX });
  if (field === "overtimeAfter") return t("liveRules.invalidOvertime", { field: t("liveRules.overtimeAfter") });
  const spec = NUMERIC_FIELDS[field];
  return t("liveRules.invalidNumber", { field: t(spec.label), min: spec.min, max: spec.max });
}

export function renderRingRulesForm(values: RingRulesFormValues, feedback: RingRulesFeedback | null, busy: boolean): string {
  const invalid = new Set(feedback?.kind === "invalid" ? feedback.fields : []);
  const invalidAttribute = (field: RingRuleField): string => (invalid.has(field) ? ' aria-invalid="true"' : "");
  const number = (name: NumericRingRuleField): string => {
    const spec = NUMERIC_FIELDS[name];
    return `<label class="field">
        <span>${escapeHtml(t(spec.label))}</span>
        <input class="text-input" name="${name}" type="number" min="${spec.min}" max="${spec.max}" step="1" inputmode="numeric" value="${escapeHtml(values[name])}"${invalidAttribute(name)} />
      </label>`;
  };
  const option = (value: ApiRingOvertimeAfter, label: MessageKey): string =>
    `<option value="${value}"${values.overtimeAfter === value ? " selected" : ""}>${escapeHtml(t(label))}</option>`;
  return `
    <form class="info-card editor-form live-ring-rules" data-action="live-ring-rules" novalidate>
      <div class="info-card-title">${escapeHtml(t("liveRules.heading"))}</div>
      <div class="info-card-subtitle">${escapeHtml(t("liveRules.note"))}</div>
      <div class="live-ring-rules-grid">
        ${number("maxDurationSeconds")}
        <label class="field">
          <span>${escapeHtml(t("liveRules.scores"))}</span>
          <input class="text-input" name="scores" value="${escapeHtml(values.scores)}"${invalidAttribute("scores")} />
        </label>
        ${number("maxDoubles")}
        ${number("maxPointsCap")}
        ${number("lastExchangeSeconds")}
        ${number("rounds")}
        ${number("breakSeconds")}
        <label class="field">
          <span>${escapeHtml(t("liveRules.overtimeAfter"))}</span>
          <select class="text-input" name="overtimeAfter"${invalidAttribute("overtimeAfter")}>
            ${option("LAST_ROUND", "liveRules.overtimeLast")}
            ${option("EVERY_ROUND", "liveRules.overtimeEvery")}
          </select>
        </label>
        ${number("extensions")}
        ${number("extensionSeconds")}
        <label class="checkbox-field">
          <input name="suddenDeath" type="checkbox"${values.suddenDeath ? " checked" : ""} />
          <span>${escapeHtml(t("liveRules.suddenDeath"))}</span>
        </label>
      </div>
      ${renderFeedback(feedback)}
      <div class="card-actions">
        <button type="submit" class="button"${busy ? " disabled" : ""}>${escapeHtml(t("liveRules.save"))}</button>
      </div>
    </form>
  `;
}

function renderFeedback(feedback: RingRulesFeedback | null): string {
  if (!feedback) return "";
  if (feedback.kind === "saved") return `<p class="live-ring-notice" role="status">${escapeHtml(t("liveRules.saved"))}</p>`;
  const messages = feedback.kind === "invalid" ? feedback.fields.map(ringRuleErrorMessage) : [feedback.message];
  return `<div class="live-ring-error" role="alert">${messages.map((message) => `<p>${escapeHtml(message)}</p>`).join("")}</div>`;
}

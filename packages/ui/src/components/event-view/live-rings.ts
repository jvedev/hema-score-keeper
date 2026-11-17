import type { ApiEventColor, ApiLiveRing, ApiScoreboardSettings, ApiScoreboardTextSize, ApiScoreboardTheme } from "@hema/event-admin-api";
import { t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import "../invite-share/invite-share.js";
import { renderColorSelect } from "./event-colors.js";
import { isFormInUse } from "./form-state.js";

/**
 * Where the score-keeper app is published next to Event-admin on the same site (`deployment/apps.json`).
 * The `score-keeper-url` attribute on `<event-view>` overrides it, e.g. for dev servers on separate ports.
 */
export const SCORE_KEEPER_APP_PATH = "/score-keeper";

const TEXT_SIZES: readonly ApiScoreboardTextSize[] = ["SMALL", "MEDIUM", "LARGE"];
const THEMES: readonly ApiScoreboardTheme[] = ["DARK", "LIGHT"];

/** The score-keeper base URL without a trailing slash: the configured one, or the same-origin app path. */
export function scoreKeeperBaseUrl(configured: string | null | undefined, origin: string): string {
  const url = configured?.trim() || `${origin}${SCORE_KEEPER_APP_PATH}`;
  return url.replace(/\/+$/, "");
}

/** The link a ring's table opens to keep score (score-keeper's `/ring/:token` route). */
export function ringKeeperLink(scoreKeeperUrl: string, keeperToken: string): string {
  return `${scoreKeeperUrl.replace(/\/+$/, "")}/ring/${encodeURIComponent(keeperToken)}`;
}

/** The link a ring's scoreboard screen opens: view only, no sign-in (score-keeper's `/scoreboard/:token` route). */
export function ringScoreboardLink(scoreKeeperUrl: string, scoreboardToken: string): string {
  return `${scoreKeeperUrl.replace(/\/+$/, "")}/scoreboard/${encodeURIComponent(scoreboardToken)}`;
}

export function ringKeeperStatus(ring: Pick<ApiLiveRing, "activeKeeper">): string {
  return ring.activeKeeper ? t("liveRings.keeping", { name: ring.activeKeeper.userName }) : t("liveRings.notKept");
}

/** Asks before a new table link: names whoever keeps the ring now, because they will be stopped. */
export function rotateKeeperConfirmMessage(ring: Pick<ApiLiveRing, "name" | "activeKeeper">): string {
  return ring.activeKeeper
    ? t("liveRings.newKeeperLinkConfirmKeeper", { name: ring.activeKeeper.userName, ring: ring.name })
    : t("liveRings.newKeeperLinkConfirm", { ring: ring.name });
}

export function rotateScoreboardConfirmMessage(ring: Pick<ApiLiveRing, "name">): string {
  return t("liveRings.newScoreboardLinkConfirm", { ring: ring.name });
}

/** The settings from a ring's scoreboard form, or null for a value outside the fixed choices. */
export function readScoreboardSettings(form: FormData): ApiScoreboardSettings | null {
  const textSize = String(form.get("textSize") ?? "");
  const theme = String(form.get("theme") ?? "");
  if (!(TEXT_SIZES as readonly string[]).includes(textSize) || !(THEMES as readonly string[]).includes(theme)) return null;
  return {
    mirrored: form.get("mirrored") === "on",
    showNext: form.get("showNext") === "on",
    textSize: textSize as ApiScoreboardTextSize,
    theme: theme as ApiScoreboardTheme,
  };
}

export interface LiveRingsView {
  /** Null while the rings are loading. */
  readonly rings: readonly ApiLiveRing[] | null;
  /** The event's colours the ring colours are chosen from. */
  readonly palette: readonly ApiEventColor[];
  readonly scoreKeeperUrl: string;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly error: string | null;
}

/** What one ring card needs besides the ring itself. */
export type LiveRingCardView = Pick<LiveRingsView, "palette" | "scoreKeeperUrl" | "busy">;

export function renderLiveRings(view: LiveRingsView): string {
  return `
    <section class="live-rings" aria-label="${escapeHtml(t("liveRings.heading"))}">
      <div class="info-card">
        <div class="info-card-title">${escapeHtml(t("liveRings.heading"))}</div>
        <div class="info-card-subtitle">${escapeHtml(t("liveRings.note"))}</div>
        ${view.notice ? `<p class="live-ring-notice" role="status">${escapeHtml(view.notice)}</p>` : ""}
        ${view.error ? `<p class="live-ring-error" role="alert">${escapeHtml(view.error)}</p>` : ""}
      </div>
      ${renderRingList(view)}
    </section>
  `;
}

function renderRingList(view: LiveRingsView): string {
  if (view.rings === null) return `<div class="empty-card">${escapeHtml(t("liveRings.loading"))}</div>`;
  if (view.rings.length === 0) return `<div class="empty-card">${escapeHtml(t("liveRings.none"))}</div>`;
  return `<div class="live-ring-list">${view.rings.map((ring) => renderLiveRingCard(ring, view)).join("")}</div>`;
}

/**
 * Brings the ring cards on screen up to date with `rings` in place, part by part, keeping every form the admin is
 * editing (changed or focused) as it is. Returns false when the cards on screen are not these rings (a ring was
 * added or removed); the caller then leaves the screen alone until its next full render.
 */
export function patchLiveRingCards(root: ParentNode, rings: readonly ApiLiveRing[], view: LiveRingCardView): boolean {
  const cards = Array.from(root.querySelectorAll<HTMLElement>("article.live-ring"));
  if (cards.length !== rings.length || cards.some((card, index) => card.dataset.ringId !== rings[index]!.id)) return false;
  cards.forEach((card, index) => patchCard(card, renderLiveRingCard(rings[index]!, view)));
  return true;
}

function patchCard(card: HTMLElement, html: string): void {
  const template = card.ownerDocument.createElement("template");
  template.innerHTML = html.trim();
  const fresh = template.content.firstElementChild;
  if (!fresh) return;
  const oldParts = Array.from(card.children);
  const newParts = Array.from(fresh.children);
  if (oldParts.length !== newParts.length) return;
  oldParts.forEach((oldPart, index) => {
    const newPart = newParts[index]!;
    if (oldPart.outerHTML === newPart.outerHTML) return;
    if (oldPart instanceof HTMLFormElement && isFormInUse(oldPart)) return;
    oldPart.replaceWith(newPart);
  });
}

/** One ring's card: who keeps it, its links, and its colour and scoreboard forms. */
export function renderLiveRingCard(ring: ApiLiveRing, view: LiveRingCardView): string {
  const id = escapeHtml(ring.id);
  const disabled = view.busy ? " disabled" : "";
  return `
    <article class="info-card live-ring" data-ring-id="${id}">
      <div class="live-ring-header">
        <div class="info-card-title">${escapeHtml(ring.name)}</div>
        <div class="info-card-subtitle" data-ring-keeper data-kept="${ring.activeKeeper ? "true" : "false"}">${escapeHtml(ringKeeperStatus(ring))}</div>
      </div>
      <div class="live-ring-links">
        <div class="live-ring-link">
          <invite-share data-ring-keeper-link heading="${escapeHtml(t("liveRings.keeperLinkHeading"))}" link="${escapeHtml(ringKeeperLink(view.scoreKeeperUrl, ring.keeperToken))}"></invite-share>
          <button type="button" class="button secondary" data-action="rotate-live-ring-keeper-link" data-ring-id="${id}"${disabled}>${escapeHtml(t("liveRings.newKeeperLink"))}</button>
        </div>
        <div class="live-ring-link">
          <invite-share data-ring-scoreboard-link heading="${escapeHtml(t("liveRings.scoreboardLinkHeading"))}" link="${escapeHtml(ringScoreboardLink(view.scoreKeeperUrl, ring.scoreboardToken))}"></invite-share>
          <button type="button" class="button secondary" data-action="rotate-live-ring-scoreboard-link" data-ring-id="${id}"${disabled}>${escapeHtml(t("liveRings.newScoreboardLink"))}</button>
        </div>
      </div>
      <form class="live-ring-colors" data-action="live-ring-colors" data-ring-id="${id}">
        <span class="live-ring-colors-title">${escapeHtml(t("liveRings.colorsHeading"))}</span>
        ${renderColorSelect("leftColor", t("liveRings.leftColor"), view.palette, ring.leftColor)}
        ${renderColorSelect("rightColor", t("liveRings.rightColor"), view.palette, ring.rightColor)}
        <button type="submit" class="button secondary"${disabled}>${escapeHtml(t("liveRings.saveColors"))}</button>
      </form>
      ${renderScoreboardForm(ring, disabled)}
    </article>
  `;
}

function renderChoice(name: "textSize" | "theme", values: readonly string[], current: string): string {
  const options = values
    .map((value) => `<option value="${value}"${value === current ? " selected" : ""}>${escapeHtml(t(`scoreboardSettings.${name}.${value}` as Parameters<typeof t>[0]))}</option>`)
    .join("");
  return `
    <label class="field">
      <span>${escapeHtml(t(`scoreboardSettings.${name}`))}</span>
      <select class="text-input" name="${name}">${options}</select>
    </label>`;
}

/** The ring's scoreboard settings (the table can set them too); the scoreboard picks them up on its next poll. */
function renderScoreboardForm(ring: ApiLiveRing, disabled: string): string {
  const settings = ring.scoreboard;
  const checkbox = (name: "mirrored" | "showNext", on: boolean) => `
    <label class="field field-checkbox">
      <input type="checkbox" name="${name}"${on ? " checked" : ""} />
      <span>${escapeHtml(t(`scoreboardSettings.${name}`))}</span>
    </label>`;
  return `
      <form class="live-ring-colors live-ring-scoreboard" data-action="live-ring-scoreboard" data-ring-id="${escapeHtml(ring.id)}">
        <span class="live-ring-colors-title">${escapeHtml(t("scoreboardSettings.heading"))}</span>
        ${checkbox("mirrored", settings.mirrored)}
        ${checkbox("showNext", settings.showNext)}
        ${renderChoice("textSize", TEXT_SIZES, settings.textSize)}
        ${renderChoice("theme", THEMES, settings.theme)}
        <button type="submit" class="button secondary"${disabled}>${escapeHtml(t("liveRings.saveScoreboard"))}</button>
      </form>`;
}

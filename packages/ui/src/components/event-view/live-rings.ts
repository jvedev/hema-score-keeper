import type { ApiLiveRing, ApiLiveRingColors } from "@hema/event-admin-api";
import { t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import "../invite-share/invite-share.js";

/**
 * Where the score-keeper app is published next to Event-admin on the same site (`deployment/apps.json`).
 * The `score-keeper-url` attribute on `<event-view>` overrides it, e.g. for dev servers on separate ports.
 */
export const SCORE_KEEPER_APP_PATH = "/score-keeper";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

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

/** The colours from a ring's colour form, or null when either is not `#rrggbb`. */
export function readRingColors(form: FormData): ApiLiveRingColors | null {
  const leftColor = String(form.get("leftColor") ?? "");
  const rightColor = String(form.get("rightColor") ?? "");
  return HEX_COLOR.test(leftColor) && HEX_COLOR.test(rightColor) ? { leftColor, rightColor } : null;
}

export interface LiveRingsView {
  /** Null while the rings are loading. */
  readonly rings: readonly ApiLiveRing[] | null;
  readonly scoreKeeperUrl: string;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly error: string | null;
}

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
  return `<div class="live-ring-list">${view.rings.map((ring) => renderRingCard(ring, view)).join("")}</div>`;
}

function renderRingCard(ring: ApiLiveRing, view: LiveRingsView): string {
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
        <label class="field">
          <span>${escapeHtml(t("liveRings.leftColor"))}</span>
          <input type="color" name="leftColor" value="${escapeHtml(ring.leftColor)}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t("liveRings.rightColor"))}</span>
          <input type="color" name="rightColor" value="${escapeHtml(ring.rightColor)}" />
        </label>
        <button type="submit" class="button secondary"${disabled}>${escapeHtml(t("liveRings.saveColors"))}</button>
      </form>
    </article>
  `;
}

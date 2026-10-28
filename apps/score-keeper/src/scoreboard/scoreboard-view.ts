import type { BoutDisplay, SideScore } from "@hema/competition-domain";
import type { Translate } from "../ring/ring-texts";

/** Kept free of @hema/ui (DOM components) so it is testable in Node; the page passes in `t`. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

interface BoutNames {
  label: string;
  fighterLeft: string;
  fighterRight: string;
}

/** What `GET /api/v1/scoreboard/:token` answers. The scoreboard draws it and works nothing out itself. */
export interface ScoreboardData {
  serverTime: string;
  tournamentName: string;
  ring: { name: string; leftColor: string; rightColor: string };
  current: (BoutNames & { display: BoutDisplay }) | null;
  onDeck: BoutNames | null;
  after: BoutNames | null;
  pool: {
    name: string;
    bouts: Array<BoutNames & { status: "PENDING" | "RUNNING" | "DONE"; isNext: boolean; result: SideScore | null }>;
  } | null;
}

export type Connection = "ok" | "lost";

/** The scoreboard path: `/scoreboard/<token>`. Null for any other path. */
export function scoreboardTokenFromPath(pathname: string): string | null {
  const match = /^\/scoreboard\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** Black or white text, whichever reads better on the colour. */
export function textColorFor(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return "#ffffff";
  const [r, g, b] = match.slice(1).map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  // Where black and white give the same contrast ratio.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#0b0d10" : "#ffffff";
}

export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The countdown now: a running clock goes on from what the server sent, `elapsedMs` ago. */
export function remainingNow(display: BoutDisplay, elapsedMs: number): number {
  return display.running ? Math.max(0, display.remainingSeconds - Math.floor(elapsedMs / 1000)) : display.remainingSeconds;
}

const TONES = { NORMAL: "normal", LAST_EXCHANGE: "last", OVERTIME: "overtime" } as const;

function vs(names: BoutNames, flipped: boolean, t: Translate): string {
  const [first, second] = flipped ? [names.fighterRight, names.fighterLeft] : [names.fighterLeft, names.fighterRight];
  return `<b>${escapeHtml(first)}</b> <span class="sb-vs">${escapeHtml(t("scoreboard.vs"))}</span> <b>${escapeHtml(second)}</b>`;
}

function periodLabel(display: BoutDisplay, t: Translate): string {
  switch (display.period) {
    case "EXTENSION":
      return t("scoreboard.extension", { n: String(display.extension ?? 1) });
    case "SUDDEN_DEATH":
      return t("scoreboard.suddenDeath");
    case "BREAK":
      return t("scoreboard.break");
    default:
      return "";
  }
}

function fighterPanel(name: string, color: string, score: number, warnings: number, roundsWon: number | null, /** The side of the screen it is shown on. */ side: "left" | "right", t: Translate): string {
  return `<section class="sb-fighter sb-${side}" style="background:${escapeHtml(color)};color:${textColorFor(color)}">
      <div class="sb-name">${escapeHtml(name)}</div>
      <div class="sb-score">${Number(score)}</div>
      <div class="sb-extra">
        ${roundsWon !== null ? `<span class="sb-rounds">${escapeHtml(t("scoreboard.roundsWon", { n: String(roundsWon) }))}</span>` : ""}
        ${warnings > 0 ? `<span class="sb-warnings">⚠ ${Number(warnings)}</span>` : ""}
      </div>
    </section>`;
}

function renderBout(data: ScoreboardData, current: NonNullable<ScoreboardData["current"]>, flipped: boolean, elapsedMs: number, t: Translate): string {
  const d = current.display;
  const left = fighterPanel(current.fighterLeft, data.ring.leftColor, d.score.left, d.warnings.left, d.roundsWon?.left ?? null, flipped ? "right" : "left", t);
  const right = fighterPanel(current.fighterRight, data.ring.rightColor, d.score.right, d.warnings.right, d.roundsWon?.right ?? null, flipped ? "left" : "right", t);
  const period = periodLabel(d, t);
  const strip = data.onDeck
    ? `<footer class="sb-strip"><span class="sb-strip-label">${escapeHtml(t("scoreboard.onDeck"))}</span> ${vs(data.onDeck, flipped, t)}${
        data.after ? ` <span class="sb-then">· ${escapeHtml(t("scoreboard.then"))} ${vs(data.after, flipped, t)}</span>` : ""
      }</footer>`
    : "";
  return `<div class="sb-bout">
      ${flipped ? right : left}
      <section class="sb-center">
        ${d.round !== null ? `<div class="sb-round">${escapeHtml(t("scoreboard.round", { round: String(d.round), rounds: String(d.rounds) }))}</div>` : ""}
        <div class="sb-clock sb-tone-${TONES[d.tone]}">${clockText(remainingNow(d, elapsedMs))}</div>
        ${period ? `<div class="sb-period sb-tone-${TONES[d.tone]}">${escapeHtml(period)}</div>` : ""}
        ${d.doubles > 0 ? `<div class="sb-doubles">${escapeHtml(t("scoreboard.doubles", { n: String(d.doubles) }))}</div>` : ""}
      </section>
      ${flipped ? left : right}
    </div>
    ${strip}
    ${renderAlert(d, t)}`;
}

/** Max doubles / point cap: a flashing see-through layer over the whole board. */
function renderAlert(display: BoutDisplay, t: Translate): string {
  const lines = [display.maxDoublesReached ? t("scoreboard.maxDoubles") : "", display.pointCapReached ? t("scoreboard.pointCap") : ""].filter(Boolean);
  return lines.length === 0 ? "" : `<div class="sb-alert" role="alert">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>`;
}

function renderNext(data: ScoreboardData, flipped: boolean, t: Translate): string {
  const next = data.onDeck
    ? `<div class="sb-next"><span class="sb-next-label">${escapeHtml(t("scoreboard.next"))}</span><div class="sb-next-names">${vs(data.onDeck, flipped, t)}</div></div>`
    : `<div class="sb-next"><span class="sb-next-label">${escapeHtml(t("scoreboard.noMoreBouts"))}</span></div>`;
  const pool = data.pool
    ? `<h2 class="sb-pool-name">${escapeHtml(data.pool.name)}</h2>
      <ol class="sb-pool">${data.pool.bouts
        .map(
          (bout) => `<li class="sb-pool-bout sb-pool-${bout.status.toLowerCase()}${bout.isNext ? " sb-pool-next" : ""}">
            <span class="sb-pool-names">${escapeHtml(bout.fighterLeft)} <span class="sb-vs">${escapeHtml(t("scoreboard.vs"))}</span> ${escapeHtml(bout.fighterRight)}</span>
            <span class="sb-pool-result">${bout.result ? `${Number(bout.result.left)}–${Number(bout.result.right)}` : ""}</span>
          </li>`,
        )
        .join("")}</ol>`
    : "";
  return `${next}${pool}`;
}

/** The header line (the header itself, with the flip button, is drawn once so the button is never replaced under a click). */
export function headerText(data: ScoreboardData): string {
  return `${data.tournamentName} · ${data.ring.name}`;
}

/** The scoreboard below the header. `elapsedMs`: time since the data arrived (a running clock counts on by it). */
export function renderScoreboard(data: ScoreboardData, flipped: boolean, connection: Connection, elapsedMs: number, t: Translate): string {
  const lost = connection === "lost" ? `<div class="sb-lost" role="alert">${escapeHtml(t("scoreboard.connectionLost"))}</div>` : "";
  return `${lost}
    <main class="sb-main">${data.current ? renderBout(data, data.current, flipped, elapsedMs, t) : renderNext(data, flipped, t)}</main>`;
}

export function renderMessage(text: string): string {
  return `<main class="sb-main sb-message"><p>${escapeHtml(text)}</p></main>`;
}

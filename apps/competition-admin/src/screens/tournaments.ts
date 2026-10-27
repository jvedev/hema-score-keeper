import { escapeHtml, formatDateTime, t } from "@hema/ui";
import { SessionExpiredError } from "../admin-client";
import type { ImportReport, LiveRingLink, LiveTournamentSummary } from "../api-types";
import type { AppContext } from "../app-context";
import { scoreKeeperAppUrl } from "../config";
import { parseSpreadsheetId, rotateConfirmMessage, rotateTarget, toImportReportView, toRingCards, toSyncCards } from "../mappers/tournaments";
import type { Translate } from "../mappers/translate";

/** How often the sync status card reloads while the screen is open. */
export const SYNC_REFRESH_MS = 10_000;

const translate = t as Translate;
const message = (caught: unknown): string => (caught instanceof Error ? caught.message : String(caught));

/** The list of the laptop person's tournaments, and a form to make one. */
export async function renderTournamentsScreen(container: HTMLElement, context: AppContext): Promise<void> {
  const tournaments = await context.client.liveTournaments();
  container.innerHTML = `<div><p class="eyebrow">${t("admin.title")}</p><h1>${t("tournaments.title")}</h1></div>
    <section class="panel">
      ${tournaments.length ? `<div class="tournament-list">${tournaments.map(tournamentRow).join("")}</div>` : `<p class="muted">${t("tournaments.none")}</p>`}
    </section>
    <form class="panel new-tournament">
      <h2>${t("tournaments.new")}</h2>
      <div class="grid-2">
        <label class="field">${t("admin.name")}<input name="name" required maxlength="120" /></label>
        <label class="field">${t("tournaments.spreadsheet")}<input name="spreadsheet" autocomplete="off" /></label>
      </div>
      <p class="error" hidden></p>
      <div class="row"><button type="submit" class="primary">${t("admin.create")}</button></div>
    </form>`;

  container.querySelectorAll<HTMLAnchorElement>("a[data-tournament]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      context.navigate({ name: "tournament", tournamentId: link.dataset.tournament! });
    });
  });

  const form = container.querySelector<HTMLFormElement>("form.new-tournament")!;
  const error = form.querySelector<HTMLElement>(".error")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    error.hidden = true;
    if (name === "") {
      error.hidden = false;
      error.textContent = t("tournaments.nameRequired");
      return;
    }
    const googleSpreadsheetId = parseSpreadsheetId(String(data.get("spreadsheet") ?? ""));
    form.querySelectorAll<HTMLButtonElement>("button").forEach((button) => (button.disabled = true));
    try {
      const created = await context.client.createLiveTournament(googleSpreadsheetId ? { name, googleSpreadsheetId } : { name });
      context.toast(t("tournaments.created"));
      context.navigate({ name: "tournament", tournamentId: created.id });
    } catch (caught) {
      form.querySelectorAll<HTMLButtonElement>("button").forEach((button) => (button.disabled = false));
      if (caught instanceof SessionExpiredError) {
        context.sessionExpired();
        return;
      }
      error.hidden = false;
      error.textContent = message(caught);
    }
  });
}

function tournamentRow(tournament: LiveTournamentSummary): string {
  const id = escapeHtml(tournament.id);
  return `<a class="tournament-row" href="/tournaments/${encodeURIComponent(tournament.id)}" data-tournament="${id}">
    <strong>${escapeHtml(tournament.name)}</strong>
    <span class="muted">${escapeHtml(formatDateTime(tournament.createdAt, "date"))} · ${t(tournament.googleSpreadsheetId ? "tournaments.withGoogle" : "tournaments.noGoogle")}</span>
  </a>`;
}

/**
 * One tournament: import the schedule, watch the backup and sync, hand out ring links.
 * Returns a cleanup that stops the sync refresh when the screen is left.
 */
export async function renderTournamentScreen(container: HTMLElement, context: AppContext, tournamentId: string): Promise<() => void> {
  const [tournament, rings, targets] = await Promise.all([
    context.client.liveTournament(tournamentId),
    context.client.liveRings(tournamentId),
    context.client.syncStatus(tournamentId),
  ]);

  container.innerHTML = `<div>
      <button type="button" class="back-link" data-back>← ${t("tournaments.back")}</button>
      <p class="eyebrow">${t("tournaments.title")}</p>
      <h1>${escapeHtml(tournament.name)}</h1>
    </div>
    <section class="panel import">
      <h2>${t("tournaments.importHeading")}</h2>
      <p class="muted">${t("tournaments.importNote")}</p>
      <div class="row">
        <input type="file" class="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
        <button type="button" class="primary" data-upload>${t("tournaments.upload")}</button>
        <button type="button" data-google ${tournament.googleSpreadsheetId ? "" : "disabled"}>${t("tournaments.importGoogle")}</button>
      </div>
      ${tournament.googleSpreadsheetId ? "" : `<p class="muted">${t("tournaments.noGoogleSheet")}</p>`}
      <div class="report" role="status" aria-live="polite"></div>
      <p class="error" hidden></p>
    </section>
    <section class="panel sync">
      <h2>${t("tournaments.syncHeading")}</h2>
      <div class="sync-cards"></div>
      <div class="row"><button type="button" data-backup>${t("tournaments.downloadBackup")}</button></div>
      <p class="error" hidden></p>
    </section>
    <section class="panel rings">
      <h2>${t("tournaments.ringsHeading")}</h2>
      <p class="muted">${t("tournaments.ringsNote")}</p>
      <div class="ring-cards"></div>
      <p class="error" hidden></p>
    </section>`;

  container.querySelector("[data-back]")!.addEventListener("click", () => context.navigate({ name: "tournaments" }));

  const importSection = container.querySelector<HTMLElement>("section.import")!;
  const reportBox = importSection.querySelector<HTMLElement>(".report")!;
  const importError = importSection.querySelector<HTMLElement>(".error")!;
  const syncSection = container.querySelector<HTMLElement>("section.sync")!;
  const syncCards = syncSection.querySelector<HTMLElement>(".sync-cards")!;
  const syncError = syncSection.querySelector<HTMLElement>(".error")!;
  const ringSection = container.querySelector<HTMLElement>("section.rings")!;
  const ringCards = ringSection.querySelector<HTMLElement>(".ring-cards")!;
  const ringError = ringSection.querySelector<HTMLElement>(".error")!;

  /** Shows a failure next to its section; an expired login goes back to the sign-in page. */
  const fail = (box: HTMLElement, caught: unknown, format: (text: string) => string = (text) => text): void => {
    if (caught instanceof SessionExpiredError) {
      context.sessionExpired();
      return;
    }
    box.hidden = false;
    box.textContent = format(message(caught));
  };

  // ---- Sync status: reloads every SYNC_REFRESH_MS while this screen is open ----
  const drawSync = (current: typeof targets): void => {
    syncCards.innerHTML = toSyncCards(current, Date.now(), translate)
      .map(
        (card) => `<div class="sync-card" data-state="${escapeHtml(card.state)}" data-tone="${card.tone}">
          <strong>${escapeHtml(card.title)}</strong>
          <span class="state-badge">${escapeHtml(card.stateLabel)}</span>
          <span class="muted">${escapeHtml(card.updated)}${card.counts.map((count) => ` · ${escapeHtml(count)}`).join("")}</span>
          ${card.error ? `<span class="error">${escapeHtml(card.error)}</span>` : ""}
        </div>`,
      )
      .join("");
  };
  drawSync(targets);
  let refreshing = false;
  let refreshAgain = false;
  const refreshOnce = async (): Promise<void> => {
    try {
      drawSync(await context.client.syncStatus(tournamentId));
      syncError.hidden = true;
    } catch (caught) {
      fail(syncError, caught, () => t("tournaments.syncUnavailable"));
    }
    // Who is keeping a ring changes while this screen is open; a failure here is retried on the next tick.
    try {
      syncKeepers(await context.client.liveRings(tournamentId));
    } catch (caught) {
      if (caught instanceof SessionExpiredError) {
        context.sessionExpired();
      }
    }
  };
  /** Reloads the sync status and the ring keepers. A request while one is running queues exactly one more run. */
  const refreshSync = async (): Promise<void> => {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      do {
        refreshAgain = false;
        if (!container.isConnected) {
          return;
        }
        await refreshOnce();
      } while (refreshAgain);
    } finally {
      refreshing = false;
    }
  };
  const timer = window.setInterval(() => void refreshSync(), SYNC_REFRESH_MS);
  const stop = (): void => window.clearInterval(timer);

  syncSection.querySelector<HTMLButtonElement>("[data-backup]")!.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    syncError.hidden = true;
    try {
      const blob = await context.client.downloadBackup(tournamentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tournament.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "tournament"}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      fail(syncError, caught, (text) => t("tournaments.downloadFailed", { message: text }));
    } finally {
      button.disabled = false;
    }
  });

  // ---- Ring links ----
  let shownRings: readonly LiveRingLink[] = rings;
  /** Updates the "who is scoring" lines in place; redraws only when the rings themselves changed (new links, new rings). */
  const syncKeepers = (fresh: readonly LiveRingLink[]): void => {
    const same = fresh.length === shownRings.length && fresh.every((ring, index) => ring.id === shownRings[index]!.id && ring.keeperToken === shownRings[index]!.keeperToken);
    if (!same) {
      drawRings(fresh);
      return;
    }
    shownRings = fresh;
    const cards = toRingCards(fresh, scoreKeeperAppUrl(), translate);
    for (const card of cards) {
      const line = ringCards.querySelector<HTMLElement>(`article[data-ring="${CSS.escape(card.id)}"] [data-kept]`);
      if (line) {
        line.dataset.kept = String(card.kept);
        line.textContent = card.keeper;
      }
    }
  };
  const drawRings = (current: readonly LiveRingLink[]): void => {
    shownRings = current;
    if (current.length === 0) {
      ringCards.innerHTML = `<p class="muted">${t("tournaments.noRings")}</p>`;
      return;
    }
    const cards = toRingCards(current, scoreKeeperAppUrl(), translate);
    ringCards.innerHTML = cards
      .map(
        (card) => `<article class="ring-card" data-ring="${escapeHtml(card.id)}">
          <div class="row"><strong>${escapeHtml(card.name)}</strong><span class="muted" data-kept="${card.kept}">${escapeHtml(card.keeper)}</span></div>
          <invite-share></invite-share>
          <div class="row"><button type="button" data-rotate>${t("tournaments.newLink")}</button></div>
        </article>`,
      )
      .join("");
    ringCards.querySelectorAll<HTMLElement>("article.ring-card").forEach((element) => {
      const ringId = element.dataset.ring!;
      element.querySelector("invite-share")!.link = cards.find((card) => card.id === ringId)!.link;
      const button = element.querySelector<HTMLButtonElement>("[data-rotate]")!;
      button.addEventListener("click", async () => {
        button.disabled = true;
        ringError.hidden = true;
        try {
          // The old link stops working and the phone scoring the ring is stopped, so this always asks first,
          // naming whoever keeps the ring now (not whoever kept it when the page loaded).
          const fresh = await context.client.liveRings(tournamentId);
          const ring = rotateTarget(fresh, ringId);
          if (!ring) {
            drawRings(fresh);
            return;
          }
          if (!window.confirm(rotateConfirmMessage(ring, translate))) {
            syncKeepers(fresh);
            button.disabled = false;
            return;
          }
          await context.client.rotateRingToken(ring.id);
          context.toast(t("tournaments.newLinkMade"));
          drawRings(await context.client.liveRings(tournamentId));
        } catch (caught) {
          button.disabled = false;
          fail(ringError, caught);
        }
      });
    });
  };
  drawRings(rings);

  // ---- Import ----
  const fileInput = importSection.querySelector<HTMLInputElement>("input.file")!;
  const importButtons = importSection.querySelectorAll<HTMLButtonElement>("button[data-upload], button[data-google]");
  const googleButton = importSection.querySelector<HTMLButtonElement>("[data-google]")!;

  const drawReport = (report: ImportReport): void => {
    const view = toImportReportView(report, translate);
    reportBox.innerHTML = `<p>${escapeHtml(view.summary)}</p>
      ${view.skipped.length ? `<h3>${t("tournaments.reportSkipped")}</h3><ul>${view.skipped.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
      ${view.errors.length ? `<h3>${t("tournaments.reportErrors")}</h3><ul class="report-errors">${view.errors.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}`;
  };

  /** Runs an import, shows its report, then reloads the rings (the import may have made some) and the sync status. */
  const runImport = async (start: () => Promise<ImportReport>): Promise<void> => {
    importError.hidden = true;
    reportBox.textContent = t("tournaments.importing");
    importButtons.forEach((button) => (button.disabled = true));
    let report: ImportReport;
    try {
      report = await start();
    } catch (caught) {
      reportBox.textContent = "";
      fail(importError, caught);
      importButtons.forEach((button) => (button.disabled = false));
      googleButton.disabled = !tournament.googleSpreadsheetId;
      return;
    }
    // The import worked: its report stays on screen whatever the refresh below does.
    drawReport(report);
    void refreshSync();
    ringError.hidden = true;
    try {
      drawRings(await context.client.liveRings(tournamentId));
    } catch (caught) {
      fail(ringError, caught);
    } finally {
      importButtons.forEach((button) => (button.disabled = false));
      googleButton.disabled = !tournament.googleSpreadsheetId;
    }
  };

  importSection.querySelector("[data-upload]")!.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) {
      void runImport(() => context.client.importWorkbook(tournamentId, file));
    }
  });
  googleButton.addEventListener("click", () => void runImport(() => context.client.importGoogle(tournamentId)));

  return stop;
}

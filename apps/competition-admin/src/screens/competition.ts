import { escapeHtml, formatDateTime, t, type MessageKey } from "@hema/ui";
import type { CompetitionDetail } from "../api-types";
import type { AppContext } from "../app-context";
import { toBoutDetailView } from "../mappers/bout";
import { fighterForBout, legacyBoutDetail, toFighterBouts, toFighterSummary } from "../mappers/fighter";
import { parametersToForm } from "../mappers/settings";
import { toStandingRows } from "../mappers/standings";
import { href, type Route } from "../router";

type CompetitionRoute = Extract<Route, { name: "competition" | "fighter" | "bout" }>;

/** The fighter last opened per competition, so a bout keeps its fighter panel beside it. */
const lastFighter = new Map<string, string>();

export function competitionHeader(competition: CompetitionDetail, active: "participants" | "settings"): string {
  const participantsHref = href({ name: "competition", competitionId: competition.id });
  const settingsHref = href({ name: "settings", competitionId: competition.id });
  return `<div>
      <p class="chip">${t(`lifecycle.${competition.status}` as MessageKey)}</p>
      <h1>${escapeHtml(competition.name)}</h1>
    </div>
    <nav class="subnav">
      <a href="${participantsHref}" data-link ${active === "participants" ? 'aria-current="page"' : ""}>${t("admin.participants")}</a>
      <a href="${settingsHref}" data-link ${active === "settings" ? 'aria-current="page"' : ""}>${t("admin.settings")}</a>
    </nav>`;
}

/** Makes in-app links use the router instead of reloading the page. */
export function wireLinks(container: HTMLElement, context: AppContext): void {
  container.querySelectorAll<HTMLAnchorElement>("a[data-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState({}, "", link.getAttribute("href")!);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  });
  void context;
}

export async function renderCompetitionScreen(container: HTMLElement, context: AppContext, route: CompetitionRoute): Promise<void> {
  const competitionId = route.competitionId;
  const [competition, standings, history, clubs] = await Promise.all([
    context.client.competition(competitionId),
    context.client.standings(competitionId),
    context.client.boutHistory(competitionId),
    context.client.clubs(),
  ]);
  const participantId = route.name === "fighter" ? route.participantId : route.name === "bout" ? fighterForBout(history, route.boutId, lastFighter.get(competitionId)) : undefined;
  if (route.name === "fighter") {
    lastFighter.set(competitionId, route.participantId);
  }

  container.innerHTML = competitionHeader(competition, "participants");

  if (competition.status === "DRAFT" || competition.status === "REGISTRATION_OPEN") {
    const parameters = competition.rulesetJson ? parametersToForm(competition.rulesetJson) : null;
    container.insertAdjacentHTML(
      "beforeend",
      `<section class="panel">
        <h2>${t("admin.planning")}</h2>
        <p class="muted">${formatDateTime(competition.date, "date")} · ${t(`scope.${competition.scope.kind}` as MessageKey)}${competition.scope.values.length ? `: ${escapeHtml(competition.scope.values.join(", "))}` : ""}</p>
        ${parameters ? `<p class="muted">${parameters.minutes} min · max ${parameters.maxPointsCap}</p>` : ""}
        <p class="muted">${t("admin.fighters", { count: standings.length })}</p>
        <a href="${href({ name: "settings", competitionId })}" data-link>${t("admin.settings")} ›</a>
      </section>`,
    );
    wireLinks(container, context);
    return;
  }

  const names = new Map(standings.map((row) => [row.participantId, row.name]));
  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const currentStep = route.name === "bout" ? "bout" : route.name === "fighter" ? "fighter" : "participants";
  container.insertAdjacentHTML(
    "beforeend",
    `<div class="drill">
      <section data-step="participants" ${currentStep === "participants" ? "data-current" : ""}>
        <participant-table searchable show-warnings></participant-table>
      </section>
      <section data-step="fighter" ${currentStep === "fighter" ? "data-current" : ""}></section>
      <section data-step="bout" ${currentStep === "bout" ? "data-current" : ""}></section>
    </div>`,
  );
  wireLinks(container, context);

  const table = container.querySelector("participant-table")!;
  table.rows = toStandingRows(standings, clubs);
  if (participantId) {
    table.setAttribute("selected", participantId);
  }
  table.addEventListener("participant-selected", (event) =>
    context.navigate({ name: "fighter", competitionId, participantId: event.detail.participantId }),
  );

  const row = standings.find((standing) => standing.participantId === participantId);
  const fighterStep = container.querySelector<HTMLElement>('[data-step="fighter"]')!;
  if (row) {
    fighterStep.innerHTML = `<button type="button" class="back-link">‹ ${t("admin.participants")}</button><fighter-history searchable show-warnings></fighter-history>`;
    fighterStep.querySelector(".back-link")!.addEventListener("click", () => context.navigate({ name: "competition", competitionId }));
    const fighter = fighterStep.querySelector("fighter-history")!;
    fighter.summary = toFighterSummary(row, row.clubId ? (clubNames.get(row.clubId) ?? null) : null, history);
    fighter.bouts = toFighterBouts(history, row.participantId, names);
    if (route.name === "bout") {
      fighter.setAttribute("selected", route.boutId);
    }
    fighter.addEventListener("bout-selected", (event) => context.navigate({ name: "bout", competitionId, boutId: event.detail.boutId }));
  }

  if (route.name === "bout") {
    const boutStep = container.querySelector<HTMLElement>('[data-step="bout"]')!;
    const back = row ? { label: row.name, route: { name: "fighter", competitionId, participantId: row.participantId } as Route } : { label: t("admin.participants"), route: { name: "competition", competitionId } as Route };
    boutStep.innerHTML = `<button type="button" class="back-link">‹ ${escapeHtml(back.label)}</button><bout-details show-warnings show-lead-graph></bout-details>`;
    boutStep.querySelector(".back-link")!.addEventListener("click", () => context.navigate(back.route));
    const entry = history.find((bout) => bout.id === route.boutId);
    const details = boutStep.querySelector("bout-details")!;
    if (entry?.source === "LEGACY") {
      details.bout = legacyBoutDetail(entry, names);
    } else {
      const bout = await context.client.bout(route.boutId);
      details.bout = toBoutDetailView(bout);
      if (bout.status === "OBJECTED") {
        boutStep.insertAdjacentHTML("beforeend", `<a href="${href({ name: "objection", boutId: bout.id })}" data-link class="primary-link">${t("review.title")} ›</a>`);
      } else if (bout.status === "SCORED") {
        boutStep.insertAdjacentHTML("beforeend", `<p class="muted">${t("admin.awaitingRefereeNote")}</p>`);
      }
      wireLinks(boutStep, context);
    }
  }
}

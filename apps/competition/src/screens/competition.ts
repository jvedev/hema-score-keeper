import { escapeHtml, t, type MessageKey } from "@hema/ui";
import { runBoutAction, type ActionFeedback } from "../actions";
import type { AppContext } from "../app-context";
import { availableActions, type BoutAction } from "../mappers/bout-actions";
import {
  drillState,
  legacyBoutDetail,
  ownRow,
  seesBoutWarnings,
  toBoutDetailView,
  toFighterBouts,
  toFighterSummary,
  toStandingRows,
  type CompetitionRoute,
} from "../mappers/competition";
import { toCompetitionJoinCard } from "../mappers/competitions";
import type { Translate } from "../mappers/translate";
import type { Route } from "../router";
import { joinCardBlock } from "./competitions";

/** The fighter last opened per competition, so a bout keeps its fighter panel beside it. */
const lastFighter = new Map<string, string>();

const ACTION_LABELS: Record<BoutAction, MessageKey> = {
  approve: "todo.approve",
  object: "todo.object",
  withdraw: "todo.withdraw",
  "referee-approve": "todo.refereeApprove",
};

/**
 * A competition: the join card (Join, Leave, Withdraw), then standings → fighter → bout.
 * It opens on the fighter's own bouts. Warnings are only asked for on their own fighter page and own bouts;
 * the server already leaves out everyone else's.
 */
export async function renderCompetitionScreen(container: HTMLElement, context: AppContext, route: CompetitionRoute): Promise<void> {
  const competitionId = route.competitionId;
  const userId = context.client.currentSession()!.user.id;
  const [competition, standings, history, participants, joinable, clubs] = await Promise.all([
    context.client.competition(competitionId),
    context.client.standings(competitionId),
    context.client.boutHistory(competitionId),
    context.client.participants(competitionId),
    context.client.joinable(),
    context.client.clubs(),
  ]);
  const own = ownRow(standings, userId);
  if (route.name === "fighter") {
    lastFighter.set(competitionId, route.participantId);
  }
  const { participantId, step } = drillState(route, history, own?.participantId, lastFighter.get(competitionId));
  const reload = () => context.navigate(route, true);

  container.classList.add("wide");
  container.innerHTML = `<div>
      <p class="chip">${escapeHtml(t(`lifecycle.${competition.status}` as MessageKey))}</p>
      <h1>${escapeHtml(competition.name)}</h1>
    </div>`;
  container.append(
    joinCardBlock(
      toCompetitionJoinCard({ competition, participants, userId, joinable: joinable.find((entry) => entry.id === competitionId), clubs, translate: t as Translate }),
      context,
      reload,
      reload,
    ),
  );
  container.insertAdjacentHTML(
    "beforeend",
    `<div class="drill">
      <section data-step="standings" ${step === "standings" ? "data-current" : ""}>
        <h2>${t("app.standings")}</h2>
        ${own ? `<button type="button" class="link my-bouts">${t("app.myBouts")} ›</button>` : ""}
        <participant-table searchable></participant-table>
      </section>
      <section data-step="fighter" ${step === "fighter" ? "data-current" : ""}></section>
      <section data-step="bout" ${step === "bout" ? "data-current" : ""}></section>
    </div>`,
  );

  // No show-warnings on the table: it would show every row's warnings, and only the fighter's own are theirs.
  const table = container.querySelector("participant-table")!;
  table.rows = toStandingRows(standings, clubs);
  if (participantId) {
    table.setAttribute("selected", participantId);
  }
  table.addEventListener("participant-selected", (event) => context.navigate({ name: "fighter", competitionId, participantId: event.detail.participantId }));
  container.querySelector(".my-bouts")?.addEventListener("click", () => context.navigate({ name: "competition", competitionId }));

  const names = new Map(standings.map((row) => [row.participantId, row.name]));
  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const row = standings.find((standing) => standing.participantId === participantId);
  const fighterStep = container.querySelector<HTMLElement>('[data-step="fighter"]')!;
  if (row) {
    const mine = row.participantId === own?.participantId;
    fighterStep.innerHTML = `<button type="button" class="back-link">‹ ${t("app.standings")}</button>
      <fighter-history searchable ${mine ? "show-warnings" : ""}></fighter-history>`;
    fighterStep.querySelector(".back-link")!.addEventListener("click", () => context.navigate({ name: "standings", competitionId }));
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
    const back: { label: string; route: Route } = row
      ? { label: row.name, route: { name: "fighter", competitionId, participantId: row.participantId } }
      : { label: t("app.standings"), route: { name: "standings", competitionId } };
    boutStep.innerHTML = `<button type="button" class="back-link">‹ ${escapeHtml(back.label)}</button>`;
    boutStep.querySelector(".back-link")!.addEventListener("click", () => context.navigate(back.route));
    const details = document.createElement("bout-details");
    details.setAttribute("show-lead-graph", "");
    const entry = history.find((bout) => bout.id === route.boutId);
    if (entry?.source === "LEGACY") {
      // Older bouts have no exchanges or warnings to show.
      details.bout = legacyBoutDetail(entry, names);
      boutStep.append(details);
    } else {
      const bout = await context.client.boutView(competitionId, route.boutId);
      if (seesBoutWarnings(bout, userId)) {
        details.setAttribute("show-warnings", "");
      }
      details.bout = toBoutDetailView(bout);
      boutStep.append(details);
      const actions = availableActions(bout, userId, Date.now());
      if (actions.length > 0) {
        boutStep.append(boutActionsPanel(actions, route.boutId, context, reload));
      }
    }
  }
}

/** The fighter's (or referee's) buttons under a bout; the same actions as the home to-do list. */
function boutActionsPanel(actions: readonly BoutAction[], boutId: string, context: AppContext, done: () => void): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "panel bout-actions";
  panel.innerHTML = `<h2>${t("app.yourBout")}</h2>
    <div class="row">${actions
      .map((action, index) => `<button type="button" data-action="${action}" class="${index === 0 ? "primary" : ""}">${t(ACTION_LABELS[action])}</button>`)
      .join("")}</div>
    <p class="error" role="alert" hidden></p>`;
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>("button[data-action]")];
  const error = panel.querySelector<HTMLElement>(".error")!;
  const feedback: ActionFeedback = {
    setBusy: (busy) => buttons.forEach((button) => (button.disabled = busy)),
    setError(message) {
      error.textContent = message ?? "";
      error.hidden = message === null;
    },
    stillShown: () => panel.isConnected,
  };
  panel.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (button && !button.disabled) {
      void runBoutAction(context, button.dataset.action as BoutAction, boutId, feedback).then((ok) => ok && feedback.stillShown() && done());
    }
  });
  return panel;
}

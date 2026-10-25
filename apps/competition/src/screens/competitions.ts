import { t, type JoinCardView } from "@hema/ui";
import { joinCompetition, leaveCompetition, type ActionFeedback } from "../actions";
import type { AppContext } from "../app-context";
import { toJoinableCards } from "../mappers/competitions";
import { toMyCompetitionItems } from "../mappers/home";
import type { Translate } from "../mappers/translate";

/** A join card with its own error line; Join and Leave go through the shared actions. Nothing follows up once the card is gone. */
export function joinCardBlock(competition: JoinCardView, context: AppContext, afterJoin: () => void, afterLeave: () => void): HTMLElement {
  const block = document.createElement("div");
  block.className = "join-block";
  block.innerHTML = `<join-card></join-card><p class="error" role="alert" hidden></p>`;
  const card = block.querySelector("join-card")!;
  const error = block.querySelector<HTMLElement>(".error")!;
  card.competition = competition;
  const feedback: ActionFeedback = {
    setBusy: (busy) => card.toggleAttribute("busy", busy),
    setError(message) {
      error.textContent = message ?? "";
      error.hidden = message === null;
    },
    stillShown: () => block.isConnected,
  };
  card.addEventListener("join-requested", () => {
    void joinCompetition(context, competition.id, competition.name, feedback).then((joined) => joined && feedback.stillShown() && afterJoin());
  });
  card.addEventListener("leave-requested", () => {
    void leaveCompetition(context, competition.id, competition.name, competition.myStatus, feedback).then((left) => left && feedback.stillShown() && afterLeave());
  });
  return block;
}

/** Competitions: the ones the fighter can join now (join cards), then their own. */
export async function renderCompetitionsScreen(container: HTMLElement, context: AppContext): Promise<void> {
  const [joinable, home, clubs] = await Promise.all([context.client.joinable(), context.client.home(), context.client.clubs()]);
  container.innerHTML = `<div><p class="eyebrow">${t("app.title")}</p><h1>${t("app.competitions")}</h1></div>
    <section class="block joinable"><h2>${t("app.openToJoin")}</h2></section>`;

  const section = container.querySelector<HTMLElement>(".joinable")!;
  const cards = toJoinableCards(joinable, home.competitions, clubs, t as Translate);
  if (cards.length === 0) {
    section.insertAdjacentHTML("beforeend", `<p class="muted">${t("app.nothingToJoin")}</p>`);
  }
  for (const card of cards) {
    section.append(
      joinCardBlock(
        card,
        context,
        () => context.navigate({ name: "competition", competitionId: card.id }),
        () => context.navigate({ name: "competitions" }, true),
      ),
    );
  }

  if (home.competitions.length > 0) {
    const mine = document.createElement("section");
    mine.className = "block";
    mine.innerHTML = `<h2>${t("app.myCompetitions")}</h2><my-competition-list></my-competition-list>`;
    const list = mine.querySelector("my-competition-list")!;
    list.items = toMyCompetitionItems(home);
    list.addEventListener("competition-selected", (event) => context.navigate({ name: "competition", competitionId: event.detail.competitionId }));
    container.append(mine);
  }
}

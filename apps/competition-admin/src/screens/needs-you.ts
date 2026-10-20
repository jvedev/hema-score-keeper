import { t } from "@hema/ui";
import type { AppContext } from "../app-context";
import { needsYouCount, toNeedsYouItems } from "../mappers/needs-you";
import type { Translate } from "../mappers/translate";

export async function renderNeedsYouScreen(container: HTMLElement, context: AppContext): Promise<void> {
  const needs = await context.client.needsYou();
  const count = needsYouCount(needs);
  if (count === 0) {
    // Nothing left to do: the screen doesn't exist without items.
    context.navigate({ name: "competitions" }, true);
    return;
  }
  container.innerHTML = `<div>
      <p class="eyebrow">${new Intl.DateTimeFormat(document.documentElement.lang || "en", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      <h1>${count === 1 ? t("admin.needsYouTitleOne") : t("admin.needsYouTitle", { count })}</h1>
    </div>
    <needs-you-list></needs-you-list>`;
  const list = container.querySelector("needs-you-list")!;
  list.items = toNeedsYouItems(needs, t as Translate);
  list.addEventListener("needs-you-selected", (event) => {
    const item = needs.objections.find((objection) => objection.boutId === event.detail.boutId) ?? needs.awaitingReferee.find((bout) => bout.boutId === event.detail.boutId);
    if (!item) {
      return;
    }
    if (event.detail.kind === "objection") {
      context.navigate({ name: "objection", boutId: item.boutId });
    } else {
      context.navigate({ name: "bout", competitionId: item.competitionId, boutId: item.boutId });
    }
  });
}

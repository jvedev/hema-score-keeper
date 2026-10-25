import { escapeHtml, formatAge, t } from "@hema/ui";
import { ApiError } from "../admin-client";
import type { AppContext } from "../app-context";
import { needsYouCount, toNeedsYouItems, toSignupItems } from "../mappers/needs-you";
import type { NeedsYouResponse } from "../api-types";
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
    <needs-you-list></needs-you-list>
    ${signupsSection(needs)}`;
  wireSignups(container, context);
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

function signupsSection(needs: NeedsYouResponse): string {
  const signups = toSignupItems(needs, t as Translate);
  if (signups.length === 0) {
    return "";
  }
  return `<section class="panel signups">
    <h2>${t("admin.signupsHeading")}</h2>
    ${signups
      .map(
        (signup) => `<div class="row signup" data-participant="${escapeHtml(signup.participantId)}" data-competition="${escapeHtml(signup.competitionId)}" data-name="${escapeHtml(signup.fighterName)}">
          <span class="grow"><strong>${escapeHtml(signup.fighterName)}</strong><br /><span class="muted">${escapeHtml(signup.detail)} · ${formatAge(signup.since)}</span></span>
          <button type="button" class="primary" data-accept="true">${t("admin.accept")}</button>
          <button type="button" data-accept="false">${t("admin.decline")}</button>
        </div>`,
      )
      .join("")}
    <p class="error" hidden></p>
  </section>`;
}

function wireSignups(container: HTMLElement, context: AppContext): void {
  const section = container.querySelector<HTMLElement>("section.signups");
  if (!section) {
    return;
  }
  const error = section.querySelector<HTMLElement>(".error")!;
  section.querySelectorAll<HTMLButtonElement>("button[data-accept]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest<HTMLElement>(".signup")!;
      const accept = button.dataset.accept === "true";
      error.hidden = true;
      section.querySelectorAll<HTMLButtonElement>("button").forEach((other) => (other.disabled = true));
      try {
        await context.client.decideSignup(row.dataset.competition!, row.dataset.participant!, accept);
        context.toast(accept ? t("admin.signupAccepted", { name: row.dataset.name! }) : t("admin.signupDeclined"));
        await context.refreshNeedsYou().catch(() => undefined);
        context.navigate({ name: "needs-you" }, true);
      } catch (caught) {
        section.querySelectorAll<HTMLButtonElement>("button").forEach((other) => (other.disabled = false));
        error.hidden = false;
        error.textContent = caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught);
      }
    });
  });
}

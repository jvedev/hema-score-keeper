import { formatDateTime, t } from "@hema/ui";
import type { AppContext } from "../app-context";
import { toCompetitionListItems } from "../mappers/competitions";
import type { Translate } from "../mappers/translate";

export async function renderCompetitionsScreen(container: HTMLElement, context: AppContext): Promise<void> {
  const [competitions, needs] = await Promise.all([context.client.competitions(), context.client.needsYou()]);
  container.innerHTML = `<div><p class="eyebrow">${t("admin.title")}</p><h1>${t("admin.competitions")}</h1></div>
    <competition-list></competition-list>
    <form class="panel new-competition" hidden>
      <h2>${t("admin.newCompetition")}</h2>
      <div class="grid-2">
        <label class="field">${t("admin.name")}<input name="name" required /></label>
        <label class="field">${t("admin.slug")}<input name="slug" required pattern="[a-z0-9-]+" /></label>
        <label class="field">${t("admin.date")}<input name="date" type="date" required /></label>
      </div>
      <p class="error" hidden></p>
      <div class="row"><button type="submit" class="primary">${t("admin.create")}</button><button type="button" class="cancel">${t("admin.cancel")}</button></div>
    </form>`;

  const list = container.querySelector("competition-list")!;
  list.items = toCompetitionListItems(competitions, needs, t as Translate, (iso) => formatDateTime(iso, "date"));
  list.addEventListener("competition-selected", (event) => context.navigate({ name: "competition", competitionId: event.detail.competitionId }));

  const form = container.querySelector<HTMLFormElement>("form.new-competition")!;
  const nameInput = form.querySelector<HTMLInputElement>("input[name=name]")!;
  const slugInput = form.querySelector<HTMLInputElement>("input[name=slug]")!;
  list.addEventListener("competition-create-requested", () => {
    form.hidden = false;
    nameInput.focus();
  });
  form.querySelector(".cancel")!.addEventListener("click", () => {
    form.hidden = true;
  });
  // Suggest a link-friendly short name from the name until the admin types their own.
  nameInput.addEventListener("input", () => {
    if (!slugInput.dataset.touched) {
      slugInput.value = nameInput.value.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
  });
  slugInput.addEventListener("input", () => {
    slugInput.dataset.touched = "true";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const error = form.querySelector<HTMLElement>(".error")!;
    try {
      const created = await context.client.createCompetition({
        name: String(data.get("name")),
        slug: String(data.get("slug")),
        date: String(data.get("date")),
      });
      context.navigate({ name: "settings", competitionId: created.id });
    } catch (caught) {
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : String(caught);
    }
  });
}

import { escapeHtml, setLocale, t } from "@hema/ui";
import type { Language } from "../api-types";
import type { AppContext } from "../app-context";
import { toProfile } from "../mappers/profile";
import { SessionExpiredError } from "../participant-client";

/** Profile: name and club shown (not edited in this phase), the language switch and sign out. */
export async function renderProfileScreen(container: HTMLElement, context: AppContext): Promise<void> {
  const [account, clubs] = await Promise.all([context.client.me(), context.client.clubs()]);
  const profile = toProfile(account, clubs);
  container.innerHTML = `<div><p class="eyebrow">${t("app.title")}</p><h1>${t("app.profile")}</h1></div>
    <section class="panel">
      <dl class="facts">
        <dt>${t("app.name")}</dt><dd>${escapeHtml(profile.name)}</dd>
        <dt>${t("app.username")}</dt><dd>${escapeHtml(profile.username)}</dd>
        <dt>${t("app.club")}</dt><dd>${profile.clubName ? escapeHtml(profile.clubName) : `<span class="muted">${t("app.noClub")}</span>`}</dd>
      </dl>
      <p class="muted">${t("app.profileNote")}</p>
    </section>
    <section class="panel">
      <label class="field"><span>${t("app.language")}</span>
        <select name="language"><option value="en">English</option><option value="nl">Nederlands</option></select>
      </label>
      <p class="error" role="alert" hidden></p>
    </section>
    <div class="row"><button type="button" class="sign-out">${t("app.signOut")}</button></div>`;

  const select = container.querySelector<HTMLSelectElement>("select[name=language]")!;
  const error = container.querySelector<HTMLElement>(".error")!;
  select.value = profile.language;
  select.addEventListener("change", async () => {
    const language: Language = select.value === "nl" ? "nl" : "en";
    select.disabled = true;
    error.hidden = true;
    try {
      await context.client.setLanguage(language);
    } catch (caught) {
      if (caught instanceof SessionExpiredError) {
        context.sessionExpired();
        return;
      }
      select.value = profile.language;
      select.disabled = false;
      error.textContent = caught instanceof Error ? caught.message : String(caught);
      error.hidden = false;
      return;
    }
    // The language is saved either way; only redraw Profile if the fighter is still on it.
    setLocale(language);
    context.relabel();
    context.toast(t("app.languageSaved"));
    if (container.isConnected) {
      context.navigate({ name: "profile" }, true);
    }
  });
  container.querySelector(".sign-out")!.addEventListener("click", () => context.signOut());
}

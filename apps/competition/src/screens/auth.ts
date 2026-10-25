import { currentLocale, escapeHtml, setLocale, t, type Locale } from "@hema/ui";
import type { Club } from "../api-types";
import type { ParticipantClient, Session } from "../participant-client";

type Mode = "sign-in" | "sign-up";

/**
 * Sign in, or create an account on the spot (name, username, password, club, language).
 * Calls `onSignedIn` with the new session; used on its own page and on the invite landing.
 */
export function renderAuthPanel(
  container: HTMLElement,
  client: ParticipantClient,
  onSignedIn: (session: Session) => void | Promise<void>,
  mode: Mode = "sign-in",
): void {
  container.innerHTML = `
    <form class="auth-form" data-mode="sign-in">
      <h2 data-text="app.signInTitle"></h2>
      <label class="field"><span data-text="app.username"></span><input name="username" autocomplete="username" required /></label>
      <label class="field"><span data-text="app.password"></span><input name="password" type="password" autocomplete="current-password" required /></label>
      <p class="error" role="alert" hidden></p>
      <button type="submit" class="primary" data-text="app.signIn"></button>
      <button type="button" class="link switch" data-text="app.noAccount"></button>
    </form>
    <form class="auth-form" data-mode="sign-up" hidden>
      <h2 data-text="app.signUpTitle"></h2>
      <label class="field"><span data-text="app.name"></span><input name="name" autocomplete="name" required /></label>
      <label class="field"><span data-text="app.username"></span><input name="username" autocomplete="username" required /></label>
      <label class="field"><span data-text="app.password"></span><input name="password" type="password" autocomplete="new-password" required /></label>
      <label class="field"><span data-text="app.club"></span>
        <select name="club" required><option value="" data-text="app.chooseClub"></option></select>
      </label>
      <label class="field"><span data-text="app.language"></span>
        <select name="language"><option value="en">English</option><option value="nl">Nederlands</option></select>
      </label>
      <p class="error" role="alert" hidden></p>
      <button type="submit" class="primary" data-text="app.signUp"></button>
      <button type="button" class="link switch" data-text="app.haveAccount"></button>
    </form>`;

  // Page-wide, so the texts around the panel (page title, invite card) follow the language too.
  const relabel = () =>
    document.querySelectorAll<HTMLElement>("[data-text]").forEach((element) => {
      element.textContent = t(element.dataset.text as Parameters<typeof t>[0]);
    });
  const signIn = container.querySelector<HTMLFormElement>('form[data-mode="sign-in"]')!;
  const signUp = container.querySelector<HTMLFormElement>('form[data-mode="sign-up"]')!;
  const languageSelect = signUp.querySelector<HTMLSelectElement>("select[name=language]")!;
  const clubSelect = signUp.querySelector<HTMLSelectElement>("select[name=club]")!;
  let clubsLoaded = false;

  const show = (next: Mode) => {
    signIn.hidden = next !== "sign-in";
    signUp.hidden = next !== "sign-up";
    (next === "sign-in" ? signIn : signUp).querySelector<HTMLInputElement>("input")!.focus();
    if (next === "sign-up" && !clubsLoaded) {
      clubsLoaded = true;
      void client
        .clubs()
        .then((clubs: Club[]) => {
          clubSelect.insertAdjacentHTML(
            "beforeend",
            clubs.map((club) => `<option value="${escapeHtml(club.slug)}">${escapeHtml(club.name)}</option>`).join(""),
          );
        })
        .catch((caught: unknown) => {
          clubsLoaded = false;
          showError(signUp, caught);
        });
    }
  };

  languageSelect.value = currentLocale();
  languageSelect.addEventListener("change", () => {
    setLocale(languageSelect.value as Locale);
    relabel();
  });
  container.querySelectorAll<HTMLButtonElement>("button.switch").forEach((button) =>
    button.addEventListener("click", () => show(button.closest("form") === signIn ? "sign-up" : "sign-in")),
  );

  signIn.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(signIn);
    void submit(signIn, () => client.login(String(data.get("username") ?? ""), String(data.get("password") ?? "")));
  });
  signUp.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(signUp);
    void submit(signUp, () =>
      client.signUp({
        name: String(data.get("name") ?? "").trim(),
        username: String(data.get("username") ?? "").trim(),
        password: String(data.get("password") ?? ""),
        clubSlug: String(data.get("club") ?? ""),
        language: data.get("language") === "nl" ? "nl" : "en",
      }),
    );
  });

  async function submit(form: HTMLFormElement, action: () => Promise<Session>): Promise<void> {
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    form.querySelector<HTMLElement>(".error")!.hidden = true;
    button.disabled = true;
    try {
      await onSignedIn(await action());
    } catch (caught) {
      showError(form, caught);
    } finally {
      button.disabled = false;
    }
  }

  relabel();
  show(mode);
}

function showError(form: HTMLFormElement, caught: unknown): void {
  const error = form.querySelector<HTMLElement>(".error")!;
  error.hidden = false;
  error.textContent = caught instanceof Error ? caught.message : t("app.signInFailed");
}

/** The page shown to someone who isn't signed in. */
export function renderSignInPage(root: HTMLElement, client: ParticipantClient, onSignedIn: (session: Session) => void): void {
  root.innerHTML = `<main class="login"><div class="login-card"><p class="eyebrow" data-text="app.title"></p><div class="auth"></div></div></main>`;
  renderAuthPanel(root.querySelector<HTMLElement>(".auth")!, client, onSignedIn);
}

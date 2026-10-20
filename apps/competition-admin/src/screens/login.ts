import { t } from "@hema/ui";
import type { AdminClient, Session } from "../admin-client";

/** The sign-in page; resolves `onSignedIn` with the session of an admin account. */
export function renderLogin(root: HTMLElement, client: AdminClient, onSignedIn: (session: Session) => void): void {
  root.innerHTML = `
    <main class="login">
      <form class="login-card">
        <p class="eyebrow">${t("admin.title")}</p>
        <h1>${t("admin.loginTitle")}</h1>
        <label>${t("admin.username")}<input name="username" autocomplete="username" required /></label>
        <label>${t("admin.password")}<input name="password" type="password" autocomplete="current-password" required /></label>
        <p class="error" role="alert" hidden></p>
        <button type="submit" class="primary">${t("admin.signIn")}</button>
      </form>
    </main>`;
  const form = root.querySelector<HTMLFormElement>("form")!;
  const error = root.querySelector<HTMLElement>(".error")!;
  form.querySelector<HTMLInputElement>("input[name=username]")!.focus();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const data = new FormData(form);
    try {
      const session = await client.login(String(data.get("username") ?? ""), String(data.get("password") ?? ""));
      if (session.user.role === "USER") {
        await client.logout();
        throw new Error(t("admin.notAdmin"));
      }
      onSignedIn(session);
    } catch (caught) {
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : t("admin.loginFailed");
    }
  });
}

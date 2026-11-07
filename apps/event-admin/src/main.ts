import "@hema/ui/event-planner-view";
import "@hema/ui/event-view";
import { createApiClient, type EventAdminSession } from "@hema/event-admin-api";
import "./auth.css";

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) {
  throw new Error("App root not found.");
}
const app: HTMLElement = appRoot;
const api = createApiClient();

function renderRoute(): void {
  const session = api.currentSession();
  if (!session) {
    renderLogin();
    return;
  }
  const path = stripAppBase(window.location.pathname).replace(/\/+$/, "") || "/";
  const tagName = path === "/planning" ? "event-planner-view" : "event-view";
  renderSessionBar(session);
  if (app.querySelector(tagName)) {
    return;
  }

  const view = document.createElement(tagName);
  const sessionBar = app.querySelector(".event-admin-session-bar");
  app.replaceChildren(...(sessionBar ? [sessionBar, view] : [view]));
}

function renderLogin(errorMessage?: string): void {
  const language = navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
  const copy = language === "nl"
    ? { title: "Inloggen op Event-admin", username: "Gebruikersnaam", password: "Wachtwoord", submit: "Inloggen", error: "Inloggen mislukt." }
    : { title: "Sign in to Event-admin", username: "Username", password: "Password", submit: "Sign in", error: "Sign-in failed." };
  const form = document.createElement("form");
  form.className = "event-admin-login";
  form.innerHTML = `
    <h1>${copy.title}</h1>
    <label>${copy.username}<input name="username" autocomplete="username" required /></label>
    <label>${copy.password}<input name="password" type="password" autocomplete="current-password" required /></label>
    <p class="event-admin-login-error" role="alert"></p>
    <button type="submit">${copy.submit}</button>
  `;
  const error = form.querySelector<HTMLElement>(".event-admin-login-error");
  if (error) error.textContent = errorMessage ?? "";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    void api.login(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
      .then(renderRoute)
      .catch((failure: unknown) => {
        if (error) error.textContent = failure instanceof Error ? failure.message : copy.error;
        if (button) button.disabled = false;
      });
  });
  app.replaceChildren(form);
}

function renderSessionBar(session: EventAdminSession): void {
  let bar = app.querySelector<HTMLElement>(".event-admin-session-bar");
  if (!bar) {
    bar = document.createElement("header");
    bar.className = "event-admin-session-bar";
    const account = document.createElement("span");
    account.className = "event-admin-session-user";
    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "event-admin-sign-out";
    signOut.addEventListener("click", () => {
      void api.logout().then(renderRoute);
    });
    bar.append(account, signOut);
    app.prepend(bar);
  }
  const account = bar.querySelector<HTMLElement>(".event-admin-session-user");
  const signOut = bar.querySelector<HTMLButtonElement>(".event-admin-sign-out");
  const dutch = session.user.language === "nl";
  if (account) account.textContent = `${session.user.name} (${session.user.role})`;
  if (signOut) signOut.textContent = dutch ? "Uitloggen" : "Sign out";
}

window.addEventListener("popstate", renderRoute);
window.addEventListener("event-admin-session-expired", () => renderLogin());
window.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[data-route]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
    return;
  }

  const destination = new URL(link.href);
  if (destination.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", `${withAppBase(destination.pathname)}${destination.search}${destination.hash}`);
  renderRoute();
});

renderRoute();

function stripAppBase(pathname: string): string {
  const base = normalizeBase(import.meta.env.BASE_URL);
  if (base === "/") return pathname;
  if (pathname === base.slice(0, -1)) return "/";
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
}

function withAppBase(pathname: string): string {
  const base = normalizeBase(import.meta.env.BASE_URL);
  if (base === "/") return pathname;
  if (pathname === base.slice(0, -1) || pathname.startsWith(base)) return pathname;
  return `${base}${pathname.replace(/^\/+/, "")}`;
}

function normalizeBase(base: string): string {
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

import "@hema/ui";
import { setLocale, t } from "@hema/ui";
import "./styles.css";
import { AdminClient, SessionExpiredError, type Session } from "./admin-client";
import type { AppContext } from "./app-context";
import { apiBaseUrl } from "./config";
import { needsYouCount, startRoute } from "./mappers/needs-you";
import { navigate as navigateTo, parseRoute, type Route } from "./router";
import { renderCompetitionScreen } from "./screens/competition";
import { renderCompetitionsScreen } from "./screens/competitions";
import { renderLogin } from "./screens/login";
import { renderNeedsYouScreen } from "./screens/needs-you";
import { renderObjectionScreen } from "./screens/objection";
import { renderSettingsScreen } from "./screens/settings";
import { createShell, type Shell } from "./shell";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("App root not found.");
}
const appRoot = root;
const client = new AdminClient(apiBaseUrl());

let shell: Shell | null = null;
let renderToken = 0;

const context: AppContext = {
  client,
  navigate: (route, replace) => navigateTo(route, replace),
  toast: (message) => shell?.toast(message),
  async refreshNeedsYou() {
    const count = needsYouCount(await client.needsYou());
    shell?.setNeedsYouCount(count);
    return count;
  },
  sessionExpired: () => showLogin(),
};

window.addEventListener("popstate", () => {
  void showRoute(parseRoute(window.location.pathname));
});

const existing = client.currentSession();
if (existing) {
  start(existing);
} else {
  showLogin();
}

function showLogin(): void {
  shell = null;
  renderLogin(appRoot, client, start);
}

function start(session: Session): void {
  setLocale(session.user.language);
  shell = createShell(appRoot, {
    navigate: (route) => context.navigate(route),
    signOut: () => {
      void client.logout().then(showLogin);
    },
    changeLanguage: (language) => {
      setLocale(language);
      shell?.relabel();
      shell?.setUser(session.user.name, language);
      void client.setLanguage(language).catch(() => undefined);
      void showRoute(parseRoute(window.location.pathname));
    },
  });
  shell.setUser(session.user.name, session.user.language);
  void showRoute(parseRoute(window.location.pathname));
}

/** Renders the screen for a route; a newer navigation cancels an older one still loading. */
async function showRoute(route: Route): Promise<void> {
  if (!shell) {
    return;
  }
  const token = ++renderToken;
  const content = shell.content;
  content.innerHTML = `<p class="loading">${t("admin.loading")}</p>`;
  try {
    if (route.name === "start") {
      const needs = await client.needsYou();
      shell.setNeedsYouCount(needsYouCount(needs));
      if (token === renderToken) {
        context.navigate(startRoute(needs), true);
      }
      return;
    }
    void context.refreshNeedsYou().catch(() => undefined);
    shell.setActive(route.name === "needs-you" || route.name === "objection" ? "needs-you" : "competitions");
    const screen = document.createElement("div");
    screen.className = "screen";
    switch (route.name) {
      case "needs-you":
        await renderNeedsYouScreen(screen, context);
        break;
      case "competitions":
        await renderCompetitionsScreen(screen, context);
        break;
      case "objection":
        await renderObjectionScreen(screen, context, route.boutId);
        break;
      case "competition":
      case "fighter":
      case "bout":
        await renderCompetitionScreen(screen, context, route);
        break;
      case "settings":
        await renderSettingsScreen(screen, context, route.competitionId);
        break;
    }
    if (token === renderToken) {
      content.replaceChildren(screen);
    }
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      showLogin();
      return;
    }
    if (token === renderToken) {
      content.innerHTML = "";
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = error instanceof Error ? error.message : String(error);
      content.append(message);
    }
  }
}

import "@hema/ui";
import { setLocale, t } from "@hema/ui";
import "./styles.css";
import type { AppContext } from "./app-context";
import { DEFAULT_HOME_BLOCKS } from "./mappers/home";
import type { InviteState } from "./mappers/join";
import { ParticipantClient, SessionExpiredError, type Session } from "./participant-client";
import { registerPwa } from "./pwa";
import { navigate as navigateTo, navItemFor, parseRoute, type Route } from "./router";
import { renderSignInPage } from "./screens/auth";
import { renderHomeScreen } from "./screens/home";
import { joinWithInvite, renderJoinLanding, renderJoinScreen } from "./screens/join";
import { renderCompetitionScreen } from "./screens/competition";
import { renderCompetitionsScreen } from "./screens/competitions";
import { renderProfileScreen } from "./screens/profile";
import { createShell, type Shell } from "./shell";
import { handleTodoAction } from "./todo-actions";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("App root not found.");
}
const appRoot = root;
const client = new ParticipantClient(import.meta.env.VITE_API_BASE_URL || "/api/v1");

let shell: Shell | null = null;
let renderToken = 0;

const context: AppContext = {
  client,
  navigate: (route, replace) => navigateTo(route, replace),
  toast: (message) => shell?.toast(message),
  homeBlocks: DEFAULT_HOME_BLOCKS,
  todoAction: (action, boutId, feedback) => handleTodoAction(action, boutId, context, feedback),
  relabel: () => shell?.relabel(),
  sessionExpired: () => showSignedOut(parseRoute(window.location.pathname)),
  signOut: () => {
    void client.logout().then(() => {
      navigateTo({ name: "home" }, true);
    });
  },
};

registerPwa();
window.addEventListener("popstate", () => {
  void showRoute(parseRoute(window.location.pathname));
});

const existing = client.currentSession();
if (existing) {
  startShell(existing);
} else {
  setLocale(navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en");
}
void showRoute(parseRoute(window.location.pathname));

/** Not signed in: the invite landing for /join/:code, the sign-in page for everything else. */
function showSignedOut(route: Route): void {
  shell = null;
  if (route.name === "join") {
    const code = route.code;
    void renderJoinLanding(appRoot, client, code, (session, state) => joinAfterSignIn(session, state, code));
    return;
  }
  renderSignInPage(appRoot, client, (session) => {
    startShell(session);
    void showRoute(parseRoute(window.location.pathname));
  });
}

/** Signed in (or just signed up) from an invite: join in one go and land on the competition. */
async function joinAfterSignIn(session: Session, state: InviteState, code: string): Promise<void> {
  startShell(session);
  shell!.content.innerHTML = `<p class="loading">${t("app.loading")}</p>`;
  if (!(await joinWithInvite(context, state, code)) && client.currentSession()) {
    // Refused (the reason is in the toast): show the signed-in invite page with its Join button.
    void showRoute(parseRoute(window.location.pathname));
  }
}

function startShell(session: Session): void {
  setLocale(session.user.language);
  shell = createShell(appRoot, { navigate: (next) => context.navigate(next) });
  shell.setUser(session.user.name);
}

/** Renders the screen for a route; a newer navigation cancels an older one still loading. */
async function showRoute(next: Route): Promise<void> {
  if (!client.currentSession()) {
    showSignedOut(next);
    return;
  }
  if (!shell) {
    startShell(client.currentSession()!);
  }
  const frame = shell!;
  const token = ++renderToken;
  frame.setActive(navItemFor(next));
  frame.content.innerHTML = `<p class="loading">${t("app.loading")}</p>`;
  const screen = document.createElement("div");
  screen.className = "screen";
  try {
    switch (next.name) {
      case "home":
        await renderHomeScreen(screen, context);
        break;
      case "join":
        await renderJoinScreen(screen, context, next.code);
        break;
      case "competitions":
        await renderCompetitionsScreen(screen, context);
        break;
      case "competition":
      case "standings":
      case "fighter":
      case "bout":
        await renderCompetitionScreen(screen, context, next);
        break;
      case "profile":
        await renderProfileScreen(screen, context);
        break;
    }
    if (token === renderToken) {
      frame.content.replaceChildren(screen);
    }
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      showSignedOut(next);
      return;
    }
    if (token === renderToken) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = error instanceof Error ? error.message : String(error);
      frame.content.replaceChildren(message);
    }
  }
}

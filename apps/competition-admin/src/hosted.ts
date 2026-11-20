import "@hema/ui";
import { t, type EventAdminRoute } from "@hema/ui";
import type { ApiSession } from "@hema/api-session";
import { AdminClient, SessionExpiredError } from "./admin-client";
import type { AdminCompetitionDetail, AdminUser } from "./api-types";
import type { AppContext } from "./app-context";
import { fromEventAdminRoute, toEventAdminRoute } from "./hosted-routes";
import { renderCompetitionScreen } from "./screens/competition";
import { renderObjectionScreen } from "./screens/objection";
import { renderSettingsScreen } from "./screens/settings";
import { scopedStyles } from "./hosted-styles";
import styles from "./styles.css?inline";

export { fromEventAdminRoute, toEventAdminRoute } from "./hosted-routes";
export type { AdminCompetitionDetail } from "./api-types";

/** The class of the element the hosted screens render into; the Competition-admin styles only apply inside it. */
export const HOSTED_CLASS = "competition-admin-hosted";

type CompetitionWorkspaceRoute = Extract<EventAdminRoute, { kind: "competition-workspace" }>;

export interface HostedCompetitionOptions {
  /** The host shell's session, so the screens share its sign-in and refresh token. */
  session: ApiSession<AdminUser>;
  navigate(route: EventAdminRoute, replace?: boolean): void;
  href(route: EventAdminRoute): string;
  /** Called when the shared session ran out while a screen was working. */
  sessionExpired(): void;
}

export interface HostedCompetitionResult {
  /** The Competition as loaded, for the host's breadcrumb; null when it could not be shown. */
  competition: AdminCompetitionDetail | null;
}

let stylesInstalled = false;

function installStyles(): void {
  if (stylesInstalled || typeof document === "undefined") {
    return;
  }
  const style = document.createElement("style");
  style.dataset.source = "competition-admin-hosted";
  // The standalone app pads screens in its own frame; hosted, the scope root takes that padding.
  style.textContent = `${scopedStyles(styles, `.${HOSTED_CLASS}`)}@scope (.${HOSTED_CLASS}) {\n:scope { display: block; padding: 24px clamp(16px, 4vw, 44px); }\n}\n`;
  document.head.append(style);
  stylesInstalled = true;
}

/**
 * Renders a rating Competition's workspace (participants, fighter, bout, settings, objection) inside another
 * admin shell. Refuses, with a message, a Competition that is not attached to the Event in the route.
 */
export async function renderHostedCompetition(
  container: HTMLElement,
  options: HostedCompetitionOptions,
  route: CompetitionWorkspaceRoute,
): Promise<HostedCompetitionResult> {
  installStyles();
  const { eventId, competitionId } = route;
  const client = new AdminClient(options.session);

  const host = document.createElement("div");
  host.className = HOSTED_CLASS;
  host.innerHTML = `<p class="muted">${t("admin.loading")}</p><div class="toast" role="status" hidden></div>`;
  container.replaceChildren(host);
  const toastElement = host.querySelector<HTMLElement>(".toast")!;
  let toastTimer: number | undefined;

  const context: AppContext = {
    client,
    navigate: (target, replace) => options.navigate(toEventAdminRoute(target, eventId, competitionId), replace),
    href: (target) => options.href(toEventAdminRoute(target, eventId, competitionId)),
    toast(message) {
      toastElement.textContent = message;
      toastElement.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastElement.hidden = true;
      }, 3000);
    },
    refreshNeedsYou: async () => 0,
    detachFromEvent: async () => {
      await client.setEvent(competitionId, null);
    },
    sessionExpired: () => options.sessionExpired(),
  };

  try {
    const competition = await client.competition(competitionId);
    if (competition.eventId !== eventId) {
      showError(host, toastElement, t("admin.notInEvent"));
      return { competition: null };
    }
    const screen = document.createElement("div");
    screen.className = "screen";
    const target = fromEventAdminRoute(route);
    switch (target.name) {
      case "settings":
        await renderSettingsScreen(screen, context, competitionId);
        break;
      case "objection":
        await renderObjectionScreen(screen, context, target.boutId);
        break;
      case "competition":
      case "fighter":
      case "bout":
        await renderCompetitionScreen(screen, context, target);
        break;
      default:
        break;
    }
    host.replaceChildren(screen, toastElement);
    return { competition };
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      options.sessionExpired();
      return { competition: null };
    }
    showError(host, toastElement, error instanceof Error ? error.message : String(error));
    return { competition: null };
  }
}

function showError(host: HTMLElement, toastElement: HTMLElement, text: string): void {
  const message = document.createElement("p");
  message.className = "error";
  message.textContent = text;
  host.replaceChildren(message, toastElement);
}

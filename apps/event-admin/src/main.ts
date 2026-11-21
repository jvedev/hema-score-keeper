import "@hema/ui/event-planner-view";
import "@hema/ui/event-view";
import "@hema/ui/events-index-view";
import "@hema/ui/event-overview-view";
import "@hema/ui/tournament-workspace-view";
import "@hema/ui/ruleset-view";
import {
  parseEventAdminRoute,
  formatEventAdminRoute,
  stripAppBase,
  withAppBase,
  setLocale,
  escapeHtml,
  type EventAdminRoute,
  type EventsIndexView,
  type EventOverviewView,
  type TournamentWorkspaceView,
} from "@hema/ui";
import { renderHostedCompetition, type AdminCompetitionDetail } from "@hema/competition-admin/hosted";
import {
  createApiClient,
  getEventAdminApiSession,
  type EventAdminSession,
  type ApiEvent,
  type ApiEventCompetition,
} from "@hema/event-admin-api";
import "./auth.css";

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) {
  throw new Error("App root not found.");
}
const app: HTMLElement = appRoot;
const api = createApiClient();
const baseUrl = import.meta.env.BASE_URL;

let currentEventsList: ApiEvent[] = [];
let activeEvent: ApiEvent | null = null;
let activeCompetition: AdminCompetitionDetail | null = null;
let competitionRenderToken = 0;

function navigateTo(route: EventAdminRoute, replace = false): void {
  const url = formatEventAdminRoute(route, baseUrl);
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
    window.scrollTo(0, 0);
  }
  renderRoute();
}

function renderRoute(): void {
  const session = api.currentSession();
  if (!session) {
    renderLogin();
    return;
  }

  if (session.user.language) {
    setLocale(session.user.language);
  }

  const route = parseEventAdminRoute(window.location.pathname, baseUrl);
  renderShell(session, route);

  const contentArea = app.querySelector<HTMLElement>(".event-admin-content");
  if (!contentArea) return;

  switch (route.kind) {
    case "events-index":
      renderEventsIndex(contentArea);
      break;
    case "event-overview":
      renderEventOverview(contentArea, route.eventId);
      break;
    case "tournament-workspace":
      renderTournamentWorkspace(contentArea, route.eventId, route.tournamentId);
      break;
    case "competition-workspace":
      renderCompetitionWorkspace(contentArea, route);
      break;
    case "event-planning":
      renderEventPlanning(contentArea, route.eventId);
      break;
    case "event-rulesets":
      renderEventRulesets(contentArea, route.eventId);
      break;
    case "not-found":
      renderNotFound(contentArea, route.path);
      break;
  }
}

function renderShell(session: EventAdminSession, route: EventAdminRoute): void {
  let shell = app.querySelector<HTMLElement>(".event-admin-shell");
  if (!shell) {
    app.innerHTML = `
      <div class="event-admin-shell">
        <header class="event-admin-session-bar">
          <div class="event-admin-nav-left">
            <a href="${withAppBase("/events", baseUrl)}" data-route class="event-admin-brand">HEMA Event-admin</a>
            <a href="${withAppBase("/events", baseUrl)}" data-route class="event-admin-nav-link events-link">${session.user.language === "nl" ? "Evenementen" : "Events"}</a>
            <div class="event-admin-event-switcher" style="display: none;">
              <select aria-label="Switch event"></select>
            </div>
          </div>
          <div class="event-admin-nav-right">
            <span class="event-admin-session-user"></span>
            <button type="button" class="event-admin-sign-out"></button>
          </div>
        </header>
        <div class="event-admin-breadcrumbs-bar" style="display: none;"></div>
        <main class="event-admin-content"></main>
      </div>
    `;
    shell = app.querySelector<HTMLElement>(".event-admin-shell")!;

    const signOut = shell.querySelector<HTMLButtonElement>(".event-admin-sign-out");
    signOut?.addEventListener("click", () => {
      void api.logout().then(renderRoute);
    });

    const switcherSelect = shell.querySelector<HTMLSelectElement>(".event-admin-event-switcher select");
    switcherSelect?.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.value) {
        navigateTo({ kind: "event-overview", eventId: target.value });
      }
    });
  }

  const account = shell.querySelector<HTMLElement>(".event-admin-session-user");
  const signOut = shell.querySelector<HTMLButtonElement>(".event-admin-sign-out");
  const eventsLink = shell.querySelector<HTMLAnchorElement>(".events-link");
  const isDutch = session.user.language === "nl";

  if (account) account.textContent = `${session.user.name} (${session.user.role})`;
  if (signOut) signOut.textContent = isDutch ? "Uitloggen" : "Sign out";
  if (eventsLink) {
    eventsLink.textContent = isDutch ? "Evenementen" : "Events";
    eventsLink.classList.toggle("active", route.kind === "events-index");
  }

  // Update Breadcrumbs & Event Switcher
  const breadcrumbsBar = shell.querySelector<HTMLElement>(".event-admin-breadcrumbs-bar");
  const switcher = shell.querySelector<HTMLElement>(".event-admin-event-switcher");
  const switcherSelect = switcher?.querySelector<HTMLSelectElement>("select");

  if (route.kind === "events-index" || route.kind === "not-found") {
    if (breadcrumbsBar) breadcrumbsBar.style.display = "none";
    if (switcher) switcher.style.display = "none";
  } else {
    if (breadcrumbsBar) {
      breadcrumbsBar.style.display = "flex";
      renderBreadcrumbs(breadcrumbsBar, route, isDutch);
    }
    if (switcher && switcherSelect && currentEventsList.length > 0) {
      switcher.style.display = "block";
      const targetEventId = "eventId" in route ? route.eventId : "";
      switcherSelect.innerHTML = currentEventsList
        .map(
          (evt) =>
            `<option value="${escapeHtml(evt.id)}" ${evt.id === targetEventId ? "selected" : ""}>${escapeHtml(evt.eventName)}</option>`,
        )
        .join("");
    }
  }
}

function renderBreadcrumbs(bar: HTMLElement, route: EventAdminRoute, isDutch: boolean): void {
  const eventsLabel = isDutch ? "Evenementen" : "Events";
  const eventsUrl = withAppBase("/events", baseUrl);

  if (route.kind === "event-overview") {
    const eventName = activeEvent?.id === route.eventId ? activeEvent.eventName : (isDutch ? "Evenement" : "Event");
    bar.innerHTML = `
      <a href="${eventsUrl}" data-route>${eventsLabel}</a>
      <span>/</span>
      <span>${escapeHtml(eventName)}</span>
    `;
  } else if (route.kind === "tournament-workspace") {
    const eventName = activeEvent?.id === route.eventId ? activeEvent.eventName : (isDutch ? "Evenement" : "Event");
    const eventUrl = withAppBase(`/events/${encodeURIComponent(route.eventId)}`, baseUrl);
    const tournament = activeEvent?.id === route.eventId ? activeEvent.tournaments.find((t) => t.id === route.tournamentId) : null;
    const tournamentName = tournament?.name ?? (isDutch ? "Toernooi" : "Tournament");
    bar.innerHTML = `
      <a href="${eventsUrl}" data-route>${eventsLabel}</a>
      <span>/</span>
      <a href="${eventUrl}" data-route>${escapeHtml(eventName)}</a>
      <span>/</span>
      <span>${escapeHtml(tournamentName)}</span>
    `;
  } else if (route.kind === "competition-workspace") {
    const eventName = activeEvent?.id === route.eventId ? activeEvent.eventName : (isDutch ? "Evenement" : "Event");
    const eventUrl = withAppBase(`/events/${encodeURIComponent(route.eventId)}`, baseUrl);
    const competitionName =
      activeCompetition?.id === route.competitionId ? activeCompetition.name : isDutch ? "Competitie" : "Competition";
    bar.innerHTML = `
      <a href="${eventsUrl}" data-route>${eventsLabel}</a>
      <span>/</span>
      <a href="${eventUrl}" data-route>${escapeHtml(eventName)}</a>
      <span>/</span>
      <span>${escapeHtml(competitionName)}</span>
    `;
  } else if (route.kind === "event-rulesets") {
    const eventName = activeEvent?.id === route.eventId ? activeEvent.eventName : (isDutch ? "Evenement" : "Event");
    const eventUrl = withAppBase(`/events/${encodeURIComponent(route.eventId)}`, baseUrl);
    bar.innerHTML = `
      <a href="${eventsUrl}" data-route>${eventsLabel}</a>
      <span>/</span>
      <a href="${eventUrl}" data-route>${escapeHtml(eventName)}</a>
      <span>/</span>
      <span>${isDutch ? "Regels" : "Rulesets"}</span>
    `;
  } else if (route.kind === "event-planning") {
    const eventName = activeEvent?.id === route.eventId ? activeEvent.eventName : (isDutch ? "Evenement" : "Event");
    const eventUrl = withAppBase(`/events/${encodeURIComponent(route.eventId)}`, baseUrl);
    bar.innerHTML = `
      <a href="${eventsUrl}" data-route>${eventsLabel}</a>
      <span>/</span>
      <a href="${eventUrl}" data-route>${escapeHtml(eventName)}</a>
      <span>/</span>
      <span>${isDutch ? "Planning" : "Planning"}</span>
    `;
  }
}

function renderEventsIndex(container: HTMLElement): void {
  let view = container.querySelector<EventsIndexView>("events-index-view");
  if (!view) {
    view = document.createElement("events-index-view") as EventsIndexView;
    view.setAttribute("base-url", baseUrl);
    container.replaceChildren(view);

    view.addEventListener("event-selected", (e: any) => {
      const eventId = e.detail.eventId;
      navigateTo({ kind: "event-overview", eventId });
    });

    view.addEventListener("event-create-requested", async (e: any) => {
      const targetView = container.querySelector<EventsIndexView>("events-index-view");
      if (targetView) targetView.loading = true;
      try {
        const created = await api.createEvent({ eventName: e.detail.eventName });
        navigateTo({ kind: "event-overview", eventId: created.id });
      } catch (err: any) {
        if (targetView) {
          targetView.loading = false;
          targetView.error = err instanceof Error ? err.message : "Failed to create event";
        }
      }
    });
  }

  const activeView = view;
  activeView.loading = true;
  api
    .listEvents()
    .then((events) => {
      currentEventsList = events;
      activeView.events = events;
      activeView.loading = false;
    })
    .catch((err) => {
      activeView.error = err instanceof Error ? err.message : "Failed to load events";
      activeView.loading = false;
    });
}

function renderEventOverview(container: HTMLElement, eventId: string): void {
  let view = container.querySelector<EventOverviewView>("event-overview-view");
  if (!view) {
    view = document.createElement("event-overview-view") as EventOverviewView;
    container.replaceChildren(view);

    view.addEventListener("tournament-selected", (e: any) => {
      navigateTo({
        kind: "tournament-workspace",
        eventId,
        tournamentId: e.detail.tournamentId,
      });
    });

    view.addEventListener("competition-selected", (e: any) => {
      navigateTo({
        kind: "competition-workspace",
        eventId,
        competitionId: e.detail.competitionId,
      });
    });

    view.addEventListener("planning-requested", () => {
      navigateTo({ kind: "event-planning", eventId });
    });

    view.addEventListener("rulesets-requested", () => {
      navigateTo({ kind: "event-rulesets", eventId });
    });

    view.addEventListener("tournament-create-requested", async (e: any) => {
      const targetView = container.querySelector<EventOverviewView>("event-overview-view");
      if (targetView) targetView.loading = true;
      try {
        await api.createTournament({ eventId, name: e.detail.name });
        renderEventOverview(container, eventId);
      } catch (err: any) {
        if (targetView) {
          targetView.loading = false;
          targetView.error = err instanceof Error ? err.message : "Failed to create tournament";
        }
      }
    });

    view.addEventListener("competition-create-requested", async (e: any) => {
      const targetView = container.querySelector<EventOverviewView>("event-overview-view");
      if (targetView) targetView.loading = true;
      try {
        await api.createEventCompetition(eventId, {
          name: e.detail.name,
          slug: e.detail.slug,
          date: e.detail.date,
        });
        renderEventOverview(container, eventId);
      } catch (err: any) {
        if (targetView) {
          targetView.loading = false;
          targetView.error = err instanceof Error ? err.message : "Failed to create competition";
        }
      }
    });

    view.addEventListener("competition-attach-requested", async (e: any) => {
      const targetView = container.querySelector<EventOverviewView>("event-overview-view");
      if (targetView) targetView.loading = true;
      try {
        await api.setCompetitionEvent(e.detail.competitionId, eventId);
        renderEventOverview(container, eventId);
      } catch (err: any) {
        if (targetView) {
          targetView.loading = false;
          targetView.error = err instanceof Error ? err.message : "Failed to attach competition";
        }
      }
    });
  }

  const activeView = view;
  activeView.loading = true;
  Promise.all([
    api.getEvent(eventId),
    api.listEventCompetitions(eventId).catch(() => []),
    // Only Competition- and system-admin accounts may list managed Competitions; others have none to attach.
    api.listManagedCompetitions().catch(() => []),
  ])
    .then(([event, competitions, managed]) => {
      activeEvent = event;
      activeView.event = event;
      activeView.competitions = competitions;
      activeView.attachableCompetitions = managed.filter((competition) => competition.eventId === null);
      activeView.loading = false;
      const session = api.currentSession();
      if (session) {
        renderShell(session, { kind: "event-overview", eventId });
      }
    })
    .catch((err) => {
      activeView.error = err instanceof Error ? err.message : "Failed to load event";
      activeView.loading = false;
    });
}

function renderCompetitionWorkspace(
  container: HTMLElement,
  route: Extract<EventAdminRoute, { kind: "competition-workspace" }>,
): void {
  const token = ++competitionRenderToken;
  const refreshShell = () => {
    const session = api.currentSession();
    if (session && token === competitionRenderToken) {
      renderShell(session, route);
    }
  };
  if (activeEvent?.id !== route.eventId) {
    void api
      .getEvent(route.eventId)
      .then((event) => {
        activeEvent = event;
        refreshShell();
      })
      .catch(() => undefined);
  }
  void renderHostedCompetition(
    container,
    {
      session: getEventAdminApiSession(),
      navigate: (target, replace) => navigateTo(target, replace),
      href: (target) => formatEventAdminRoute(target, baseUrl),
      sessionExpired: () => renderLogin(),
    },
    route,
  ).then(({ competition }) => {
    if (token !== competitionRenderToken) return;
    activeCompetition = competition;
    refreshShell();
  });
}

function renderTournamentWorkspace(
  container: HTMLElement,
  eventId: string,
  tournamentId: string,
): void {
  let view = container.querySelector<TournamentWorkspaceView>("tournament-workspace-view");
  if (!view) {
    view = document.createElement("tournament-workspace-view") as TournamentWorkspaceView;

    view.addEventListener("planning-requested", () => navigateTo({ kind: "event-planning", eventId }));

    // The workspace saves through the API itself; it reports a refreshed event so the breadcrumb follows renames.
    view.addEventListener("event-refreshed", (e: any) => {
      activeEvent = e.detail.event;
      const session = api.currentSession();
      if (session) renderShell(session, { kind: "tournament-workspace", eventId, tournamentId });
    });

    container.replaceChildren(view);
  }

  const activeView = view;
  activeView.loading = true;
  api
    .getEvent(eventId)
    .then((event) => {
      activeEvent = event;
      activeView.event = event;
      activeView.tournamentId = tournamentId;
      activeView.loading = false;
      const session = api.currentSession();
      if (session) {
        renderShell(session, { kind: "tournament-workspace", eventId, tournamentId });
      }
    })
    .catch((err) => {
      activeView.error = err instanceof Error ? err.message : "Failed to load tournament";
      activeView.loading = false;
    });
}

function renderEventRulesets(container: HTMLElement, eventId: string): void {
  const view = document.createElement("ruleset-view");
  view.setAttribute("event-id", eventId);
  container.replaceChildren(view);
  // The breadcrumb shows the Event's name, which a direct link has not loaded yet.
  if (activeEvent?.id !== eventId) {
    void api
      .getEvent(eventId)
      .then((event) => {
        activeEvent = event;
        const session = api.currentSession();
        if (session) renderShell(session, { kind: "event-rulesets", eventId });
      })
      .catch(() => undefined);
  }
}

function renderEventPlanning(container: HTMLElement, eventId: string): void {
  let view = container.querySelector<HTMLElement>("event-planner-view");
  if (!view) {
    view = document.createElement("event-planner-view");
    if (eventId) {
      view.setAttribute("event-id", eventId);
    }
    container.replaceChildren(view);
  } else if (eventId) {
    view.setAttribute("event-id", eventId);
  }
  // The breadcrumb shows the Event's name, which a direct link to the planner has not loaded yet.
  if (eventId && activeEvent?.id !== eventId) {
    void api
      .getEvent(eventId)
      .then((event) => {
        activeEvent = event;
        const session = api.currentSession();
        if (session) renderShell(session, { kind: "event-planning", eventId });
      })
      .catch(() => undefined);
  }
}

function renderNotFound(container: HTMLElement, path: string): void {
  const isDutch = api.currentSession()?.user.language === "nl";
  container.innerHTML = `
    <div class="event-admin-not-found">
      <h2>${isDutch ? "Pagina niet gevonden" : "Page not found"}</h2>
      <p>${path}</p>
      <p>
        <a href="${withAppBase("/events", baseUrl)}" data-route class="event-admin-not-found-link">
          ${isDutch ? "Naar evenementen" : "Go to events"}
        </a>
      </p>
    </div>
  `;
}

function renderLogin(errorMessage?: string): void {
  const language = navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
  const copy =
    language === "nl"
      ? {
          title: "Inloggen op Event-admin",
          username: "Gebruikersnaam",
          password: "Wachtwoord",
          submit: "Inloggen",
          error: "Inloggen mislukt.",
        }
      : {
          title: "Sign in to Event-admin",
          username: "Username",
          password: "Password",
          submit: "Sign in",
          error: "Sign-in failed.",
        };
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
    void api
      .login(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
      .then(renderRoute)
      .catch((failure: unknown) => {
        if (error) error.textContent = failure instanceof Error ? failure.message : copy.error;
        if (button) button.disabled = false;
      });
  });
  app.replaceChildren(form);
}

window.addEventListener("popstate", renderRoute);
window.addEventListener("event-admin-session-expired", () => renderLogin());
window.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[data-route]");
  if (
    !link ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey
  ) {
    return;
  }

  const destination = new URL(link.href);
  if (destination.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  window.history.pushState(
    {},
    "",
    `${withAppBase(destination.pathname, baseUrl)}${destination.search}${destination.hash}`,
  );
  renderRoute();
});

renderRoute();

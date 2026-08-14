import "@hema/ui";
import {
  createApiClient,
  type ApiArena,
  type ApiEntry,
  type ApiEvent,
  type ApiEventMutationResult,
  type ApiSkill,
  type ApiStage,
  type ApiTournament,
  type EntryKind,
  type StageOfficialRole,
} from "./api";
import "./styles.css";

type EventTab = "tournaments" | "arenas" | "officials";
type TournamentTab = "entries" | "officials" | "stages";
type StageTab = "overview" | "arenas" | "officials" | "rounds" | "matches";
type EditorKind = "event" | "tournament" | "arena" | "entry" | "stage" | "stage-arena" | "stage-official";

interface EditorState {
  kind: EditorKind;
  id?: string;
  entryKind?: EntryKind;
}

interface AppState {
  loading: boolean;
  error: string | null;
  events: ApiEvent[];
  selectedEventId: string | null;
  selectedTournamentId: string | null;
  selectedStageId: string | null;
  editor: EditorState | undefined;
  eventTab: EventTab;
  tournamentTab: TournamentTab;
  stageTab: StageTab;
}

const api = createApiClient();
const app = requireElement<HTMLElement>("#app");

const state: AppState = {
  loading: true,
  error: null,
  events: [],
  selectedEventId: null,
  selectedTournamentId: null,
  selectedStageId: null,
  editor: undefined,
  eventTab: "tournaments",
  tournamentTab: "stages",
  stageTab: "overview",
};

app.addEventListener("click", onAppClick);
app.addEventListener("submit", onAppSubmit);
void bootstrap();

async function bootstrap(): Promise<void> {
  state.loading = true;
  render();
  try {
    state.events = await api.listEvents();
    if (state.events.length === 0) {
      state.editor = { kind: "event" };
      state.selectedEventId = null;
    }
    state.error = null;
  } catch (error) {
    state.error = toErrorMessage(error);
  } finally {
    state.loading = false;
    render();
  }
}

function onAppClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
  if (!target) {
    return;
  }

  switch (target.dataset.action) {
    case "refresh":
      state.loading = true;
      state.error = null;
      void bootstrap();
      return;
    case "select-event":
      selectEvent(target.dataset.id);
      return;
    case "new-event":
      openEditor({ kind: "event" });
      return;
    case "open-editor":
      openEditor({
        kind: target.dataset.editor as EditorKind,
        ...(target.dataset.id ? { id: target.dataset.id } : {}),
        ...(target.dataset.entryKind ? { entryKind: target.dataset.entryKind as EntryKind } : {}),
      });
      return;
    case "close-editor":
      closeEditor();
      return;
    case "delete-entry":
      void deleteEntry(target.dataset.id);
      return;
    case "delete-event":
      void deleteEvent(target.dataset.id);
      return;
    case "delete-tournament":
    case "delete-arena":
    case "delete-stage":
      void deleteResource(target.dataset.action, target.dataset.id);
      return;
    case "select-tournament":
      selectTournament(target.dataset.id);
      return;
    case "select-stage":
      selectStage(target.dataset.id);
      return;
    case "set-event-tab":
      setEventTab(target.dataset.tab as EventTab);
      return;
    case "set-tournament-tab":
      setTournamentTab(target.dataset.tab as TournamentTab);
      return;
    case "set-stage-tab":
      setStageTab(target.dataset.tab as StageTab);
      return;
    default:
      return;
  }
}

function onAppSubmit(event: SubmitEvent): void {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form || form.dataset.action !== "editor") {
    return;
  }

  event.preventDefault();
  void submitEditor(form);
}

function render(): void {
  if (state.loading) {
    app.innerHTML = renderLoading();
    return;
  }

  if (state.error) {
    app.innerHTML = renderError(state.error);
    return;
  }

  app.innerHTML = renderShell();
}

function renderLoading(): string {
  return `
    <main class="app-shell">
      <section class="empty-state">
        <div class="badge badge-muted">Laden</div>
        <h1>Event admin wordt geladen</h1>
        <p class="loading-note">We halen de events op uit de bestaande backend.</p>
      </section>
    </main>
  `;
}

function renderTournamentCreateForm(event: ApiEvent, tournament: ApiTournament | undefined): string {
  const name = tournament?.name ?? "";
  const ruleset = tournament?.ruleset ?? event.ruleset ?? "";
  const order = tournament ? String(tournament.order) : String(event.tournaments.length);

  return `
    <section class="editor-card">
      <header class="editor-card-header">
        <div>
          <div class="eyebrow">Toernooi toevoegen</div>
          <p class="editor-note">Nieuw toernooi aan dit event koppelen.</p>
        </div>
      </header>
      <form class="editor-form" data-action="tournament-create">
        <input type="hidden" name="eventId" value="${escapeHtml(event.id)}" />
        <label class="field">
          <span>Naam</span>
          <input class="text-input" name="name" type="text" value="${escapeHtml(name)}" placeholder="Bijv. Heren staal" required />
        </label>
        <label class="field">
          <span>Ruleset</span>
          <input class="text-input" name="ruleset" type="text" value="${escapeHtml(ruleset)}" placeholder="Optioneel" />
        </label>
        <label class="field">
          <span>Volgorde</span>
          <input class="text-input" name="order" type="number" min="0" step="1" value="${escapeHtml(order)}" />
        </label>
        <div class="field-actions">
          <button type="submit" class="button">Toernooi aanmaken</button>
        </div>
      </form>
    </section>
  `;
}

function renderArenaCreateForm(event: ApiEvent): string {
  const order = String(event.arenas.length);
  return `
    <section class="editor-card">
      <header class="editor-card-header">
        <div>
          <div class="eyebrow">Arena toevoegen</div>
          <p class="editor-note">Nieuwe arena aan dit event koppelen.</p>
        </div>
      </header>
      <form class="editor-form" data-action="arena-create">
        <input type="hidden" name="eventId" value="${escapeHtml(event.id)}" />
        <label class="field">
          <span>Naam</span>
          <input class="text-input" name="name" type="text" placeholder="Bijv. Arena 1" required />
        </label>
        <label class="field">
          <span>Volgorde</span>
          <input class="text-input" name="order" type="number" min="0" step="1" value="${escapeHtml(order)}" />
        </label>
        <div class="field-actions">
          <button type="submit" class="button">Arena toevoegen</button>
        </div>
      </form>
    </section>
  `;
}

function renderEntryCreateForm(
  event: ApiEvent,
  kind: EntryKind,
  tournamentId?: string,
): string {
  const tournaments = event.tournaments;
  if (tournaments.length === 0) {
    return renderEmptyCard("Maak eerst een toernooi aan.");
  }

  const defaultTournamentId = tournamentId ?? currentTournament(event)?.id ?? tournaments[0]?.id ?? "";
  const title = kind === "VOLUNTEER" ? "Vrijwilliger toevoegen" : "Inschrijving toevoegen";
  const description =
    kind === "VOLUNTEER"
      ? "Maak een vrijwilliger aan voor een toernooi."
      : "Maak een fighter-inschrijving aan voor een toernooi.";
  const buttonLabel = kind === "VOLUNTEER" ? "Vrijwilliger toevoegen" : "Inschrijving toevoegen";

  return `
    <section class="editor-card">
      <header class="editor-card-header">
        <div>
          <div class="eyebrow">${escapeHtml(title)}</div>
          <p class="editor-note">${escapeHtml(description)}</p>
        </div>
      </header>
      <form class="editor-form" data-action="entry-create">
        <input type="hidden" name="kind" value="${escapeHtml(kind)}" />
        <label class="field">
          <span>Naam</span>
          <input class="text-input" name="username" type="text" placeholder="Bijv. Jan Jansen" required />
        </label>
        <label class="field">
          <span>Toernooi</span>
          <select class="text-input" name="tournamentId">
            ${tournaments
              .map(
                (tournament) => `
                  <option value="${escapeHtml(tournament.id)}" ${tournament.id === defaultTournamentId ? "selected" : ""}>
                    ${escapeHtml(tournament.name)}
                  </option>
                `,
              )
              .join("")}
          </select>
        </label>
        ${kind === "FIGHTER"
          ? `
            <label class="field">
              <span>Seed</span>
              <input class="text-input" name="seed" type="number" min="0" step="1" placeholder="Optioneel" />
            </label>
          `
          : ""}
        <div class="field-actions">
          <button type="submit" class="button">${escapeHtml(buttonLabel)}</button>
        </div>
      </form>
    </section>
  `;
}

function renderStageCreateForm(tournament: ApiTournament, stage?: ApiStage): string {
  const name = stage?.name ?? "";
  const ruleset = stage?.ruleset ?? tournament.ruleset ?? "";
  const type = stage?.type ?? "POOL";
  const title = stage ? "Stage bijwerken" : "Stage toevoegen";
  const buttonLabel = stage ? "Stage bijwerken" : "Stage toevoegen";

  return `
    <section class="editor-card">
      <header class="editor-card-header">
        <div>
          <div class="eyebrow">${escapeHtml(title)}</div>
          <p class="editor-note">${stage ? "Werk deze stage bij." : "Nieuwe stage aan dit toernooi koppelen."}</p>
        </div>
      </header>
      <form class="editor-form" data-action="stage-create">
        <input type="hidden" name="tournamentId" value="${escapeHtml(tournament.id)}" />
        <label class="field">
          <span>Type</span>
          <select class="text-input" name="type">
            <option value="POOL" ${type === "POOL" ? "selected" : ""}>POOL</option>
            <option value="ELIMINATION" ${type === "ELIMINATION" ? "selected" : ""}>ELIMINATION</option>
            <option value="SEMI_FINAL" ${type === "SEMI_FINAL" ? "selected" : ""}>SEMI_FINAL</option>
            <option value="FINAL" ${type === "FINAL" ? "selected" : ""}>FINAL</option>
          </select>
        </label>
        <label class="field">
          <span>Naam</span>
          <input class="text-input" name="name" type="text" value="${escapeHtml(name)}" placeholder="Optioneel" />
        </label>
        <label class="field">
          <span>Ruleset</span>
          <input class="text-input" name="ruleset" type="text" value="${escapeHtml(ruleset)}" placeholder="Optioneel" />
        </label>
        <div class="field-actions">
          <button type="submit" class="button">${escapeHtml(buttonLabel)}</button>
        </div>
      </form>
    </section>
  `;
}

function renderStageArenaCreateForm(event: ApiEvent, stage: ApiStage): string {
  if (event.arenas.length === 0) {
    return renderEmptyCard("Maak eerst een arena aan.");
  }

  const assignedArenaIds = new Set(stage.arenas.map((assignment) => assignment.arenaId));
  const availableArenas = event.arenas.filter((arena) => !assignedArenaIds.has(arena.id));

  return `
    <section class="editor-card">
      <header class="editor-card-header">
        <div>
          <div class="eyebrow">Arena koppelen</div>
          <p class="editor-note">Koppel een arena aan deze stage.</p>
        </div>
      </header>
      <form class="editor-form" data-action="stage-arena-create">
        <input type="hidden" name="stageId" value="${escapeHtml(stage.id)}" />
        <label class="field">
          <span>Arena</span>
          <select class="text-input" name="arenaId">
            ${availableArenas.length > 0
              ? availableArenas
                  .map(
                    (arena) => `
                      <option value="${escapeHtml(arena.id)}">${escapeHtml(arena.name)}</option>
                    `,
                  )
                  .join("")
              : `<option value="">Geen vrije arenas</option>`}
          </select>
        </label>
        <div class="field-actions">
          <button type="submit" class="button" ${availableArenas.length === 0 ? "disabled" : ""}>Arena koppelen</button>
        </div>
      </form>
    </section>
  `;
}

function renderStageOfficialCreateForm(tournament: ApiTournament, stage: ApiStage): string {
  const officials = tournament.entries.filter((entry) => entry.kind !== "FIGHTER");
  if (officials.length === 0) {
    return renderEmptyCard("Maak eerst een vrijwilliger aan in deze categorie.");
  }

  const assignedEntryIds = new Set(stage.officials.map((official) => official.entryId));
  const availableOfficials = officials.filter((entry) => !assignedEntryIds.has(entry.id));

  return `
    <section class="editor-card">
      <header class="editor-card-header">
        <div>
          <div class="eyebrow">Vrijwilliger koppelen</div>
          <p class="editor-note">Koppel een vrijwilliger aan deze stage.</p>
        </div>
      </header>
      <form class="editor-form" data-action="stage-official-create">
        <input type="hidden" name="stageId" value="${escapeHtml(stage.id)}" />
        <label class="field">
          <span>Vrijwilliger</span>
          <select class="text-input" name="entryId">
            ${availableOfficials.length > 0
              ? availableOfficials
                  .map(
                    (entry) => `
                      <option value="${escapeHtml(entry.id)}">${escapeHtml(entry.user.username)}</option>
                    `,
                  )
                  .join("")
              : `<option value="">Geen vrije vrijwilligers</option>`}
          </select>
        </label>
        <label class="field">
          <span>Rol</span>
          <select class="text-input" name="role">
            <option value="JUDGE">Scheids</option>
            <option value="JURY">Jury</option>
            <option value="TELLER">Teller</option>
            <option value="TABLE">Tafel</option>
          </select>
        </label>
        <div class="field-actions">
          <button type="submit" class="button" ${availableOfficials.length === 0 ? "disabled" : ""}>Vrijwilliger koppelen</button>
        </div>
      </form>
    </section>
  `;
}

function renderError(message: string): string {
  return `
    <main class="app-shell">
      <section class="empty-state error-state">
        <div class="badge badge-danger">Fout</div>
        <h1>Kan de backend niet lezen</h1>
        <p>${escapeHtml(message)}</p>
        <button type="button" class="button" data-action="refresh">Opnieuw proberen</button>
      </section>
    </main>
  `;
}

function renderShell(): string {
  const event = currentEvent();
  const tournament = event ? currentTournament(event) : undefined;
  const stage = currentStage(tournament);
  const eventSummary = event ? summarizeEvent(event) : null;
  const tournamentSummary = event && tournament ? summarizeTournament(event, tournament) : null;
  return `
    <main class="app-shell">
      <header class="topbar">
        <div class="topbar-copy">
          <div class="eyebrow">HEMA Event Admin</div>
          <h1>${escapeHtml(event ? event.eventName : "Nog geen events")}</h1>
          <p class="topbar-breadcrumb">
            ${event ? escapeHtml(event.eventName) : "Maak het eerste event aan"}
            ${event && tournament ? ` / ${escapeHtml(tournament.name)}` : ""}
            ${event && stage ? ` / ${escapeHtml(stageLabel(stage))}` : ""}
          </p>
        </div>
        <div class="topbar-actions">
          <div class="badge">${escapeHtml(eventSummary ? eventSummary.ruleset : "Geen ruleset")}</div>
          <div class="badge badge-muted">${eventSummary ? `${eventSummary.tournaments} toernooien` : "0 toernooien"}</div>
          <div class="badge badge-muted">${eventSummary ? `${eventSummary.arenas} arenas` : "0 arenas"}</div>
          <button type="button" class="button secondary" data-action="refresh">Verversen</button>
        </div>
      </header>

      <section class="workspace">
        <article class="panel">
          <header class="panel-header">
            <div>
              <div class="eyebrow">Events</div>
              <h2>Overzicht</h2>
            </div>
            <div class="panel-actions">
              <div class="panel-meta">${state.events.length} events</div>
              <button type="button" class="button icon-button" data-action="new-event" title="New event" aria-label="New event">+</button>
            </div>
          </header>
          <div class="panel-body">
            ${renderEventList(event)}
          </div>
        </article>

        <article class="panel">
          <header class="panel-header">
            <div>
              <div class="eyebrow">Event</div>
              <h2>${escapeHtml(event ? event.eventName : "Geen events")}</h2>
              <p class="panel-meta">${event ? "Beheer de onderdelen van dit event." : "Maak een event aan in het overzicht."}</p>
            </div>
            ${event ? `<div class="panel-actions">${renderEventCreateAction()}</div>` : ""}
          </header>
          ${renderTabBar(
            "event",
            state.eventTab,
            [
              { value: "tournaments", label: "Toernooien" },
              { value: "arenas", label: "Arenas" },
              { value: "officials", label: "Vrijwilligers" },
            ],
          )}
          <div class="panel-body">
            ${event ? renderEventTab(event) : renderEmptyCard("Maak eerst een event aan.")}
          </div>
        </article>

        <article class="panel">
          <header class="panel-header">
            <div>
              <div class="eyebrow">Toernooi</div>
              <h2>${tournament ? escapeHtml(tournament.name) : "Geen toernooi geselecteerd"}</h2>
            </div>
            <div class="panel-actions">
              <div class="panel-meta">${tournamentSummary ? `${tournamentSummary.entries} inschrijvingen` : "Geen data"}</div>
              ${event && tournament ? renderTournamentCreateAction() : ""}
            </div>
          </header>
          ${renderTabBar(
            "tournament",
            state.tournamentTab,
            [
              { value: "entries", label: "Deelnemers" },
              { value: "officials", label: "Vrijwilligers" },
              { value: "stages", label: "Stages" },
            ],
          )}
          <div class="panel-body">
            ${event && tournament ? renderTournamentTab(event, tournament) : renderEmptyCard("Selecteer een toernooi.")}
          </div>
        </article>

      </section>
      ${renderEditor()}
    </main>
  `;
}

function renderEventList(selectedEvent: ApiEvent | undefined): string {
  if (state.events.length === 0) {
    return renderEmptyCard("Nog geen events aangemaakt.");
  }

  const activeEventId = selectedEvent?.id ?? state.events[0]?.id;

  return `
    <div class="list">
      ${state.events
        .map((event) => {
          const summary = summarizeEvent(event);
          return `
            <div
                class="info-card list-item ${event.id === activeEventId ? "is-active" : ""}"
                data-action="select-event"
                data-id="${escapeHtml(event.id)}"
              >
                <span class="list-title">${escapeHtml(event.eventName)}</span>
                <span class="list-meta">${escapeHtml(summary.ruleset)}</span>
                <span class="list-stats">${summary.tournaments} toernooien · ${summary.arenas} arenas</span>
              ${renderEventActions(event)}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEventActions(event: ApiEvent): string {
  const name = escapeHtml(event.eventName);
  return `
    <div class="card-actions">
      <button type="button" class="button secondary icon-button" data-action="open-editor" data-editor="event" data-id="${escapeHtml(event.id)}" title="Bewerk ${name}" aria-label="Bewerk ${name}">&#9998;</button>
      <button type="button" class="button secondary icon-button danger-button" data-action="delete-event" data-id="${escapeHtml(event.id)}" title="Verwijder ${name}" aria-label="Verwijder ${name}">&#128465;</button>
    </div>
  `;
}

function renderEditor(): string {
  const editor = state.editor;
  if (!editor) {
    return "";
  }

  const event = currentEvent();
  const tournament = event ? currentTournament(event) : undefined;
  const stage = currentStage(tournament);
  const isEdit = Boolean(editor.id);
  const title = editor.kind === "entry"
    ? `${isEdit ? "Edit" : "New"} ${editorLabel(editor.kind, editor.entryKind)}`
    : `${isEdit ? "Bewerk" : "Nieuw"} ${editorLabel(editor.kind, editor.entryKind)}`;
  const body = renderEditorFields(editor, event, tournament, stage);

  return `
    <section class="modal-backdrop" role="presentation">
      <form class="modal-card" data-action="editor" aria-modal="true" aria-labelledby="editor-title">
        <header class="modal-header">
          <div>
            <div class="eyebrow">Event admin</div>
            <h2 id="editor-title">${escapeHtml(title)}</h2>
          </div>
          <button type="button" class="button secondary" data-action="close-editor">Sluiten</button>
        </header>
        <input type="hidden" name="editorKind" value="${escapeHtml(editor.kind)}" />
        ${editor.id ? `<input type="hidden" name="id" value="${escapeHtml(editor.id)}" />` : ""}
        ${editor.entryKind ? `<input type="hidden" name="entryKind" value="${escapeHtml(editor.entryKind)}" />` : ""}
        <div class="editor-form">${body}</div>
        <div class="modal-actions">
          <button type="submit" class="button">${editor.kind === "entry" ? (isEdit ? "Save changes" : `Create ${editorLabel(editor.kind, editor.entryKind)}`) : (isEdit ? "Wijzigingen opslaan" : `${editorLabel(editor.kind, editor.entryKind)} aanmaken`)}</button>
          <button type="button" class="button secondary" data-action="close-editor">Sluiten</button>
        </div>
      </form>
    </section>
  `;
}

function renderEditorFields(
  editor: EditorState,
  event: ApiEvent | undefined,
  tournament: ApiTournament | undefined,
  stage: ApiStage | undefined,
): string {
  const selectedTournamentId = tournament?.id ?? event?.tournaments[0]?.id ?? "";
  switch (editor.kind) {
    case "event": {
      const item = state.events.find((candidate) => candidate.id === editor.id);
      return renderTextFields([
        ["eventName", "Event naam", item?.eventName ?? "", "Bijv. HEMA Open 2026", true],
        ["ruleset", "Ruleset", item?.ruleset ?? "", "Optioneel", false],
      ]) + `
        <label class="checkbox-field">
          <input name="allFightersAreVolunteers" type="checkbox" ${item?.allFightersAreVolunteers ? "checked" : ""} />
          <span>All fighters are volunteers</span>
        </label>
      `;
    }
    case "tournament": {
      const item = event?.tournaments.find((candidate) => candidate.id === editor.id);
      return renderTextFields([
        ["name", "Naam", item?.name ?? "", "Bijv. Heren staal", true],
        ["ruleset", "Ruleset", item?.ruleset ?? event?.ruleset ?? "", "Optioneel", false],
        ["order", "Volgorde", String(item?.order ?? event?.tournaments.length ?? 0), "", true, "number"],
      ]);
    }
    case "arena": {
      const item = event?.arenas.find((candidate) => candidate.id === editor.id);
      return renderTextFields([
        ["name", "Naam", item?.name ?? "", "Bijv. Arena 1", true],
        ["order", "Volgorde", String(item?.order ?? event?.arenas.length ?? 0), "", true, "number"],
      ]);
    }
    case "entry": {
      const item = findEntryInEvent(event, editor.id);
      const kind = item?.kind ?? editor.entryKind ?? "FIGHTER";
      if (!item) {
        return `
          <input type="hidden" name="entryKind" value="${escapeHtml(kind)}" />
          ${renderTextFields([["username", "Name", "", "For example, Jane Doe", true]])}
          ${renderVolunteerPreferences([])}
          ${kind === "FIGHTER" && !event?.allFightersAreVolunteers
            ? `<label class="checkbox-field"><input name="alsoVolunteer" type="checkbox" /> <span>Also Volunteer</span></label>`
            : ""}
        `;
      }
      return `
        ${renderTextFields([["username", "Name", item.user.username, "For example, Jane Doe", true]])}
        ${renderVolunteerPreferences(item.user.skills ?? [])}
        ${renderTournamentSelect(event, item.tournamentId ?? selectedTournamentId)}
        <label class="field">
          <span>Entry type</span>
          <select class="text-input" name="entryKind">
            <option value="FIGHTER" ${kind === "FIGHTER" ? "selected" : ""}>Fighter</option>
            <option value="VOLUNTEER" ${kind === "VOLUNTEER" ? "selected" : ""}>Volunteer</option>
            <option value="BOTH" ${kind === "BOTH" ? "selected" : ""}>Fighter and Volunteer</option>
          </select>
        </label>
        <label class="field">
          <span>Seed</span>
          <input class="text-input" name="seed" type="number" min="0" step="1" value="${item.seed ?? ""}" placeholder="Optional" />
        </label>
      `;
    }
    case "stage": {
      const item = tournament?.stages.find((candidate) => candidate.id === editor.id);
      const type = item?.type ?? "POOL";
      return `
        <label class="field"><span>Type</span><select class="text-input" name="type">
          <option value="POOL" ${type === "POOL" ? "selected" : ""}>POOL</option>
          <option value="ELIMINATION" ${type === "ELIMINATION" ? "selected" : ""}>ELIMINATION</option>
          <option value="SEMI_FINAL" ${type === "SEMI_FINAL" ? "selected" : ""}>SEMI_FINAL</option>
          <option value="FINAL" ${type === "FINAL" ? "selected" : ""}>FINAL</option>
        </select></label>
        ${renderTextFields([
          ["name", "Naam", item?.name ?? "", "Optioneel", false],
          ["ruleset", "Ruleset", item?.ruleset ?? tournament?.ruleset ?? "", "Optioneel", false],
        ])}
      `;
    }
    case "stage-arena": {
      const assignedArenaIds = new Set(stage?.arenas.map((assignment) => assignment.arenaId));
      const availableArenas = event?.arenas.filter((arena) => !assignedArenaIds.has(arena.id)) ?? [];
      return renderSelect("arenaId", "Arena", availableArenas.map((arena) => [arena.id, arena.name]), "Geen vrije arenas");
    }
    case "stage-official": {
      const assignedEntryIds = new Set(stage?.officials.map((official) => official.entryId));
      const availableOfficials = tournament?.entries.filter((entry) => entry.kind !== "FIGHTER" && !assignedEntryIds.has(entry.id)) ?? [];
      return `
        ${renderSelect("entryId", "Vrijwilliger", availableOfficials.map((entry) => [entry.id, entry.user.username]), "Geen vrije vrijwilligers")}
        ${renderSelect("role", "Rol", [["JUDGE", "Scheids"], ["JURY", "Jury"], ["TELLER", "Teller"], ["TABLE", "Tafel"]])}
      `;
    }
  }
}

function renderEventTab(event: ApiEvent): string {
  switch (state.eventTab) {
    case "tournaments":
      return renderTournamentList(event, currentTournament(event));
    case "arenas":
      return renderArenaList(event, event.arenas);
    case "officials":
      return renderEventOfficials(event);
  }
}

function renderEventCreateAction(): string {
  switch (state.eventTab) {
    case "tournaments":
      return renderCreateButton("tournament", "Nieuw toernooi");
    case "arenas":
      return renderCreateButton("arena", "Nieuwe arena");
    case "officials":
      return renderCreateButton("entry", "Nieuwe vrijwilliger", "VOLUNTEER");
  }
}

function renderTournamentCreateAction(): string {
  switch (state.tournamentTab) {
    case "entries":
      return renderCreateButton("entry", "Nieuwe deelnemer", "FIGHTER");
    case "officials":
      return renderCreateButton("entry", "Nieuwe vrijwilliger", "VOLUNTEER");
    case "stages":
      return renderCreateButton("stage", "Nieuwe stage");
  }
}

function renderCreateButton(editor: EditorKind, label: string, entryKind?: EntryKind): string {
  return `
    <button type="button" class="button icon-button" data-action="open-editor" data-editor="${editor}" ${entryKind ? `data-entry-kind="${entryKind}"` : ""} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">+</button>
  `;
}

function renderTournamentTab(event: ApiEvent, tournament: ApiTournament): string {
  switch (state.tournamentTab) {
    case "entries":
      return renderEntryList(tournament.entries.filter((entry) => entry.kind !== "VOLUNTEER"));
    case "officials":
      return renderTournamentOfficials(tournament);
    case "stages":
      return renderStageList(event, tournament, currentStage(tournament));
  }
}

function renderStageTab(event: ApiEvent, tournament: ApiTournament, stage: ApiStage): string {
  switch (state.stageTab) {
    case "overview":
      return `
        <div class="section-actions">
          <button type="button" class="button" data-action="open-editor" data-editor="stage" data-id="${escapeHtml(stage.id)}">Stage bewerken</button>
        </div>
        ${renderStageOverview(event, tournament, stage)}
      `;
    case "arenas":
      return `
        <div class="section-actions">
          <button type="button" class="button icon-button" data-action="open-editor" data-editor="stage-arena" title="Nieuwe arena-koppeling" aria-label="Nieuwe arena-koppeling">+</button>
        </div>
        ${renderArenaAssignments(stage)}
      `;
    case "officials":
      return `
        <div class="section-actions">
          <button type="button" class="button icon-button" data-action="open-editor" data-editor="stage-official" title="Nieuwe vrijwilliger-koppeling" aria-label="Nieuwe vrijwilliger-koppeling">+</button>
        </div>
        ${renderStageOfficials(tournament, stage)}
      `;
    case "rounds":
      return renderRounds(stage);
    case "matches":
      return renderMatches(tournament, stage);
  }
}

function renderTournamentList(event: ApiEvent, selectedTournament: ApiTournament | undefined): string {
  if (event.tournaments.length === 0) {
    return renderEmptyCard("Geen toernooien in dit event.");
  }

  return `
    <div class="list">
      ${event.tournaments
        .map((tournament) => {
          const summary = summarizeTournament(event, tournament);
          return `
            <div class="info-card list-item ${selectedTournament?.id === tournament.id ? "is-active" : ""}" data-action="select-tournament" data-id="${escapeHtml(tournament.id)}">
                <span class="tournament-title"><span class="tournament-color" style="background-color: ${escapeHtml(tournament.color)}" title="Tournament color: ${escapeHtml(tournament.color)}"></span><span class="list-title">${escapeHtml(tournament.name)}</span></span>
                <span class="list-meta">${escapeHtml(summary.ruleset)}</span>
                <span class="list-stats">${summary.entries} inschrijvingen · ${summary.stages} stages</span>
              ${renderResourceActions("tournament", tournament.id, tournament.name)}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderArenaList(event: ApiEvent, arenas: ApiArena[]): string {
  if (arenas.length === 0) {
    return renderEmptyCard("Geen arenas in dit event.");
  }

  return `
    <div class="list">
      ${arenas
        .map((arena) => {
          const usages = event.tournaments.flatMap((tournament) =>
            tournament.stages.flatMap((stage) =>
              stage.arenas
                .filter((assignment) => assignment.arenaId === arena.id)
                .map((assignment) => stageLabel(stage)),
            ),
          );

          return `
            <div class="info-card">
              <div class="info-card-title">${escapeHtml(arena.name)}</div>
              <div class="info-card-subtitle">Volgorde ${arena.order + 1}</div>
              <div class="badge-row">
                ${usages.length > 0
                  ? usages.map((usage) => `<span class="badge badge-muted">${escapeHtml(usage)}</span>`).join("")
                  : `<span class="badge badge-muted">Nog niet gekoppeld</span>`}
              </div>
              ${renderResourceActions("arena", arena.id, arena.name)}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEventOfficials(event: ApiEvent): string {
  const officials = collectEventOfficials(event);
  if (officials.length === 0) {
    return renderEmptyCard("Geen officials in dit event.");
  }

  return `
    <div class="list">
      ${officials
        .map(({ entry, assignments }) => `
          <div class="info-card">
            <div class="info-card-title">${escapeHtml(entry.user.username)}</div>
            <div class="info-card-subtitle">${escapeHtml(roleLabel(entry.kind))}</div>
            <div class="badge-row">
              ${assignments.length > 0
                ? assignments.map((assignment) => `<span class="badge badge-muted">${escapeHtml(assignment)}</span>`).join("")
                : `<span class="badge badge-muted">Geen stage-assignments</span>`}
            </div>
            ${renderEntryActions(entry)}
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderEntryList(entries: ApiEntry[]): string {
  if (entries.length === 0) {
    return renderEmptyCard("Geen deelnemers gevonden.");
  }

  return `
    <div class="list">
      ${entries.map((entry) => renderEntryCard(entry)).join("")}
    </div>
  `;
}

function renderEntryCard(entry: ApiEntry): string {
  return `
    <div class="info-card">
      <div class="info-card-title">${escapeHtml(entry.user.username)}</div>
      <div class="info-card-subtitle">Seed ${entry.seed ?? "n.v.t."}</div>
      <div class="badge-row">
        <span class="badge badge-muted">${escapeHtml(roleLabel(entry.kind))}</span>
      </div>
      ${renderEntryActions(entry)}
    </div>
  `;
}

function renderEntryActions(entry: ApiEntry): string {
  const name = escapeHtml(entry.user.username);
  return `
    <div class="card-actions">
      <button type="button" class="button secondary icon-button" data-action="open-editor" data-editor="entry" data-id="${escapeHtml(entry.id)}" title="Bewerk ${name}" aria-label="Bewerk ${name}">&#9998;</button>
      <button type="button" class="button secondary icon-button danger-button" data-action="delete-entry" data-id="${escapeHtml(entry.id)}" title="Verwijder ${name}" aria-label="Verwijder ${name}">&#128465;</button>
    </div>
  `;
}

function renderResourceActions(kind: "tournament" | "arena" | "stage", id: string, name: string): string {
  const escapedName = escapeHtml(name);
  return `
    <div class="card-actions list-row-actions">
      <button type="button" class="button secondary icon-button" data-action="open-editor" data-editor="${kind}" data-id="${escapeHtml(id)}" title="Bewerk ${escapedName}" aria-label="Bewerk ${escapedName}">&#9998;</button>
      <button type="button" class="button secondary icon-button danger-button" data-action="delete-${kind}" data-id="${escapeHtml(id)}" title="Verwijder ${escapedName}" aria-label="Verwijder ${escapedName}">&#128465;</button>
    </div>
  `;
}

function renderTournamentOfficials(tournament: ApiTournament): string {
  const officials = tournament.entries.filter((entry) => entry.kind !== "FIGHTER");
  if (officials.length === 0) {
    return renderEmptyCard("Geen vrijwilligers in dit toernooi.");
  }

  return `
    <div class="list">
      ${officials
        .map((entry) => {
          const assignments = collectEntryAssignments(tournament, entry.id);
          return `
            <div class="info-card">
              <div class="info-card-title">${escapeHtml(entry.user.username)}</div>
              <div class="info-card-subtitle">${escapeHtml(roleLabel(entry.kind))}</div>
              <div class="badge-row">
                ${assignments.length > 0
                  ? assignments.map((assignment) => `<span class="badge badge-muted">${escapeHtml(assignment)}</span>`).join("")
                  : `<span class="badge badge-muted">Nog niet toegewezen</span>`}
              </div>
              ${renderEntryActions(entry)}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderStageList(event: ApiEvent, tournament: ApiTournament, selectedStage: ApiStage | undefined): string {
  if (tournament.stages.length === 0) {
    return renderEmptyCard("Geen stages in dit toernooi.");
  }

  return `
    <div class="list">
      ${tournament.stages
        .map((stage) => {
          const summary = summarizeStage(event, tournament, stage);
          return `
            <div class="info-card list-item ${selectedStage?.id === stage.id ? "is-active" : ""}" data-action="select-stage" data-id="${escapeHtml(stage.id)}">
                <span class="list-title">${escapeHtml(stageLabel(stage))}</span>
                <span class="list-meta">${escapeHtml(summary.ruleset)}</span>
                <span class="list-stats">${summary.rounds} rondes · ${summary.matches} matches</span>
              ${renderResourceActions("stage", stage.id, stageLabel(stage))}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderStageOverview(event: ApiEvent, tournament: ApiTournament, stage: ApiStage): string {
  const summary = summarizeStage(event, tournament, stage);
  return `
    <div class="detail-grid">
      <div class="metric-card">
        <div class="metric-label">Type</div>
        <div class="metric-value">${escapeHtml(stage.type)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Ruleset</div>
        <div class="metric-value">${escapeHtml(summary.ruleset)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Arenas</div>
        <div class="metric-value">${summary.arenas}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Vrijwilligers</div>
        <div class="metric-value">${summary.officials}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Rondes</div>
        <div class="metric-value">${summary.rounds}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Matches</div>
        <div class="metric-value">${summary.matches}</div>
      </div>
    </div>
    <div class="info-card">
      <div class="info-card-title">${escapeHtml(stageLabel(stage))}</div>
      <div class="info-card-subtitle">${escapeHtml(tournament.name)} in ${escapeHtml(event.eventName)}</div>
      <div class="badge-row">
        <span class="badge badge-muted">${escapeHtml(stage.type)}</span>
        <span class="badge badge-muted">${summary.matches} matches</span>
      </div>
    </div>
  `;
}

function renderArenaAssignments(stage: ApiStage): string {
  if (stage.arenas.length === 0) {
    return renderEmptyCard("Geen arena-koppelingen voor deze stage.");
  }

  return `
    <div class="list">
      ${stage.arenas
        .map((assignment) => `
          <div class="info-card">
            <div class="info-card-title">${escapeHtml(assignment.arena.name)}</div>
            <div class="info-card-subtitle">Volgorde ${assignment.arena.order + 1}</div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderStageOfficials(tournament: ApiTournament, stage: ApiStage): string {
  if (stage.officials.length === 0) {
    return renderEmptyCard("Geen stage officials toegewezen.");
  }

  return `
    <div class="list">
      ${stage.officials
        .map((official) => {
          const entry = findEntry(tournament, official.entryId);
          return `
            <div class="info-card">
              <div class="info-card-title">${escapeHtml(entry?.user.username ?? official.entryId)}</div>
              <div class="info-card-subtitle">${escapeHtml(roleName(official.role))}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderRounds(stage: ApiStage): string {
  if (stage.rounds.length === 0) {
    return renderEmptyCard("Geen rondes gevonden.");
  }

  return `
    <div class="list">
      ${stage.rounds
        .map((round) => `
          <div class="info-card">
            <div class="info-card-title">Ronde ${round.roundNumber + 1}</div>
            <div class="info-card-subtitle">${round.matches.length} matches</div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderMatches(tournament: ApiTournament, stage: ApiStage): string {
  const matches = stage.rounds.flatMap((round) => round.matches.map((match) => ({ round, match })));
  if (matches.length === 0) {
    return renderEmptyCard("Geen matches gevonden.");
  }

  return `
    <div class="list">
      ${matches
        .map(({ round, match }) => {
          const entryA = findEntryById(tournament, match.entryAId);
          const entryB = findEntryById(tournament, match.entryBId);
          const winner = findEntryById(tournament, match.winnerEntryId);
          const arena = findArena(stage, match.arenaId);
          return `
            <div class="info-card">
              <div class="info-card-title">Ronde ${round.roundNumber + 1}</div>
              <div class="info-card-subtitle">
                ${escapeHtml(entryName(entryA) ?? "Onbekend")}
                vs
                ${escapeHtml(entryName(entryB) ?? "Onbekend")}
              </div>
              <div class="badge-row">
                <span class="badge badge-muted">${escapeHtml(arena?.name ?? "Geen arena")}</span>
                <span class="badge badge-muted">${match.scoreA ?? "?"}-${match.scoreB ?? "?"}</span>
                <span class="badge badge-muted">${escapeHtml(entryName(winner) ?? "Geen winnaar")}</span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTabBar(kind: "event" | "tournament" | "stage", value: string, tabs: Array<{ value: string; label: string }>): string {
  return `
    <nav class="tabs" style="--tab-count: ${tabs.length};" aria-label="${escapeHtml(kind)} tabs">
      ${tabs
        .map(
          (tab) => `
            <button
              type="button"
              class="tab ${tab.value === value ? "is-active" : ""}"
              data-action="set-${kind}-tab"
              data-tab="${escapeHtml(tab.value)}"
            >
              ${escapeHtml(tab.label)}
            </button>
          `,
        )
        .join("")}
    </nav>
  `;
}

function renderEmptyCard(message: string): string {
  return `<div class="empty-card">${escapeHtml(message)}</div>`;
}

function selectEvent(id?: string): void {
  if (!id) {
    return;
  }

  state.selectedEventId = id;
  state.selectedTournamentId = null;
  state.selectedStageId = null;
  render();
}

function openEditor(editor: EditorState): void {
  if (editor.kind !== "event" && !currentEvent()) {
    return;
  }

  state.editor = editor;
  render();
}

function closeEditor(): void {
  state.editor = state.events.length === 0 ? { kind: "event" } : undefined;
  render();
}

async function deleteEntry(id?: string): Promise<void> {
  const entry = findEntryInEvent(currentEvent(), id);
  if (!entry) {
    return;
  }

  if (!window.confirm(`Weet je zeker dat je ${entry.user.username} wilt verwijderen?`)) {
    return;
  }

  state.loading = true;
  state.error = null;
  render();
  try {
    await api.deleteEntry(entry.id);
    await bootstrap();
  } catch (error) {
    state.loading = false;
    state.error = toErrorMessage(error);
    render();
  }
}

async function deleteEvent(id?: string): Promise<void> {
  const event = state.events.find((candidate) => candidate.id === id);
  if (!event) {
    return;
  }

  if (!window.confirm(`Weet je zeker dat je ${event.eventName} wilt verwijderen?`)) {
    return;
  }

  state.loading = true;
  state.error = null;
  render();
  try {
    await api.deleteEvent(event.id);
    if (state.selectedEventId === event.id) {
      state.selectedEventId = null;
      state.selectedTournamentId = null;
      state.selectedStageId = null;
    }
    await bootstrap();
  } catch (error) {
    state.loading = false;
    state.error = toErrorMessage(error);
    render();
  }
}

async function deleteResource(action: string | undefined, id?: string): Promise<void> {
  const event = currentEvent();
  const tournament = event?.tournaments.find((item) => item.id === id);
  const arena = event?.arenas.find((item) => item.id === id);
  const stage = event?.tournaments.flatMap((item) => item.stages).find((item) => item.id === id);
  const name = action === "delete-tournament"
    ? tournament?.name
    : action === "delete-arena"
      ? arena?.name
      : stage
        ? stageLabel(stage)
        : undefined;
  if (!id || !name || !window.confirm(`Weet je zeker dat je ${name} wilt verwijderen?`)) {
    return;
  }

  state.loading = true;
  state.error = null;
  render();
  try {
    if (action === "delete-tournament") await api.deleteTournament(id);
    if (action === "delete-arena") await api.deleteArena(id);
    if (action === "delete-stage") await api.deleteStage(id);
    await bootstrap();
  } catch (error) {
    state.loading = false;
    state.error = toErrorMessage(error);
    render();
  }
}

function selectTournament(id?: string): void {
  if (!id) {
    return;
  }

  state.selectedTournamentId = id;
  state.selectedStageId = null;
  render();
}

function selectStage(id?: string): void {
  if (!id) {
    return;
  }

  state.selectedStageId = id;
  render();
}

function setEventTab(tab: EventTab): void {
  state.eventTab = tab;
  render();
}

function setTournamentTab(tab: TournamentTab): void {
  state.tournamentTab = tab;
  render();
}

function setStageTab(tab: StageTab): void {
  state.stageTab = tab;
  render();
}

async function submitEditor(form: HTMLFormElement): Promise<void> {
  const formData = new FormData(form);
  const kind = requireFormString(formData.get("editorKind"), "Onderdeel") as EditorKind;
  const id = optionalFormString(formData.get("id"));
  const event = currentEvent();
  const tournament = event ? currentTournament(event) : undefined;
  const stage = currentStage(tournament);

  state.loading = true;
  render();

  try {
    await saveEditor(kind, id, formData, event, tournament, stage);
    await bootstrap();
  } catch (error) {
    state.loading = false;
    state.error = toErrorMessage(error);
    render();
  }
}

async function saveEditor(
  kind: EditorKind,
  id: string | undefined,
  formData: FormData,
  event: ApiEvent | undefined,
  tournament: ApiTournament | undefined,
  stage: ApiStage | undefined,
): Promise<void> {
  switch (kind) {
    case "event": {
      const eventName = requireFormString(formData.get("eventName"), "Event naam");
      const ruleset = optionalFormString(formData.get("ruleset"));
      const allFightersAreVolunteers = formData.get("allFightersAreVolunteers") === "on";
      const result = id
        ? await api.updateEvent(id, { eventName, ruleset: ruleset ?? null, allFightersAreVolunteers })
        : await api.createEvent({ eventName, ...(ruleset ? { ruleset } : {}), allFightersAreVolunteers });
      state.selectedEventId = result.id;
      state.selectedTournamentId = null;
      state.selectedStageId = null;
      return;
    }
    case "tournament": {
      const eventId = event?.id ?? resultEventIdFallback();
      const body = {
        eventId,
        name: requireFormString(formData.get("name"), "Naam"),
        order: requireFormNumber(formData.get("order"), "Volgorde"),
        ruleset: optionalFormString(formData.get("ruleset")) ?? null,
      };
      const result = id ? await api.updateTournament(id, body) : await api.createTournament(body);
      state.selectedTournamentId = result.id;
      state.selectedStageId = null;
      return;
    }
    case "arena": {
      const eventId = event?.id ?? resultEventIdFallback();
      const body = {
        eventId,
        name: requireFormString(formData.get("name"), "Naam"),
        order: requireFormNumber(formData.get("order"), "Volgorde"),
      };
      await (id ? api.updateArena(id, body) : api.createArena(body));
      return;
    }
    case "entry": {
      const username = requireFormString(formData.get("username"), "Naam");
      const tournamentId = id
        ? requireFormString(formData.get("tournamentId"), "Tournament")
        : tournament?.id ?? (() => { throw new Error("Select a tournament first."); })();
      const entryKind = requireFormString(formData.get("entryKind"), "Entry type") as EntryKind;
      const seed = optionalFormNumber(formData.get("seed"), "Seed");
      if (id) {
        const entry = findEntryInEvent(event, id);
        if (!entry) throw new Error("Inschrijving niet gevonden.");
        await api.updateUser(entry.userId, { username });
        await api.updateEntry(id, { tournamentId, kind: entryKind, seed: seed ?? null });
        await saveVolunteerPreferences(entry.userId, formData, entry.user.skills ?? []);
      } else {
        const existingUser = (await api.listUsers()).find(
          (candidate) => candidate.username.localeCompare(username, undefined, { sensitivity: "accent" }) === 0,
        );
        const user = existingUser ?? await api.createUser({ username });
        const role = entryKind === "FIGHTER" && (formData.get("alsoVolunteer") === "on" || event?.allFightersAreVolunteers)
          ? "BOTH"
          : entryKind;
        const existingEntry = tournament?.entries.find((entry) => entry.userId === user.id);
        if (existingEntry) {
          await api.updateEntry(existingEntry.id, { kind: role, ...(seed !== undefined ? { seed } : {}) });
        } else {
          await api.createEntry({ tournamentId, userId: user.id, kind: role, ...(seed !== undefined ? { seed } : {}) });
        }
        if (!existingUser) {
          await saveVolunteerPreferences(user.id, formData, []);
        }
      }
      return;
    }
    case "stage": {
      const tournamentId = tournament?.id;
      if (!tournamentId) throw new Error("Selecteer eerst een toernooi.");
      const body = {
        tournamentId,
        type: requireFormString(formData.get("type"), "Type") as ApiStage["type"],
        name: optionalFormString(formData.get("name")) ?? null,
        ruleset: optionalFormString(formData.get("ruleset")) ?? null,
      };
      const result = id ? await api.updateStage(id, body) : await api.createStage(body);
      state.selectedStageId = result.id;
      return;
    }
    case "stage-arena": {
      if (!stage) throw new Error("Selecteer eerst een stage.");
      await api.createStageArena(stage.id, { arenaId: requireFormString(formData.get("arenaId"), "Arena") });
      return;
    }
    case "stage-official": {
      if (!stage) throw new Error("Selecteer eerst een stage.");
      await api.createStageOfficial(stage.id, {
        entryId: requireFormString(formData.get("entryId"), "Vrijwilliger"),
        role: requireFormString(formData.get("role"), "Rol") as StageOfficialRole,
      });
      return;
    }
  }
}

function renderTextFields(fields: Array<[string, string, string, string, boolean, string?]>): string {
  return fields
    .map(([name, label, value, placeholder, required, type = "text"]) => `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input class="text-input" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="1"' : ""} />
      </label>
    `)
    .join("");
}

function renderTournamentSelect(event: ApiEvent | undefined, selectedTournamentId: string): string {
  return renderSelect(
    "tournamentId",
    "Toernooi",
    (event?.tournaments ?? []).map((candidate) => [candidate.id, candidate.name]),
    "Maak eerst een toernooi aan.",
    selectedTournamentId,
  );
}

function renderVolunteerPreferences(skills: ApiSkill[]): string {
  const judge = skills.find((skill) => skill.skillName === "JUDGE");
  const jury = skills.find((skill) => skill.skillName === "JURY");
  const table = skills.some((skill) => skill.skillName === "TABLE");
  const other = skills.some((skill) => skill.skillName === "OTHER");
  return `
    <div class="volunteer-preferences">
      <span>This participant would like to volunteer as:</span>
      <div class="volunteer-checkboxes">
        <label class="checkbox-field"><input name="judgeVolunteer" type="checkbox" ${judge ? "checked" : ""} /><span>Judge</span></label>
        <label class="checkbox-field"><input name="juryVolunteer" type="checkbox" ${jury ? "checked" : ""} /><span>Jury</span></label>
        <label class="checkbox-field"><input name="tableVolunteer" type="checkbox" ${table ? "checked" : ""} /><span>Table</span></label>
        <label class="checkbox-field"><input name="otherVolunteer" type="checkbox" ${other ? "checked" : ""} /><span>Other volunteer work</span></label>
      </div>
      <div class="volunteer-skills">
        <span>Skills</span>
        ${renderSkillRating("judgeSkill", "Judge", judge?.skillLevel ?? 1)}
        ${renderSkillRating("jurySkill", "Jury", jury?.skillLevel ?? 1)}
      </div>
    </div>
  `;
}

function renderSkillRating(name: string, label: string, selectedLevel: number): string {
  return `
    <fieldset class="field skill-rating">
      <span>${escapeHtml(label)} vaardigheid</span>
      <div class="star-picker" role="radiogroup" aria-label="${escapeHtml(label)} vaardigheid">
        ${Array.from({ length: 5 }, (_value, index) => {
          const level = 5 - index;
          return `
            <input id="${escapeHtml(name)}-${level}" name="${escapeHtml(name)}" type="radio" value="${level}" ${level === selectedLevel ? "checked" : ""} />
            <label for="${escapeHtml(name)}-${level}" title="${level} ${level === 1 ? "star" : "stars"}" aria-label="${level} ${level === 1 ? "star" : "stars"}">&#9733;</label>
          `;
        }).join("")}
      </div>
    </fieldset>
  `;
}

async function saveVolunteerPreferences(userId: string, formData: FormData, skills: ApiSkill[]): Promise<void> {
  const preferences: Array<[string, string, string?]> = [
    ["JUDGE", "judgeVolunteer", "judgeSkill"],
    ["JURY", "juryVolunteer", "jurySkill"],
    ["TABLE", "tableVolunteer"],
    ["OTHER", "otherVolunteer"],
  ];

  for (const [skillName, checkboxName, ratingName] of preferences) {
    const existing = skills.find((skill) => skill.skillName === skillName);
    const selected = formData.get(checkboxName) === "on";
    if (!selected && existing) {
      await api.deleteSkill(existing.id);
      continue;
    }
    if (selected) {
      const skillLevel = ratingName ? requireFormNumber(formData.get(ratingName), `${skillName} skill`) : 1;
      if (existing) {
        if (existing.skillLevel !== skillLevel) await api.updateSkill(existing.id, { skillLevel });
      } else {
        await api.createSkill({ userId, skillName, skillLevel });
      }
    }
  }
}

function renderSelect(
  name: string,
  label: string,
  options: Array<[string, string]>,
  emptyLabel = "Geen opties beschikbaar",
  selectedValue?: string,
): string {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="text-input" name="${escapeHtml(name)}" ${options.length === 0 ? "disabled" : ""}>
        ${options.length > 0
          ? options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")
          : `<option value="">${escapeHtml(emptyLabel)}</option>`}
      </select>
    </label>
  `;
}

function editorLabel(kind: EditorKind, entryKind?: EntryKind): string {
  switch (kind) {
    case "event": return "event";
    case "tournament": return "toernooi";
    case "arena": return "arena";
    case "entry": return entryKind === "VOLUNTEER" ? "Volunteer" : entryKind === "BOTH" ? "Fighter and Volunteer" : "Fighter";
    case "stage": return "stage";
    case "stage-arena": return "arena-koppeling";
    case "stage-official": return "vrijwilliger-koppeling";
  }
}

function findEntryInEvent(event: ApiEvent | undefined, id: string | undefined): ApiEntry | undefined {
  if (!id) return undefined;
  return event?.tournaments.flatMap((candidate) => candidate.entries).find((entry) => entry.id === id);
}

function requireFormNumber(value: FormDataEntryValue | null, label: string): number {
  const number = optionalFormNumber(value, label);
  if (number === undefined) throw new Error(`${label} is verplicht.`);
  return number;
}

function optionalFormNumber(value: FormDataEntryValue | null, label: string): number | undefined {
  const text = optionalFormString(value);
  if (text === undefined) return undefined;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} moet een positief geheel getal zijn.`);
  return number;
}

function currentEvent(): ApiEvent | undefined {
  return state.events.find((event) => event.id === state.selectedEventId) ?? state.events[0];
}

function currentTournament(event: ApiEvent): ApiTournament | undefined {
  return event.tournaments.find((tournament) => tournament.id === state.selectedTournamentId) ?? event.tournaments[0];
}

function currentStage(tournament: ApiTournament | undefined): ApiStage | undefined {
  if (!tournament) {
    return undefined;
  }

  return tournament.stages.find((stage) => stage.id === state.selectedStageId) ?? tournament.stages[0];
}

function summarizeEvent(event: ApiEvent): {
  ruleset: string;
  tournaments: number;
  arenas: number;
  fighters: number;
  officials: number;
} {
  const fighters = event.tournaments.flatMap((tournament) => tournament.entries.filter((entry) => entry.kind !== "VOLUNTEER"));
  const officials = collectEventOfficials(event);
  return {
    ruleset: rulesetLabel(event.ruleset),
    tournaments: event.tournaments.length,
    arenas: event.arenas.length,
    fighters: fighters.length,
    officials: officials.length,
  };
}

function summarizeTournament(event: ApiEvent, tournament: ApiTournament): {
  ruleset: string;
  entries: number;
  stages: number;
} {
  return {
    ruleset: rulesetLabel(tournament.ruleset ?? event.ruleset),
    entries: tournament.entries.length,
    stages: tournament.stages.length,
  };
}

function summarizeStage(event: ApiEvent, tournament: ApiTournament, stage: ApiStage): {
  ruleset: string;
  arenas: number;
  officials: number;
  rounds: number;
  matches: number;
} {
  return {
    ruleset: rulesetLabel(stage.ruleset ?? tournament.ruleset ?? event.ruleset),
    arenas: stage.arenas.length,
    officials: stage.officials.length,
    rounds: stage.rounds.length,
    matches: stage.rounds.reduce((count, round) => count + round.matches.length, 0),
  };
}

function collectEventOfficials(event: ApiEvent): Array<{ entry: ApiEntry; assignments: string[] }> {
  return event.tournaments
    .flatMap((tournament) =>
      tournament.entries
        .filter((entry) => entry.kind !== "FIGHTER")
        .map((entry) => ({ entry, assignments: collectEntryAssignments(tournament, entry.id) })),
    )
    .sort((left, right) => left.entry.user.username.localeCompare(right.entry.user.username));
}

function collectEntryAssignments(tournament: ApiTournament, entryId: string): string[] {
  const assignments: string[] = [];
  for (const stage of tournament.stages) {
    for (const official of stage.officials) {
      if (official.entryId === entryId) {
        assignments.push(`${stageLabel(stage)} · ${roleName(official.role)}`);
      }
    }
  }

  return assignments;
}

function findEntry(tournament: ApiTournament, entryId: string): ApiEntry | undefined {
  return tournament.entries.find((entry) => entry.id === entryId);
}

function findEntryById(tournament: ApiTournament, entryId: string | null): ApiEntry | undefined {
  if (!entryId) {
    return undefined;
  }

  return findEntry(tournament, entryId);
}

function findArena(stage: ApiStage, arenaId: string | null): ApiArena | undefined {
  if (!arenaId) {
    return undefined;
  }

  return stage.arenas.map((assignment) => assignment.arena).find((arena) => arena.id === arenaId);
}

function entryName(entry: ApiEntry | undefined): string | undefined {
  return entry?.user.username;
}

function rulesetLabel(value: string | null | undefined): string {
  return value ? value : "Erft ruleset";
}

function roleLabel(kind: EntryKind): string {
  return kind === "VOLUNTEER" ? "Volunteer" : kind === "BOTH" ? "Fighter and Volunteer" : "Fighter";
}

function roleName(role: StageOfficialRole): string {
  switch (role) {
    case "JUDGE":
      return "Scheids";
    case "JURY":
      return "Jury";
    case "TELLER":
      return "Teller";
    case "TABLE":
      return "Tafel";
  }
}

function stageLabel(stage: ApiStage): string {
  return stage.name ? stage.name : stage.type;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Onbekende fout.";
}

function requireFormString(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is verplicht.`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is verplicht.`);
  }

  return trimmed;
}

function optionalFormString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resultEventIdFallback(): string {
  const existing = currentEvent();
  if (!existing) {
    throw new Error("No event is selected.");
  }

  return existing.id;
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }

  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

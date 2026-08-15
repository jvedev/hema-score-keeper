import css from "./event-planner-view.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import "../event-editor-view/event-editor-view.js";
import {
  createApiClient,
  type ApiEvent,
  type ApiEventSchedule,
  type ApiEventScheduleResponse,
  type ApiSkill,
  type ApiRuleset,
  type ApiScheduledPhase,
  type ApiScheduleTimeSlot,
  type ApiStage,
  type ScheduleRole,
} from "@hema/event-admin-api";

export class EventPlannerView extends BaseComponent {
  readonly #api = createApiClient();
  #events: ApiEvent[] = [];
  #scheduleData: ApiEventScheduleResponse | undefined;
  #eventId: string | undefined;
  #error: string | undefined;
  #loading = false;
  #showSlotDetails = false;
  #showSuggestions = false;
  #mode: "stages" | "volunteers" = "stages";
  #dragging = false;

  connectedCallback(): void {
    this.#eventId = new URLSearchParams(window.location.search).get("eventId") ?? undefined;
    this.renderPlanner();
    this.registerEvent(this.root, "change", (event) => this.handleChange(event));
    this.registerEvent(this.root, "submit", (event) => {
      event.preventDefault();
      void this.handleSubmit(event);
    });
    this.registerEvent(this.root, "click", (event) => {
      void this.handleClick(event);
    });
    this.registerEvent(this.root, "dragstart", (event) => this.handleDragStart(event as DragEvent));
    this.registerEvent(this.root, "dragover", (event) => this.handleDragOver(event as DragEvent));
    this.registerEvent(this.root, "dragleave", (event) => this.handleDragLeave(event as DragEvent));
    this.registerEvent(this.root, "drop", (event) => {
      void this.handleDrop(event as DragEvent);
    });
    this.registerEvent(this.root, "dragend", () => this.handleDragEnd());
    this.registerEvent(this.root, "mouseover", (event) => this.handleVolunteerMouseOver(event as MouseEvent));
    this.registerEvent(this.root, "mouseout", (event) => this.handleVolunteerMouseOut(event as MouseEvent));
    this.registerEvent(window, "popstate", () => {
      this.#eventId = new URLSearchParams(window.location.search).get("eventId") ?? undefined;
      void this.load();
    });
    void this.load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  private async load(): Promise<void> {
    this.#loading = true;
    this.#error = undefined;
    this.renderPlanner();

    try {
      this.#events = await this.#api.listEvents();
      this.#scheduleData = this.#eventId
        ? await this.#api.getEventSchedule(this.#eventId)
        : undefined;
    } catch (error) {
      this.#scheduleData = undefined;
      this.#error = error instanceof Error ? error.message : "The planner could not be loaded.";
    } finally {
      this.#loading = false;
      this.renderPlanner();
    }
  }

  private handleChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.name !== "eventId") {
      return;
    }

    const url = new URL(window.location.href);
    if (target.value) {
      url.searchParams.set("eventId", target.value);
    } else {
      url.searchParams.delete("eventId");
    }
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
    this.#eventId = target.value || undefined;
    void this.load();
  }

  private async handleSubmit(event: Event): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const action = form.dataset.action;
    const eventId = this.#eventId;
    if (!eventId) {
      return;
    }

    const data = new FormData(form);
    try {
      switch (action) {
        case "update-start-time":
          await this.#api.updateEventSchedule(eventId, {
            startTimeMinutes: parseTimeInput(requireFormString(data, "startTime")),
          });
          break;
        case "add-slot":
          await this.#api.createScheduleTimeSlot(eventId, {
            durationMinutes: requirePositiveFormNumber(data, "durationMinutes"),
            label: requireFormString(data, "label"),
            color: optionalFormString(data, "color"),
            isBreak: data.get("isBreak") === "on",
          });
          break;
        case "update-slot":
          await this.#api.updateScheduleTimeSlot(requireFormString(data, "slotId"), {
            durationMinutes: requirePositiveFormNumber(data, "durationMinutes"),
            label: requireFormString(data, "label"),
            color: optionalFormString(data, "color"),
            isBreak: data.get("isBreak") === "on",
          });
          break;
        default:
          return;
      }
      await this.load();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The change could not be saved.";
      this.renderPlanner();
    }
  }

  private async handleClick(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionElement = target.closest<HTMLElement>("[data-click-action]");
    if (!actionElement) {
      if (target.classList.contains("modal-backdrop")) {
        this.#showSuggestions = false;
        this.renderPlanner();
      }
      return;
    }

    if (actionElement.dataset.clickAction === "toggle-slot-details") {
      this.#showSlotDetails = !this.#showSlotDetails;
      this.renderPlanner();
      return;
    }
    if (actionElement.dataset.clickAction === "open-suggestions") {
      this.#showSuggestions = true;
      this.renderPlanner();
      return;
    }
    if (actionElement.dataset.clickAction === "close-suggestions") {
      this.#showSuggestions = false;
      this.renderPlanner();
      return;
    }
    if (actionElement.dataset.clickAction === "set-mode") {
      this.#mode = actionElement.dataset.mode === "volunteers" ? "volunteers" : "stages";
      this.renderPlanner();
      return;
    }

    const id = actionElement.dataset.id;
    if (!id) {
      return;
    }

    try {
      if (actionElement.dataset.clickAction === "delete-slot") {
        if (!window.confirm("Delete this time slot?")) {
          return;
        }
        await this.#api.deleteScheduleTimeSlot(id);
      } else if (actionElement.dataset.clickAction === "delete-placement") {
        if (!window.confirm("Delete this stage placement?")) {
          return;
        }
        await this.#api.deleteScheduledPhase(id);
      } else if (actionElement.dataset.clickAction === "delete-assignment") {
        await this.#api.deleteScheduledAssignment(id);
      } else {
        return;
      }
      await this.load();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The change could not be saved.";
      this.renderPlanner();
    }
  }

  private handleDragStart(event: DragEvent): void {
    const target = event.composedPath()[0];
    const source = target instanceof Element ? target : event.target;
    if (!(source instanceof Element)) {
      return;
    }

    const phase = source.closest<HTMLElement>("[data-stage-id]");
    const volunteer = source.closest<HTMLElement>("[data-user-id]");
    const placement = source.closest<HTMLElement>("[data-placement-id]");
    if (!placement && !phase && !volunteer) {
      return;
    }

    this.#dragging = true;
    this.root.host.toggleAttribute("data-dragging", true);
    this.clearHoveredVolunteer();
    if (!event.dataTransfer) {
      return;
    }

    if (placement) {
      event.dataTransfer.setData("application/x-hema-scheduled-phase", placement.dataset.placementId ?? "");
    } else if (phase) {
      event.dataTransfer.setData("application/x-hema-stage", phase.dataset.stageId ?? "");
    } else if (volunteer) {
      event.dataTransfer.setData("application/x-hema-volunteer", volunteer.dataset.userId ?? "");
    }

    event.dataTransfer.effectAllowed = "move";
  }

  private handleDragOver(event: DragEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const cell = target.closest<HTMLElement>("[data-assignment-phase-id], [data-arena-id][data-time-slot-id]");
    if (cell && cell.dataset.break !== "true") {
      event.preventDefault();
      cell.dataset.dropActive = "true";
    }
  }

  private handleDragLeave(event: DragEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const dropzone = target.closest<HTMLElement>("[data-assignment-phase-id]");
    if (dropzone) {
      dropzone.dataset.dropActive = "false";
    }
  }

  private async handleDrop(event: DragEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element) || !event.dataTransfer) {
      return;
    }

    const cell = target.closest<HTMLElement>("[data-assignment-phase-id], [data-arena-id][data-time-slot-id]");
    if (!cell || cell.dataset.break === "true") {
      return;
    }

    event.preventDefault();
    cell.dataset.dropActive = "false";
    const arenaId = cell.dataset.arenaId;
    const timeSlotId = cell.dataset.timeSlotId;
    const stageId = event.dataTransfer.getData("application/x-hema-stage");
    const placementId = event.dataTransfer.getData("application/x-hema-scheduled-phase");
    const volunteerId = event.dataTransfer.getData("application/x-hema-volunteer");
    const assignmentPhaseId = cell.dataset.assignmentPhaseId;
    const role = cell.dataset.role as ScheduleRole | undefined;
    if (volunteerId && assignmentPhaseId && role) {
      try {
        const assignment = await this.#api.createScheduledAssignment(assignmentPhaseId, { userId: volunteerId, role });
        this.addAssignmentToSchedule(assignmentPhaseId, assignment);
        this.renderPlanner();
      } catch (error) {
        this.#error = error instanceof Error ? error.message : "The volunteer could not be assigned.";
        this.renderPlanner();
      }
      return;
    }
    if (!arenaId || !timeSlotId || (!stageId && !placementId)) {
      return;
    }

    try {
      if (placementId) {
        await this.#api.updateScheduledPhase(placementId, { arenaId, timeSlotId });
      } else {
        await this.#api.createScheduledPhase({ stageId, arenaId, timeSlotId });
      }
      await this.load();
    } catch (error) {
      this.#error = error instanceof Error ? error.message : "The stage could not be placed.";
      this.renderPlanner();
    }
  }

  private renderPlanner(): void {
    const data = this.#scheduleData;
    const selectedEventId = this.#eventId ?? "";
    const eventOptions = this.#events
      .map((event) => `<option value="${escapeHtml(event.id)}"${event.id === selectedEventId ? " selected" : ""}>${escapeHtml(event.eventName)}</option>`)
      .join("");
    const schedule = data?.schedule;
    const event = data?.event;

    this.render(css, `
      <section class="planner"${this.#dragging ? ' data-dragging="true"' : ""}>
        <header class="planner-header">
          <div>
            <a data-route href="/">Event administration</a>
            <h1>Event planner</h1>
          </div>
          <div class="planner-header-actions">
            <label>
              Event
              <select name="eventId" ${this.#loading ? "disabled" : ""}>
                <option value="">Choose an event</option>
                ${eventOptions}
              </select>
            </label>
            <button
              type="button"
              class="button secondary icon-button"
              data-click-action="open-suggestions"
              title="Open suggestions"
              aria-label="Open suggestions"
              ${event ? "" : "disabled"}
            >✦</button>
          </div>
        </header>
        ${this.#error ? `<p class="planner-error" role="alert">${escapeHtml(this.#error)}</p>` : ""}
        ${this.#loading ? "<p>Loading planner...</p>" : ""}
        ${!this.#loading && !event ? "<p class=\"planner-empty\">Choose an event to create a schedule.</p>" : ""}
        ${event && schedule ? this.renderSchedule(event, schedule) : ""}
        ${event ? this.renderSuggestionsModal(event) : ""}
      </section>
    `);
  }

  private renderSchedule(event: ApiEvent, schedule: ApiEventSchedule): string {
    const slots = schedule.timeSlots;
    const columnTemplate = `11rem ${slots.map((slot) => `${Math.max(12, slot.durationMinutes / 4)}rem`).join(" ")}`;
    const currentStart = schedule.startTimeMinutes;
    let start = currentStart;
    const slotHeaders = slots.map((slot) => {
      const header = this.renderSlotHeader(slot, start);
      start += slot.durationMinutes;
      return header;
    }).join("");

    return `
      <div class="planner-controls">
        <form data-action="update-start-time" class="start-time-form">
          <label>Start time <input name="startTime" type="time" value="${formatTime(currentStart)}" required></label>
          <button type="submit">Save start time</button>
        </form>
        <form data-action="add-slot" class="slot-form">
          <label>Duration (min.) <input name="durationMinutes" type="number" min="1" max="1440" value="60" required></label>
          <label>Label <input name="label" value="New time slot" required></label>
          <label>Color <input name="color" type="color" value="#6b7280"></label>
          <label class="checkbox-label"><input name="isBreak" type="checkbox"> Break</label>
          <button type="submit">Add time slot</button>
        </form>
      </div>
      <div class="planner-layout">
        <aside class="phase-sidebar">
          <div class="planner-mode-tabs">
            <button type="button" data-click-action="set-mode" data-mode="stages" aria-pressed="${this.#mode === "stages"}">Tournament stages</button>
            <button type="button" data-click-action="set-mode" data-mode="volunteers" aria-pressed="${this.#mode === "volunteers"}">Volunteers</button>
          </div>
          <div class="phase-sidebar-content">
            ${this.#mode === "stages"
              ? event.tournaments.map((tournament) => `
              <section class="tournament-phases" style="--tournament-color: ${escapeHtml(tournament.color)}">
                <h3>${escapeHtml(tournament.name)}</h3>
                ${tournament.stages.map((stage) => `
                  <button class="phase-source" type="button" draggable="true" data-stage-id="${escapeHtml(stage.id)}">
                    ${escapeHtml(stage.name ?? stageLabel(stage.type))}
                  </button>
                `).join("")}
              </section>
            `).join("")
              : this.renderVolunteerList(event)}
          </div>
        </aside>
        <div class="timeline-scroll">
          <div class="timeline-grid" style="grid-template-columns: ${columnTemplate}">
            <div class="arena-corner">
              <span>Arena / time slot</span>
              <button type="button" class="slot-details-toggle" data-click-action="toggle-slot-details" aria-pressed="${this.#showSlotDetails}" title="${this.#showSlotDetails ? "Hide all time slot details" : "Show all time slot details"}">
                ${this.#showSlotDetails ? "Hide details" : "Show details"}
              </button>
            </div>
            ${slotHeaders}
            ${event.arenas.sort((left, right) => left.order - right.order).map((arena) => `
              <div class="arena-label">${escapeHtml(arena.name)}</div>
              ${slots.map((slot) => this.renderScheduleCell(arena.id, slot)).join("")}
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  private renderSuggestionsModal(event: ApiEvent): string {
    if (!this.#showSuggestions) {
      return "";
    }

    const suggestions = buildEventSuggestions(event);
    const longestSlot = suggestions.reduce((max, suggestion) => Math.max(max, suggestion.longestSlotMinutes), 0);
    const totalParticipants = suggestions.reduce((sum, suggestion) => sum + suggestion.participantCount, 0);
    const totalPools = suggestions.reduce((sum, suggestion) => sum + suggestion.poolCount, 0);

    return `
      <event-editor-view>
        <section class="modal-backdrop" role="presentation">
          <div class="modal-card suggestions-modal-card" role="dialog" aria-modal="true" aria-labelledby="suggestions-title">
            <header class="modal-header">
              <div>
                <div class="eyebrow">Planning suggestions</div>
                <h2 id="suggestions-title">Pool and elimination suggestions</h2>
                <p class="editor-note">These are estimates based on the current event, participant counts, pool limits, elimination setup, ruleset match length, and time between matches.</p>
              </div>
              <div class="modal-actions">
                <button type="button" class="button secondary" data-click-action="close-suggestions">Close</button>
              </div>
            </header>

            <div class="suggestion-summary">
              <span class="badge">Tournaments ${suggestions.length}</span>
              <span class="badge badge-muted">Participants ${totalParticipants}</span>
              <span class="badge badge-muted">Pools ${totalPools}</span>
              <span class="badge badge-muted">Longest slot ${formatDuration(longestSlot)}</span>
            </div>

            <div class="suggestion-list">
              ${suggestions.length > 0
                ? suggestions.map((suggestion) => this.renderSuggestionCard(suggestion)).join("")
                : `<div class="empty-state">No tournaments with pool suggestions yet.</div>`}
            </div>
          </div>
        </section>
      </event-editor-view>
    `;
  }

  private renderSuggestionCard(suggestion: TournamentSuggestion): string {
    return `
      <article class="suggestion-card" style="--tournament-color: ${escapeHtml(suggestion.color)}">
        <div class="suggestion-card-header">
          <div>
            <h3>${escapeHtml(suggestion.tournamentName)}</h3>
            <p>${escapeHtml(suggestion.reason)}</p>
          </div>
          <div class="suggestion-pill">${suggestion.participantCount} participants</div>
        </div>

        <div class="badge-row">
          <span class="badge badge-muted">Pool sizes ${escapeHtml(suggestion.poolSizes.join(", "))}</span>
          <span class="badge badge-muted">Pools ${suggestion.poolCount}</span>
          <span class="badge badge-muted">Pool slot lengths ${escapeHtml(suggestion.waveLengths.map(formatDuration).join(", "))}</span>
          <span class="badge badge-muted">Elimination length ${formatDuration(suggestion.eliminationLengthMinutes)}</span>
          <span class="badge badge-muted">Total ${formatDuration(suggestion.totalMinutes)}</span>
        </div>

        <div class="suggestion-metrics">
          <div>
            <span>Participant count</span>
            <strong>${suggestion.participantCount}</strong>
          </div>
          <div>
            <span>Match block</span>
            <strong>${formatDuration(suggestion.matchBlockMinutes)}</strong>
          </div>
          <div>
            <span>Preferred pool</span>
            <strong>${suggestion.preferredPoolSize}</strong>
          </div>
          <div>
            <span>Limits</span>
            <strong>${suggestion.minPoolSize} - ${suggestion.maxPoolSize}</strong>
          </div>
        </div>

        ${suggestion.warnings.length > 0
          ? `<div class="suggestion-warning">${suggestion.warnings.map(escapeHtml).join("<br />")}</div>`
          : ""}
      </article>
    `;
  }

  private renderSlotHeader(slot: ApiScheduleTimeSlot, startTimeMinutes: number): string {
    const endTimeMinutes = startTimeMinutes + slot.durationMinutes;
    const assignmentCount = slot.scheduledPhases.length;
    return `
      <section class="slot-header${slot.isBreak ? " break-slot" : ""}" style="--slot-color: ${escapeHtml(slot.color ?? "#6b7280")}">
        <p>${formatTime(startTimeMinutes)} - ${formatTime(endTimeMinutes)}</p>
        <strong class="slot-label">${escapeHtml(slot.label)}</strong>
        ${this.#showSlotDetails ? `
          <div class="slot-details">
          <form data-action="update-slot">
            <input name="slotId" type="hidden" value="${escapeHtml(slot.id)}">
            <label>Label <input name="label" value="${escapeHtml(slot.label)}" required></label>
            <label>Duration <input name="durationMinutes" type="number" min="1" max="1440" value="${slot.durationMinutes}" required></label>
            <label>Color <input name="color" type="color" value="${escapeHtml(slot.color ?? "#6b7280")}"></label>
            <label class="checkbox-label"><input name="isBreak" type="checkbox"${slot.isBreak ? " checked" : ""}> Break</label>
            <button type="submit">Save</button>
          </form>
          <button type="button" class="icon-button" data-click-action="delete-slot" data-id="${escapeHtml(slot.id)}"${assignmentCount > 0 ? " disabled" : ""} aria-label="Delete time slot" title="Delete time slot">×</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  private renderScheduleCell(arenaId: string, slot: ApiScheduleTimeSlot): string {
    const placement = slot.scheduledPhases.find((candidate) => candidate.arenaId === arenaId);
    return `
      <div class="schedule-cell${slot.isBreak ? " break-cell" : ""}" data-arena-id="${escapeHtml(arenaId)}" data-time-slot-id="${escapeHtml(slot.id)}" data-break="${slot.isBreak}">
        ${placement ? `
          <article class="phase-card" draggable="${this.#mode === "stages"}" data-placement-id="${escapeHtml(placement.id)}" style="--tournament-color: ${escapeHtml(placement.stage.tournament.color)}">
            <span>${escapeHtml(placement.stage.tournament.name)}</span>
            <strong>${escapeHtml(placement.stage.name ?? stageLabel(placement.stage.type))}</strong>
            ${this.#mode === "stages"
              ? `<button type="button" data-click-action="delete-placement" data-id="${escapeHtml(placement.id)}" aria-label="Delete stage placement" title="Delete stage placement">×</button>`
              : ""}
            ${this.#mode === "volunteers" ? this.renderAssignmentDropzones(placement) : ""}
          </article>
        ` : slot.isBreak ? "<span>Break</span>" : "<span class=\"drop-hint\">Drag a stage here</span>"}
      </div>
    `;
  }

  private renderVolunteerList(event: ApiEvent): string {
    const volunteers = new Map<string, { username: string; skills: ApiSkill[] | undefined }>();
    for (const tournament of event.tournaments) {
      for (const entry of tournament.entries) {
        if (entry.kind !== "VOLUNTEER" && entry.kind !== "BOTH") continue;
        volunteers.set(entry.userId, { username: entry.user.username, skills: entry.user.skills });
      }
    }
    return [...volunteers.entries()].map(([userId, volunteer]) => {
      const skills = renderVolunteerSkills(volunteer.skills ?? []);
      const tooltip = renderVolunteerTooltip(volunteer.username, volunteer.skills ?? []);
      return `
      <button class="volunteer-source" type="button" draggable="true" data-user-id="${escapeHtml(userId)}" data-volunteer-hover-key="source:${escapeHtml(userId)}">
        <strong>${escapeHtml(volunteer.username)}</strong>
        ${skills ? `<div class="volunteer-skills">${skills}</div>` : ""}
        ${tooltip}
      </button>
    `;
    }).join("") || "<p class=\"planner-empty\">No volunteers are available for this event.</p>";
  }

  private renderAssignmentDropzones(placement: ApiScheduledPhase): string {
    return `<div class="assignment-dropzones">${(["JUDGE", "JURY", "TABLE"] as const).map((role) => {
      const assignments = placement.assignments?.filter((candidate) => candidate.role === role) ?? [];
      return `<div class="assignment-dropzone" data-assignment-phase-id="${escapeHtml(placement.id)}" data-role="${role}">
        <span>${role}</span>
        <div class="assignment-volunteers">
          ${assignments.map((assignment) => `
            <span class="assignment-volunteer" data-volunteer-hover-key="assignment:${escapeHtml(assignment.id)}">${escapeHtml(assignment.user.username)}
              <button type="button" data-click-action="delete-assignment" data-id="${escapeHtml(assignment.id)}" aria-label="Remove ${escapeHtml(assignment.user.username)}" title="Remove ${escapeHtml(assignment.user.username)}">×</button>
              ${renderVolunteerTooltip(assignment.user.username, assignment.user.skills ?? [])}
            </span>
          `).join("") || "<em>Drop volunteer</em>"}
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  private addAssignmentToSchedule(
    scheduledPhaseId: string,
    assignment: ApiScheduledPhase["assignments"][number],
  ): void {
    for (const timeSlot of this.#scheduleData?.schedule.timeSlots ?? []) {
      const scheduledPhase = timeSlot.scheduledPhases.find((candidate) => candidate.id === scheduledPhaseId);
      if (scheduledPhase) {
        scheduledPhase.assignments = [...(scheduledPhase.assignments ?? []), assignment];
        return;
      }
    }
  }
  
  private handleDragEnd(): void {
    this.#dragging = false;
    this.root.host.toggleAttribute("data-dragging", false);
    this.clearHoveredVolunteer();
  }

  private handleVolunteerMouseOver(event: MouseEvent): void {
    if (this.#dragging) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const volunteer = target.closest<HTMLElement>("[data-volunteer-hover-key]");
    if (!volunteer) {
      return;
    }

    this.clearHoveredVolunteer();
    volunteer.dataset.hovered = "true";
  }

  private handleVolunteerMouseOut(event: MouseEvent): void {
    if (this.#dragging) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const volunteer = target.closest<HTMLElement>("[data-volunteer-hover-key]");
    if (!volunteer) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Element && relatedTarget.closest("[data-volunteer-hover-key]") === volunteer) {
      return;
    }

    delete volunteer.dataset.hovered;
  }

  private clearHoveredVolunteer(): void {
    const hovered = this.root.querySelector<HTMLElement>("[data-volunteer-hover-key][data-hovered='true']");
    if (hovered) {
      delete hovered.dataset.hovered;
    }
  }
}

function renderVolunteerSkills(skills: NonNullable<ApiEvent["tournaments"][number]["entries"][number]["user"]["skills"]>): string {
  return skills
    .filter((skill) => (skill.skillName === "JUDGE" || skill.skillName === "JURY") && skill.skillLevel > 0)
    .map((skill) => {
      const label = skill.skillName === "JUDGE" ? "Judge" : "Jury";
      const stars = Array.from({ length: skill.skillLevel }, () => "&#9733;").join("");
      return `<span class="volunteer-skill"><span class="volunteer-skill-label">${escapeHtml(label)}</span><span class="volunteer-skill-stars" aria-hidden="true">${stars}</span></span>`;
    })
    .join("");
}

function renderVolunteerTooltip(username: string, skills: ApiSkill[]): string {
  const skillMarkup = renderVolunteerSkills(skills);
  const wishMarkup = renderVolunteerWishes(skills);
  if (!skillMarkup && !wishMarkup) {
    return "";
  }

  return `
    <div class="volunteer-tooltip" role="tooltip">
      <div class="volunteer-tooltip-name">${escapeHtml(username)}</div>
      ${skillMarkup ? `<div class="volunteer-tooltip-section"><span class="volunteer-tooltip-heading">Skills</span>${skillMarkup}</div>` : ""}
      ${wishMarkup ? `<div class="volunteer-tooltip-section"><span class="volunteer-tooltip-heading">Wensen</span>${wishMarkup}</div>` : ""}
    </div>
  `;
}

function renderVolunteerWishes(skills: ApiSkill[]): string {
  const labels: Array<[ApiSkill["skillName"], string]> = [
    ["JUDGE", "Judge"],
    ["JURY", "Jury"],
    ["TABLE", "Table"],
  ];

  return labels
    .filter(([skillName]) => skills.some((skill) => skill.skillName === skillName))
    .map(([, label]) => `<span class="volunteer-wish">${escapeHtml(label)}</span>`)
    .join("");
}

function requireFormString(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function optionalFormString(data: FormData, name: string): string | null {
  const value = data.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requirePositiveFormNumber(data: FormData, name: string): number {
  const value = Number(data.get(name));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseTimeInput(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Enter a valid start time.");
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error("Enter a valid start time.");
  }
  return hours * 60 + minutes;
}

function formatTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function stageLabel(type: string): string {
  switch (type) {
    case "POOL":
      return "Pool";
    case "ELIMINATION":
      return "Elimination";
    case "SEMI_FINAL":
      return "Semi-final";
    case "FINAL":
      return "Final";
    default:
      return type;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface TournamentSuggestion {
  tournamentId: string;
  tournamentName: string;
  color: string;
  participantCount: number;
  poolSizes: number[];
  poolCount: number;
  waveLengths: number[];
  firstSlotLengthMinutes: number;
  eliminationLengthMinutes: number;
  longestSlotMinutes: number;
  totalMinutes: number;
  matchBlockMinutes: number;
  minPoolSize: number;
  maxPoolSize: number;
  preferredPoolSize: number;
  reason: string;
  warnings: string[];
}

function buildEventSuggestions(event: ApiEvent): TournamentSuggestion[] {
  const arenaCount = Math.max(1, event.arenas.length);
  return [...event.tournaments]
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .map((tournament) => buildTournamentSuggestion(tournament, arenaCount, event.ruleset));
}

function buildTournamentSuggestion(
  tournament: ApiEvent["tournaments"][number],
  arenaCount: number,
  eventRuleset: ApiRuleset | null,
): TournamentSuggestion {
  const poolStage = tournament.stages.find((stage) => stage.type === "POOL");
  const eliminationStage = tournament.stages.find((stage) => stage.type === "ELIMINATION" || stage.type === "SEMI_FINAL" || stage.type === "FINAL");
  const participantCount = tournament.entries.filter((entry) => entry.kind !== "VOLUNTEER").length;
  const ruleset = resolveStageRuleset(poolStage?.ruleset ?? tournament.ruleset ?? eventRuleset);
  const minPoolSize = poolStage?.minPoolSize ?? 4;
  const maxPoolSize = poolStage?.maxPoolSize ?? 6;
  const preferredPoolSize = poolStage?.preferredPoolSize ?? 5;
  const timeBetweenMatchesMinutes = poolStage?.timeBetweenMatchesMinutes ?? 2;
  const matchMinutes = Math.max(1, Math.ceil((ruleset?.definition?.matchParameters.maxDurationSeconds ?? 180) / 60));
  const matchBlockMinutes = matchMinutes + timeBetweenMatchesMinutes;
  const eliminationParticipantCount = resolveEliminationParticipantCount(poolStage, eliminationStage, participantCount);
  const eliminationLengthMinutes = calculateEliminationDurationMinutes(eliminationParticipantCount, arenaCount, matchBlockMinutes);
  const warnings: string[] = [];

  if (!poolStage) {
    warnings.push("No pool stage settings were found; default pool limits were used.");
  }

  if (participantCount === 0) {
    warnings.push("No participants are registered yet.");
    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      color: tournament.color,
      participantCount,
      poolSizes: [],
      poolCount: 0,
      waveLengths: [],
      firstSlotLengthMinutes: 0,
      eliminationLengthMinutes,
      longestSlotMinutes: eliminationLengthMinutes,
      totalMinutes: 0,
      matchBlockMinutes,
      minPoolSize,
      maxPoolSize,
      preferredPoolSize,
      reason: "No participant data is available yet.",
      warnings,
    };
  }

  const distribution = buildPoolDistribution(
    participantCount,
    minPoolSize,
    maxPoolSize,
    preferredPoolSize,
    arenaCount,
    matchMinutes,
    timeBetweenMatchesMinutes,
  );
  if (!distribution) {
    warnings.push("The participant count does not fit the configured pool limits.");
    const fallbackSize = participantCount;
    const poolSizes = [fallbackSize];
    const waveLengths = [calculatePoolDurationMinutes(fallbackSize, matchMinutes, timeBetweenMatchesMinutes)];
    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      color: tournament.color,
      participantCount,
      poolSizes,
      poolCount: poolSizes.length,
      waveLengths,
      firstSlotLengthMinutes: waveLengths[0] ?? 0,
      eliminationLengthMinutes,
      longestSlotMinutes: Math.max(eliminationLengthMinutes, ...waveLengths),
      totalMinutes: waveLengths.reduce((sum, duration) => sum + duration, 0) + eliminationLengthMinutes,
      matchBlockMinutes,
      minPoolSize,
      maxPoolSize,
      preferredPoolSize,
      reason: `Fallback to a single pool of ${fallbackSize}; elimination length ${formatDuration(eliminationLengthMinutes)}.`,
      warnings,
    };
  }

  const poolDurations = distribution.sizes.map((size) => calculatePoolDurationMinutes(size, matchMinutes, timeBetweenMatchesMinutes));
  const waveLengths = chunkDurations(poolDurations, arenaCount);
  const totalMinutes = waveLengths.reduce((sum, duration) => sum + duration, 0) + eliminationLengthMinutes;
  const firstSlotLengthMinutes = waveLengths[0] ?? 0;
  const longestSlotMinutes = Math.max(eliminationLengthMinutes, ...waveLengths);
  const longestPool = distribution.sizes[0] ?? participantCount;
  const shortestPool = distribution.sizes[distribution.sizes.length - 1] ?? participantCount;

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    color: tournament.color,
    participantCount,
    poolSizes: distribution.sizes,
    poolCount: distribution.sizes.length,
    waveLengths,
    firstSlotLengthMinutes,
    eliminationLengthMinutes,
    longestSlotMinutes,
    totalMinutes,
    matchBlockMinutes,
    minPoolSize,
    maxPoolSize,
    preferredPoolSize,
    reason: `Balanced across ${distribution.sizes.length} pools with sizes ${distribution.sizes.join(", ")}; elimination length ${formatDuration(eliminationLengthMinutes)}.`,
    warnings: [
      ...(distribution.sizes.some((size) => size < minPoolSize || size > maxPoolSize)
        ? ["One or more pools fall outside the configured limits."]
        : []),
      ...(longestPool !== shortestPool ? [`Pool sizes vary between ${shortestPool} and ${longestPool}.`] : []),
      ...warnings,
    ],
  };
}

function resolveStageRuleset(ruleset: ApiRuleset | null | undefined): ApiRuleset | null {
  return ruleset ?? null;
}

function resolveEliminationParticipantCount(
  poolStage: ApiStage | undefined,
  eliminationStage: ApiStage | undefined,
  participantCount: number,
): number {
  if (eliminationStage?.eliminationParticipantCount !== null && eliminationStage?.eliminationParticipantCount !== undefined) {
    return eliminationStage.eliminationParticipantCount;
  }

  if (poolStage?.preferredPoolSize !== null && poolStage?.preferredPoolSize !== undefined) {
    return poolStage.preferredPoolSize;
  }

  return Math.min(Math.max(1, participantCount), 5);
}

function calculateEliminationDurationMinutes(participantCount: number, arenaCount: number, matchBlockMinutes: number): number {
  if (participantCount <= 1) {
    return 0;
  }

  let remainingParticipants = participantCount;
  let totalMinutes = 0;
  while (remainingParticipants > 1) {
    const matchesThisRound = Math.floor(remainingParticipants / 2);
    if (matchesThisRound > 0) {
      totalMinutes += Math.ceil(matchesThisRound / arenaCount) * matchBlockMinutes;
    }
    remainingParticipants = Math.ceil(remainingParticipants / 2);
  }

  return roundUpToFive(totalMinutes);
}

function buildPoolDistribution(
  participantCount: number,
  minPoolSize: number,
  maxPoolSize: number,
  preferredPoolSize: number,
  arenaCount: number,
  matchMinutes: number,
  timeBetweenMatchesMinutes: number,
): { sizes: number[] } | undefined {
  if (participantCount < minPoolSize) {
    return undefined;
  }

  const minPools = Math.ceil(participantCount / maxPoolSize);
  const maxPools = Math.floor(participantCount / minPoolSize);
  let best: { sizes: number[]; totalMinutes: number; deviation: number; spread: number } | undefined;

  for (let poolCount = minPools; poolCount <= maxPools; poolCount += 1) {
    const sizes = createBalancedPoolSizes(participantCount, poolCount, minPoolSize, maxPoolSize, preferredPoolSize);
    if (!sizes) {
      continue;
    }

    const totalDeviation = sizes.reduce((sum, size) => sum + Math.abs(size - preferredPoolSize), 0);
    const spread = Math.max(...sizes) - Math.min(...sizes);
    const totalMinutes = estimateTournamentDurationMinutes(sizes, arenaCount, matchMinutes, timeBetweenMatchesMinutes);
    const candidate = { sizes, totalMinutes, deviation: totalDeviation, spread };
    if (!best) {
      best = candidate;
      continue;
    }

    const currentScore = [best.totalMinutes, best.deviation, best.spread, best.sizes.length];
    const nextScore = [candidate.totalMinutes, candidate.deviation, candidate.spread, candidate.sizes.length];
    if (compareScores(nextScore, currentScore) < 0) {
      best = candidate;
    }
  }

  return best ? { sizes: best.sizes } : undefined;
}

function createBalancedPoolSizes(
  participantCount: number,
  poolCount: number,
  minPoolSize: number,
  maxPoolSize: number,
  preferredPoolSize: number,
): number[] | undefined {
  if (participantCount < poolCount * minPoolSize || participantCount > poolCount * maxPoolSize) {
    return undefined;
  }

  const target = clamp(preferredPoolSize, minPoolSize, maxPoolSize);
  const sizes = Array.from({ length: poolCount }, () => target);
  let remaining = participantCount - target * poolCount;

  if (remaining > 0) {
    while (remaining > 0) {
      let changed = false;
      for (let index = 0; index < sizes.length && remaining > 0; index += 1) {
        const current = sizes[index];
        if (current === undefined || current >= maxPoolSize) {
          continue;
        }
        sizes[index] = current + 1;
        remaining -= 1;
        changed = true;
      }
      if (!changed) {
        return undefined;
      }
    }
  } else if (remaining < 0) {
    while (remaining < 0) {
      let changed = false;
      for (let index = sizes.length - 1; index >= 0 && remaining < 0; index -= 1) {
        const current = sizes[index];
        if (current === undefined || current <= minPoolSize) {
          continue;
        }
        sizes[index] = current - 1;
        remaining += 1;
        changed = true;
      }
      if (!changed) {
        return undefined;
      }
    }
  }

  return sizes.sort((left, right) => right - left);
}

function estimateTournamentDurationMinutes(
  poolSizes: number[],
  arenaCount: number,
  matchMinutes: number,
  timeBetweenMatchesMinutes: number,
): number {
  const poolDurations = poolSizes.map((size) => calculatePoolDurationMinutes(size, matchMinutes, timeBetweenMatchesMinutes));
  return chunkDurations(poolDurations, arenaCount).reduce((sum, duration) => sum + duration, 0);
}

function calculatePoolDurationMinutes(poolSize: number, matchMinutes: number, timeBetweenMatchesMinutes: number): number {
  const matchCount = (poolSize * (poolSize - 1)) / 2;
  if (matchCount <= 0) {
   return 0;
  }

  const exactMinutes = (matchCount * matchMinutes) + Math.max(0, matchCount - 1) * timeBetweenMatchesMinutes;
  return roundUpToFive(Math.max(matchMinutes + timeBetweenMatchesMinutes, exactMinutes));
}

function chunkDurations(durations: number[], arenaCount: number): number[] {
  if (durations.length === 0) {
    return [];
  }

  const sorted = [...durations].sort((left, right) => right - left);
  const waveLengths: number[] = [];
  for (let index = 0; index < sorted.length; index += arenaCount) {
    waveLengths.push(Math.max(...sorted.slice(index, index + arenaCount)));
  }

  return waveLengths;
}

function compareScores(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundUpToFive(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return "0 min";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }

  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

if (!customElements.get("event-planner-view")) {
  customElements.define("event-planner-view", EventPlannerView);
}

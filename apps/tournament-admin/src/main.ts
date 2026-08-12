import "@hema/ui";
import "./styles.css";

type ParticipantKind = "FIGHTER" | "OFFICIAL";
type ParticipantSkill = "JUDGE" | "JURY" | "TABLE";
type PoolRole = "FIGHTER" | ParticipantSkill;

interface Participant {
  id: string;
  name: string;
  kind: ParticipantKind;
  skills: ParticipantSkill[];
}

interface TimeSlot {
  id: string;
  label: string;
  order: number;
}

interface Arena {
  id: string;
  name: string;
  order: number;
}

interface Stage {
  id: string;
  name: string;
  type: "POOL" | "ELIMINATION" | "FINAL";
  ruleset: string;
}

type ActiveDialog = "participant" | "timeslot" | "arena";

interface PoolAssignment {
  id: string;
  participantId: string;
  role: PoolRole;
}

interface Pool {
  id: string;
  name: string;
  eventId: string;
  stageId: string;
  timeSlotId: string;
  arenaId: string;
  assignments: PoolAssignment[];
}

interface EventModel {
  id: string;
  name: string;
  ruleset: string;
  participants: Participant[];
  timeSlots: TimeSlot[];
  arenas: Arena[];
  stages: Stage[];
  pools: Pool[];
}

interface AppState {
  events: EventModel[];
  selectedEventId: string;
  showOfficialRoles: boolean;
  filteredTimeSlotIds: string[];
  activeDialog: ActiveDialog | undefined;
  participantName: string;
  participantKind: ParticipantKind;
  participantSkills: ParticipantSkill[];
  timeSlotLabel: string;
  arenaName: string;
  notice: string | undefined;
}

const roleLabels: Record<PoolRole, string> = {
  FIGHTER: "Fighter",
  JUDGE: "Ref",
  JURY: "Jury",
  TABLE: "Table",
};

const skillLabels: Record<ParticipantSkill, string> = {
  JUDGE: "Judge",
  JURY: "Jury",
  TABLE: "Table",
};

const skillOrder: ParticipantSkill[] = ["JUDGE", "JURY", "TABLE"];

const app = document.querySelector<HTMLDivElement>("#app")!;

const state: AppState = createInitialState();
let noticeTimer: number | undefined;

app.addEventListener("click", handleClick);
app.addEventListener("change", handleChange);
app.addEventListener("input", handleInput);
app.addEventListener("submit", handleSubmit);
app.addEventListener("dragstart", handleDragStart);
app.addEventListener("dragover", handleDragOver);
app.addEventListener("drop", handleDrop);

render();

function createInitialState(): AppState {
  return {
    events: [
      {
        id: "event-1",
        name: "Voorbeeldtoernooi",
        ruleset: "Round robin",
        participants: [
          ...Array.from({ length: 20 }, (_value, index) => ({
            id: `fighter-${String(index + 1).padStart(2, "0")}`,
            name: `fighter-${String(index + 1).padStart(2, "0")}`,
            kind: "FIGHTER" as const,
            skills: [],
          })),
          { id: "official-1", name: "judge-01", kind: "OFFICIAL", skills: ["JUDGE"] },
          { id: "official-2", name: "jury-01", kind: "OFFICIAL", skills: ["JURY"] },
          { id: "official-3", name: "table-01", kind: "OFFICIAL", skills: ["TABLE"] },
        ],
        timeSlots: [
          { id: "slot-1", label: "09:00", order: 1 },
        ],
        arenas: [
          { id: "arena-1", name: "Arena A", order: 1 },
        ],
        stages: [
          {
            id: "stage-1",
            name: "Poolfase",
            type: "POOL",
            ruleset: "Round robin",
          },
        ],
        pools: [],
      },
      {
        id: "event-2",
        name: "Open training",
        ruleset: "Open format",
        participants: [],
        timeSlots: [],
        arenas: [],
        stages: [
          {
            id: "stage-2",
            name: "Vrije opzet",
            type: "FINAL",
            ruleset: "Open format",
          },
        ],
        pools: [],
      },
    ],
    selectedEventId: "event-1",
    showOfficialRoles: true,
    filteredTimeSlotIds: [],
    activeDialog: undefined,
    participantName: "",
    participantKind: "FIGHTER",
    participantSkills: [],
    timeSlotLabel: "",
    arenaName: "",
    notice: undefined,
  };
}

function render(): void {
  const event = getSelectedEvent();
  const stage = event.stages[0];
  if (!stage) {
    throw new Error("Selected event has no stage.");
  }
  const timeSlots = [...event.timeSlots].sort((left, right) => left.order - right.order);
  const arenas = [...event.arenas].sort((left, right) => left.order - right.order);

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="title">
          <h1>Tournament admin <span class="stage-pill stage-pill-${escapeHtml(stage.type.toLowerCase())}">${escapeHtml(stage.name)}</span></h1>
        </div>
        <div class="topbar-tools">
          <div class="topbar-actions">
            <button class="button secondary topbar-action" type="button" data-action="open-dialog" data-dialog="participant">Add participant</button>
            <button class="button secondary topbar-action" type="button" data-action="open-dialog" data-dialog="timeslot">Add timeslot</button>
            <button class="button secondary topbar-action" type="button" data-action="open-dialog" data-dialog="arena">Add arena</button>
            <label class="header-switch" title="Toon of verberg ref/jury/table">
              <input data-bind="showOfficialRoles" type="checkbox"${state.showOfficialRoles ? " checked" : ""} />
              <span class="header-switch-track" aria-hidden="true"></span>
              <span class="header-switch-label">Officials</span>
            </label>
          </div>
          <select class="select" data-bind="selectedEventId">
            ${state.events
              .map(
                (item) =>
                  `<option value="${escapeHtml(item.id)}"${item.id === state.selectedEventId ? " selected" : ""}>${escapeHtml(item.name)}</option>`,
              )
              .join("")}
          </select>
          <span class="tag">${escapeHtml(event.ruleset)}</span>
          <span class="tag">${escapeHtml(stage.name)} · ${escapeHtml(stage.type)}</span>
        </div>
      </header>

      ${state.notice ? `<div class="notice notice-toast" role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` : ""}

      <div class="layout">
        <aside class="sidebar">
          <section class="panel">
            <h2>Deelnemers</h2>
            <div class="people">
              ${renderParticipantGroup(event, event.participants, "FIGHTER")}
              ${renderParticipantGroup(event, event.participants, "OFFICIAL")}
            </div>
          </section>
        </aside>

        <main class="board-shell">
          <section
            class="grid${state.showOfficialRoles ? "" : " compact"}"
            style="--slot-count: ${Math.max(timeSlots.length, 1)}; grid-template-rows: 30px repeat(${Math.max(arenas.length, 1)}, ${state.showOfficialRoles ? "minmax(0, 1fr)" : "auto"});"
          >
            <div class="grid-header">
              <div class="corner" aria-hidden="true"></div>
              ${timeSlots.map((slot) => renderTimeSlotHeader(slot)).join("")}
            </div>

            ${arenas.map((arena) => renderArenaRow(event, stage, arenas, timeSlots, arena)).join("")}
          </section>
        </main>
      </div>
      ${renderActiveDialog()}
    </div>
  `;
}

function renderActiveDialog(): string {
  switch (state.activeDialog) {
    case "participant":
      return renderParticipantDialog();
    case "timeslot":
      return renderTimeSlotDialog();
    case "arena":
      return renderArenaDialog();
    default:
      return "";
  }
}

function renderParticipantDialog(): string {
  return `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="participant-dialog-title">
      <form class="modal-card" data-form-action="add-participant">
        <header class="modal-header">
          <div>
            <h2 id="participant-dialog-title">Add participant</h2>
            <p class="hint">Voeg een fighter of vrijwilliger toe.</p>
          </div>
          <button class="button ghost modal-close" type="button" data-action="close-dialog">Close</button>
        </header>

        <div class="form-row">
          <label>
            <span class="section-label">Name</span>
            <input class="text-input" data-bind="participantName" value="${escapeHtml(state.participantName)}" placeholder="Naam" autofocus />
          </label>
          <label>
            <span class="section-label">Type</span>
            <select class="select" data-bind="participantKind">
              <option value="FIGHTER"${state.participantKind === "FIGHTER" ? " selected" : ""}>Fighter</option>
              <option value="OFFICIAL"${state.participantKind === "OFFICIAL" ? " selected" : ""}>Vrijwilliger</option>
            </select>
          </label>
        </div>

        <div class="form-row">
          <span class="section-label">Skills</span>
          <div class="skill-picker">
            ${skillOrder
              .map(
                (skill) => `
                  <label class="skill-toggle">
                    <input
                      type="checkbox"
                      data-bind="participantSkill"
                      value="${escapeHtml(skill)}"
                      ${state.participantSkills.includes(skill) ? "checked" : ""}
                    />
                    <span>${escapeHtml(skillLabels[skill])}</span>
                  </label>
                `,
              )
              .join("")}
          </div>
          <span class="hint">Vrijwilligers kunnen meerdere skills hebben.</span>
        </div>

        <div class="modal-actions">
          <button class="button" type="submit">Add participant</button>
        </div>
      </form>
    </section>
  `;
}

function renderTimeSlotDialog(): string {
  return `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="timeslot-dialog-title">
      <form class="modal-card modal-card-narrow" data-form-action="add-timeslot">
        <header class="modal-header">
          <div>
            <h2 id="timeslot-dialog-title">Add timeslot</h2>
            <p class="hint">Voeg een nieuw tijdslot toe.</p>
          </div>
          <button class="button ghost modal-close" type="button" data-action="close-dialog">Close</button>
        </header>

        <div class="form-row">
          <label>
            <span class="section-label">Timeslot label</span>
            <input class="text-input" data-bind="timeSlotLabel" value="${escapeHtml(state.timeSlotLabel)}" placeholder="Bijv. 09:00" autofocus />
          </label>
        </div>

        <div class="modal-actions">
          <button class="button" type="submit">Add timeslot</button>
        </div>
      </form>
    </section>
  `;
}

function renderArenaDialog(): string {
  return `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="arena-dialog-title">
      <form class="modal-card modal-card-narrow" data-form-action="add-arena">
        <header class="modal-header">
          <div>
            <h2 id="arena-dialog-title">Add arena</h2>
            <p class="hint">Voeg een nieuwe arena toe.</p>
          </div>
          <button class="button ghost modal-close" type="button" data-action="close-dialog">Close</button>
        </header>

        <div class="form-row">
          <label>
            <span class="section-label">Arena name</span>
            <input class="text-input" data-bind="arenaName" value="${escapeHtml(state.arenaName)}" placeholder="Bijv. Arena A" autofocus />
          </label>
        </div>

        <div class="modal-actions">
          <button class="button" type="submit">Add arena</button>
        </div>
      </form>
    </section>
  `;
}

function renderParticipantGroup(event: EventModel, participants: Participant[], kind: ParticipantKind): string {
  const filteredSlotIds = new Set(state.filteredTimeSlotIds);
  const items = participants
    .filter((participant) => participant.kind === kind)
    .filter((participant) => !isParticipantAssignedInAnyFilteredSlot(event, participant.id, filteredSlotIds));
  const fighterAssignments = new Set(
    event.pools.flatMap((pool) =>
      pool.assignments
        .filter((assignment) => assignment.role === "FIGHTER")
        .map((assignment) => assignment.participantId),
    ),
  );
  return `
    <div class="group">
      <h3>${kind === "FIGHTER" ? "Fighters" : "Vrijwilligers"}</h3>
      ${items.length === 0
        ? `<div class="participant-empty">Geen ${kind === "FIGHTER" ? "fighters" : "vrijwilligers"} voor deze filter.</div>`
        : `<div class="participant-list">
        ${items
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(
            (participant) => `
              <button
                class="chip participant-chip${kind === "FIGHTER" && fighterAssignments.has(participant.id) ? " participant-chip-fighter" : ""}"
                draggable="true"
                type="button"
                data-drag-kind="participant"
                data-participant-id="${escapeHtml(participant.id)}"
                title="Sleep naar een pool-rol"
              >
                <span class="participant-name">${escapeHtml(participant.name)}</span>
                <span class="participant-meta">
                  ${kind === "FIGHTER"
                    ? renderFighterAssignmentTag(event, participant.id)
                    : `${renderSkillTags(participant.skills)}${renderParticipantAssignmentTags(event, participant.id)}`}
                </span>
              </button>
            `,
          )
          .join("")}
      </div>`}
    </div>
  `;
}

function isParticipantAssignedInAnyFilteredSlot(
  event: EventModel,
  participantId: string,
  filteredSlotIds: Set<string>,
): boolean {
  if (filteredSlotIds.size === 0) {
    return false;
  }

  return event.pools.some((pool) =>
    filteredSlotIds.has(pool.timeSlotId) &&
    pool.assignments.some((assignment) => assignment.participantId === participantId),
  );
}

function renderTimeSlotHeader(slot: TimeSlot): string {
  const active = state.filteredTimeSlotIds.includes(slot.id);
  return `
    <div class="slot-header${active ? " filtered" : ""}">
      <strong>${escapeHtml(slot.label)}</strong>
      <label class="slot-filter" title="Toon alleen niet-ingeplande deelnemers voor ${escapeHtml(slot.label)}">
        <input
          type="checkbox"
          data-bind="participantTimeSlotFilter"
          value="${escapeHtml(slot.id)}"
          ${active ? "checked" : ""}
        />
        <span class="slot-filter-track" aria-hidden="true"></span>
      </label>
    </div>
  `;
}

function renderArenaRow(
  event: EventModel,
  stage: Stage,
  arenas: Arena[],
  timeSlots: TimeSlot[],
  arena: Arena,
): string {
  return `
    <div class="grid-row">
      <div class="arena-header">
        <div>
          <strong>${escapeHtml(arena.name)}</strong>
          <div class="hint">Arena ${arena.order}</div>
        </div>
      </div>
      ${timeSlots
        .map((slot) => renderCell(event, stage, arena, slot))
        .join("")}
    </div>
  `;
}

function renderCell(event: EventModel, stage: Stage, arena: Arena, slot: TimeSlot): string {
  const pool = event.pools.find(
    (item) => item.arenaId === arena.id && item.timeSlotId === slot.id && item.stageId === stage.id,
  );

  if (!pool) {
    return `
      <div class="cell">
        <div class="cell-empty">
          <button
            class="button"
            type="button"
            data-action="create-pool"
            data-arena-id="${escapeHtml(arena.id)}"
            data-timeslot-id="${escapeHtml(slot.id)}"
          >
            Pool toevoegen
          </button>
        </div>
      </div>
    `;
  }

  const participantsById = new Map(event.participants.map((participant) => [participant.id, participant]));

  return `
    <div class="cell">
      <article class="pool-card">
        <div class="pool-head">
          <div>
            <strong>${escapeHtml(pool.name)}</strong>
            <div class="hint">${escapeHtml(slot.label)} · ${escapeHtml(arena.name)}</div>
          </div>
          <button class="button ghost" type="button" data-action="delete-pool" data-pool-id="${escapeHtml(pool.id)}">Verwijder</button>
        </div>
        ${
          state.showOfficialRoles
            ? `<div class="pool-officials">
                ${renderRoleZone(pool, participantsById, "JUDGE")}
                ${renderRoleZone(pool, participantsById, "JURY")}
                ${renderRoleZone(pool, participantsById, "TABLE")}
                ${renderRoleZone(pool, participantsById, "FIGHTER")}
              </div>`
            : `<div class="pool-fighters-only">
                ${renderRoleZone(pool, participantsById, "FIGHTER", true)}
              </div>`
        }
      </article>
    </div>
  `;
}

function renderRoleZone(
  pool: Pool,
  participantsById: Map<string, Participant>,
  role: PoolRole,
  compact = false,
): string {
  const assignments = pool.assignments.filter((assignment) => assignment.role === role);
  return `
    <section
      class="role-zone${compact ? " fighters-only" : ""}"
      data-drop-zone="pool-role"
      data-pool-id="${escapeHtml(pool.id)}"
      data-role="${escapeHtml(role)}"
    >
      <div class="role-title">${roleLabels[role]}</div>
      <div class="assignment-list">
        ${assignments
          .map((assignment) => renderAssignmentChip(assignment, participantsById))
          .join("")}
      </div>
    </section>
  `;
}

function renderAssignmentChip(
  assignment: PoolAssignment,
  participantsById: Map<string, Participant>,
): string {
  const participant = participantsById.get(assignment.participantId);
  if (!participant) return "";
  return `
    <div class="assignment-chip">
      <span>${escapeHtml(participant.name)}</span>
      <button type="button" data-action="delete-assignment" data-assignment-id="${escapeHtml(assignment.id)}">×</button>
    </div>
  `;
}

function renderSkillTags(skills: ParticipantSkill[]): string {
  if (skills.length === 0) {
    return `<span class="tag tag-muted">geen skill</span>`;
  }

  return skills.map((skill) => `<span class="tag">${escapeHtml(skillLabels[skill])}</span>`).join("");
}

function renderParticipantAssignmentTags(event: EventModel, participantId: string): string {
  const assignments = getParticipantAssignments(event, participantId);
  if (assignments.length === 0) {
    return `<span class="tag tag-muted">vrij</span>`;
  }

  return assignments
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(
      (assignment) => `
        <span class="tag">
          ${escapeHtml(assignment.poolName)} · ${escapeHtml(assignment.slotLabel)} · ${escapeHtml(assignment.arenaName)} · ${escapeHtml(roleLabels[assignment.role])}
        </span>
      `,
    )
    .join("");
}

function renderFighterAssignmentTag(event: EventModel, participantId: string): string {
  const assignments = getParticipantAssignments(event, participantId).sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  if (assignments.length === 0) {
    return `<span class="tag tag-muted">niet ingedeeld</span>`;
  }

  const assignment = assignments[0];
  return `<span class="tag">${escapeHtml(assignment.poolName)} · ${escapeHtml(assignment.slotLabel)} · ${escapeHtml(assignment.arenaName)}</span>`;
}

function getParticipantAssignments(
  event: EventModel,
  participantId: string,
): Array<{ poolName: string; slotLabel: string; arenaName: string; role: PoolRole; sortKey: string }> {
  const slotById = new Map(event.timeSlots.map((slot) => [slot.id, slot]));
  const arenaById = new Map(event.arenas.map((arena) => [arena.id, arena]));

  return event.pools.flatMap((pool) => {
    const slot = slotById.get(pool.timeSlotId);
    const arena = arenaById.get(pool.arenaId);
    if (!slot || !arena) return [];

    return pool.assignments
      .filter((assignment) => assignment.participantId === participantId)
      .map((assignment) => ({
        poolName: pool.name,
        slotLabel: slot.label,
        arenaName: arena.name,
        role: assignment.role,
        sortKey: `${slot.order}-${arena.order}-${pool.name}-${assignment.role}`,
      }));
  });
}

function handleClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
  if (!target) return;

  switch (target.dataset.action) {
    case "open-dialog":
      openDialog(target.dataset.dialog as ActiveDialog | undefined);
      break;
    case "close-dialog":
      closeDialog();
      break;
    case "create-pool":
      createPool(target.dataset.arenaId, target.dataset.timeslotId);
      break;
    case "delete-pool":
      deletePool(target.dataset.poolId);
      break;
    case "delete-assignment":
      deleteAssignment(target.dataset.assignmentId);
      break;
    default:
      break;
  }
}

function handleSubmit(event: SubmitEvent): void {
  const form = event.target as HTMLFormElement | null;
  if (!form) return;
  const action = form.dataset.formAction;
  if (!action) return;

  event.preventDefault();

  switch (action) {
    case "add-participant":
      addParticipant(true);
      break;
    case "add-timeslot":
      addTimeSlot(true);
      break;
    case "add-arena":
      addArena(true);
      break;
    default:
      break;
  }
}

function handleChange(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target || !("dataset" in target)) return;
  if (target.dataset.bind === "selectedEventId") {
    state.selectedEventId = target.value;
    state.filteredTimeSlotIds = [];
    render();
    return;
  }

  if (target.dataset.bind === "showOfficialRoles") {
    const input = target as HTMLInputElement;
    state.showOfficialRoles = input.checked;
    render();
    return;
  }

  if (target.dataset.bind === "participantTimeSlotFilter") {
    const input = target as HTMLInputElement;
    const slotId = input.value;
    state.filteredTimeSlotIds = input.checked
      ? state.filteredTimeSlotIds.includes(slotId)
        ? state.filteredTimeSlotIds
        : [...state.filteredTimeSlotIds, slotId]
      : state.filteredTimeSlotIds.filter((item) => item !== slotId);
    render();
    return;
  }

  if (target.dataset.bind === "participantSkill") {
    const input = target as HTMLInputElement;
    const skill = input.value as ParticipantSkill;
    if (input.checked) {
      state.participantSkills = state.participantSkills.includes(skill)
        ? state.participantSkills
        : [...state.participantSkills, skill];
    } else {
      state.participantSkills = state.participantSkills.filter((item) => item !== skill);
    }
    render();
  }
}

function handleInput(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target || !("dataset" in target)) return;

  switch (target.dataset.bind) {
    case "participantName":
      state.participantName = target.value;
      break;
    case "participantKind":
      state.participantKind = target.value === "OFFICIAL" ? "OFFICIAL" : "FIGHTER";
      break;
    case "timeSlotLabel":
      state.timeSlotLabel = target.value;
      break;
    case "arenaName":
      state.arenaName = target.value;
      break;
    default:
      break;
  }
}

function handleDragStart(event: DragEvent): void {
  const target = closestParticipantElement(event.target);
  if (!target) return;
  event.dataTransfer?.setData("text/plain", target.dataset.participantId ?? "");
  event.dataTransfer?.setData("application/x-participant-kind", getParticipantKind(target.dataset.participantId ?? ""));
}

function handleDragOver(event: DragEvent): void {
  const target = closestDropZoneElement(event.target);
  if (!target) return;
  event.preventDefault();
  target.classList.add("drag-over");
}

function handleDrop(event: DragEvent): void {
  const zone = closestDropZoneElement(event.target);
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("drag-over");

  const participantId = event.dataTransfer?.getData("text/plain");
  if (!participantId) return;

  const poolId = zone.dataset.poolId;
  const role = zone.dataset.role as PoolRole | undefined;
  if (!poolId || !role) return;

  assignParticipantToPool(poolId, participantId, role);
}

function closestParticipantElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-drag-kind='participant']");
}

function closestDropZoneElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-drop-zone='pool-role']");
}

function openDialog(dialog: ActiveDialog | undefined): void {
  if (!dialog) return;
  state.activeDialog = dialog;
  render();
}

function closeDialog(): void {
  state.activeDialog = undefined;
  render();
}

function addParticipant(closeModal = false): boolean {
  const event = getSelectedEvent();
  const name = state.participantName.trim();
  if (!name) {
    flash("Geef eerst een naam op.");
    return false;
  }

  event.participants.push({
    id: `participant-${crypto.randomUUID()}`,
    name,
    kind: state.participantKind,
    skills: [...state.participantSkills],
  });

  state.participantName = "";
  state.participantSkills = [];
  if (closeModal) {
    state.activeDialog = undefined;
  }
  flash(`${name} toegevoegd.`);
  return true;
}

function addTimeSlot(closeModal = false): boolean {
  const event = getSelectedEvent();
  const label = state.timeSlotLabel.trim();
  if (!label) {
    flash("Geef eerst een tijdslotnaam op.");
    return false;
  }

  event.timeSlots.push({
    id: `slot-${crypto.randomUUID()}`,
    label,
    order: event.timeSlots.length + 1,
  });

  state.timeSlotLabel = "";
  if (closeModal) {
    state.activeDialog = undefined;
  }
  flash(`Tijdslot ${label} toegevoegd.`);
  return true;
}

function addArena(closeModal = false): boolean {
  const event = getSelectedEvent();
  const name = state.arenaName.trim();
  if (!name) {
    flash("Geef eerst een arenanaam op.");
    return false;
  }

  event.arenas.push({
    id: `arena-${crypto.randomUUID()}`,
    name,
    order: event.arenas.length + 1,
  });

  state.arenaName = "";
  if (closeModal) {
    state.activeDialog = undefined;
  }
  flash(`Arena ${name} toegevoegd.`);
  return true;
}

function createPool(arenaId?: string, timeSlotId?: string): void {
  if (!arenaId || !timeSlotId) return;
  const event = getSelectedEvent();
  const stage = event.stages[0];
  if (!stage) {
    flash("Dit event heeft nog geen stage.");
    return;
  }
  const existing = event.pools.find(
    (pool) => pool.stageId === stage.id && pool.arenaId === arenaId && pool.timeSlotId === timeSlotId,
  );
  if (existing) {
    flash("In deze cel staat al een pool.");
    return;
  }

  const poolNumber = event.pools.filter((pool) => pool.stageId === stage.id).length + 1;
  event.pools.push({
    id: `pool-${crypto.randomUUID()}`,
    name: `Pool ${poolNumber}`,
    eventId: event.id,
    stageId: stage.id,
    timeSlotId,
    arenaId,
    assignments: [],
  });

  flash(`Pool ${poolNumber} aangemaakt.`);
  render();
}

function deletePool(poolId?: string): void {
  if (!poolId) return;
  const event = getSelectedEvent();
  event.pools = event.pools.filter((pool) => pool.id !== poolId);
  flash("Pool verwijderd.");
  render();
}

function deleteAssignment(assignmentId?: string): void {
  if (!assignmentId) return;
  const event = getSelectedEvent();
  for (const pool of event.pools) {
    const nextAssignments = pool.assignments.filter((assignment) => assignment.id !== assignmentId);
    if (nextAssignments.length !== pool.assignments.length) {
      pool.assignments = nextAssignments;
      flash("Toewijzing verwijderd.");
      render();
      return;
    }
  }
}

function assignParticipantToPool(poolId: string, participantId: string, role: PoolRole): void {
  const event = getSelectedEvent();
  const participant = event.participants.find((item) => item.id === participantId);
  if (!participant) {
    flash("Onbekende deelnemer.");
    return;
  }

  const pool = event.pools.find((item) => item.id === poolId);
  if (!pool) {
    flash("Onbekende pool.");
    return;
  }

  const alreadyInSlot = event.pools.some(
    (item) => item.timeSlotId === pool.timeSlotId && item.assignments.some((assignment) => assignment.participantId === participantId),
  );
  if (alreadyInSlot) {
    flash(`${participant.name} is al ingepland in dit tijdslot.`);
    return;
  }

  if (
    role === "FIGHTER" &&
    event.pools.some((item) => item.assignments.some((assignment) => assignment.participantId === participantId && assignment.role === "FIGHTER"))
  ) {
    flash(`${participant.name} staat al ergens als Fighter.`);
    return;
  }

  pool.assignments.push({
    id: `assignment-${crypto.randomUUID()}`,
    participantId,
    role,
  });

  flash(`${participant.name} toegewezen aan ${roleLabels[role]}.`);
  render();
}

function getSelectedEvent(): EventModel {
  const event = state.events.find((item) => item.id === state.selectedEventId);
  if (!event) throw new Error("Selected event not found.");
  return event;
}

function getParticipantKind(participantId: string): ParticipantKind {
  const event = getSelectedEvent();
  const participant = event.participants.find((item) => item.id === participantId);
  return participant?.kind ?? "FIGHTER";
}

function flash(message: string): void {
  state.notice = message;
  render();
  if (noticeTimer !== undefined) {
    window.clearTimeout(noticeTimer);
  }
  noticeTimer = window.setTimeout(() => {
    state.notice = undefined;
    render();
  }, 1200);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

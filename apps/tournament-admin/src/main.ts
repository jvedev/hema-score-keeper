import "@hema/ui";
import "./styles.css";

type ParticipantKind = "FIGHTER" | "OFFICIAL";
type PoolRole = "FIGHTER" | "JUDGE" | "JURY" | "TELLER" | "TABLE";

interface Participant {
  id: string;
  name: string;
  kind: ParticipantKind;
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
  participantName: string;
  participantKind: ParticipantKind;
  timeSlotLabel: string;
  arenaName: string;
  notice?: string;
}

const roleLabels: Record<PoolRole, string> = {
  FIGHTER: "Speler",
  JUDGE: "Judge",
  JURY: "Jury",
  TELLER: "Teller",
  TABLE: "Tafel",
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found.");

const state: AppState = createInitialState();
let noticeTimer: number | undefined;

app.addEventListener("click", handleClick);
app.addEventListener("change", handleChange);
app.addEventListener("input", handleInput);
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
          })),
          { id: "official-1", name: "judge-01", kind: "OFFICIAL" },
          { id: "official-2", name: "jury-01", kind: "OFFICIAL" },
          { id: "official-3", name: "teller-01", kind: "OFFICIAL" },
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
    participantName: "",
    participantKind: "FIGHTER",
    timeSlotLabel: "",
    arenaName: "",
  };
}

function render(): void {
  const event = getSelectedEvent();
  const stage = event.stages[0];
  const timeSlots = [...event.timeSlots].sort((left, right) => left.order - right.order);
  const arenas = [...event.arenas].sort((left, right) => left.order - right.order);

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="title">
          <h1>Tournament admin</h1>
          <p>Desktop planner voor events, pools, arena's en officials.</p>
        </div>
        <div class="topbar-tools">
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

      <div class="layout">
        <aside class="sidebar">
          <section class="panel">
            <h2>Event tools</h2>
            <div class="form-row">
              <label>
                <span class="section-label">Deelnemer naam</span>
                <input class="text-input" data-bind="participantName" value="${escapeHtml(state.participantName)}" placeholder="Naam" />
              </label>
              <label>
                <span class="section-label">Type</span>
                <select class="select" data-bind="participantKind">
                  <option value="FIGHTER"${state.participantKind === "FIGHTER" ? " selected" : ""}>Fighter</option>
                  <option value="OFFICIAL"${state.participantKind === "OFFICIAL" ? " selected" : ""}>Official</option>
                </select>
              </label>
              <button class="button" data-action="add-participant">Deelnemer toevoegen</button>
            </div>

            <div class="form-row">
              <label>
                <span class="section-label">Tijdslot</span>
                <input class="text-input" data-bind="timeSlotLabel" value="${escapeHtml(state.timeSlotLabel)}" placeholder="Bijv. 09:00" />
              </label>
              <button class="button secondary" data-action="add-timeslot">Tijdslot toevoegen</button>
            </div>

            <div class="form-row">
              <label>
                <span class="section-label">Arena</span>
                <input class="text-input" data-bind="arenaName" value="${escapeHtml(state.arenaName)}" placeholder="Bijv. Arena A" />
              </label>
              <button class="button secondary" data-action="add-arena">Arena toevoegen</button>
            </div>

            ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
          </section>

          <section class="panel">
            <h2>Deelnemers</h2>
            <div class="people">
              ${renderParticipantGroup(event.participants, "FIGHTER")}
              ${renderParticipantGroup(event.participants, "OFFICIAL")}
            </div>
          </section>
        </aside>

        <main class="board-shell">
          <section class="stage-summary">
            <div>
              <strong>${escapeHtml(event.name)}</strong>
              <span class="hint">Selecteer een event, beheer de rasterstructuur en sleep deelnemers naar de juiste pool-rol.</span>
            </div>
            <span class="tag">${timeSlots.length} slots · ${arenas.length} arenas · ${event.pools.length} pools</span>
          </section>

          <section class="grid" style="--slot-count: ${Math.max(timeSlots.length, 1)}">
            <div class="grid-header">
              <div class="corner">
                <strong>Arena / slot</strong>
                <div class="hint">Raster</div>
              </div>
              ${timeSlots.map(renderTimeSlotHeader).join("")}
            </div>

            ${arenas.map((arena) => renderArenaRow(event, stage, arenas, timeSlots, arena)).join("")}
          </section>
        </main>
      </div>
    </div>
  `;
}

function renderParticipantGroup(participants: Participant[], kind: ParticipantKind): string {
  const items = participants.filter((participant) => participant.kind === kind);
  return `
    <div class="group">
      <h3>${kind === "FIGHTER" ? "Fighters" : "Officials"}</h3>
      <div class="participant-list">
        ${items
          .map(
            (participant) => `
              <button
                class="chip"
                draggable="true"
                type="button"
                data-drag-kind="participant"
                data-participant-id="${escapeHtml(participant.id)}"
                title="Sleep naar een pool-rol"
              >
                ${escapeHtml(participant.name)}
                <small>${kind === "FIGHTER" ? "speler" : "official"}</small>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTimeSlotHeader(slot: TimeSlot): string {
  return `
    <div class="slot-header">
      <strong>${escapeHtml(slot.label)}</strong>
      <span class="hint">Tijdslot ${slot.order}</span>
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

        <div class="pool-summary">
          ${renderPoolSummary(pool, participantsById)}
        </div>

        <div class="role-grid">
          ${renderRoleZone(pool, participantsById, "FIGHTER")}
          ${renderRoleZone(pool, participantsById, "JUDGE")}
          ${renderRoleZone(pool, participantsById, "JURY")}
          ${renderRoleZone(pool, participantsById, "TELLER")}
          ${renderRoleZone(pool, participantsById, "TABLE")}
        </div>
      </article>
    </div>
  `;
}

function renderPoolSummary(
  pool: Pool,
  participantsById: Map<string, Participant>,
): string {
  if (pool.assignments.length === 0) {
    return `<div class="hint">Nog geen spelers of officials toegewezen.</div>`;
  }

  return `
    <div class="assignment-summary">
      ${pool.assignments
        .map((assignment) => {
          const participant = participantsById.get(assignment.participantId);
          if (!participant) return "";
          return `
            <div class="summary-pill">
              <span class="tag">${roleLabels[assignment.role]}</span>
              <strong>${escapeHtml(participant.name)}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderRoleZone(
  pool: Pool,
  participantsById: Map<string, Participant>,
  role: PoolRole,
): string {
  const assignments = pool.assignments.filter((assignment) => assignment.role === role);
  return `
    <section
      class="role-zone"
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

function handleClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
  if (!target) return;

  switch (target.dataset.action) {
    case "add-participant":
      addParticipant();
      break;
    case "add-timeslot":
      addTimeSlot();
      break;
    case "add-arena":
      addArena();
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

function handleChange(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target || !("dataset" in target)) return;
  if (target.dataset.bind === "selectedEventId") {
    state.selectedEventId = target.value;
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
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drag-kind='participant']");
  if (!target) return;
  event.dataTransfer?.setData("text/plain", target.dataset.participantId ?? "");
  event.dataTransfer?.setData("application/x-participant-kind", getParticipantKind(target.dataset.participantId ?? ""));
}

function handleDragOver(event: DragEvent): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-zone='pool-role']");
  if (!target) return;
  event.preventDefault();
  target.classList.add("drag-over");
}

function handleDrop(event: DragEvent): void {
  const zone = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-drop-zone='pool-role']");
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

function addParticipant(): void {
  const event = getSelectedEvent();
  const name = state.participantName.trim();
  if (!name) {
    flash("Geef eerst een naam op.");
    return;
  }

  event.participants.push({
    id: `participant-${crypto.randomUUID()}`,
    name,
    kind: state.participantKind,
  });

  state.participantName = "";
  flash(`${name} toegevoegd.`);
  render();
}

function addTimeSlot(): void {
  const event = getSelectedEvent();
  const label = state.timeSlotLabel.trim();
  if (!label) {
    flash("Geef eerst een tijdslotnaam op.");
    return;
  }

  event.timeSlots.push({
    id: `slot-${crypto.randomUUID()}`,
    label,
    order: event.timeSlots.length + 1,
  });

  state.timeSlotLabel = "";
  flash(`Tijdslot ${label} toegevoegd.`);
  render();
}

function addArena(): void {
  const event = getSelectedEvent();
  const name = state.arenaName.trim();
  if (!name) {
    flash("Geef eerst een arenanaam op.");
    return;
  }

  event.arenas.push({
    id: `arena-${crypto.randomUUID()}`,
    name,
    order: event.arenas.length + 1,
  });

  state.arenaName = "";
  flash(`Arena ${name} toegevoegd.`);
  render();
}

function createPool(arenaId?: string, timeSlotId?: string): void {
  if (!arenaId || !timeSlotId) return;
  const event = getSelectedEvent();
  const stage = event.stages[0];
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

  if (participant.kind === "FIGHTER" && role !== "FIGHTER") {
    flash("Fighters kunnen alleen in de speler-rol worden gezet.");
    return;
  }
  if (participant.kind === "OFFICIAL" && role === "FIGHTER") {
    flash("Officials kunnen niet als speler worden gezet.");
    return;
  }

  const pool = event.pools.find((item) => item.id === poolId);
  if (!pool) {
    flash("Onbekende pool.");
    return;
  }

  const poolsInSameSlot = event.pools.filter((item) => item.timeSlotId === pool.timeSlotId);
  for (const existingPool of poolsInSameSlot) {
    existingPool.assignments = existingPool.assignments.filter(
      (assignment) => assignment.participantId !== participantId,
    );
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
  }, 2200);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

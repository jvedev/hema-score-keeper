import "./styles.css";
import {
  CompetitionAdminApi,
  type Club,
  type Competition,
  type Participant,
  type User,
} from "./api";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root not found.");
}
const root = app;

const api = new CompetitionAdminApi();

let currentUser: User | null = null;
let clubs: Club[] = [];
let users: User[] = [];
let competitions: Competition[] = [];
let participantsByCompetition = new Map<string, Participant[]>();
let flashMessage = "";
let pageError = "";
let loading = true;

void bootstrap();

async function bootstrap(): Promise<void> {
  if (!api.getSession()) {
    loading = false;
    renderLogin();
    return;
  }

  try {
    currentUser = await api.me();
    await loadDashboardData();
    loading = false;
    renderDashboard();
  } catch {
    api.setSession(null);
    currentUser = null;
    loading = false;
    renderLogin();
  }
}

async function loadDashboardData(): Promise<void> {
  const [clubList, userList, competitionList] = await Promise.all([
    api.listClubs(),
    api.listUsers(),
    api.listCompetitions(),
  ]);

  const participantEntries = await Promise.all(
    competitionList.map(async (competition) => [competition.id, await api.listParticipants(competition.id)] as const),
  );

  clubs = clubList;
  users = userList;
  competitions = competitionList;
  participantsByCompetition = new Map(participantEntries);
}

function renderLogin(): void {
  root.innerHTML = `
    <main class="page">
      <section class="hero login-panel">
        <p class="eyebrow">Phase 1</p>
        <h1>Competition admin</h1>
        <p class="lead">Login met club, username en password om competitions en clubs te beheren.</p>
        ${pageError ? `<p class="alert alert-error">${escapeHtml(pageError)}</p>` : ""}
        <form id="login-form" class="form-stack">
          <label>
            <span>Club slug</span>
            <input name="clubSlug" autocomplete="organization" required />
          </label>
          <label>
            <span>Username</span>
            <input name="username" autocomplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <label class="checkbox">
            <input name="rememberMe" type="checkbox" checked />
            <span>Remember me</span>
          </label>
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#login-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    pageError = "";
    flashMessage = "";
    const data = new FormData(form);
    try {
      currentUser = await api.login({
        clubSlug: String(data.get("clubSlug") ?? ""),
        username: String(data.get("username") ?? ""),
        password: String(data.get("password") ?? ""),
        rememberMe: data.get("rememberMe") === "on",
      });
      await loadDashboardData();
      renderDashboard();
    } catch (error) {
      pageError = error instanceof Error ? error.message : "Login failed.";
      renderLogin();
    }
  });
}

function renderDashboard(): void {
  const userLabel = currentUser ? `${currentUser.username} (${currentUser.role})` : "Unknown";
  root.innerHTML = `
    <main class="page">
      <header class="topbar">
        <div>
          <p class="eyebrow">Competition admin</p>
          <h1>Dashboard</h1>
          <p class="lead">Signed in as ${escapeHtml(userLabel)}.</p>
        </div>
        <button id="logout-button" class="secondary">Log out</button>
      </header>

      ${flashMessage ? `<p class="alert">${escapeHtml(flashMessage)}</p>` : ""}
      ${pageError ? `<p class="alert alert-error">${escapeHtml(pageError)}</p>` : ""}

      <section class="grid">
        <article class="card">
          <h2>Clubs</h2>
          <form id="club-form" class="form-stack compact">
            <label>
              <span>Name</span>
              <input name="name" required />
            </label>
            <label>
              <span>Slug</span>
              <input name="slug" required />
            </label>
            <button type="submit">Create club</button>
          </form>
          <div class="list">
            ${clubs.map((club) => `<div class="list-item"><strong>${escapeHtml(club.name)}</strong><span>${escapeHtml(club.slug)}</span></div>`).join("") || "<p class=\"muted\">No clubs yet.</p>"}
          </div>
        </article>

        <article class="card">
          <h2>Users</h2>
          <form id="user-form" class="form-stack compact">
            <label>
              <span>Club</span>
              <select name="clubId" required>
                ${renderClubOptions(clubs, true)}
              </select>
            </label>
            <label>
              <span>Username</span>
              <input name="username" required />
            </label>
            <label>
              <span>Role</span>
              <select name="role">
                <option value="USER">USER</option>
                <option value="COMPETITION_ADMIN">COMPETITION_ADMIN</option>
                <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
              </select>
            </label>
            <button type="submit">Create user</button>
          </form>
          <div class="list">
            ${users.map((user) => renderUserRow(user)).join("") || "<p class=\"muted\">No users yet.</p>"}
          </div>
        </article>
      </section>

      <section class="card">
        <h2>Competitions</h2>
        <form id="competition-form" class="form-stack compact inline-grid">
          <label>
            <span>Name</span>
            <input name="name" required />
          </label>
          <label>
            <span>Slug</span>
            <input name="slug" required />
          </label>
          <label>
            <span>Date</span>
            <input name="date" type="date" required />
          </label>
          <label>
            <span>Visibility</span>
            <select name="visibility">
              <option value="PUBLIC">PUBLIC</option>
              <option value="CLUB_ONLY">CLUB_ONLY</option>
            </select>
          </label>
          <label>
            <span>Club</span>
            <select name="clubId">
              <option value="">No club</option>
              ${renderClubOptions(clubs, false)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <input name="status" value="DRAFT" />
          </label>
          <button type="submit">Create competition</button>
        </form>

        <div class="competition-list">
          ${competitions.map((competition) => renderCompetitionCard(competition)).join("") || "<p class=\"muted\">No competitions yet.</p>"}
        </div>
      </section>
    </main>
  `;

  document.querySelector<HTMLButtonElement>("#logout-button")?.addEventListener("click", async () => {
    try {
      await api.logout();
    } finally {
      currentUser = null;
      clubs = [];
      users = [];
      competitions = [];
      participantsByCompetition = new Map();
      renderLogin();
    }
  });

  document.querySelector<HTMLFormElement>("#club-form")?.addEventListener("submit", handleCreateClub);
  document.querySelector<HTMLFormElement>("#user-form")?.addEventListener("submit", handleCreateUser);
  document.querySelector<HTMLFormElement>("#competition-form")?.addEventListener("submit", handleCreateCompetition);
  document.querySelectorAll<HTMLFormElement>("[data-participant-form]").forEach((form) => {
    form.addEventListener("submit", handleCreateParticipant);
  });
  document.querySelectorAll<HTMLFormElement>("[data-user-role-form]").forEach((form) => {
    form.addEventListener("submit", handleUpdateUserRole);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-enrollment-button]").forEach((button) => {
    button.addEventListener("click", handleCreateEnrollmentToken);
  });
}

async function handleCreateClub(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  try {
    await api.createClub({
      name: String(data.get("name") ?? ""),
      slug: String(data.get("slug") ?? ""),
    });
    flashMessage = "Club created.";
    pageError = "";
    await loadDashboardData();
    renderDashboard();
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Unable to create club.";
    renderDashboard();
  }
}

async function handleCreateUser(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  try {
    await api.createUser({
      clubId: toNullableString(data.get("clubId")),
      username: String(data.get("username") ?? ""),
      role: (String(data.get("role") ?? "USER") as User["role"]),
      status: "INVITED",
    });
    flashMessage = "User created. Generate an enrollment token to send a QR code.";
    pageError = "";
    await loadDashboardData();
    renderDashboard();
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Unable to create user.";
    renderDashboard();
  }
}

async function handleUpdateUserRole(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const userId = form.dataset.userId;
  if (!userId) {
    return;
  }

  const data = new FormData(form);
  try {
    await api.updateUser(userId, {
      role: String(data.get("role") ?? "USER") as User["role"],
    });
    flashMessage = "User role updated.";
    pageError = "";
    await loadDashboardData();
    renderDashboard();
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Unable to update user.";
    renderDashboard();
  }
}

async function handleCreateEnrollmentToken(event: Event): Promise<void> {
  const button = event.currentTarget as HTMLButtonElement | null;
  const userId = button?.dataset.userId;
  if (!button || !userId) {
    return;
  }

  try {
    const token = await api.createEnrollmentToken(userId);
    flashMessage = `Enrollment token created. Default club: ${token.defaultClubSlug ?? "none"} · ${token.token}`;
    pageError = "";
    renderDashboard();
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Unable to create enrollment token.";
    renderDashboard();
  }
}

async function handleCreateCompetition(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  const visibility = String(data.get("visibility") ?? "PUBLIC") as "PUBLIC" | "CLUB_ONLY";
  const clubId = toNullableString(data.get("clubId"));

  try {
    await api.createCompetition({
      name: String(data.get("name") ?? ""),
      slug: String(data.get("slug") ?? ""),
      date: String(data.get("date") ?? ""),
      status: String(data.get("status") ?? "DRAFT"),
      visibility,
      clubId: visibility === "CLUB_ONLY" ? clubId : null,
    });
    flashMessage = "Competition created.";
    pageError = "";
    await loadDashboardData();
    renderDashboard();
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Unable to create competition.";
    renderDashboard();
  }
}

async function handleCreateParticipant(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const competitionId = form.dataset.competitionId;
  if (!competitionId) {
    return;
  }

  const data = new FormData(form);
  try {
    await api.createParticipant(competitionId, {
      name: String(data.get("name") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
      clubId: toNullableString(data.get("clubId")),
      userId: toNullableString(data.get("userId")),
      kind: String(data.get("kind") ?? "MEMBER") as "MEMBER" | "GUEST",
    });
    flashMessage = "Participant added.";
    pageError = "";
    await loadDashboardData();
    renderDashboard();
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Unable to create participant.";
    renderDashboard();
  }
}

function renderCompetitionCard(competition: Competition): string {
  const participants = participantsByCompetition.get(competition.id) ?? [];
  const clubOptions = renderClubOptions(clubs, true);
  const userOptions = `<option value="">No linked user</option>${users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.username)} (${escapeHtml(user.role)})</option>`).join("")}`;
  return `
    <article class="subcard">
      <div class="subcard-head">
        <div>
          <strong>${escapeHtml(competition.name)}</strong>
          <p>${escapeHtml(competition.slug)} · ${escapeHtml(competition.status)} · ${escapeHtml(competition.visibility)}</p>
        </div>
        <span>${escapeHtml(competition.date)}</span>
      </div>
      <form class="form-stack compact inline-grid" data-participant-form data-competition-id="${escapeHtml(competition.id)}">
        <label>
          <span>Name</span>
          <input name="name" required />
        </label>
        <label>
          <span>Display name</span>
          <input name="displayName" />
        </label>
        <label>
          <span>Club</span>
          <select name="clubId">
            <option value="">No club</option>
            ${clubOptions}
          </select>
        </label>
        <label>
          <span>Linked user</span>
          <select name="userId">
            ${userOptions}
          </select>
        </label>
        <label class="checkbox">
          <span>Type</span>
          <select name="kind">
            <option value="MEMBER">Member</option>
            <option value="GUEST">Guest</option>
          </select>
        </label>
        <button type="submit">Add participant</button>
      </form>
      <div class="list">
        ${participants.map((participant) => `<div class="list-item"><strong>${escapeHtml(participant.name)}</strong><span>${escapeHtml(participant.displayName ?? "")} · ${escapeHtml(participant.kind.toLowerCase())}${participant.userId ? ` · user ${escapeHtml(participant.userId)}` : ""}</span></div>`).join("") || "<p class=\"muted\">No participants yet.</p>"}
      </div>
    </article>
  `;
}

function renderUserRow(user: User): string {
  return `
    <form class="list-item user-row" data-user-role-form data-user-id="${escapeHtml(user.id)}">
      <div>
        <strong>${escapeHtml(user.username)}</strong>
        <span>${escapeHtml(user.status)}${user.clubId ? ` · ${escapeHtml(findClubSlug(user.clubId))}` : ""}</span>
      </div>
      <select name="role">
        <option value="USER" ${user.role === "USER" ? "selected" : ""}>USER</option>
        <option value="COMPETITION_ADMIN" ${user.role === "COMPETITION_ADMIN" ? "selected" : ""}>COMPETITION_ADMIN</option>
        <option value="SYSTEM_ADMIN" ${user.role === "SYSTEM_ADMIN" ? "selected" : ""}>SYSTEM_ADMIN</option>
      </select>
      <button type="submit" class="secondary">Save</button>
      <button type="button" class="secondary" data-enrollment-button data-user-id="${escapeHtml(user.id)}">QR token</button>
    </form>
  `;
}

function renderClubOptions(items: Club[], includeBlank: boolean): string {
  const options = items.map((club) => `<option value="${escapeHtml(club.id)}">${escapeHtml(club.name)} (${escapeHtml(club.slug)})</option>`).join("");
  return includeBlank ? `<option value="">No club</option>${options}` : options;
}

function findClubSlug(clubId: string): string {
  return clubs.find((club) => club.id === clubId)?.slug ?? clubId;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

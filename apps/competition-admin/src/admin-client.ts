import type {
  AdminUser,
  BoutResponse,
  Club,
  CompetitionAdminEntry,
  CompetitionDetail,
  CompetitionSummary,
  HistoryBout,
  NeedsYouResponse,
  ObjectionResolution,
  ParticipantRow,
  PersonSearchResult,
  StandingRow,
} from "./api-types";

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

/** The login is gone (refresh failed); the admin has to sign in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your login has expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

/** A refused request, with the server's message and any extra details (such as a checklist). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SESSION_KEY = "hema-competition-admin.session";

interface AuthResponse {
  user: { id: string; name: string; language?: string; role: AdminUser["role"] };
  accessToken: string;
  refreshToken: string;
}

const e = encodeURIComponent;

export class AdminClient {
  #session: Session | null;
  /** The refresh in flight, shared by every request that hits a 401 meanwhile (refresh tokens are single use). */
  #refreshing: Promise<void> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly storage: Storage = localStorage,
  ) {
    this.#session = readSession(storage);
  }

  currentSession(): Session | null {
    return this.#session;
  }

  async login(username: string, password: string): Promise<Session> {
    return this.#store(await this.#send<AuthResponse>("POST", "/auth/login", { username, password, rememberMe: true }, false));
  }

  async logout(): Promise<void> {
    const session = this.#session;
    this.#forget();
    if (session) {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }).catch(() => undefined);
    }
  }

  async setLanguage(language: "en" | "nl"): Promise<void> {
    await this.#send("PATCH", "/auth/me", { language });
    if (this.#session) {
      this.#session = { ...this.#session, user: { ...this.#session.user, language } };
      this.storage.setItem(SESSION_KEY, JSON.stringify(this.#session));
    }
  }

  needsYou = () => this.#send<NeedsYouResponse>("GET", "/admin/needs-you");
  competitions = () => this.#send<CompetitionSummary[]>("GET", "/competitions/admin");
  competition = (id: string) => this.#send<CompetitionDetail>("GET", `/competitions/${e(id)}`);
  createCompetition = (input: { name: string; slug: string; date: string }) => this.#send<CompetitionDetail>("POST", "/competitions", input);
  patchCompetition = (id: string, changes: Record<string, unknown>) => this.#send<CompetitionDetail>("PATCH", `/competitions/${e(id)}`, changes);
  transition = (id: string, action: string) => this.#send<CompetitionDetail>("POST", `/competitions/${e(id)}/transitions`, { action });
  standings = (id: string) => this.#send<StandingRow[]>("GET", `/competitions/${e(id)}/standings`);
  boutHistory = (id: string) => this.#send<HistoryBout[]>("GET", `/competitions/${e(id)}/bout-history`);
  participants = (id: string) => this.#send<ParticipantRow[]>("GET", `/competitions/${e(id)}/participants`);
  addParticipant = (id: string, input: { name: string; userId: string }) => this.#send<ParticipantRow>("POST", `/competitions/${e(id)}/participants`, input);
  bout = (boutId: string) => this.#send<BoutResponse>("GET", `/bouts/${e(boutId)}`);
  resolveObjection = (boutId: string, body: ObjectionResolution) => this.#send<BoutResponse>("POST", `/bouts/${e(boutId)}/resolution`, body);
  admins = (id: string) => this.#send<CompetitionAdminEntry[]>("GET", `/competitions/${e(id)}/admins`);
  addAdmin = (id: string, userId: string) => this.#send<CompetitionAdminEntry[]>("POST", `/competitions/${e(id)}/admins`, { userId });
  removeAdmin = (id: string, userId: string) => this.#send<CompetitionAdminEntry[]>("DELETE", `/competitions/${e(id)}/admins/${e(userId)}`);
  transferOwnership = (id: string, userId: string) => this.#send<CompetitionAdminEntry[]>("POST", `/competitions/${e(id)}/owner`, { userId });
  searchPeople = (query: string) => this.#send<PersonSearchResult[]>("GET", `/people?q=${e(query)}`);
  clubs = () => this.#send<Club[]>("GET", "/clubs");

  async #send<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
    const usedToken = this.#session?.accessToken;
    let response = await this.#fetch(method, path, body, authenticated);
    if (response.status === 401 && authenticated) {
      // Another request may have refreshed already; only refresh when the token is still the one that failed.
      if (this.#session && this.#session.accessToken === usedToken) {
        this.#refreshing ??= this.#refresh().finally(() => (this.#refreshing = null));
      }
      await (this.#refreshing ?? Promise.resolve());
      response = await this.#fetch(method, path, body, authenticated);
      if (response.status === 401) {
        this.#forget();
        throw new SessionExpiredError();
      }
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: unknown };
      throw new ApiError(payload.error ?? response.statusText, response.status, payload.details);
    }
    return (await response.json()) as T;
  }

  #fetch(method: string, path: string, body: unknown, authenticated: boolean): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (authenticated && this.#session) {
      headers.Authorization = `Bearer ${this.#session.accessToken}`;
    }
    return fetch(`${this.baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }

  async #refresh(): Promise<void> {
    if (!this.#session) {
      throw new SessionExpiredError();
    }
    const response = await this.#fetch("POST", "/auth/refresh", { refreshToken: this.#session.refreshToken }, false);
    if (!response.ok) {
      this.#forget();
      throw new SessionExpiredError();
    }
    this.#store((await response.json()) as AuthResponse);
  }

  #store(response: AuthResponse): Session {
    this.#session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: { id: response.user.id, name: response.user.name, language: response.user.language === "nl" ? "nl" : "en", role: response.user.role },
    };
    this.storage.setItem(SESSION_KEY, JSON.stringify(this.#session));
    return this.#session;
  }

  #forget(): void {
    this.#session = null;
    this.storage.removeItem(SESSION_KEY);
  }
}

function readSession(storage: Storage): Session | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    return session && typeof session.accessToken === "string" ? session : null;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  name: string;
  language: "en" | "nl";
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface CompetitionOption {
  id: string;
  name: string;
}

export interface PersonOption {
  userId: string;
  name: string;
  clubName: string | null;
}

export interface CompetitionChoice {
  startedIn: { id: string; name: string; rulesetJson: unknown };
  others: CompetitionOption[];
}

/** The login is gone (refresh failed); the operator has to sign in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your login has expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

const SESSION_KEY = "hema-score-keeper.session";

interface AuthResponse {
  user: { id: string; name: string; language?: string };
  accessToken: string;
  refreshToken: string;
}

/** Talks to the backend for competition bouts; refreshes the login once when it expires. */
export class CompetitionClient {
  #session: Session | null;

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
    const response = await this.#send<AuthResponse>("POST", "/auth/login", { username, password, rememberMe: true }, false);
    return this.#store(response);
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

  async runningCompetitions(): Promise<CompetitionOption[]> {
    const competitions = await this.#send<Array<{ id: string; name: string; status: string }>>("GET", "/competitions");
    return competitions.filter((competition) => competition.status === "RUNNING").map(({ id, name }) => ({ id, name }));
  }

  async participants(competitionId: string): Promise<PersonOption[]> {
    const participants = await this.#send<Array<{ name: string; userId: string | null }>>(
      "GET",
      `/competitions/${encodeURIComponent(competitionId)}/participants`,
    );
    // Only participants with an account can fight a competition bout.
    return participants
      .filter((participant): participant is { name: string; userId: string } => participant.userId !== null)
      .map((participant) => ({ userId: participant.userId, name: participant.name, clubName: null }));
  }

  competitionOptions(fighterA: string, fighterB: string, startedIn: string): Promise<CompetitionChoice> {
    const query = new URLSearchParams({ fighterA, fighterB, startedIn });
    return this.#send("GET", `/bouts/competition-options?${query.toString()}`);
  }

  searchPeople(query: string): Promise<PersonOption[]> {
    return this.#send("GET", `/people?q=${encodeURIComponent(query)}`);
  }

  recordBout(input: unknown): Promise<{ id: string; status: string }> {
    return this.#send("POST", "/bouts", input);
  }

  approveAsReferee(boutId: string, onSpot: { A: boolean; B: boolean }): Promise<{ id: string; status: string }> {
    return this.#send("POST", `/bouts/${encodeURIComponent(boutId)}/referee-approval`, { fightersApprovedOnSpot: onSpot });
  }

  async #send<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
    let response = await this.#fetch(method, path, body, authenticated);
    if (response.status === 401 && authenticated) {
      await this.#refresh();
      response = await this.#fetch(method, path, body, authenticated);
      if (response.status === 401) {
        this.#forget();
        throw new SessionExpiredError();
      }
    }
    if (!response.ok) {
      throw new Error(await errorMessage(response));
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
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
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
      user: { id: response.user.id, name: response.user.name, language: response.user.language === "nl" ? "nl" : "en" },
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
    return session && typeof session.accessToken === "string" && typeof session.refreshToken === "string" ? session : null;
  } catch {
    return null;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

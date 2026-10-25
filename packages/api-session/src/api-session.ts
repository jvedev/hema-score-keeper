/** The account fields the backend's login, refresh and register responses carry. */
export interface AuthUser {
  id: string;
  name: string;
  language?: string;
  role?: string;
  clubId?: string | null;
}

/** `POST /auth/login`, `/auth/refresh` and `/auth/register`. */
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Session<User> {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/** The login is gone (refresh failed); the user has to sign in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your login has expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

/** A refused request, with the server's message and any extra details (such as a checklist or a refusal reason). */
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

export interface ApiSessionOptions<User> {
  /** API root, e.g. `/api/v1`. */
  baseUrl: string;
  storage: Storage;
  /** Where the session is kept in `storage`. */
  storageKey: string;
  /** Turns the server's account into what the app remembers. */
  toUser(user: AuthUser): User;
}

/**
 * A signed-in session against the backend: stores the tokens, sends requests with the access token
 * and refreshes it on a 401. Refresh tokens are single use, so requests that hit a 401 together
 * wait for one shared refresh instead of each spending the token. Tabs share the stored session:
 * before refreshing, and when a refresh is refused, a newer session another tab stored is used
 * instead, and a failure only removes the stored session when it is still the one that failed. When the retry
 * with such an adopted session is refused too (its access token also expired), it is refreshed once more.
 */
export class ApiSession<User> {
  #session: Session<User> | null;
  /** The refresh in flight, shared by every request that hits a 401 meanwhile. */
  #refreshing: Promise<void> | null = null;
  /** Sessions taken over from another tab's storage without refreshing them here; their access token may have expired. */
  readonly #adopted = new WeakSet<Session<User>>();

  constructor(private readonly options: ApiSessionOptions<User>) {
    this.#session = readSession<User>(options.storage, options.storageKey);
  }

  current(): Session<User> | null {
    return this.#session;
  }

  /** Sends a JSON request; `authenticated` requests carry the access token and refresh it once on a 401. */
  async send<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
    const usedToken = this.#session?.accessToken;
    let response = await this.#fetch(method, path, body, authenticated);
    if (response.status === 401 && authenticated) {
      let retried = await this.#refreshUnless(usedToken);
      response = await this.#fetch(method, path, body, authenticated);
      // The retry used a session another tab stored without refreshing it; its access token may have expired
      // too while every tab sat idle, so refresh that one once more (bounded: a single extra round).
      if (response.status === 401 && retried !== null && this.#adopted.has(retried)) {
        retried = await this.#refreshUnless(retried.accessToken);
        response = await this.#fetch(method, path, body, authenticated);
      }
      if (response.status === 401) {
        this.#forgetFailed(retried);
        throw new SessionExpiredError();
      }
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: unknown };
      throw new ApiError(payload.error ?? response.statusText, response.status, payload.details);
    }
    return (await response.json()) as T;
  }

  /** Remembers the tokens and user from a login, refresh or register response. */
  store(response: AuthResponse): Session<User> {
    this.#session = { accessToken: response.accessToken, refreshToken: response.refreshToken, user: this.options.toUser(response.user) };
    this.#save();
    return this.#session;
  }

  /** Changes the remembered user (e.g. after saving the language). */
  update(changes: Partial<User>): void {
    if (this.#session) {
      this.#session = { ...this.#session, user: { ...this.#session.user, ...changes } };
      this.#save();
    }
  }

  forget(): void {
    this.#session = null;
    this.options.storage.removeItem(this.options.storageKey);
  }

  /** Forgets the session straight away, then asks the server to end it (failures ignored). */
  async logout(): Promise<void> {
    const session = this.#session;
    this.forget();
    if (session) {
      await fetch(`${this.options.baseUrl}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }).catch(() => undefined);
    }
  }

  #fetch(method: string, path: string, body: unknown, authenticated: boolean): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (authenticated && this.#session) {
      headers.Authorization = `Bearer ${this.#session.accessToken}`;
    }
    return fetch(`${this.options.baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }

  /**
   * Refreshes unless another request already replaced the access token that failed (`usedToken`), waits for the
   * refresh in flight, and returns the session the retry will use.
   */
  async #refreshUnless(usedToken: string | undefined): Promise<Session<User> | null> {
    if (this.#session && this.#session.accessToken === usedToken) {
      this.#refreshing ??= this.#refresh().finally(() => (this.#refreshing = null));
    }
    await (this.#refreshing ?? Promise.resolve());
    return this.#session;
  }

  async #refresh(): Promise<void> {
    const stale = this.#session;
    if (!stale) {
      throw new SessionExpiredError();
    }
    // Another tab may have refreshed already, spending the refresh token this tab still holds.
    if (this.#adoptNewerStored(stale)) {
      return;
    }
    const response = await this.#fetch("POST", "/auth/refresh", { refreshToken: stale.refreshToken }, false);
    if (!response.ok) {
      // Refused because another tab spent the token first: use what it stored.
      if (this.#adoptNewerStored(stale)) {
        return;
      }
      this.#forgetFailed(stale);
      throw new SessionExpiredError();
    }
    this.store((await response.json()) as AuthResponse);
  }

  /** Takes over the stored session when it differs from `stale`; false when there is none or it is the same one. */
  #adoptNewerStored(stale: Session<User>): boolean {
    const stored = readSession<User>(this.options.storage, this.options.storageKey);
    if (stored === null || sameTokens(stored, stale)) {
      return false;
    }
    this.#session = stored;
    this.#adopted.add(stored);
    return true;
  }

  /** Forgets `failed` here; the stored session is only removed while it is still that one (another tab may have a newer one). */
  #forgetFailed(failed: Session<User> | null): void {
    this.#session = null;
    const stored = readSession<User>(this.options.storage, this.options.storageKey);
    if (stored !== null && (failed === null || sameTokens(stored, failed))) {
      this.options.storage.removeItem(this.options.storageKey);
    }
  }

  #save(): void {
    this.options.storage.setItem(this.options.storageKey, JSON.stringify(this.#session));
  }
}

function sameTokens(a: Session<unknown>, b: Session<unknown>): boolean {
  return a.accessToken === b.accessToken && a.refreshToken === b.refreshToken;
}

function readSession<User>(storage: Storage, key: string): Session<User> | null {
  try {
    const raw = storage.getItem(key);
    const session = raw ? (JSON.parse(raw) as Session<User>) : null;
    return session && typeof session.accessToken === "string" ? session : null;
  } catch {
    return null;
  }
}

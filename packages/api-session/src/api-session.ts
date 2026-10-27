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

/**
 * The login could not be refreshed because the server was unreachable or failing (a network error, a timeout, a 5xx).
 * The stored session is kept: this is being offline, not being signed out.
 */
export class RefreshUnavailableError extends TypeError {
  constructor(readonly status: number | null = null) {
    super("Could not refresh the login right now. Check the connection and try again.");
    this.name = "RefreshUnavailableError";
  }
}

/** Per-request options for `ApiSession.send`. */
export interface SendOptions {
  /** Extra request headers. */
  headers?: Readonly<Record<string, string>>;
  /** Gives up (aborts the request, headers and body) after this many milliseconds. The refresh a 401 triggers gets the same limit. */
  timeoutMs?: number;
  /** How to read a successful response: JSON (default) or the raw bytes as a Blob (a file download). */
  responseType?: "json" | "blob";
}

/** An abort signal that fires after `ms`, and `clear` to stop its timer once the request is over. */
export interface TimeoutSignal {
  signal: AbortSignal;
  clear(): void;
}

/**
 * `AbortSignal.timeout(ms)` where the browser has it. Older tablets lack it: there an AbortController and a timer do
 * the same (the abort reason is a `TimeoutError`, as with the platform one), and `clear` stops the timer.
 */
export function timeoutSignal(ms: number): TimeoutSignal {
  if (typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), clear: () => undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError()), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function timeoutError(): Error {
  const message = "The request timed out.";
  if (typeof DOMException === "function") {
    return new DOMException(message, "TimeoutError");
  }
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

/** A refused request, with the server's message and any extra details (such as a checklist or a refusal reason). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
    /** The whole JSON error body, for the extra top-level fields some refusals carry (such as a `reason`). */
    readonly body: Readonly<Record<string, unknown>> = {},
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

  /**
   * Sends a JSON request (a Blob, ArrayBuffer or typed array body goes as raw `application/octet-stream` instead);
   * `authenticated` requests carry the access token and refresh it once on a 401.
   */
  async send<T>(method: string, path: string, body?: unknown, authenticated = true, options: SendOptions = {}): Promise<T> {
    // One signal for the whole call: it covers the headers and the body, and any retry after a refresh.
    const timeout = options.timeoutMs !== undefined ? timeoutSignal(options.timeoutMs) : undefined;
    try {
      return await this.#send<T>(method, path, body, authenticated, options, timeout?.signal);
    } finally {
      timeout?.clear();
    }
  }

  async #send<T>(method: string, path: string, body: unknown, authenticated: boolean, options: SendOptions, signal: AbortSignal | undefined): Promise<T> {
    const usedToken = this.#session?.accessToken;
    let response = await this.#fetch(method, path, body, authenticated, options.headers, signal);
    if (response.status === 401 && authenticated) {
      let retried = await this.#refreshUnless(usedToken, options.timeoutMs);
      response = await this.#fetch(method, path, body, authenticated, options.headers, signal);
      // The retry used a session another tab stored without refreshing it; its access token may have expired
      // too while every tab sat idle, so refresh that one once more (bounded: a single extra round).
      if (response.status === 401 && retried !== null && this.#adopted.has(retried)) {
        retried = await this.#refreshUnless(retried.accessToken, options.timeoutMs);
        response = await this.#fetch(method, path, body, authenticated, options.headers, signal);
      }
      if (response.status === 401) {
        this.#forgetFailed(retried);
        throw new SessionExpiredError();
      }
    }
    if (!response.ok) {
      const parsed: unknown = await response.json().catch(() => ({}));
      const payload = (typeof parsed === "object" && parsed !== null ? parsed : {}) as { error?: string; details?: unknown };
      throw new ApiError(payload.error ?? response.statusText, response.status, payload.details, payload);
    }
    return (options.responseType === "blob" ? await response.blob() : await response.json()) as T;
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

  #fetch(method: string, path: string, body: unknown, authenticated: boolean, extraHeaders?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json", ...extraHeaders };
    const raw = isRawBody(body);
    if (body !== undefined) {
      headers["Content-Type"] = raw ? "application/octet-stream" : "application/json";
    }
    if (authenticated && this.#session) {
      headers.Authorization = `Bearer ${this.#session.accessToken}`;
    }
    return fetch(`${this.options.baseUrl}${path}`, { method, headers, ...(signal ? { signal } : {}), ...(body !== undefined ? { body: raw ? (body as BodyInit) : JSON.stringify(body) } : {}) });
  }

  /**
   * Refreshes unless another request already replaced the access token that failed (`usedToken`), waits for the
   * refresh in flight, and returns the session the retry will use.
   */
  async #refreshUnless(usedToken: string | undefined, timeoutMs?: number): Promise<Session<User> | null> {
    if (this.#session && this.#session.accessToken === usedToken) {
      this.#refreshing ??= this.#refresh(timeoutMs).finally(() => (this.#refreshing = null));
    }
    await (this.#refreshing ?? Promise.resolve());
    return this.#session;
  }

  async #refresh(timeoutMs?: number): Promise<void> {
    const stale = this.#session;
    if (!stale) {
      throw new SessionExpiredError();
    }
    // Another tab may have refreshed already, spending the refresh token this tab still holds.
    if (this.#adoptNewerStored(stale)) {
      return;
    }
    // A network error or timeout here throws as it is: being offline keeps the session.
    const timeout = timeoutMs !== undefined ? timeoutSignal(timeoutMs) : undefined;
    let response: Response;
    let refreshed: AuthResponse | null = null;
    try {
      response = await this.#fetch("POST", "/auth/refresh", { refreshToken: stale.refreshToken }, false, undefined, timeout?.signal);
      if (response.ok) {
        refreshed = (await response.json()) as AuthResponse;
      }
    } finally {
      timeout?.clear();
    }
    if (!response.ok) {
      // Refused because another tab spent the token first: use what it stored.
      if (this.#adoptNewerStored(stale)) {
        return;
      }
      // Only a refusal of the token itself (400, 401) ends the login; a failing or unreachable server does not.
      if (response.status !== 400 && response.status !== 401) {
        throw new RefreshUnavailableError(response.status);
      }
      this.#forgetFailed(stale);
      throw new SessionExpiredError();
    }
    this.store(refreshed!);
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

function isRawBody(body: unknown): boolean {
  return body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body);
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

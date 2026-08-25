export interface AppsScriptClientOptions {
  baseUrl: string;
  getIdToken?: () => string | null;
  /** How long a GET response stays cached client-side. Defaults to 30s; pass 0 to disable caching. */
  cacheTtlMs?: number;
}

interface AppsScriptEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 30_000;

export class AppsScriptClient {
  readonly #baseUrl: string;
  readonly #getIdToken: () => string | null;
  readonly #cacheTtlMs: number;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(options: AppsScriptClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#getIdToken = options.getIdToken ?? (() => null);
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async get<T>(
    action: string,
    params: Record<string, string> = {},
    options: { bypassCache?: boolean } = {},
  ): Promise<T> {
    const cacheKey = buildCacheKey(action, params);
    if (!options.bypassCache) {
      const cached = this.#cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as T;
      }
    }

    const url = new URL(this.#baseUrl);
    url.searchParams.set("action", action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), { method: "GET" });
    const data = await this.#parseResponse<T>(response, action);
    if (this.#cacheTtlMs > 0) {
      this.#cache.set(cacheKey, { value: data, expiresAt: Date.now() + this.#cacheTtlMs });
    }
    return data;
  }

  async post<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const idToken = this.#getIdToken();
    if (!idToken) {
      throw new Error(`Action "${action}" requires a signed-in user.`);
    }

    const response = await fetch(this.#baseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, idToken, ...payload }),
    });
    const data = await this.#parseResponse<T>(response, action);
    // A write can change data behind any cached read (ranking, participants, bouts, settings),
    // so the simplest correct invalidation is to drop everything rather than track dependencies.
    this.#cache.clear();
    return data;
  }

  async #parseResponse<T>(response: Response, action: string): Promise<T> {
    let envelope: AppsScriptEnvelope<T>;
    try {
      envelope = (await response.json()) as AppsScriptEnvelope<T>;
    } catch {
      throw new Error(`Action "${action}" returned an unreadable response (status ${response.status}).`);
    }

    if (!response.ok || !envelope.ok) {
      throw new Error(envelope.error ?? `Action "${action}" failed (status ${response.status}).`);
    }

    return envelope.data as T;
  }
}

function buildCacheKey(action: string, params: Record<string, string>): string {
  const sortedParams = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${action}?${new URLSearchParams(sortedParams).toString()}`;
}

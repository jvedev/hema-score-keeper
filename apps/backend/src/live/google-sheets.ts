import { createSign } from "node:crypto";
import type { CellSource, CellValue } from "./cell-source.js";
import { parseA1, toA1, type CellWrite } from "./sheet-layout.js";
import type { CellSink } from "./xlsx-sink.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_TIMEOUT_MS = 10_000;
const TOKEN_MARGIN_MS = 60_000;
const MAX_RANGES_PER_GET = 100;
const MAX_BODY_ERROR = 200;

/** Where each write records its time (same cell as the local backup). */
const LAST_SYNC_SHEET = "Schedule";
const LAST_SYNC_CELL = "H1";

export interface GoogleCredentials {
  email: string;
  privateKey: string;
}

export interface GoogleApiOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Applies to every request to Google, the token request included. */
  timeoutMs?: number;
}

/**
 * A failed Google call. `wholeTarget` means the whole Google target is unusable right now (network, timeout,
 * credentials, access, quota, 5xx, not configured): retrying other bouts one by one would not help.
 * A false value means the problem belongs to one range or sheet (for example a sheet that does not exist).
 * The message never contains the private key or a token.
 */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly wholeTarget: boolean,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

/** Reads the service account from the environment. Null when it is not configured. The key may hold escaped `\n`. */
export function googleCredentials(env: NodeJS.ProcessEnv = process.env): GoogleCredentials | null {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let key = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !key) return null;
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  return { email, privateKey: key.replace(/\\n/g, "\n") };
}

export function notConfiguredError(): GoogleError {
  return new GoogleError("NOT_CONFIGURED: the Google service account is not set up on the server.", true, "NOT_CONFIGURED");
}

/** Removes anything that looks like a key, token or signed assertion from a message, whatever its origin. */
export function scrubSecrets(message: string): string {
  return message
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[redacted key]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*)?/g, "[redacted token]")
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, "[redacted token]");
}

/** Service-account access to the Sheets REST API: a signed JWT is exchanged for a token that is cached until it expires. */
export class GoogleSheetsApi {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly credentials: GoogleCredentials,
    options: GoogleApiOptions = {},
  ) {
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** A JSON call to the Sheets API. Throws GoogleError. */
  async call(method: "GET" | "POST", url: string, body?: unknown): Promise<unknown> {
    const token = await this.accessToken();
    return this.send(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private async accessToken(): Promise<string> {
    const nowMs = this.now().getTime();
    if (this.token && nowMs < this.token.expiresAt - TOKEN_MARGIN_MS) return this.token.value;
    const assertion = this.signAssertion(Math.floor(nowMs / 1000));
    const data = (await this.send(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      },
      true,
    )) as { access_token?: unknown; expires_in?: unknown };
    if (typeof data.access_token !== "string") throw new GoogleError("Google sign-in returned no access token.", true);
    const lifetimeSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
    this.token = { value: data.access_token, expiresAt: nowMs + lifetimeSeconds * 1000 };
    return data.access_token;
  }

  private signAssertion(issuedAt: number): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
      iss: this.credentials.email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    })}`;
    try {
      const signature = createSign("RSA-SHA256").update(unsigned).sign(this.credentials.privateKey).toString("base64url");
      return `${unsigned}.${signature}`;
    } catch {
      // The underlying message may describe the key; keep it out of lastError.
      throw new GoogleError("The Google private key could not be used to sign in. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.", true);
    }
  }

  /**
   * One request with a hard deadline that covers the headers and the whole body: it gives up after `timeoutMs`
   * even if the fetch never settles or the body never ends. `wholeTargetOn400` is for the token request, where a
   * 400 (invalid_grant: wrong credentials) is never a problem of one range.
   */
  private async send(url: string, init: RequestInit, wholeTargetOn400 = false): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new GoogleError(`Google did not answer within ${this.timeoutMs / 1000} s (timeout).`, true, "TIMEOUT"));
      }, this.timeoutMs);
    });
    const exchange = (async () => {
      const response = await this.fetchFn(url, { ...init, signal: controller.signal });
      const text = await response.text();
      return { response, text };
    })();
    exchange.catch(() => undefined); // a late failure after the timeout must not become an unhandled rejection
    try {
      const { response, text } = await Promise.race([exchange, timeout]);
      if (response.status === 401) this.token = null;
      return this.parse(response, text, wholeTargetOn400);
    } catch (error) {
      if (error instanceof GoogleError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new GoogleError(`Google could not be reached: ${scrubSecrets(reason)}`, true, "NETWORK");
    } finally {
      clearTimeout(timer);
    }
  }

  private parse(response: Response, text: string, wholeTargetOn400: boolean): unknown {
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (response.ok) return data ?? {};
    const detail = googleErrorDetail(data);
    const message = `Google answered ${response.status}${detail ? `: ${scrubSecrets(detail).slice(0, MAX_BODY_ERROR)}` : "."}`;
    // On a sheets call, 400 is a problem with one range or sheet; everything else (auth, access, quota, outage)
    // hits the whole target.
    throw new GoogleError(message, wholeTargetOn400 || response.status !== 400, String(response.status));
  }
}

function googleErrorDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const error = (data as { error?: unknown; error_description?: unknown }).error;
  if (typeof error === "string") {
    const description = (data as { error_description?: unknown }).error_description;
    return typeof description === "string" ? `${error} (${description})` : error;
  }
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "";
}

let sharedApi: { key: string; api: GoogleSheetsApi } | null = null;

/** The process-wide API client (so the token is cached across jobs and requests), or null when not configured. */
export function sharedGoogleApi(env: NodeJS.ProcessEnv = process.env): GoogleSheetsApi | null {
  const credentials = googleCredentials(env);
  if (!credentials) return null;
  const key = `${credentials.email}\u0000${credentials.privateKey}`;
  if (!sharedApi || sharedApi.key !== key) sharedApi = { key, api: new GoogleSheetsApi(credentials) };
  return sharedApi.api;
}

/** For tests: forget the cached client and its token. */
export function resetSharedGoogleApi(): void {
  sharedApi = null;
}

function quoteSheet(sheet: string): string {
  return `'${sheet.replace(/'/g, "''")}'`;
}

/**
 * Writes cells with one `values:batchUpdate` (RAW) per call, plus `Schedule!H1` = the time of the write when the
 * spreadsheet has a Schedule sheet (like the xlsx sink). Which sheets exist comes from a metadata read first, which
 * counts against the read quota, not the tighter write quota.
 */
export class GoogleCellSink implements CellSink {
  private readonly now: () => Date;

  constructor(
    private readonly spreadsheetId: string,
    private readonly api: GoogleSheetsApi,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async write(writes: CellWrite[]): Promise<void> {
    const data = writes.map((write) => ({
      range: `${quoteSheet(write.sheet)}!${write.cell}`,
      values: [[write.value ?? ""]],
    }));
    if (await this.hasSheet(LAST_SYNC_SHEET)) {
      data.push({ range: `${quoteSheet(LAST_SYNC_SHEET)}!${LAST_SYNC_CELL}`, values: [[this.now().toISOString()]] });
    }
    await this.api.call("POST", `${SHEETS_URL}/${encodeURIComponent(this.spreadsheetId)}/values:batchUpdate`, {
      valueInputOption: "RAW",
      data,
    });
  }

  private async hasSheet(title: string): Promise<boolean> {
    const meta = (await this.api.call(
      "GET",
      `${SHEETS_URL}/${encodeURIComponent(this.spreadsheetId)}?fields=sheets.properties.title`,
    )) as { sheets?: { properties?: { title?: unknown } }[] };
    return (meta.sheets ?? []).some((sheet) => sheet.properties?.title === title);
  }
}

/** Reads calculated values (`UNFORMATTED_VALUE`) with `values:batchGet`; neighbouring cells of a column share one range. */
export class GoogleCellSource implements CellSource {
  constructor(
    private readonly spreadsheetId: string,
    private readonly api: GoogleSheetsApi,
  ) {}

  async read(sheet: string, cells: string[]): Promise<Map<string, CellValue>> {
    const result = new Map<string, CellValue>();
    const runs = columnRuns(cells);
    for (let start = 0; start < runs.length; start += MAX_RANGES_PER_GET) {
      const chunk = runs.slice(start, start + MAX_RANGES_PER_GET);
      const query = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
      for (const run of chunk) query.append("ranges", `${quoteSheet(sheet)}!${run.a1}`);
      const response = (await this.api.call(
        "GET",
        `${SHEETS_URL}/${encodeURIComponent(this.spreadsheetId)}/values:batchGet?${query.toString()}`,
      )) as { valueRanges?: { values?: unknown[][] }[] };
      chunk.forEach((run, index) => {
        const rows = response.valueRanges?.[index]?.values ?? [];
        for (let offset = 0; offset < run.count; offset += 1) {
          result.set(`${sheet}!${toA1(run.col, run.firstRow + offset)}`, cellValue(rows[offset]?.[0]));
        }
      });
    }
    return result;
  }
}

function cellValue(value: unknown): CellValue {
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

/** Groups cells into single-column runs of consecutive rows ("A2:A500"). Cells are returned in request order per run. */
function columnRuns(cells: string[]): { a1: string; col: number; firstRow: number; count: number }[] {
  const byColumn = new Map<number, Set<number>>();
  for (const cell of cells) {
    const { col, row } = parseA1(cell);
    const rows = byColumn.get(col) ?? new Set<number>();
    rows.add(row);
    byColumn.set(col, rows);
  }
  const runs: { a1: string; col: number; firstRow: number; count: number }[] = [];
  for (const [col, rowSet] of [...byColumn].sort((a, b) => a[0] - b[0])) {
    const rows = [...rowSet].sort((a, b) => a - b);
    let first = rows[0]!;
    let previous = first;
    const close = () => {
      const a1 = first === previous ? toA1(col, first) : `${toA1(col, first)}:${toA1(col, previous)}`;
      runs.push({ a1, col, firstRow: first, count: previous - first + 1 });
    };
    for (const row of rows.slice(1)) {
      if (row !== previous + 1) {
        close();
        first = row;
      }
      previous = row;
    }
    close();
  }
  return runs;
}

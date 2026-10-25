import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendDatabase } from "../src/db.js";
import { isWholeTargetError } from "../src/live/sync-errors.js";
import {
  GoogleCellSink,
  GoogleError,
  GoogleSheetsApi,
  googleCredentials,
  resetSharedGoogleApi,
  scrubSecrets,
} from "../src/live/google-sheets.js";
import { backupPath } from "../src/live/data-dir.js";
import { enqueueSync } from "../src/live/live-store.js";
import { parseA1, toA1, type CellWrite } from "../src/live/sheet-layout.js";
import { createDefaultSinks, runSyncOnce, startSyncWorker, type SinkFactory } from "../src/live/sync-worker.js";
import type { CellSink } from "../src/live/xlsx-sink.js";
import { bearer, createTestContext, insertUser, type TestContext, type TestUser } from "./helpers.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const EMAIL = "sync@example.iam.gserviceaccount.com";
const SPREADSHEET = "sheet-123";
const T0 = new Date("2026-10-25T10:00:00.000Z");

type FetchCall = { url: string; method: string; headers: Record<string, string>; body: string };

/** A fake Google: token endpoint plus whatever `sheets` answers. Records every call. */
function fakeGoogle(sheets: (call: FetchCall) => { status?: number; json?: unknown } | "hang") {
  const calls: FetchCall[] = [];
  let tokens = 0;
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
      body: typeof init?.body === "string" ? init.body : "",
    };
    calls.push(call);
    if (call.url === "https://oauth2.googleapis.com/token") {
      tokens += 1;
      return Response.json({ access_token: `ya29.token-${tokens}`, expires_in: 3600 });
    }
    const answer = sheets(call);
    if (answer === "hang") return new Promise<Response>(() => undefined);
    return Response.json(answer.json ?? {}, { status: answer.status ?? 200 });
  });
  return { fetch: fn as unknown as typeof fetch, calls, tokenCalls: () => calls.filter((call) => call.url.includes("oauth2")) };
}

describe("google sheets client", () => {
  it("signs a JWT and caches the token", async () => {
    let now = T0;
    const google = fakeGoogle(() => ({ json: {} }));
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: google.fetch, now: () => now });

    await api.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x/values:batchGet");
    await api.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x/values:batchGet");
    expect(google.tokenCalls()).toHaveLength(1);
    expect(google.calls[1]!.headers.authorization).toBe("Bearer ya29.token-1");

    const form = new URLSearchParams(google.tokenCalls()[0]!.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = form.get("assertion")!.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: Math.floor(T0.getTime() / 1000),
      exp: Math.floor(T0.getTime() / 1000) + 3600,
    });
    const verifier = createVerify("RSA-SHA256").update(`${header}.${claims}`);
    expect(verifier.verify(createPublicKey(publicKey), Buffer.from(signature, "base64url"))).toBe(true);

    now = new Date(T0.getTime() + 3600_000 - 30_000); // inside the safety margin: a new token
    await api.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x/values:batchGet");
    expect(google.tokenCalls()).toHaveLength(2);
  });

  it("accepts a private key with escaped newlines", () => {
    const escaped = privateKey.replace(/\n/g, "\\n");
    expect(googleCredentials({ GOOGLE_SERVICE_ACCOUNT_EMAIL: EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: `"${escaped}"` })?.privateKey).toBe(privateKey);
    expect(googleCredentials({ GOOGLE_SERVICE_ACCOUNT_EMAIL: EMAIL })).toBeNull();
  });

  /** Answers the spreadsheet metadata read with these sheet titles, and anything else with {}. */
  function withSheets(titles: string[]) {
    return fakeGoogle((call) =>
      call.url.includes("values:") ? { json: {} } : { json: { sheets: titles.map((title) => ({ properties: { title } })) } },
    );
  }

  it("batchUpdate body has the bout range and H1", async () => {
    const google = withSheets(["Pool_1", "Pool 2's", "Schedule"]);
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: google.fetch });
    const sink = new GoogleCellSink(SPREADSHEET, api, { now: () => T0 });
    const writes: CellWrite[] = [
      { sheet: "Pool_1", cell: "D26", value: 2 },
      { sheet: "Pool_1", cell: "E26", value: null },
      { sheet: "Pool 2's", cell: "D26", value: 1 },
    ];
    await sink.write(writes);

    const update = google.calls.find((call) => call.url.includes("values:batchUpdate"))!;
    expect(update.url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET}/values:batchUpdate`);
    expect(update.method).toBe("POST");
    expect(JSON.parse(update.body)).toEqual({
      valueInputOption: "RAW",
      data: [
        { range: "'Pool_1'!D26", values: [[2]] },
        { range: "'Pool_1'!E26", values: [[""]] },
        { range: "'Pool 2''s'!D26", values: [[1]] },
        { range: "'Schedule'!H1", values: [[T0.toISOString()]] },
      ],
    });
    expect(google.calls.filter((call) => call.url.includes("values:batchUpdate"))).toHaveLength(1);
  });

  it("no H1 when the spreadsheet has no Schedule sheet", async () => {
    const google = withSheets(["Pool_1"]);
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: google.fetch });
    await new GoogleCellSink(SPREADSHEET, api, { now: () => T0 }).write([{ sheet: "Pool_1", cell: "D26", value: 2 }]);

    const meta = google.calls.find((call) => !call.url.includes("oauth2") && !call.url.includes("values:"))!;
    expect(meta.url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET}?fields=sheets.properties.title`);
    const updates = google.calls.filter((call) => call.url.includes("values:batchUpdate"));
    expect(updates).toHaveLength(1);
    expect(JSON.parse(updates[0]!.body).data).toEqual([{ range: "'Pool_1'!D26", values: [[2]] }]);
  });

  it("times out a hanging Google, even when the fetch ignores the abort", async () => {
    const google = fakeGoogle(() => "hang");
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: google.fetch, timeoutMs: 30 });
    const error = await api.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleError);
    expect(isWholeTargetError(error)).toBe(true);
    expect(String((error as Error).message)).toContain("timeout");
  });

  it("never puts the key or a token in an error message", async () => {
    const leaky = fakeGoogle(() => ({ status: 500, json: { error: { message: `boom Bearer ya29.secret ${privateKey}` } } }));
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: leaky.fetch });
    const error = (await api.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x").catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("500");
    expect(error.message).not.toContain("ya29");
    expect(error.message).not.toContain("PRIVATE KEY");

    const broken = new GoogleSheetsApi({ email: EMAIL, privateKey: "not a key" }, { fetch: leaky.fetch });
    const signError = (await broken.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x").catch((e: unknown) => e)) as Error;
    expect(signError.message).not.toContain("not a key");
    expect(scrubSecrets(`token eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ4In0.c2ln and ya29.abc`)).not.toMatch(/eyJ|ya29/);
  });
});

describe("google target", () => {
  let ctx: TestContext;
  let db: Kysely<BackendDatabase>;
  let owner: TestUser;
  let dataDir: string;
  const saved = { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY };

  function configure(): void {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = EMAIL;
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
  }

  async function addTournament(id: string, spreadsheetId: string | null = SPREADSHEET): Promise<void> {
    await db
      .insertInto("LiveTournament")
      .values({ id, name: id, mode: "SHEET", layoutVersion: "v3", googleSpreadsheetId: spreadsheetId, createdByUserId: owner.id, createdAt: T0.toISOString() })
      .execute();
  }

  async function addBout(tournamentId: string, boutId: string, headerCell = "B25"): Promise<void> {
    const ringId = `ring-${tournamentId}`;
    await db.insertInto("LiveRing").values({ id: ringId, tournamentId, name: "Ring", order: 1 }).onConflict((c) => c.doNothing()).execute();
    await db
      .insertInto("LiveBout")
      .values({
        id: boutId, tournamentId, ringId, order: 1, label: boutId, sheetName: "Pool_1", headerCell,
        fighterLeft: "L", fighterRight: "R", status: "RUNNING", startedAt: T0.toISOString(), finishedAt: null,
      })
      .execute();
  }

  function request(method: "GET" | "POST", url: string, as: TestUser | null = owner, payload?: object) {
    return ctx.app.inject({ method, url, payload, headers: as ? bearer(as) : {} });
  }

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "live-google-"));
    process.env.LIVE_DATA_DIR = dataDir;
    resetSharedGoogleApi();
    ctx = await createTestContext();
    db = ctx.database;
    owner = await insertUser(db, { id: "owner", role: "USER" });
  });

  afterEach(async () => {
    delete process.env.LIVE_DATA_DIR;
    for (const [name, value] of [["GOOGLE_SERVICE_ACCOUNT_EMAIL", saved.email], ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", saved.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.unstubAllGlobals();
    resetSharedGoogleApi();
    await ctx.app.close();
  });

  it("google failure does not block exchanges", async () => {
    await addTournament("T");
    await addBout("T", "B1");
    for (const mode of ["hang", "500"] as const) {
      const google = fakeGoogle(() => (mode === "hang" ? "hang" : { status: 500, json: { error: { message: "backend error" } } }));
      const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: google.fetch, timeoutMs: 50 });
      const sinks: SinkFactory = (tournamentId, target) => (target === "GOOGLE" ? new GoogleCellSink(SPREADSHEET, api) : null);
      await db.updateTable("LiveSyncJob").set({ lastError: null }).execute();
      const stop = startSyncWorker(db, { intervalMs: 10, sinks });
      try {
        const started = Date.now();
        const response = await request("POST", "/api/v1/live-bouts/B1/exchanges", owner, {
          clientExchangeId: `x-${mode}`, kind: "EXCHANGE", leftPoints: 1, rightPoints: 0,
        });
        expect(response.statusCode).toBe(200);
        expect(Date.now() - started).toBeLessThan(200);

        // Wait for the worker to try Google and fail (timeout or 500).
        let job = await googleJob();
        for (let i = 0; i < 100 && !job.lastError; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          job = await googleJob();
        }
        expect(job.status).toBe("PENDING");
        expect(job.lastError).toMatch(mode === "hang" ? /timeout/i : /500/);
        expect(job.lastError).not.toContain("PRIVATE KEY");
        expect(job.lastError).not.toContain("ya29");
        const state = await db.selectFrom("LiveSyncState").selectAll().where("target", "=", "GOOGLE").executeTakeFirstOrThrow();
        expect(state.lastError).toBe(job.lastError);
      } finally {
        stop();
      }
    }
  });

  async function googleJob() {
    return db.selectFrom("LiveSyncJob").selectAll().where("target", "=", "GOOGLE").executeTakeFirstOrThrow();
  }

  it("a whole-target error backs off the batch once instead of retrying each bout", async () => {
    await addTournament("T", null);
    for (const id of ["B1", "B2", "B3"]) {
      await addBout("T", id, `B${25 + Number(id.slice(1)) * 20}`);
      await db
        .insertInto("LiveExchange")
        .values({ id: `e-${id}`, boutId: id, seq: 1, kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, isDouble: 0, firstScorer: null, clientExchangeId: id, createdByUserId: owner.id, createdAt: T0.toISOString(), undoneAt: null })
        .execute();
      await enqueueSync(db, "T", id, T0);
    }
    const errors: unknown[] = [
      Object.assign(new Error("EBUSY: resource busy or locked, rename 'x'"), { code: "EBUSY" }),
      Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" }),
      new Error("File not found: C:/data/backup.xlsx"),
      new GoogleError("Google answered 503", true),
      new GoogleError("Google did not answer within 10 s (timeout).", true, "TIMEOUT"),
    ];
    for (const error of errors) {
      await db.updateTable("LiveSyncJob").set({ status: "PENDING", attempts: 0, nextAttemptAt: T0.toISOString(), lastError: null }).execute();
      let calls = 0;
      const sink: CellSink = { write: async () => { calls += 1; throw error; } };
      const result = await runSyncOnce(db, () => sink, T0);
      expect(calls).toBe(1);
      expect(result).toEqual({ done: 0, failed: 3 });
      const jobs = await db.selectFrom("LiveSyncJob").select(["status", "attempts"]).execute();
      expect(jobs.every((job) => job.status === "PENDING" && job.attempts === 1)).toBe(true);
    }

    // A problem that belongs to one range still falls back to one write per bout.
    await db.updateTable("LiveSyncJob").set({ status: "PENDING", attempts: 0, nextAttemptAt: T0.toISOString() }).execute();
    let calls = 0;
    const picky: CellSink = {
      write: async (writes) => {
        calls += 1;
        if (writes.length > 31) throw new GoogleError("Google answered 400: Unable to parse range", false, "400");
      },
    };
    const result = await runSyncOnce(db, () => picky, T0);
    expect(calls).toBe(4);
    expect(result.done).toBe(3);
  });

  it("not configured is reported", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    await addTournament("T");
    await addBout("T", "B1");
    await enqueueSync(db, "T", "B1", T0);

    expect(createDefaultSinks(db, {})("T", "GOOGLE")).toBeNull();
    const googleOnly: SinkFactory = (id, target) => (target === "GOOGLE" ? createDefaultSinks(db, {})(id, target) : null);
    const result = await runSyncOnce(db, googleOnly, new Date(T0.getTime() + 1));
    expect(result).toEqual({ done: 0, failed: 0 }); // skipped: the job is left alone
    expect((await googleJob()).status).toBe("PENDING");

    const status = (await request("GET", "/api/v1/live-tournaments/T/sync")).json() as { targets: { target: string; state: string; pending: number }[] };
    expect(status.targets.find((target) => target.target === "GOOGLE")).toMatchObject({ state: "NOT_CONFIGURED", pending: 1 });
    const imported = await request("POST", "/api/v1/live-tournaments/T/import/google");
    expect(imported.statusCode).toBe(503);
    expect(imported.body).toContain("NOT_CONFIGURED");
  });

  it("import from google uses calculated values", async () => {
    configure();
    await addTournament("T");
    const cells: Record<string, Record<string, string | number>> = {
      Schedule: { A2: "Ring A", B2: 1, C2: "Pool_1", D2: "B25", A3: "Ring A", B3: 2, C3: "Pool_1", D3: "H25" },
      Pool_1: { B25: "Match 1", C25: "Ronald", E25: "Diego", H25: "Match 6", I25: "Anna", K25: 0 },
    };
    const google = fakeGoogle((call) => {
      const url = new URL(call.url);
      const ranges = url.searchParams.getAll("ranges").map((range) => {
        const [sheetPart, area] = range.split("!") as [string, string];
        const sheet = sheetPart.replace(/^'|'$/g, "");
        const [from, to = from] = area.split(":") as [string, string?];
        const start = parseA1(from);
        const end = parseA1(to);
        const values: unknown[][] = [];
        for (let row = start.row; row <= end.row; row += 1) {
          const value = cells[sheet]?.[toA1(start.col, row)];
          values.push(value === undefined ? [] : [value]);
        }
        return { range, values };
      });
      return { json: { valueRanges: ranges } };
    });
    vi.stubGlobal("fetch", google.fetch);

    const response = await request("POST", "/api/v1/live-tournaments/T/import/google");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ added: 2, errors: [] });
    const bouts = await db.selectFrom("LiveBout").select(["headerCell", "fighterLeft", "fighterRight"]).orderBy("order").execute();
    expect(bouts).toEqual([
      { headerCell: "B25", fighterLeft: "Ronald", fighterRight: "Diego" },
      { headerCell: "H25", fighterLeft: "Anna", fighterRight: "" },
    ]);
    const gets = google.calls.filter((call) => call.url.includes("values:batchGet"));
    expect(gets.length).toBeGreaterThan(0);
    expect(gets.every((call) => new URL(call.url).searchParams.get("valueRenderOption") === "UNFORMATTED_VALUE")).toBe(true);
    expect(google.tokenCalls()).toHaveLength(1);
  });

  it("import from google reports an unreachable Google instead of a missing sheet", async () => {
    configure();
    await addTournament("T");
    vi.stubGlobal("fetch", fakeGoogle(() => ({ status: 503, json: {} })).fetch);
    const response = await request("POST", "/api/v1/live-tournaments/T/import/google");
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain("PRIVATE KEY");
    expect((await request("POST", "/api/v1/live-tournaments/T/import/google", null)).statusCode).toBe(401);
  });

  it("sync status lists both targets", async () => {
    configure();
    await addTournament("T");
    await addBout("T", "B1");
    await addBout("T", "B2", "H25");
    await enqueueSync(db, "T", "B1", T0);
    await enqueueSync(db, "T", "B2", T0);
    await db.updateTable("LiveSyncJob").set({ status: "FAILED", lastError: "RANGE_OVERFLOW: too many" }).where("boutId", "=", "B2").where("target", "=", "LOCAL").execute();
    await db
      .insertInto("LiveSyncState")
      .values([
        { tournamentId: "T", target: "LOCAL", lastSuccessAt: "2026-10-25T10:00:00.000Z", lastError: "old", lastErrorAt: "2026-10-25T09:00:00.000Z" },
        { tournamentId: "T", target: "GOOGLE", lastSuccessAt: "2026-10-25T09:00:00.000Z", lastError: "Google answered 503", lastErrorAt: "2026-10-25T10:00:00.000Z" },
      ])
      .execute();
    mkdirSync(path.dirname(backupPath("T")), { recursive: true });
    writeFileSync(backupPath("T"), "x");

    const body = (await request("GET", "/api/v1/live-tournaments/T/sync")).json() as { targets: Record<string, unknown>[] };
    expect(body.targets.map((target) => target.target)).toEqual(["LOCAL", "GOOGLE"]);
    expect(body.targets[0]).toMatchObject({ state: "ERROR", pending: 1, failed: 1, lastError: "RANGE_OVERFLOW: too many", lastErrorAt: null }); // stale state error, FAILED job message shown
    expect(body.targets[1]).toMatchObject({ state: "ERROR", pending: 2, failed: 0, lastError: "Google answered 503" });

    // Success after the error: the old error is no longer current.
    await db.updateTable("LiveSyncJob").set({ status: "DONE" }).execute();
    await db.updateTable("LiveSyncState").set({ lastSuccessAt: "2026-10-25T11:00:00.000Z" }).execute();
    const healthy = (await request("GET", "/api/v1/live-tournaments/T/sync")).json() as { targets: Record<string, unknown>[] };
    expect(healthy.targets[0]).toMatchObject({ state: "OK", pending: 0, failed: 0, lastError: null });
    expect(healthy.targets[1]).toMatchObject({ state: "OK", lastError: null, lastSuccessAt: "2026-10-25T11:00:00.000Z" });

    const other = await insertUser(db, { id: "other", role: "USER" });
    expect((await request("GET", "/api/v1/live-tournaments/T/sync", other)).statusCode).toBe(403);
    expect((await request("GET", "/api/v1/live-tournaments/T/sync", null)).statusCode).toBe(401);
  });

  async function threeBoutsWithExchanges(tournamentId: string, spreadsheetId: string | null) {
    await addTournament(tournamentId, spreadsheetId);
    for (const n of [1, 2, 3]) {
      const id = `${tournamentId}-B${n}`;
      await addBout(tournamentId, id, `B${5 + n * 20}`);
      await db
        .insertInto("LiveExchange")
        .values({ id: `e-${id}`, boutId: id, seq: 1, kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, isDouble: 0, firstScorer: null, clientExchangeId: id, createdByUserId: owner.id, createdAt: T0.toISOString(), undoneAt: null })
        .execute();
      await enqueueSync(db, tournamentId, id, T0);
    }
  }

  it("wrong credentials (400 invalid_grant) back off the batch once and the import says so", async () => {
    await threeBoutsWithExchanges("T", SPREADSHEET);
    const bad = fakeGoogle((call) => ({ status: 400, json: { error: "invalid_grant" } }));
    // The token endpoint is answered by fakeGoogle itself; override it to fail.
    const failing = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      bad.calls.push({ url: String(input), method: init?.method ?? "GET", headers: {}, body: "" });
      return Response.json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, { status: 400 });
    }) as unknown as typeof fetch;
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: failing });
    const sinks: SinkFactory = (_id, target) => (target === "GOOGLE" ? new GoogleCellSink(SPREADSHEET, api) : null);
    const result = await runSyncOnce(db, sinks, T0);
    expect(result).toEqual({ done: 0, failed: 3 });
    expect(bad.calls).toHaveLength(1); // one token call, not N+1
    const job = await googleJob();
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(1);

    configure();
    vi.stubGlobal("fetch", failing);
    const imported = await request("POST", "/api/v1/live-tournaments/T/import/google");
    expect(imported.statusCode).toBe(502);
    expect(imported.body).toContain("invalid_grant");
    expect(imported.body).not.toContain("Schedule");
  });

  it("a body that never ends times out, and another tournament still syncs", async () => {
    await threeBoutsWithExchanges("T", SPREADSHEET);
    await addTournament("T2", null);
    await addBout("T2", "T2-B1");
    await enqueueSync(db, "T2", "T2-B1", T0);
    const hangingBody = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("oauth2")) return Response.json({ access_token: "ya29.x", expires_in: 3600 });
      return new Response(new ReadableStream({ start() {} }), { status: 200 });
    }) as unknown as typeof fetch;
    const api = new GoogleSheetsApi({ email: EMAIL, privateKey }, { fetch: hangingBody, timeoutMs: 50 });
    const error = await api.call("GET", "https://sheets.googleapis.com/v4/spreadsheets/x").catch((e: unknown) => e);
    expect(String((error as Error).message)).toContain("timeout");

    const local = vi.fn(async () => undefined);
    const sinks: SinkFactory = (_id, target) => (target === "GOOGLE" ? new GoogleCellSink(SPREADSHEET, api) : { write: local });
    const started = Date.now();
    const result = await runSyncOnce(db, sinks, T0);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(local).toHaveBeenCalled();
    expect(result.failed).toBe(3);
    const t2 = await db.selectFrom("LiveSyncJob").select("status").where("tournamentId", "=", "T2").where("target", "=", "LOCAL").executeTakeFirstOrThrow();
    expect(t2.status).toBe("DONE");
  });

  it("FAILED jobs keep the state at ERROR, whatever else would be shown", async () => {
    await addTournament("T", null);
    await addBout("T", "B1");
    await enqueueSync(db, "T", "B1", T0);
    await db.updateTable("LiveSyncJob").set({ status: "FAILED", lastError: "RANGE_OVERFLOW: too many" }).where("target", "=", "LOCAL").execute();
    const body = (await request("GET", "/api/v1/live-tournaments/T/sync")).json() as { targets: Record<string, unknown>[] };
    // No backup file exists, but the failed job is the more important fact.
    expect(body.targets[0]).toMatchObject({ target: "LOCAL", state: "ERROR", failed: 1, lastError: "RANGE_OVERFLOW: too many" });
    expect(body.targets[1]).toMatchObject({ target: "GOOGLE", state: "NO_SPREADSHEET", lastError: null, lastErrorAt: null });
  });

  it("a hidden error also hides lastErrorAt", async () => {
    await addTournament("T", null);
    await db
      .insertInto("LiveSyncState")
      .values({ tournamentId: "T", target: "LOCAL", lastSuccessAt: "2026-10-25T11:00:00.000Z", lastError: "old", lastErrorAt: "2026-10-25T09:00:00.000Z" })
      .execute();
    mkdirSync(path.dirname(backupPath("T")), { recursive: true });
    writeFileSync(backupPath("T"), "x");
    const body = (await request("GET", "/api/v1/live-tournaments/T/sync")).json() as { targets: Record<string, unknown>[] };
    expect(body.targets[0]).toMatchObject({ state: "OK", lastError: null, lastErrorAt: null });
  });

  it("a missing backup file is a clear state, not an endless error", async () => {
    await addTournament("T", null);
    await addBout("T", "B1");
    await enqueueSync(db, "T", "B1", T0);
    await db
      .insertInto("LiveSyncState")
      .values({ tournamentId: "T", target: "LOCAL", lastSuccessAt: null, lastError: "File not found: x", lastErrorAt: T0.toISOString() })
      .execute();
    const body = (await request("GET", "/api/v1/live-tournaments/T/sync")).json() as { targets: Record<string, unknown>[] };
    expect(body.targets[0]).toMatchObject({ target: "LOCAL", state: "NO_BACKUP_FILE", lastError: null, pending: 1 });
    expect(body.targets[1]).toMatchObject({ target: "GOOGLE", state: "NO_SPREADSHEET" });
  });

  it("backup.xlsx downloads for the creator only", async () => {
    await addTournament("T", null);
    const url = "/api/v1/live-tournaments/T/backup.xlsx";
    expect((await request("GET", url)).statusCode).toBe(404); // no file yet
    mkdirSync(path.dirname(backupPath("T")), { recursive: true });
    const bytes = Buffer.from([80, 75, 3, 4, 1, 2, 3]);
    writeFileSync(backupPath("T"), bytes);

    const response = await request("GET", url);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.rawPayload.equals(bytes)).toBe(true);

    const other = await insertUser(db, { id: "other", role: "USER" });
    const admin = await insertUser(db, { id: "admin", role: "SYSTEM_ADMIN" });
    expect((await request("GET", url, other)).statusCode).toBe(403);
    expect((await request("GET", url, null)).statusCode).toBe(401);
    expect((await request("GET", url, admin)).statusCode).toBe(200);
  });
});

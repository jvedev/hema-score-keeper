# Tournament Mode Phase 1: Sheet-Mode Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend can run a sheet-mode tournament:
- import rings, bouts and fighters from the spreadsheet (an uploaded `.xlsx` or the Google Sheet);
- store every exchange live, with an undo;
- mirror each bout's exchanges in the background into the local backup `.xlsx` and the Google Sheet;
- show a sync status that admins can trust.

**Architecture:**
- A new `apps/backend/src/live/` module with its own tables, added through `schema-migrations.ts`. Sheet fighters are names, not accounts, so the event-era `Entry` and `Match` tables don't fit.
- All sheet reading goes through one `CellSource` interface, implemented by an xlsx reader and a Google reader. All sheet writing goes through one `CellSink` interface, implemented by an xlsx writer and a Google writer.
- A versioned **layout mapping** turns "bout at `Pool_1!B25`, exchange 3" into cells.
- An outbox table plus an in-process worker does the writing, always off the request path. Live play never waits on a sheet.

**Tech Stack:** Fastify 5, Kysely + better-sqlite3, Vitest; `exceljs` (new dependency, MIT, pin an exact 4.4.x version) for `.xlsx`; the Google Sheets REST API v4 via `fetch` with a service-account JWT signed by `node:crypto`. No `googleapis` package, and the legacy `apps/backend/src/google-sheets.ts` / `packages/sheets-client` are neither used nor read (user instruction).

**Spec:** `docs/superpowers/specs/2026-10-25-tournament-mode-design.md` (§6, §7, §8a, §8b). The real workbook is `DEVELOPMENT_TournamentPoolsV3_.xlsx` in the repo root.

## Global Constraints

- Work directly on `master`. **Do not commit**; the user commits (AGENTS.md). The "Commit" steps below mean: stop and leave the changes uncommitted.
- Use Bash, not PowerShell. Tests use `DATABASE_URL=file::memory:` and never open `apps/backend/data/dev.db` or `apps/backend/dev.db`. Importing `dist/db.js` or `dist/server.js` opens the real DB.
- Never modify `DEVELOPMENT_TournamentPoolsV3_.xlsx`. Tests copy it to a temp dir.
- Live play must not depend on the internet or Google. A failing or slow sheet target never blocks or fails an exchange request.
- Exchanges are the single source of truth. Score and state are derived from them.
- Sheet mode, phase 1: any signed-in account may score. Creating, importing and sync admin are for the tournament's creator or a `SYSTEM_ADMIN`.
- The apps never read results back from the sheet. Import reads the schedule, fighters and bracket names only.
- Re-import never changes or removes a bout that has exchanges; it reports it as skipped.
- Layout `v3`, measured on the real sheet:
  - The match header cell is the label cell ("Match 1" at `B25`, "Match 6" at `H25`, "Match 11" at `N25`; in the eliminations, header row 27).
  - Left fighter = header column +1, right fighter = header column +3.
  - Exchange rows are header row +1 … +15 (15 max).
  - Left points input = header column +2, right points input = header column +3.
  - No double or first-scorer columns (`null`). A double is written as both points.
- Deductions: a warning with a point deduction is its own exchange row, with a negative entry for that fighter.

## Review Focus

1. **Retry of an exchange after a network timeout** (the phone resends) must not create a second exchange. → Task 4 test `same clientExchangeId is stored once`.
2. **Two devices posting to one bout at once** (takeover overlap) gives distinct sequence numbers with no lost exchange. → Task 4 test `concurrent exchanges get distinct seq`.
3. **Google unreachable or wrong credentials:** exchange requests still succeed fast, the outbox keeps the job and retries with back-off, and the status shows the error. → Task 6 test `google failure does not block exchanges`.
4. **More than 15 exchanges in a bout:** scoring continues, and the sync job fails visibly with `RANGE_OVERFLOW` rather than writing outside the block. → Task 5 test `overflow is reported not written`.
5. **Undo after a sync already wrote the row:** the next sync rewrites the whole range and the undone row becomes blank. → Task 5 test `undo clears the synced row`.

---

### Task 1: Live tables and store

**Files:**
- Modify: `apps/backend/src/schema-migrations.ts` (append migration `2026-10-25-live-tournaments`)
- Modify: `apps/backend/src/db.ts` (table types)
- Create: `apps/backend/src/live/live-store.ts`
- Test: `apps/backend/test/live-store.test.ts`

**Interfaces:**
- Produces these tables:
  - `LiveTournament` (`id`, `name`, `mode` 'SHEET', `layoutVersion` 'v3', `googleSpreadsheetId` null, `createdByUserId`, `createdAt`)
  - `LiveRing` (`id`, `tournamentId`, `name`, `order`), unique (`tournamentId`, `name`)
  - `LiveBout` (`id`, `tournamentId`, `ringId`, `order`, `label`, `sheetName`, `headerCell`, `fighterLeft`, `fighterRight`, `status` 'PENDING'|'RUNNING'|'DONE', `startedAt`, `finishedAt`), unique (`tournamentId`, `sheetName`, `headerCell`)
  - `LiveExchange` (`id`, `boutId`, `seq`, `kind` 'EXCHANGE'|'DEDUCTION', `leftPoints`, `rightPoints`, `isDouble` 0/1, `firstScorer` 'LEFT'|'RIGHT'|null, `clientExchangeId`, `createdByUserId`, `createdAt`, `undoneAt` null), unique (`boutId`, `clientExchangeId`)
  - `LiveSyncJob` (`id`, `tournamentId`, `boutId`, `target` 'LOCAL'|'GOOGLE', `status` 'PENDING'|'DONE'|'FAILED', `attempts`, `nextAttemptAt`, `lastError`, `updatedAt`), unique (`boutId`, `target`): one coalesced job per bout per target
  - `LiveSyncState` (`tournamentId`, `target`, `lastSuccessAt`, `lastError`, `lastErrorAt`), PK (`tournamentId`, `target`)
- Produces `live-store.ts`:
  - `activeExchanges(db, boutId): Promise<LiveExchangeRow[]>`, ordered by `seq`, excluding undone
  - `enqueueSync(db, tournamentId, boutId): Promise<void>`: upserts PENDING for both targets and resets `attempts`; GOOGLE only when `googleSpreadsheetId` is set

- [ ] **Step 1: Write the failing tests:**
  - `migration creates live tables` (columns present; the unique indexes above reject duplicates)
  - `activeExchanges skips undone and orders by seq`
  - `enqueueSync coalesces to one job per target`
- [ ] **Step 2: Run them.** `npx vitest run test/live-store.test.ts` in `apps/backend`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration (follow the existing entries' `addColumn`/`CREATE TABLE IF NOT EXISTS` style), the types and the two functions.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Stop for review.** Changes stay uncommitted.

### Task 2: Layout mapping (pure)

**Files:**
- Create: `apps/backend/src/live/sheet-layout.ts`
- Test: `apps/backend/test/sheet-layout.test.ts`

**Interfaces:**
- Produces:
  - `type SheetLayout = { version: string; fighterLeftCol: number; fighterRightCol: number; firstExchangeRowOffset: number; maxExchanges: number; leftPointsCol: number; rightPointsCol: number; doubleCol: number | null; firstScorerCol: number | null }`. Column fields are offsets from the header column.
  - `LAYOUTS: Record<string, SheetLayout>` with `v3` as in Global Constraints.
  - `parseA1(cell: string): { col: number; row: number }` and `toA1(col: number, row: number): string`
  - `boutCells(layout, headerCell): { fighterLeft: string; fighterRight: string }`
  - `exchangeRangeWrites(layout, sheetName, headerCell, exchanges: ExchangeForSheet[]): { writes: CellWrite[] } | { error: "RANGE_OVERFLOW" }`. It writes every row of the 15-row block, blank (`null`) past the last exchange, so an undo clears the cell.
  - `type CellWrite = { sheet: string; cell: string; value: number | string | null }`
  - `type ExchangeForSheet = { kind; leftPoints; rightPoints; isDouble; firstScorer }`
- Each exchange row writes `leftPoints`/`rightPoints`. A zero point is written as `null`, matching how the sheet is typed by hand. The double and first-scorer columns are only written when the layout has them.

- [ ] **Step 1: Write the failing tests:**
  - `v3 cells for Pool_1!B25`: fighters `C25`/`E25`; exchange 1 → `D26`/`E26`; exchange 15 → `D40`/`E40`
  - `v3 cells for H25`: exchange 1 → `J26`/`K26`
  - `v3 cells for Eliminations!B27`: exchange 1 → `D28`/`E28`
  - `blank rows after the last exchange` (3 exchanges → rows 4–15 written `null`)
  - `deduction is a negative entry for that fighter`
  - `overflow is RANGE_OVERFLOW` (16 exchanges)
  - `A1 round-trip including AA/AI columns`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Stop for review.**

### Task 3: Import from the sheet

**Files:**
- Create: `apps/backend/src/live/cell-source.ts` (interface + `XlsxCellSource`)
- Create: `apps/backend/src/live/import.ts`
- Create: `apps/backend/src/live/live-routes.ts` (create tournament + import routes; registered in `server.ts`)
- Test: `apps/backend/test/live-import.test.ts`, fixtures built in the test with `exceljs`

**Interfaces:**
- Produces:
  - `interface CellSource { read(sheet: string, cells: string[]): Promise<Map<string, string | number | null>> }`. Values are the **calculated** values (exceljs `cell.result` for formulas). Keys are `"Sheet!A1"`.
  - `XlsxCellSource.fromBuffer(buf: Buffer)`
  - `importSchedule(db, tournamentId, source: CellSource): Promise<ImportReport>`, where `ImportReport = { added: number; updated: number; skipped: { label: string; reason: "HAS_EXCHANGES" }[]; errors: { row: number; message: string }[] }`
- Schedule sheet format, documented in `docs/competition-deploy.md` → "Tournament schedule sheet":
  - A sheet named `Schedule`. Row 1 holds headers. From row 2: A `Ring`, B `Order` (integer), C `Sheet`, D `Cell` (the header cell), E `Label` (optional, defaults to the header cell's value).
  - `G1` = "Last sync", and `H1` is written by the sync (Task 6).
  - Missing or zero fighter names import as `""`, so elimination bouts appear before the pools finish.
- Rings are upserted by name. A bout's import key is (`sheetName`, `headerCell`). Re-import updates ring, order, label and fighters only when the bout has no exchanges; bouts that are no longer on the schedule and have no exchanges are removed.
- Routes:
  - `POST /api/v1/live-tournaments` `{ name, googleSpreadsheetId? }` → `{ id }`
  - `POST /api/v1/live-tournaments/:id/import/xlsx` with body `application/octet-stream`, the raw `.xlsx` (raise `bodyLimit` to 20 MB for this route). It also stores the bytes as the local backup base, `data/live/<id>/backup.xlsx` under `LIVE_DATA_DIR` (default `./data/live`). Returns `ImportReport`.
  - `GET /api/v1/live-tournaments/:id` → tournament + rings + bouts (with derived scores, Task 4)

- [ ] **Step 1: Write the failing tests:**
  - `imports rings and bouts from a Schedule sheet`. Fixture: a Schedule sheet with 2 rings, and pool headers whose fighter cells are formula-cached values.
  - `blank fighters import as empty`
  - `re-import updates a pending bout`
  - `re-import skips a bout that has exchanges`
  - `re-import removes a dropped pending bout`
  - `schedule row with unknown sheet is an error, other rows still import`
  - `only creator or system admin may import`
  - `reads the real workbook`: copy `DEVELOPMENT_TournamentPoolsV3_.xlsx`, add a Schedule sheet pointing at `Pool_1!B25`; the fighters equal the cached values of `C25`/`E25`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add `exceljs` to `apps/backend/package.json` (exact version) and run `npm install`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Stop for review.**

### Task 4: Live bout API

**Files:**
- Create: `apps/backend/src/live/bout-score.ts` (pure)
- Create: `apps/backend/src/live/bout-routes.ts` (registered in `server.ts`)
- Test: `apps/backend/test/live-bouts.test.ts`

**Interfaces:**
- Consumes: Task 1 store, Task 2 `ExchangeForSheet`.
- Produces:
  - `scoreOf(exchanges): { left: number; right: number; doubles: number }`. Matches the sheet's rule: when both points are > 0 it is a double and scores 0 for both; deductions add their negative points.
  - Routes (signed-in users):
    - `GET /api/v1/live-rings/:ringId/bouts` → bouts in `order`, with score and status
    - `GET /api/v1/live-bouts/:id` → `{ bout, exchanges, score }`
    - `POST /api/v1/live-bouts/:id/start` → RUNNING
    - `POST /api/v1/live-bouts/:id/exchanges` `{ clientExchangeId: string, kind, leftPoints, rightPoints, isDouble?, firstScorer? }` → `{ exchange, score }`
    - `POST /api/v1/live-bouts/:id/undo` → removes the newest non-undone exchange (sets `undoneAt`)
    - `POST /api/v1/live-bouts/:id/finish` → DONE
  - Every write calls `enqueueSync` in the same transaction.
- Validation:
  - Points are integers from −10 to 10.
  - A deduction has exactly one negative side and the other 0.
  - Writes to a DONE bout → 409. Exchanges on a PENDING bout start it.
- `seq` is `max(seq)+1` inside a transaction. A repeated `clientExchangeId` returns the stored exchange with 200 and no new row.

- [ ] **Step 1: Write the failing tests:**
  - `scoreOf counts doubles as zero`
  - `scoreOf applies deductions`
  - `same clientExchangeId is stored once`
  - `concurrent exchanges get distinct seq` (use the existing `YieldAfterEachQuery` helper from `test/helpers.ts`)
  - `undo removes only the newest`
  - `writes to a finished bout are refused`
  - `anonymous is 401`
  - `exchange enqueues sync`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Stop for review.**

### Task 5: Sync worker and the local backup file

**Files:**
- Create: `apps/backend/src/live/sync-worker.ts`
- Create: `apps/backend/src/live/xlsx-sink.ts`
- Test: `apps/backend/test/live-sync.test.ts`

**Interfaces:**
- Produces:
  - `interface CellSink { write(writes: CellWrite[]): Promise<void> }`
  - `XlsxFileSink(path)`: loads the file, sets **values** on the given cells, keeps every other cell (formulas included) and writes atomically (temp file + rename).
  - `runSyncOnce(db, sinks: (tournamentId, target) => CellSink | null, now: Date): Promise<{ done: number; failed: number }>`. For each due PENDING job it builds the whole range with `exchangeRangeWrites` from `activeExchanges`, writes it, then marks the job DONE and updates `LiveSyncState.lastSuccessAt`. On error it records `lastError`, and `nextAttemptAt` backs off at 5 s, 15 s, 60 s, then every 60 s. `RANGE_OVERFLOW` is FAILED and only reset by a new write to that bout.
  - `startSyncWorker(db, opts): () => void`: an interval of 2 s, started from `server.ts` when `NODE_ENV !== "test"`, and returning a stop function.
- [ ] **Step 1: Write the failing tests:**
  - `writes the bout range into the backup file`. Re-read it with exceljs: the values are in `D26`/`E26`, and the formula in `C26` still exists.
  - `undo clears the synced row`
  - `overflow is reported not written`
  - `failure backs off and records lastError`
  - `real workbook keeps its formulas after a write`: the formula count per sheet is unchanged before and after.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** If exceljs drops the workbook's array formulas, stop and report as BLOCKED with the evidence. Do not swap libraries silently.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Stop for review.**

### Task 6: Google Sheet target and the sync status

**Files:**
- Create: `apps/backend/src/live/google-sheets.ts` (`GoogleCellSink` + `GoogleCellSource` + JWT)
- Modify: `apps/backend/src/live/live-routes.ts`
- Modify: `docs/competition-deploy.md`, `apps/backend/.env.example`
- Test: `apps/backend/test/live-google.test.ts`, using a fake `fetch`

**Interfaces:**
- Config: reuse the existing backend env vars `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. They are already in `apps/backend/.env` and `.env.example`. Accept a private key with escaped `\n`. Without them, the GOOGLE target reports `NOT_CONFIGURED` and is skipped. Never log or return the key. The sheet must be shared with the service account's email (documented).
- `GoogleCellSink.write` makes one `values:batchUpdate` with `valueInputOption=RAW`. It also writes `Schedule!H1` = ISO time. A token is cached until expiry.
- `GoogleCellSource.read` makes one `values:batchGet` with `valueRenderOption=UNFORMATTED_VALUE`.
- Routes:
  - `POST /api/v1/live-tournaments/:id/import/google` → `ImportReport`, using the Task 3 `importSchedule`
  - `GET /api/v1/live-tournaments/:id/sync` → `{ targets: { target, lastSuccessAt, lastError, lastErrorAt, pending, failed }[] }`
  - `GET /api/v1/live-tournaments/:id/backup.xlsx` → downloads the local backup file (creator or system admin)
- The local sink also writes `Schedule!H1`.

- [ ] **Step 1: Write the failing tests:**
  - `signs a JWT and caches the token`
  - `batchUpdate body has the bout range and H1`
  - `google failure does not block exchanges` (the fake fetch hangs or 500s; POST exchange still answers within 200 ms, and the job stays PENDING with `lastError`)
  - `not configured is reported`
  - `import from google uses calculated values`
  - `sync status lists both targets`
  - `backup.xlsx downloads for the creator only`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Stop for review.**

### Task 7: End-to-end check on a copy

- [ ] **Step 1:** Run a backend on a temp DB with `LIVE_DATA_DIR` in `.superpowers/verify/`, using HTTP calls (curl or a small script):
  1. create a tournament
  2. upload a copy of the real workbook plus a Schedule sheet (2 rings, pool 1 matches 1–3)
  3. score match 1 with 4 exchanges, 1 double, 1 deduction and 1 undo
  4. finish it
  5. download `backup.xlsx` and check `D26:E40` and `H1`
  6. re-import and confirm match 1 is skipped
- [ ] **Step 2:** Run the full `npm test`, typecheck for every workspace, and the backend build. Expected: all green.
- [ ] **Step 3:** Write a report with the outputs and stop for review. The user commits.

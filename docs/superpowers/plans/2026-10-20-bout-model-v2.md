# Bout Model v2 (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend records ad hoc bouts between enrolled users, with a mandatory referee, up to four jury members, referee approval (optionally with both fighters on the spot), a three-day objection window, objections that take a bout out of the ratings until an admin resolves them, corrections with revision history, and per-competition standings recalculated from bout history. The old unauthenticated bout write routes are switched off.

**Architecture:** A bout is stored once (`Bout`) and linked to every running competition both fighters are enrolled in (`BoutCompetition`). Fighters and officials are users; standings map user ids to each competition's participant ids. All lifecycle rules come from `@hema/competition-domain` (`bout-lifecycle`, `competitionsForBout`, `replayRatings`, `buildParticipantRows`); the backend only stores, authorizes and maps. Bouts settle lazily: whenever a bout is loaded, `settleBout(row, now)` runs and a changed status is saved — no scheduler. Time comes from an injectable clock so tests can move past the three days.

**Tech Stack:** Fastify 5, Kysely, better-sqlite3, Vitest + `app.inject()`.

**Spec:** `docs/superpowers/specs/2026-10-19-competition-admin-design.md` (sections 3, 4.3a, 4.4, 4.5 first bullet only).

## Global Constraints

- Work on `master`; commit only when the user asks.
- Bash, not PowerShell. Tests never open `data/dev.db`.
- Fighters, referee, jury and table official are **users** (accounts). A bout needs: two different fighters, a referee who is neither fighter, 0–4 distinct jury members who aren't fighters or the referee, an optional table official.
- A bout is linked to every `RUNNING` competition both fighters are enrolled in (participant row with their `userId`). None → 409 "These fighters share no running competition."
- Status values and rules: exactly `@hema/competition-domain`'s `BoutStatus` and transitions. Three days = `OBJECTION_WINDOW_MS`.
- Only the referee approves as referee; only a fighter approves/objects for their own side; only the objecting fighter withdraws; only an admin (OWNER/CO_ADMIN) of a competition the bout is linked to, or a SYSTEM_ADMIN, resolves objections.
- A correction keeps the previous result in `BoutRevision`.
- Legacy `CompetitionBout` rows with `published = 1` keep counting as final bouts in their own competition (participant ids, no warnings). They are read-only.
- Old write routes `POST /api/v1/competitions/:id/bouts`, `PUT …/bouts/:boutId`, `DELETE …/bouts/:boutId` answer **410** "Recording bouts moved to the score-keeper." (decided by the user: the old app can't record bouts until the new participant app).
- Bout chat, notifications and media are **not** in this phase.

## Review Focus

- A fighter objects at 2 days 23:59:59 and the request arrives after the window — the server clock decides; an objection after `windowStartedAt + 3d` is 409. → Task 4 test `rejects an objection after three days`.
- A bout linked to two competitions disappears from both standings while objected and returns to both when restored. → Task 6 test `objection removes the bout from every competition`.
- A fighter who is enrolled in competition X but not Y: a bout against someone in both counts only in X. → Task 3 test `links only shared running competitions`.
- An admin of competition X can't resolve an objection on a bout that only counts in Y. → Task 5 test `forbids admins of other competitions`.
- Legacy published bouts and new bouts combine in one rating history in date order. → Task 6 test `mixes legacy and new bouts in date order`.

---

### Task 1: Bout tables and injectable clock

**Files:**
- Modify: `apps/backend/src/schema-migrations.ts` (migrations 7–10), `apps/backend/src/db.ts` (table types)
- Modify: `apps/backend/src/server.ts` — `createApp(database = db, options: AppOptions = {})`, `export interface AppOptions { now?: () => Date }`; decorate `app` with the clock (`app.decorate("now", options.now ?? (() => new Date()))`) and declare it in a `declare module "fastify"` block
- Modify: `apps/backend/test/helpers.ts` — `createTestContext(options?: { now?: () => Date })`; export `class TestClock { now(): Date; advance(ms: number): void; set(iso: string): void }` starting at `2026-10-15T20:00:00.000Z`
- Test: `apps/backend/test/schema-migrations.test.ts` (extend), `apps/backend/test/health.test.ts` (extend)

**Interfaces:**
- Produces tables (add to `BackendDatabase`):
  - `Bout { id; fighterAUserId; fighterBUserId; refereeUserId; tableUserId: string | null; ring: string | null; startedAt: string; scoreA: number; scoreB: number; winnerSide: "A" | "B" | null; warningsA: number; warningsB: number; exchangesJson: string; startedInCompetitionId: string | null; createdByUserId: string; status: string; revision: number; windowStartedAt: string | null; fighterApprovedA: SqliteBoolean; fighterApprovedB: SqliteBoolean; objectionBy: "A" | "B" | null; objectionAt: string | null; objectionReason: string | null; voidReason: string | null }`
  - `BoutJury { boutId; seat: number (1–4); userId }`, PK `(boutId, seat)`, unique `(boutId, userId)`
  - `BoutCompetition { boutId; competitionId }`, PK both; index on `competitionId`
  - `BoutRevision { boutId; revision: number; scoreA; scoreB; winnerSide; warningsA; warningsB; exchangesJson; replacedAt: string; replacedByUserId: string }`, PK `(boutId, revision)`
  - FKs: users and competitions `ON DELETE CASCADE` for link tables; `Bout` user FKs without cascade.
  - Migration names: `2026-10-20-bout-table`, `2026-10-20-bout-jury-table`, `2026-10-20-bout-competition-table`, `2026-10-20-bout-revision-table`.

- [ ] **Step 1: Write failing tests:** after `applySchemaMigrations`, `sqlite_master` has `Bout`, `BoutJury`, `BoutCompetition`, `BoutRevision`; `SchemaMigration` count is 10 (update the existing idempotency test from 6 to 10). `createTestContext({ now: () => clock.now() })` → `ctx.app.now().toISOString()` equals the clock's value, and changes after `clock.advance(1000)`.
- [ ] **Step 2: Run** `npm test --workspace @hema/backend`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + `npm run typecheck --workspace @hema/backend`. Expected: PASS.

### Task 2: Bout store (row ↔ domain lifecycle, lazy settle)

**Files:**
- Create: `apps/backend/src/bouts/bout-store.ts`
- Test: `apps/backend/test/bout-store.test.ts`

**Interfaces:**
- Consumes: `BoutLifecycle`, `settleBout` from `@hema/competition-domain`; Task 1 tables.
- Produces:
  ```ts
  export type BoutRow = Selectable<BackendDatabase["Bout"]>;
  export function toLifecycle(row: BoutRow): BoutLifecycle;
  export function lifecycleColumns(lifecycle: BoutLifecycle): Pick<Updateable<BackendDatabase["Bout"]>, "status" | "revision" | "windowStartedAt" | "fighterApprovedA" | "fighterApprovedB" | "objectionBy" | "objectionAt" | "voidReason">;
  export async function loadBout(executor: DbExecutor, id: string, now: Date): Promise<BoutRow>;   // 404 if missing; settles and saves if settleBout changed it
  export async function saveLifecycle(executor: DbExecutor, id: string, lifecycle: BoutLifecycle): Promise<void>;
  export async function boutCompetitionIds(executor: DbExecutor, boutId: string): Promise<string[]>;
  ```

- [ ] **Step 1: Write failing tests** (insert a `Bout` row directly with status `COUNTED`, `windowStartedAt` = clock start):
  - `toLifecycle` → `fighterApproved` booleans, `objection` null; round-trip `lifecycleColumns(toLifecycle(row))` equals the row's lifecycle columns
  - `loadBout(…, start + 1h)` → still `COUNTED`; `loadBout(…, start + OBJECTION_WINDOW_MS)` → `FINAL` and the stored row is now `FINAL`
  - `loadBout` on an unknown id → `HttpError` 404
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 3: Record a bout (`POST /api/v1/bouts`)

**Files:**
- Create: `apps/backend/src/bouts/bout-input.ts` (validation), `apps/backend/src/bouts/bout-routes.ts` (`registerBoutRoutes(app, database)`), `apps/backend/src/bouts/bout-view.ts` (response shape)
- Modify: `apps/backend/src/server.ts` (call `registerBoutRoutes`)
- Test: `apps/backend/test/bout-create.test.ts`

**Interfaces:**
- Consumes: `competitionsForBout`, `createScoredBout` (domain); `loadBout` (Task 2); `resolveAccessUser`.
- Produces:
  ```ts
  // bout-input.ts
  export interface ExchangeInput { atSeconds: number; kind: "SCORE" | "DOUBLE" | "WARNING" | "TIME"; side: "A" | "B" | null; points: number; reason: string | null }
  export interface BoutInput {
    fighterAUserId: string; fighterBUserId: string; refereeUserId: string; juryUserIds: string[]; tableUserId: string | null;
    ring: string | null; startedAt: string; scoreA: number; scoreB: number; winnerSide: "A" | "B" | null;
    warningsA: number; warningsB: number; exchanges: ExchangeInput[]; startedInCompetitionId: string | null;
  }
  export function parseBoutInput(body: unknown): BoutInput;   // HttpError 400 with a clear message per rule
  // bout-view.ts
  export interface BoutView {
    id: string; status: BoutStatus; revision: number; startedAt: string; ring: string | null;
    fighterA: { userId: string; name: string }; fighterB: { userId: string; name: string };
    referee: { userId: string; name: string }; jury: Array<{ seat: number; userId: string; name: string }>; table: { userId: string; name: string } | null;
    scoreA: number; scoreB: number; winnerSide: "A" | "B" | null; warningsA: number; warningsB: number; exchanges: ExchangeInput[];
    windowEndsAt: string | null; fighterApproved: { A: boolean; B: boolean }; objection: { by: "A" | "B"; at: string } | null; voidReason: string | null;
    competitionIds: string[];
  }
  export async function toBoutView(executor: DbExecutor, row: BoutRow): Promise<BoutView>;
  ```
  Route `POST /api/v1/bouts`: caller must be logged in and be the referee or the table official of the bout (403 otherwise). Users must exist (404). Rules from Global Constraints (400). `startedInCompetitionId`, if given, must be among the linked competitions (400). Inserts `Bout` (status from `createScoredBout()`), `BoutJury`, `BoutCompetition` in one transaction. Returns `BoutView`.

- [ ] **Step 1: Write failing tests** (fixtures: users f1, f2, f3, ref, jury1–5, table; competitions X and Y RUNNING via direct inserts — X has f1,f2,f3, Y has f1,f2; Z CLOSED with f1,f2):
  - referee records f1 vs f2 with 2 jury → 200, `status: "SCORED"`, `competitionIds` = [X, Y] (any order), jury seats 1–2
  - **`links only shared running competitions`**: f1 vs f3 → `competitionIds` = [X]
  - fighters share no running competition → 409
  - caller is a fighter (not referee/table) → 403; not logged in → 401
  - same fighter twice → 400; referee is a fighter → 400; 5 jury → 400; duplicate jury → 400; a jury member who is a fighter → 400; unknown user → 404
  - `winnerSide` inconsistent with scores (A wins but `scoreA < scoreB`) → 400; negative score → 400
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 4: Approve, object, withdraw, void

**Files:**
- Modify: `apps/backend/src/bouts/bout-routes.ts`
- Test: `apps/backend/test/bout-lifecycle.test.ts`

**Interfaces:**
- Consumes: `approveByReferee`, `approveByFighter`, `objectToBout`, `withdrawObjection`, `voidBout`, `BoutTransitionError` (domain); `loadBout`, `saveLifecycle`, `toBoutView`.
- Produces routes (all return `BoutView`; domain errors → 409 with the error code in `details.code`):
  - `POST /api/v1/bouts/:id/referee-approval` body `{ fightersApprovedOnSpot: { A: boolean; B: boolean } }` — referee only
  - `POST /api/v1/bouts/:id/approval` — fighter A or B, side derived from the caller
  - `POST /api/v1/bouts/:id/objection` body `{ reason: string }` (required; stored in `objectionReason`, later the first line of the bout chat) — fighter only
  - `POST /api/v1/bouts/:id/objection/withdrawal` — fighter only (domain checks it's the objector)
  - `POST /api/v1/bouts/:id/void` body `{ reason }` — referee only
  - `GET /api/v1/bouts/:id` — fighters, officials, admins of a linked competition, system admins; others 403

- [ ] **Step 1: Write failing tests** with `TestClock`:
  - referee approves without on-spot → `COUNTED`, `windowEndsAt` = start + 3 days; with both on-spot → `FINAL`
  - a fighter approving as referee → 403; the referee objecting → 403
  - fighter A approves, fighter B approves → `FINAL`
  - fighter A objects with a reason → `OBJECTED`; without a reason → 400
  - **`rejects an objection after three days`**: advance clock by `OBJECTION_WINDOW_MS` → objection 409 and `GET` shows `FINAL`
  - fighter B withdraws A's objection → 409 (`NOT_OBJECTOR`); A withdraws → `COUNTED`, then A can't object again (409 `ALREADY_APPROVED`)
  - referee voids a counted bout with a reason → `VOIDED`; without a reason → 400
  - `GET` by an unrelated user → 403; by a jury member → 200
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 5: Resolve objections (restore / correct / void) with revisions

**Files:**
- Modify: `apps/backend/src/bouts/bout-routes.ts`
- Test: `apps/backend/test/bout-resolution.test.ts`

**Interfaces:**
- Consumes: `resolveObjection` (domain); `requireCompetitionAdmin`/`competitionAdminRole` (phase 2); `parseBoutInput`'s result fields for corrections.
- Produces route `POST /api/v1/bouts/:id/resolution` body:
  - `{ kind: "restore" }`
  - `{ kind: "void", reason: string }`
  - `{ kind: "correct", result: { scoreA; scoreB; winnerSide; warningsA; warningsB; exchanges } }` — validated with the same rules as Task 3; the old result is inserted into `BoutRevision` (revision = old revision number, `replacedByUserId` = caller) before updating.
  Caller must be an admin of at least one linked competition or a SYSTEM_ADMIN (403 otherwise).
  Add `GET /api/v1/bouts/:id/revisions` → `Array<{ revision; scoreA; scoreB; winnerSide; warningsA; warningsB; exchanges; replacedAt; replacedBy: { userId; name } }>` (same access as `GET /bouts/:id`).

- [ ] **Step 1: Write failing tests:**
  - owner of X restores → `COUNTED`
  - owner of X corrects 5–3 → 4–4 draw → `COUNTED`, `revision: 2`, scores updated, `windowEndsAt` = now + 3 days; `/revisions` returns one entry with 5–3
  - void with reason → `VOIDED`
  - **`forbids admins of other competitions`**: owner of an unrelated competition W → 403; a co-admin of Y (bout linked to X and Y) → 200
  - resolving a bout that isn't objected → 409
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 6: Standings and bout history per competition

**Files:**
- Create: `apps/backend/src/bouts/standings.ts`
- Modify: `apps/backend/src/bouts/bout-routes.ts`, `apps/backend/src/server.ts` (old `GET /competitions/:id/ranking` returns standings mapped to `{ participantId, position, name, rating }`), `apps/backend/src/competition-model.ts` (remove `listRanking`'s own Elo loop)
- Test: `apps/backend/test/standings.test.ts`

**Interfaces:**
- Consumes: `replayRatings`, `buildParticipantRows`, `boutCounts`, `settleBout` (domain).
- Produces:
  ```ts
  export interface StandingRow extends ParticipantRow { name: string; clubId: string | null; userId: string | null }
  export async function competitionStandings(executor: DbExecutor, competitionId: string, now: Date): Promise<StandingRow[]>;
  export interface HistoryBout { id: string; source: "LEGACY" | "BOUT"; foughtAt: string; fighterAParticipantId: string; fighterBParticipantId: string; scoreA: number; scoreB: number; winnerSide: "A" | "B" | null; status: BoutStatus; ratingChange: RatingChange | null }
  export async function competitionBoutHistory(executor: DbExecutor, competitionId: string, now: Date): Promise<HistoryBout[]>;   // newest first
  ```
  Routes (same visibility as `GET /competitions/:id`): `GET /api/v1/competitions/:id/standings`, `GET /api/v1/competitions/:id/bout-history`.
  Legacy rows: `CompetitionBout` with `published = 1` → `counts: true`, status `FINAL`, fighter ids as-is, winner side from `winnerParticipantId`.
  New bouts: linked via `BoutCompetition`; settled with `now`; mapped user → participant id; `counts = boutCounts`.

- [ ] **Step 1: Write failing tests:**
  - two counted bouts f1 beats f2, then f2 beats f1 → standings ratings equal the domain replay of those two
  - **`objection removes the bout from every competition`**: bout in X and Y; object → both standings back to 1000/1000; restore → both show the change again
  - **`mixes legacy and new bouts in date order`**: a legacy published bout (2026-10-01, f1 beats f2) and a new bout (2026-10-15, f2 beats f1) → standings equal `replayRatings` of both in that order; history lists both newest first with `source` set
  - voided and `SCORED` bouts don't count but appear in history with their status
  - old `GET /competitions/:id/ranking` returns the same ratings as `/standings`
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 7: Switch off the old bout write routes

**Files:**
- Modify: `apps/backend/src/server.ts` (the three old write routes → 410), `apps/backend/src/competition-model.ts` (delete `createMatch`/`publishMatch`/`declineMatch` and their aliases if nothing else uses them)
- Test: `apps/backend/test/legacy-bout-routes.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/competitions/:id/bouts`, `PUT /api/v1/competitions/:id/bouts/:boutId`, `DELETE /api/v1/competitions/:id/bouts/:boutId` → 410 `{ error: "Recording bouts moved to the score-keeper." }`. Old `GET` bout routes keep working for legacy rows.

- [ ] **Step 1: Write failing tests:** each of the three routes → 410 with that message; `GET /competitions/:id/bouts` still 200.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole repo: `npm test`, `npm run typecheck`, `npm run build --workspace @hema/backend`. Expected: all PASS. (The old `apps/competition` app's publish flow now gets 410 at runtime — accepted by the user.)

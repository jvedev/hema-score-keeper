# Competition Backend: Lifecycle & Access (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend enforces the competition lifecycle, gives each competition its own owner and co-admins (replacing club-based admin access), stores competition scope, club area/country and user language, and stops creating guests — all covered by HTTP-level tests.

**Architecture:** New competition code goes into small modules under `apps/backend/src/competitions/` and registers its routes on the existing Fastify app via `registerCompetitionAdminRoutes(app, database)`, so the 1,900-line `server.ts` only loses the old admin competition routes and gains one call. Schema changes are idempotent steps in a new `schema-migrations.ts`, recorded in a `SchemaMigration` table, run from `createDatabase()` after the existing bootstrap. Lifecycle rules come from `@hema/competition-domain` (phase 1).

**Tech Stack:** Fastify 5, Kysely, better-sqlite3, Vitest (new for the backend), `app.inject()` for HTTP tests, in-memory SQLite.

**Spec:** `docs/superpowers/specs/2026-10-19-competition-admin-design.md` (sections 3, 4.1, 4.2, 4.3, 4.9, 9).

## Global Constraints

- Work on `master`; no branches. Commit only when the user asks, and only this plan's files.
- **The user has uncommitted work in `apps/backend`** (`db.ts`, `server.ts`, `competition-bootstrap.ts`, `read-model.ts`, `api-types.ts`, seed script, a new migration folder). Build on top of it; never revert or reformat it.
- Bash, not PowerShell.
- Tests must never open `apps/backend/data/dev.db`: Vitest sets `DATABASE_URL=file::memory:`.
- Lifecycle statuses: `DRAFT`, `REGISTRATION_OPEN`, `RUNNING`, `CLOSED`, `ARCHIVED`. Old values map `ACTIVE → RUNNING`, `ARCHIVED → ARCHIVED`, anything else → `DRAFT`.
- Competition admin roles: `OWNER` (exactly one per competition) and `CO_ADMIN`.
- `SYSTEM_ADMIN` can manage every competition. A `COMPETITION_ADMIN` manages only competitions where they have an admin row.
- Scope kinds: `CLUB`, `CLUBS`, `AREA`, `COUNTRY`, `OPEN`. `OPEN` needs no values; others need at least one value.
- Club `countryCode`: two uppercase letters (ISO 3166-1 alpha-2). `area`: free text.
- User language: `en` or `nl`, default `en`.
- The ruleset (`rulesetJson`) can only change while `DRAFT` or `REGISTRATION_OPEN`.
- `status` can no longer be set through `PATCH`; only through the transitions endpoint.
- No new participants of kind `GUEST`; existing guest rows are left alone.

## Review Focus

- Running the migrations twice (second server start) changes nothing and doesn't fail. → Task 2 test `migrations are idempotent`.
- An existing `COMPETITION_ADMIN` keeps seeing their club's competitions after the migration. → Task 2 test `club admins become co-admins of their club's competitions`.
- A co-admin of one competition gets 403 on another competition's PATCH, transitions and admins endpoints. → Task 3 and Task 5 tests `forbids a non-admin`.
- Removing the last owner or the owner themselves is refused; ownership can only be transferred. → Task 5 test `cannot remove the owner`.
- A PATCH that tries to change `rulesetJson` on a RUNNING competition is refused even when other fields are valid, and nothing is partially saved. → Task 4 test `refuses ruleset change once running`.

---

### Task 1: Backend test harness

**Files:**
- Modify: `apps/backend/package.json` (add `"test": "vitest run"`, devDependency `"vitest": "^4.1.10"`, dependency `"@hema/competition-domain": "*"`)
- Create: `apps/backend/vitest.config.ts` (`test.env.DATABASE_URL = "file::memory:"`, `test.include = ["test/**/*.test.ts"]`)
- Modify: `apps/backend/src/db.ts` — `createDatabase(databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db")`
- Modify: `apps/backend/src/server.ts:1911-1918` — only call `start()` when run directly: `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void start();`
- Create: `apps/backend/test/helpers.ts`
- Test: `apps/backend/test/health.test.ts`

**Interfaces:**
- Produces (`test/helpers.ts`):
  ```ts
  export interface TestContext { app: FastifyInstance; database: Kysely<BackendDatabase> }
  export async function createTestContext(): Promise<TestContext>;          // fresh in-memory DB + createApp(database)
  export async function insertUser(database: Kysely<BackendDatabase>, input: { id: string; role: "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN"; clubId?: string | null; name?: string }): Promise<void>;
  export function bearer(user: { id: string; role: AccountRole; clubId: string | null }): { authorization: string };   // uses signAccessToken
  export async function insertClub(database: Kysely<BackendDatabase>, input: { id: string; slug?: string; name?: string }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test** `health.test.ts`: `createTestContext()` then `app.inject({ method: "GET", url: "/health" })` → `statusCode === 200`; and a second test that `createTestContext()` twice gives two databases (insert a club in one, the other has none).
- [ ] **Step 2: Run** `npm install` then `npm test --workspace @hema/backend`. Expected: FAIL (helpers missing).
- [ ] **Step 3: Implement** the config, the `createDatabase` parameter, the `start()` guard and the helpers.
- [ ] **Step 4: Run** `npm test --workspace @hema/backend` and `npm run typecheck --workspace @hema/backend`. Expected: PASS. Also run `npm run dev --workspace @hema/backend` briefly (background) and check `GET /health` answers, then stop it — the guard must not break normal start.

### Task 2: Schema migrations (lifecycle statuses, admins, scope, area/country, language)

**Files:**
- Create: `apps/backend/src/schema-migrations.ts`
- Modify: `apps/backend/src/db.ts` (table types; call `applySchemaMigrations(native)` after `initializeCompetitionDatabase(native)`)
- Test: `apps/backend/test/schema-migrations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function applySchemaMigrations(database: NativeDatabase): void;
  ```
  New/changed tables (add to `BackendDatabase` in `db.ts`):
  - `SchemaMigration { name: string (PK); appliedAt: string }`
  - `CompetitionAdmin { competitionId: string; userId: string; role: "OWNER" | "CO_ADMIN" }`, PK `(competitionId, userId)`, FKs cascade.
  - `Competition` + `scopeKind: string NOT NULL DEFAULT 'OPEN'`, `scopeValuesJson: string NOT NULL DEFAULT '[]'`
  - `Club` + `area: string | null`, `countryCode: string | null`
  - `User` + `language: string NOT NULL DEFAULT 'en'`
  Migrations, in order, each recorded by name and skipped if present:
  1. `2026-10-19-competition-admin-table`
  2. `2026-10-19-competition-scope-columns`
  3. `2026-10-19-club-area-country`
  4. `2026-10-19-user-language`
  5. `2026-10-19-map-competition-statuses` (ACTIVE→RUNNING, ARCHIVED stays, everything else not in the new set → DRAFT)
  6. `2026-10-19-club-admins-become-co-admins`: for each competition with `clubId`, every `COMPETITION_ADMIN` with that `clubId` gets a `CO_ADMIN` row; for competitions with `clubId IS NULL`, every `COMPETITION_ADMIN` gets a `CO_ADMIN` row (today they all see those). Competitions get no `OWNER` from the migration.

- [ ] **Step 1: Write the failing tests** using a raw `better-sqlite3` `:memory:` database prepared with `initializeCompetitionDatabase` (it seeds competitions with statuses ACTIVE / ARCHIVED / PUBLIC):
  - after `applySchemaMigrations`: `competition-1` is `RUNNING`, `competition-2` `ARCHIVED`, `competition-3` `DRAFT`
  - `PRAGMA table_info` shows `Club.area`, `Club.countryCode`, `User.language`, `Competition.scopeKind`, `Competition.scopeValuesJson`; new competitions default to `OPEN` / `[]`
  - **`club admins become co-admins of their club's competitions`**: insert club `c1`, admin `u1` (club c1), admin `u2` (no club), user `u3` (role USER); set `competition-1.clubId = 'c1'` before migrating → `competition-1` has a CO_ADMIN row for `u1` only; `competition-3` (no club) has rows for `u1` and `u2`; `u3` has none
  - **`migrations are idempotent`**: running `applySchemaMigrations` twice leaves row counts in `CompetitionAdmin` and `SchemaMigration` unchanged and doesn't throw
- [ ] **Step 2: Run** `npm test --workspace @hema/backend`. Expected: FAIL.
- [ ] **Step 3: Implement** `schema-migrations.ts` (one function per migration; `ALTER TABLE … ADD COLUMN` guarded by `PRAGMA table_info`; each migration in a transaction with its `SchemaMigration` insert). Wire it into `createDatabase`.
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 3: Competition access by owner/co-admin

**Files:**
- Create: `apps/backend/src/competitions/access.ts`
- Create: `apps/backend/src/competitions/admin-routes.ts`
- Modify: `apps/backend/src/server.ts` — export `AccessUser`, `requireAdminUser`; remove the old `GET /api/v1/competitions/admin`, `POST /api/v1/competitions`, `PATCH /api/v1/competitions/:id`, `POST /api/v1/competitions/:id/participants` handlers (lines ~366–510) and call `registerCompetitionAdminRoutes(app, database)` in their place.
- Modify: `apps/backend/src/competition-model.ts` — `CompetitionSummary` gains `scope: { kind: ScopeKind; values: string[] }`
- Test: `apps/backend/test/competition-access.test.ts`

**Interfaces:**
- Consumes: `createTestContext`, `insertUser`, `bearer` (Task 1); `CompetitionAdmin` table (Task 2).
- Produces:
  ```ts
  // competitions/access.ts
  export type CompetitionAdminRole = "OWNER" | "CO_ADMIN";
  export async function competitionAdminRole(executor: DbExecutor, user: AccessUser, competitionId: string): Promise<CompetitionAdminRole | "SYSTEM_ADMIN" | null>;
  export async function requireCompetitionAdmin(executor: DbExecutor, user: AccessUser, competitionId: string): Promise<CompetitionAdminRole | "SYSTEM_ADMIN">;   // 403 "You don't manage this competition."
  export async function listManagedCompetitionIds(executor: DbExecutor, user: AccessUser): Promise<string[] | "ALL">;
  // competitions/admin-routes.ts
  export function registerCompetitionAdminRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void;
  ```
  Route behaviour after this task:
  - `GET /api/v1/competitions/admin` → only managed competitions (all for SYSTEM_ADMIN).
  - `POST /api/v1/competitions` → creates as `DRAFT` (ignores any `status` in the body), inserts the caller as `OWNER` (also for SYSTEM_ADMIN). `clubId`/`visibility` rules stay as today.
  - `PATCH /api/v1/competitions/:id` and `POST /api/v1/competitions/:id/participants` → `requireCompetitionAdmin` instead of the club check.

- [ ] **Step 1: Write the failing tests:**
  - admin A creates a competition → 200, `status === "DRAFT"`, a `CompetitionAdmin` row `{ userId: A, role: "OWNER" }`
  - admin B (same club as A) → `GET /competitions/admin` doesn't include A's competition
  - **`forbids a non-admin`**: admin B → `PATCH /competitions/:id` and `POST /competitions/:id/participants` → 403
  - SYSTEM_ADMIN sees and may patch everything
  - role `USER` → 403 on all four routes
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** access module and move the four routes into `admin-routes.ts` with the new checks.
- [ ] **Step 4: Run** tests + typecheck + `npm run build --workspace @hema/backend`. Expected: PASS.

### Task 4: Lifecycle transitions, ruleset freeze, scope

**Files:**
- Modify: `apps/backend/src/competitions/admin-routes.ts`
- Create: `apps/backend/src/competitions/scope.ts`
- Test: `apps/backend/test/competition-lifecycle.test.ts`

**Interfaces:**
- Consumes: `transitionCompetition`, `readinessChecklist`, `CompetitionTransitionError`, `CompetitionAction` from `@hema/competition-domain`.
- Produces:
  ```ts
  // competitions/scope.ts
  export type ScopeKind = "CLUB" | "CLUBS" | "AREA" | "COUNTRY" | "OPEN";
  export interface CompetitionScope { kind: ScopeKind; values: string[] }
  export function parseScope(input: unknown): CompetitionScope;     // HttpError 400 on bad input
  export function hasScope(scope: CompetitionScope): boolean;       // OPEN → true; others → values.length > 0
  ```
  Routes:
  - `POST /api/v1/competitions/:id/transitions` body `{ action: CompetitionAction }` → updated competition. Readiness: `rulesetVersionId` = `"inline"` when `rulesetJson` is set (it always is), `hasScope(scope)`, `startDate` = `date`. `NOT_READY` → 409 with the checklist in the body `{ error, checklist }`; `NOT_ALLOWED` → 409.
  - `PATCH` accepts `scope` (via `parseScope`); rejects `status` with 400 "Use the transitions endpoint to change status."; rejects `rulesetJson` with 409 "The ruleset is fixed once the competition is running." when status is `RUNNING`, `CLOSED` or `ARCHIVED`. Validate everything before writing anything.
  - `GET` responses include `scope`.

- [ ] **Step 1: Write the failing tests:**
  - DRAFT with default (OPEN) scope → `OPEN_REGISTRATION` → 200 `REGISTRATION_OPEN` → `START` → `RUNNING` → `CLOSE` → `CLOSED` → `REOPEN` → `RUNNING`
  - DRAFT with scope `{ kind: "CLUB", values: [] }` → `OPEN_REGISTRATION` → 409, body `checklist.scopeAndDatesSet === false`
  - `ARCHIVE` from `RUNNING` → 409
  - unknown action `"EXPLODE"` → 400
  - PATCH `{ status: "RUNNING" }` → 400
  - **`refuses ruleset change once running`**: RUNNING competition, PATCH `{ name: "New", rulesetJson: {...} }` → 409 and `name` unchanged
  - PATCH `rulesetJson` while DRAFT → 200
  - PATCH `scope: { kind: "COUNTRY", values: ["NL"] }` → 200 and returned in GET; `{ kind: "MOON" }` → 400
  - co-admin of another competition → transitions 403
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** `scope.ts` and the route changes.
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 5: Co-admins and ownership transfer

**Files:**
- Modify: `apps/backend/src/competitions/admin-routes.ts`
- Modify: `apps/backend/src/competitions/access.ts`
- Test: `apps/backend/test/competition-admins.test.ts`

**Interfaces:**
- Consumes: Task 3 access functions.
- Produces routes:
  - `GET /api/v1/competitions/:id/admins` → `Array<{ userId: string; name: string; username: string; role: CompetitionAdminRole }>` (any admin of the competition)
  - `POST /api/v1/competitions/:id/admins` body `{ userId }` → adds `CO_ADMIN`. Only OWNER or SYSTEM_ADMIN. Target user must exist (404) and have role `COMPETITION_ADMIN` or `SYSTEM_ADMIN` (400). Already an admin → 409.
  - `DELETE /api/v1/competitions/:id/admins/:userId` → removes a `CO_ADMIN`. OWNER or SYSTEM_ADMIN; a co-admin may remove themselves. Removing the `OWNER` → 409 "Transfer ownership first."
  - `POST /api/v1/competitions/:id/owner` body `{ userId }` → target must already be a CO_ADMIN (400 otherwise); swaps roles in one transaction (old owner becomes CO_ADMIN). Only OWNER or SYSTEM_ADMIN.
  - A competition without an OWNER (migrated ones): SYSTEM_ADMIN can transfer ownership to a co-admin; co-admins can't.

- [ ] **Step 1: Write the failing tests:**
  - owner adds admin B → 200; B now sees the competition in `GET /competitions/admin`
  - co-admin B tries to add C → 403
  - adding a role-`USER` → 400; unknown user → 404; adding B twice → 409
  - **`cannot remove the owner`**: DELETE owner → 409
  - co-admin removes themselves → 200
  - transfer to B → B is OWNER, A is CO_ADMIN; transfer to a non-admin → 400
  - **`forbids a non-admin`**: unrelated admin D → all four routes 403
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** the routes.
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 6: Club area/country, user language, no new guests

**Files:**
- Modify: `apps/backend/src/server.ts` (club create/patch, `PATCH /api/v1/users/:id`, new `PATCH /api/v1/auth/me`), `apps/backend/src/read-model.ts` (`ApiUser.language`), `apps/backend/src/api-types.ts` (`ApiClub.area`, `ApiClub.countryCode`, `ApiUser.language`)
- Modify: `apps/backend/src/competitions/admin-routes.ts` (participants: reject `kind: "GUEST"`)
- Test: `apps/backend/test/clubs-language-guests.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/clubs` and new `PATCH /api/v1/clubs/:id` accept `area` (string | null) and `countryCode` (string | null; must match `/^[A-Z]{2}$/` after `toUpperCase()`, else 400). SYSTEM_ADMIN or a COMPETITION_ADMIN of that club may patch.
  - `PATCH /api/v1/auth/me` body `{ language: "en" | "nl" }` → updated `ApiUser`; other values → 400. `GET /api/v1/auth/me` includes `language`.
  - `POST /api/v1/competitions/:id/participants` with `kind: "GUEST"` → 400 "Guests are no longer supported; invite the person to enrol instead."

- [ ] **Step 1: Write the failing tests:**
  - create club with `countryCode: "nl"` → stored `"NL"`; `"NLD"` → 400; patch `area: "Randstad"` → returned
  - `PATCH /auth/me { language: "nl" }` → 200, then `GET /auth/me` → `language === "nl"`; `"de"` → 400; new users default to `"en"`
  - participant with `kind: "GUEST"` → 400; `kind: "MEMBER"` still works
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole suite: `npm test --workspace @hema/backend`, `npm run typecheck --workspace @hema/backend`, `npm run build --workspace @hema/backend`, `npm test --workspace @hema/competition-domain`. Expected: all PASS.
- [ ] **Step 5: Update the existing admin app's API client** only where its calls would now break: `apps/competition-admin/src/main.ts` sends `status` on create (now ignored, fine) — no change needed unless typecheck fails; run `npm run typecheck --workspace @hema/competition-admin`. Expected: PASS.

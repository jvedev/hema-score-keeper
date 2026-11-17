# Baseline database schema

Status: **approved and implemented 2026-11-17, uncommitted.** See **Status / next**.

## Problem

A fresh database cannot be created from the repository (found 2026-11-17 while rebuilding the
dev database after the spreadsheet removal). The schema is spread over five places that do
not add up to a complete database:

| Place | What it does |
|---|---|
| `apps/backend/sql/migrations/*/migration.sql` (10 dirs) | Prisma-era incremental SQL for the Event-admin tables (`Event`, `Tournament`, `Ruleset`, `Stage`, `Match`, ...). The baseline they build on is missing, so they fail on an empty file (`no such table: Ruleset`). Nothing in code runs them. |
| `src/competition-bootstrap.ts` (330 lines) | Creates/repairs `User`, `Club`, `Competition*`, `UserSession`, token tables; includes a `User` table rebuild. |
| `src/schema-migrations.ts` (489 lines, 25 named migrations) | Adds columns and the Bout, Live and admin tables on top of whatever exists. |
| `test/helpers.ts` | Builds the 15 Event-admin tables by hand for tests, so tests do not use the real schema and can drift from it. |
| `scripts/seed-database.mjs` | Also creates 4 tables itself before seeding. |

The only complete schema lives in existing databases (the current `dev.db`: 43 tables, 87
indexes, including a stale `_prisma_migrations` table). A clean machine, the Windows package
on first start, and Alwaysdata therefore cannot start with an empty database.

## Goal

One baseline schema in code creates every table and index on an empty database. Tests, the
seed script, the dev server and deployments all use that same schema. Nothing is in
production, so no existing database is upgraded: old databases are recreated.

## Proposed approach

1. **Single source:** `apps/backend/src/schema.sql`, holding `CREATE TABLE` and
   `CREATE INDEX` statements for every table in `BackendDatabase` (`src/db.ts`), in dependency
   order, with foreign keys, checks, defaults and unique constraints. It is derived from
   the current database after all migrations (`sqlite_master` of the fresh `dev.db`), cleaned
   up and reviewed against the Kysely types; legacy objects with no code use
   (`_prisma_migrations`, `SchemaMigration`, unused tables/columns) are left out.
2. **Startup:** `initializeDatabase` applies `schema.sql` in one transaction on an empty
   database and stamps `PRAGMA user_version = 1`. A database that already has tables but no
   matching version is refused with a clear message ("recreate the database"), instead of
   being patched. Build copies `schema.sql` into `dist` (or it is embedded as a TS string, if
   that is simpler for the Windows package).
3. **Remove:** `sql/migrations/`, the table-creation and repair code in
   `competition-bootstrap.ts` (keep any non-schema bootstrap logic, e.g. a first admin, if
   present), the migration list and runner in `schema-migrations.ts`, the hand-written tables
   in `test/helpers.ts`, and the `CREATE TABLE`s in the seed script.
4. **Future changes:** until the first production release, schema changes edit `schema.sql`
   directly and the dev database is recreated. Real migrations (keyed on `user_version`) are
   introduced only once there is production data to keep; recorded as a rule in `AGENTS.md`.
5. **Dev database:** a script (e.g. `npm run backend:db:reset`) deletes `data/dev.db`, creates
   it from the baseline and seeds it. It keeps a timestamped backup of the old file.
6. **Tests:** a schema test checks that a fresh database contains exactly the tables of
   `BackendDatabase`, that `PRAGMA foreign_key_check` and `integrity_check` pass, that every
   foreign key target exists, and that a non-empty unversioned database is refused. All
   existing backend tests then run on the real schema via `test/helpers.ts`.

## Risks

- `test/helpers.ts` tables may differ from the real ones; switching tests to the real schema
  may surface failures that hide real bugs. Fix the code or schema, not the test, unless the
  test was wrong.
- Raw SQL anywhere (not via Kysely) that relies on a legacy column. Search for raw SQL before
  dropping anything.
- The Windows package must ship `schema.sql` (check `scripts/package-windows.mjs` /
  `build-deployment.mjs`).

## Verification

`npm run typecheck`, `npm test`, `npm run build`, `npm run test:database-mode:smoke`,
`scripts/verify-deployment-build.mjs`; start the backend on an empty data directory and log in
with a created admin; `backend:db:reset` then the seed; `foreign_key_check` clean.

## Out of scope

Ring/scoreboard settings from the table
(`2026-11-17-table-ring-and-scoreboard-settings.md`), the reduced Event-admin Phase 2, and
any data model redesign beyond removing dead objects.

## Status / next

Drafted and approved 2026-11-17; implemented the same day (uncommitted, on top of the uncommitted
spreadsheet removal).

What changed:

- **Schema form:** `apps/backend/src/schema.ts` (an embedded SQL string, not a `.sql` file, so `tsc`
  ships it in `dist/` and the Windows package needs no extra copy step). It holds
  `SCHEMA_VERSION = 1`, `BASELINE_SCHEMA_SQL` (41 tables, 66 named indexes) and `BACKEND_TABLES`
  (dependency order) with a compile-time check that it equals `keyof BackendDatabase`.
  `ensureBaselineSchema` creates the schema in one transaction on an empty database and sets
  `user_version`; it accepts a database with the current version and throws
  `DatabaseSchemaError` (pointing to `npm run backend:db:reset`) for anything else.
- **Opening a database:** `src/native-database.ts` (side-effect free) resolves the path,
  enables `foreign_keys`, applies the baseline and runs the demo-competition bootstrap;
  `db.ts` wraps it in Kysely. `competition-bootstrap.ts` now only adds the three demo
  competitions when `Competition` is empty (unchanged behaviour).
- **Removed:** `sql/migrations/`, `schema-migrations.ts` + its test, the table creation/repair
  in `competition-bootstrap.ts`, the hand-written tables in `test/helpers.ts`, the
  `CREATE TABLE`s in the seed script, `SchemaMigration` from `BackendDatabase`, and the unused
  `Bout.tableUserId` column.
- **Reconciled against `dev.db`:** dropped `_prisma_migrations`/`SchemaMigration`; removed
  duplicate indexes (old `idx_*` copies of the Prisma `*_idx`/`*_key` indexes, inline `UNIQUE`
  plus two unique indexes on token hashes) and indexes that are a prefix of a unique index;
  renamed the remaining `idx_*` indexes to the `Table_columns_idx/_key` style; `JSONB`/`BOOLEAN`
  column types became `TEXT`/`INTEGER`; `LiveRing.keeperToken`/`scoreboardToken` are
  `NOT NULL` (as typed); restored the `User.clubId → Club` foreign key from the Prisma schema
  and added `EnrollmentToken.defaultClubId → Club` (both `ON DELETE SET NULL`); added
  `ScheduledPhase_arenaId_idx`. Test-only differences (Ruleset pool columns, `definition NOT
  NULL`, unique `ScheduledPhase(arenaId, timeSlotId)`) are gone with the hand-written tables.
- **Seed/reset:** `scripts/seed-database.mjs` opens the database through the built
  `dist/native-database.js` (same path resolution and schema as the server), then clears every
  `BACKEND_TABLES` table and inserts sample data. `scripts/reset-database.mjs`
  (`npm run db:reset` / root `npm run backend:db:reset`) moves the database and its journal
  files aside as `<file>.bak-<timestamp>`, creates a fresh one and seeds it. Both npm scripts
  build the backend first.
- **Tests:** `test/schema.test.ts` (11 tests). Switching all tests to the real schema exposed
  one test bug: `live-database-access.test.ts` assigned the same official twice to one
  scheduled phase, which the real unique key forbids; the redundant insert was removed.
  `live-store.test.ts` column-order expectations follow the new baseline column order.

Verified by the coordinator (2026-11-17): `npm run typecheck` clean; `npm test` all pass
(backend 300, ui 245, competition 104, score-keeper 104, competition-domain 91,
competition-admin 74, api-session 30, match-engine 30, ranking 18); `npm run build`,
`npm run test:database-mode:smoke` (12) and `scripts/verify-deployment-build.mjs` pass. The
agent also started the built backend on an empty data dir, created an admin and logged in.
`npm run backend:db:reset` was run on the real dev database: old file kept as
`data/dev.db.bak-2026-11-17T15-48-57-554Z`; new `dev.db` has version 1, 41 tables, 9 users,
no foreign-key violations. Nothing committed.

Open points for the user: demo competitions are still auto-added on every start when
`Competition` is empty, including a first production start (could move to the seed only);
the restored/added club foreign keys null the column on club delete; a stray tracked or
untracked `apps/backend/dev.db` in the backend root.

Next:
[`2026-11-17-table-ring-and-scoreboard-settings.md`](2026-11-17-table-ring-and-scoreboard-settings.md).

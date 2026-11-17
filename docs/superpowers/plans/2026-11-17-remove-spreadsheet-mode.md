# Remove spreadsheet mode

Status: **draft, awaiting the user's approval.** Do not start implementation before approval.

## Goal

Spreadsheet (sheet) mode is dropped (user decision 2026-11-17). SQLite is the only source of
truth; a live tournament exists only as the database-mode projection of an Event-admin
Tournament. Remove all Google Sheets, Apps Script and xlsx import/sync/backup code, data and UI
so later phases (the reduced Phase 2 of `2026-11-07-unified-event-admin-implementation.md`)
build on a simpler base.

Nothing is in production: no data, migrations, legacy rows, or API compatibility need to be
preserved. The local `apps/backend/data/dev.db` may be discarded and reseeded.

## Inventory (recon 2026-11-17)

Backend (`apps/backend`):

- `src/google-sheets.ts` and its two server routes in `src/server.ts` (around lines 196 and 207,
  generic read/write of sheet values).
- `src/live/`: `google-sheets.ts`, `import.ts`, `sync-worker.ts` (started in `server.ts`),
  `xlsx-sink.ts`, `cell-source.ts`, `sheet-layout.ts`, `sync-errors.ts`.
- `src/live/live-routes.ts`: create sheet tournament (`POST /live-tournaments`), xlsx and Google
  import, sync status, `backup.xlsx`, fighter identity review and ambiguous-bout linking.
- Sheet-only references in `live-store.ts`, `bout-routes.ts`, `bout-score.ts`, `ring-access.ts`,
  `ring-routes.ts`, `database-mode.ts` (writes placeholder `layoutVersion`,
  `googleSpreadsheetId`, `sheetName`, `headerCell`).
- Schema (`src/db.ts`, `src/schema-migrations.ts`): `LiveTournament.mode`, `layoutVersion`,
  `googleSpreadsheetId`; `LiveBout.sheetName`, `headerCell`; `LiveSyncJob` and `LiveSyncState`
  tables; sheet identity fields on `LiveTournamentFighter` (`nameKey`, `ambiguous`).
- Tests: `live-google`, `live-import`, `live-sync`, `sheet-layout`, plus sheet cases in
  `live-store`, `live-bouts`, `live-ring`, `live-fighters`, `live-push`,
  `live-database-access`, `database-mode`, `schema-migrations`.

Frontends and packages:

- `packages/sheets-client` (whole workspace package; only used by score-keeper).
- `apps/score-keeper`: Google Sheets launcher route/screen in `main.ts` and `index.html`,
  `src/data/google-sheets-client.ts`, the database-versus-spreadsheet mode label in
  `ring/ring-mode.ts`, `mode` in `ring/live-client.ts`, sheet bits in `exchange-mapping.ts`
  and `ring-controller.ts`.
- `apps/competition-admin`: the live-tournaments screen (`screens/tournaments.ts`, 604 lines,
  with `mappers/tournaments.ts` and its client): create from spreadsheet, import, sync
  status, backup download, identity review. The same screen also manages ring keeper links,
  scoreboard links, ring colours, ruleset and fighter account links; see "Open question".
- `apps/competition/src/api-types.ts` (`sheetName`), `packages/competition-domain`
  (`ring-rules.ts` comment/defaults for sheet tournaments), `packages/ui` i18n keys
  (`tournaments.*` sheet strings, `ring.sheetMode`).

Repository files:

- `DEVELOPMENT_TournamentPoolsV3_.xlsx` (repo root).
- Docs: `docs/apps script setup.md`, `docs/google service account setup.md`,
  `docs/google sheets integration.md`, `docs/google sheets setup.md`; sheet sections in
  `docs/competition-deploy.md` and `docs/competition-backend-plan.md`.
- Local only: `.superpowers/sdd/2026-10-25-tournament-sheet-backend` and related verify data.

## Proposed scope

1. Backend: delete the sheet modules, routes, sync worker and tests listed above. Make
   `LiveTournament.sourceTournamentId` required and unique; drop the sheet columns and tables.
   Because nothing needs preserving, edit the schema definition directly instead of adding a
   down-migration, and recreate the dev database from the seed script.
2. Remove `packages/sheets-client` and its score-keeper usage. Removing a workspace changes
   `package-lock.json`; regenerating it runs `npm install`, which needs the user's permission.
3. Score-keeper: remove the Google Sheets launcher route and the mode label; ring mode always
   uses the database tournament.
4. Event-admin live tab: add ring management for the activated tournament: per ring the
   keeper link and scoreboard link (show, copy, rotate) and the fighter colours, plus the
   ring rules editor (`PUT /live-tournaments/:id/rules`). Authorization stays as today for
   these routes (tournament admins and `SYSTEM_ADMIN`). Fighter account linking is not moved:
   in database mode fighter accounts come from `Entry.userId`, so the manual link UI and its
   routes are removed with the sheet identity review.
   Setting colours and scoreboard options from the table is a separate follow-up phase:
   `2026-11-17-table-ring-and-scoreboard-settings.md`.
5. Competition-admin: delete the live-tournaments screen, its mapper, client calls, route
   and navigation entry. Competition-admin keeps only the rating Competition workflow.
6. Shared types, domain defaults and i18n keys: remove sheet-only entries.
7. Remove the xlsx file and the Google/Apps Script setup docs; trim sheet sections from the
   remaining docs. Mark the older sheet-era plans as historical rather than rewriting them.

## Decided by the user

- 2026-11-17: ring keeper/scoreboard links, ring colours and ring rules move to the Event-admin
  live tab; the Competition-admin live-tournaments screen is deleted.
- 2026-11-17: ring colours and scoreboard settings (mirror, show next bout, text size, theme)
  must be settable from the table; planned as the next phase, not in this one.

## Noted for later (not in this phase)

- The live ring rules (`LiveTournament.ruleset` JSON) and Event-admin `Ruleset` records
  (`rulesetId` on Tournament/Stage/Match) overlap. Unifying them is a separate decision.

## Verification

- `npm run typecheck`, `npm test` (all workspaces), `npm run build`.
- `npm run test:database-mode:smoke` (journey: create, schedule, activate, claim, score,
  finish, results, correction).
- Production build route check (`scripts/verify-deployment-build.mjs`).
- `git grep -i -E "google|spreadsheet|sheetName|xlsx"` shows only intentional historical
  mentions.

## Out of scope

- The reduced Phase 2 (rating Competition relationship) and later Event-admin phases.
- Collapsing all runtime migrations into a single baseline schema (possible follow-up; propose
  separately).
- HTTPS, Web Push and phone tests (deferred to project end; Codespaces planned).

## Status / next

2026-11-17: inventory done and the decision recorded in `AGENTS.md`, the tournament-mode spec,
the unified Event-admin plan and the session context. The user chose to move ring management
to Event-admin. Next: the user approves this plan; then implement.

2026-11-17, item 4 (Event-admin live tab ring management) implemented, uncommitted:
`packages/ui/src/components/event-view/live-rings.ts` (ring cards: table and scoreboard links via
`<invite-share>`, rotate with confirm naming the current keeper, colours) and `ring-rules-form.ts`
(rules editor with strict client validation; the backend `PUT /live-tournaments/:id/rules` silently
replaces out-of-range values with defaults instead of returning 400). Client methods in
`packages/event-admin-api`; i18n keys `liveRings.*` and `liveRules.*`. Links are
`<score-keeper>/ring/<keeperToken>` and `<score-keeper>/scoreboard/<scoreboardToken>`; the base is the
`score-keeper-url` attribute on `<event-view>` (set by `apps/event-admin` from `VITE_SCORE_KEEPER_URL`),
default `<origin>/score-keeper`. Verified: typecheck, all workspace tests and build pass.

2026-11-17, phase implemented (uncommitted, approved by the user):

- Backend: sheet modules, sync worker, Google routes and sheet-only live routes removed (list
  and `/fighters` too); `mode`, `layoutVersion`, `googleSpreadsheetId`, `sheetName`,
  `headerCell`, manual-assignment flags, `LiveSyncJob`/`LiveSyncState` and fighter identity
  fields dropped by editing migrations in place (the identity-review migration is gone).
  `LiveTournament.sourceTournamentId` and `LiveBout.sourceMatchId` are `NOT NULL UNIQUE`;
  `LiveTournamentFighter.userId` is required. Pools are grouped by scheduled phase
  (`bout-pools.ts`; fighter view returns `poolName`). Ring/rules/colour/rotate routes allow only
  the source Tournament's admins and `SYSTEM_ADMIN` (not Event admins). `exceljs` removed from
  `apps/backend/package.json`. `LIVE_DATA_DIR` and Google settings removed.
- Frontends: `packages/sheets-client` deleted; score-keeper Google Sheets launcher and mode
  label removed; Competition-admin live-tournaments screen, client calls, routes, nav and
  `VITE_SCORE_KEEPER_URL` removed; 95 unused i18n keys removed per language.
- Repo: root xlsx, four Google/Apps Script docs and `tools/apps-script/` deleted; sheet
  sections trimmed from `docs/competition-deploy.md` and `docs/competition-backend-plan.md`;
  `LIVE_DATA_DIR` removed from the Windows packaging/launcher.
- Verification (coordinator run): `npm run typecheck` clean; `npm test` all pass (backend
  301, ui 245, competition 104, score-keeper 104, competition-domain 91, competition-admin 74,
  api-session 30, match-engine 30, ranking 18); `npm run build` and
  `scripts/verify-deployment-build.mjs` pass. Not checked in a browser.

Open items:

- Done 2026-11-17 with the user's permission: `npm install` regenerated `package-lock.json`
  (sheets-client and exceljs gone). The old dev database is kept as
  `apps/backend/data/dev.db.bak-2026-11-17`; the new `dev.db` was made from a copy of it with
  all `Live*` tables dropped and their migration rows reset, then migrated and reseeded
  (new live shape, 0 foreign-key violations).
- **Found while rebuilding: a fresh database cannot be created from the repository.** The
  Event-admin base tables (`Event`, `Tournament`, `Ruleset`, `Match`, ...) only exist in old
  databases; `sql/migrations/*` are incremental Prisma-era files without their baseline, and
  `initializeDatabase` does not create these tables (only `test/helpers.ts` builds them by
  hand). This also affects a fresh deployment. Proposed follow-up: one baseline schema in code
  that creates every table, replacing `sql/migrations` and the runtime migration list.
- Tracked `google.md` at the repo root holds an e-mail address, what looks like a plain-text
  password and the Apps Script deployment id; the user decides about deleting it and rotating
  the password. Stale tracked build output `pages-stage/competition/**` is a deletion candidate.
- Backend `PUT /live-tournaments/:id/rules` silently replaces invalid values with defaults;
  should return 400 (small follow-up).
- Event-admin needs `VITE_SCORE_KEEPER_URL` in dev (separate Vite ports).

Next: resolve the open items, user review in the browser, commit on the user's request; then
the phase in `2026-11-17-table-ring-and-scoreboard-settings.md` (needs approval).

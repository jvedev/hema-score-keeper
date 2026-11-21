# Unified Event-admin implementation plan

Status: Phase 4 database-mode tournament workspace is incomplete; restore missing functionality and verify it before Phase 5.

Parent UX plan: [`2026-11-07-unified-event-admin-ux.md`](2026-11-07-unified-event-admin-ux.md).
Detailed concept: [`2026-11-07-unified-event-admin-ux-detail.md`](2026-11-07-unified-event-admin-ux-detail.md).
Wireframes: [`2026-11-07-unified-event-admin-wireframes.md`](2026-11-07-unified-event-admin-wireframes.md).

## Goal

Deliver one Event-admin shell for optional event components while preserving distinct
workflows and data:

1. Event-admin database-mode Tournament (`Event → Tournament`), including its schedule and
   database-mode live-scoring controls.
2. Spreadsheet-mode `LiveTournament`, including spreadsheet import, sync/backup, rules,
   fighter identity linking, and ring links.
3. Competition-admin rating Competition, which may remain standalone or attach to one Event.

Do not merge these three domains into a generic tournament/competition record. Retain the
standalone Competition-admin entry point. Do not start implementation until this plan and the
pre-implementation decisions below are approved.

## Decisions recorded from the user

> **2026-11-17 — spreadsheet mode dropped.** The user dropped spreadsheet mode entirely and works
> with SQLite only; nothing is in production, so no data, migrations, legacy rows, or API
> compatibility need preserving. This overrides every spreadsheet-mode decision below: there is
> no spreadsheet-mode component, no attach path for legacy sheet tournaments, and Phase 6 is
> cancelled. Phase 2 shrinks to the rating Competition relationship. Unowned-Event bootstrap
> and runtime migrations may be simplified. The removal runs first, as its own phase:
> `2026-11-17-remove-spreadsheet-mode.md`.

- An Event does not require any component and may contain multiple components.
- ~~The spreadsheet-mode `LiveTournament` workflow remains supported beside database mode.~~
  Superseded 2026-11-17 (see above).
- Spreadsheet-mode tournaments appear under the parent Event's **Components** as a separate
  component type, not as the database-mode Tournament or rating Competition.
- Event administrators of the parent Event gain management access to an attached
  spreadsheet-mode tournament, in addition to its existing creator and `SYSTEM_ADMIN`.
- The creator of a new Event becomes its first Event administrator. Existing Events without
  an administrator remain unowned until a `SYSTEM_ADMIN` assigns their first administrator.
- An Event may contain zero or more database-mode Tournaments; each database-mode Tournament
  belongs to exactly one Event.
- An Event may contain multiple rating Competitions; each rating Competition may be linked to
  no more than one Event.
- Attaching or detaching a Competition or spreadsheet-mode tournament changes only its parent
  Event relationship. Its child data is preserved; detaching restores standalone management
  for Competition and removes parent-Event access to the spreadsheet tournament. Deleting an
  Event also detaches these component types instead of deleting their data.
- Spreadsheet-mode tournament ring/bout order remains in its existing workflow; the shared
  Event planner schedules database-mode Tournament stages only.
- A rating Competition may be standalone or linked to exactly one Event. For an attached
  Competition, management rights combine the parent Event administrators, existing
  Competition administrators, and `SYSTEM_ADMIN`.
- The existing `/competition-admin/` entry point remains available for standalone
  Competitions.
- The existing Competition-admin spreadsheet-tournament entry remains permanently
  available alongside the Event-admin component entry.
- The development database may be restructured or development data discarded if needed, but
  only as an explicit, reviewed implementation decision.
- No npm packages may be installed without the user's permission. Use `cmd.exe`, Bash,
  Node.js, or Python for scripts and checks; do not use PowerShell.

## Repository baseline and constraints

- Event-admin currently boots one `<event-view>` plus a separate `/planning` view from
  `apps/event-admin/src/main.ts`. Event, tournament, and stage selection are held in the
  `packages/ui/src/components/event-view/event-view-controller.ts` state; the proposed
  entity-scoped routes require replacing or extending this routing model.
- `packages/event-admin-api/src/index.ts` already exposes event, tournament, planner, admin,
  and database-live APIs. The backend returns Events with nested database-mode Tournaments,
  Arenas, and Rulesets; it does not yet expose a unified component list.
- Event-admin database-mode Tournament ownership is already scoped through `TournamentAdmin`.
  Phase 1 adds a separate `EventAdmin` relation and APIs. Parent-Event authorization for
  spreadsheet-mode tournaments and Competitions still depends on their relationship fields.
- The `LiveTournament` table in `apps/backend/src/schema-migrations.ts` supports `SHEET` and
  `DATABASE`. Database-mode rows link to an Event-admin Tournament through
  `sourceTournamentId`; spreadsheet-mode rows have no Event link. Spreadsheet-mode
  management currently allows the creator or `SYSTEM_ADMIN`.
- Spreadsheet-mode UI and operations currently live in
  `apps/competition-admin/src/screens/tournaments.ts` and
  `apps/competition-admin/src/admin-client.ts`; the API is registered by the backend live
  routes. Preserve those existing operations and their mode guards.
- Rating Competition has its own schema, APIs, client, authorization, and UI. Its current
  schema has no Event relationship. Existing Competition admins are stored separately from
  Event-admin Tournament admins.
- Keep database-mode activation, scheduling, completed results, and corrections tied to the
  database-mode Tournament and its existing Event schedule. The spreadsheet workflow does not
  inherit database-mode live-result or correction controls.
- Do not inspect `apps/backend/src/google-sheets.ts` or `packages/sheets-client`; the existing
  spreadsheet integration is outside this planning task.

## Proposed data and API shape

Use the existing domain tables rather than a polymorphic `Activity` table:

- Database-mode Tournament remains a child of Event through `Tournament.eventId`.
  Database live scoring remains associated through `LiveTournament.sourceTournamentId`.
- Add a nullable Event relationship for spreadsheet-mode `LiveTournament` rows. New
  spreadsheet tournaments created from an Event must have that Event association; existing
  rows without an Event remain intact and need an explicit assignment before appearing as
  Event components. Database-mode Event ownership is derived from its source Tournament, not
  stored a second time.
- Add a nullable `Competition.eventId` relationship. Null means standalone; a Competition can
  be linked to no more than one Event, while an Event may contain multiple Competitions.
- Return a type-discriminated, type-specific component collection from an Event read API.
  Keep each underlying entity's existing fields and operations; avoid copying one type's
  behavior into another type's API.
- Add an explicit per-Event administrator relation and authorization helpers. The user has
  approved the membership bootstrap policy and permission outcomes for attached Competition
  and spreadsheet-mode tournaments.
- Add scoped create/link/unlink operations. Attaching or detaching changes only the parent
  relationship; it must not copy, merge, or delete Competition participants, LiveTournament
  bouts, exchanges, or other child data.
- Event deletion detaches standalone-capable Competition and spreadsheet-mode LiveTournament
  records rather than deleting them. Existing database-mode Tournament cascade behavior
  remains unchanged unless a reviewed migration intentionally changes it.

## Proposed implementation phases

Each phase is a separate review boundary. Ask for approval before starting a phase; do not
continue automatically to later phases.

### Phase 1 — Resolve permissions, ownership, and relationship rules

Scope:

- Introduce an `EventAdmin` membership model so "administrator of the parent Event" is
  enforceable and distinct from `TournamentAdmin` and `CompetitionAdmin`.
- The user approved this bootstrap: the authenticated creator of a new Event becomes its
  first Event administrator. Existing Events without an administrator remain unowned until
  a `SYSTEM_ADMIN` assigns their first administrator.
- Define the Event-admin operations that Event administrators may perform. Membership in an
  Event must not silently grant database-mode Tournament administration; the Tournament
  creator/admin and ring-role permissions remain scoped as already implemented.
- Record the permission contracts for attached spreadsheet-mode tournaments and
  Competitions; their enforcement depends on the relationship fields introduced in Phase 2.

Acceptance:

- API authorization tests cover Event admins, Tournament admins, `SYSTEM_ADMIN`, unrelated
  users, and revoked Event/Tournament membership.
- No Event-admin role is inferred from `COMPETITION_ADMIN`, Event membership from
  `TournamentAdmin`, or Tournament administration from Event membership.
- Existing Events remain unowned until a `SYSTEM_ADMIN` assigns their first administrator.

### Phase 2 — Schema, migration, and component API

Scope:

- Reuse the Phase 1 Event administrator relation and add any component-scoped membership
  operations required by the attachment flows.
- Add nullable `Competition.eventId` and sheet-mode `LiveTournament.eventId` relationships
  with indexes and reviewed delete behavior.
- Enforce parent-Event access for attached spreadsheet-mode tournaments while preserving
  their current creator and `SYSTEM_ADMIN` access. For an attached Competition, enforce the
  union of parent Event administrators, Competition administrators, and `SYSTEM_ADMIN`;
  standalone authorization remains unchanged.
- Preserve existing sheet tournaments with a null Event association. Provide an explicit
  assignment path; do not guess which Event owns legacy rows.
- Add Event component read models that return separate `databaseTournament`,
  `spreadsheetTournament`, and `competition` entries with the correct identifiers and
  summaries. Do not expose sheet-only controls on database-mode records.
- Add authorized create-for-Event, attach-existing, and detach operations. Validate
  component type, current parent, and Event-admin membership on the server.
- Implement the approved attach/detach and Event-deletion behavior without deleting child
  data, and define the explicit association path for existing unlinked sheet tournaments.
- Keep existing standalone Competition and spreadsheet-mode API routes working during the
  transition. Database-mode API contracts and source links remain backward-compatible.

Acceptance:

- Migration tests preserve all existing Competition and LiveTournament rows, mode values,
  spreadsheet identifiers, exchanges, and database source links.
- Re-running migrations is safe; no existing sheet record is assigned to an arbitrary Event.
- Tests cover standalone/attached/unattached cardinality, duplicate attachment, wrong-parent
  access, deletion/detachment, and idempotent reads.

### Phase 3 — Event-admin shell, routes, and event workspace

Scope:

- Replace the current panel-selection-only navigation with route handling for the Events
  index, Event workspace, type-specific component workspaces, and event planner. Retain the
  `/event-admin/` base path and use deep links that survive refresh and browser navigation.
- Build the Events index and focused Event overview, including zero-component state, the
  type-aware Components list, Event resources, and event-wide planning entry point.
- Add type-specific create actions. Creating an Event must not create any child component.
- Keep loading, empty, unauthorized, failure, and destructive states distinct.
- Localize the shell and new screens in the existing English/Dutch pattern and preserve
  keyboard and responsive behavior.

Candidate routes:

- `/events`
- `/events/:eventId`
- `/events/:eventId/tournaments/:tournamentId`
- `/events/:eventId/spreadsheet-tournaments/:liveTournamentId`
- `/events/:eventId/competitions/:competitionId`
- `/events/:eventId/planning`

Acceptance:

- Direct navigation, refresh, browser back/forward, switching Events, and missing IDs retain
  or reject context correctly; one Event's data is never displayed under another Event.
- A component-free Event can manage its Event-owned resources and planner.
- Component counts and cards match the authorized API data.

### Phase 4 — Database-mode Tournament and planner workspaces

Scope:

- Refactor the existing Event/Tournament/Stage tabs into focused, entity-scoped workspaces
  without changing tournament-specific behavior unnecessarily.
- Preserve participants, officials, stages, admins, stage progression, schedule, live status,
  completed results, and authorized correction history.
- Keep the event-wide planner focused on Event-admin database-mode Tournament stages, as the
  user decided. Do not schedule rating Competition bouts or spreadsheet-mode LiveTournament
  bouts into it.
- Keep Event membership and Tournament administrator controls separate and explain their
  permission scopes in the UI.

Acceptance:

- Existing database-mode schedule projection, scoring, authorization, completed-result
  correction, and tournament-admin behavior pass their current tests.
- Planner ordering and assignments remain attached to the correct Event and Tournament.
- The independent `npm run test:database-mode:smoke` journey remains green.

### Phase 5 — Rating Competition workspace and attachment

Scope:

- Integrate Competition management into the Event-admin shell using the existing
  Competition-admin APIs and capabilities: lifecycle, settings, signups/invites, participants,
  standings, admins, bout history, objections, and referee review.
- Reuse or extract typed API/UI pieces where the current app boundaries permit; avoid an
  iframe or a second visible application shell.
- Add create-for-Event and attach-existing flows. Preserve the existing
  `/competition-admin/` entry for standalone Competitions and open the same Competition
  workspace in the correct context.
- Show an attached Competition's Event breadcrumb and apply the approved combined permission
  rule server-side.

Acceptance:

- A Competition can be standalone or linked to exactly one Event; its existing data and
  Competition admins are preserved when linked/unlinked.
- Event administrators and Competition admins can manage an attached Competition; neither
  receives rights over unrelated Competitions.
- Existing standalone Competition-admin workflows continue to work.

### Phase 6 — Spreadsheet-mode tournament workspace and migration

Scope:

- Integrate the existing spreadsheet-mode workflow under Event → Components, preserving
  XLSX/Google import, sync/backup status, rules, fighter identity linking, and ring links.
- Reuse the current screen/API behavior where possible instead of reimplementing import,
  sync, or backup semantics.
- Create new sheet-mode tournaments in the selected Event. Provide a clear, authorized way to
  associate existing unlinked sheet-mode rows with an Event.
- Keep the current Competition-admin spreadsheet-tournament entry permanently alongside the
  Event-admin component entry. Both entry points manage the same `LiveTournament` records and
  preserve their existing creator/system-admin permissions.
- Clearly show sheet mode, sync errors, stale state, and backup availability. Database-mode
  activation/results/correction controls must not appear on this workspace.

Acceptance:

- Existing spreadsheet operations retain their current API behavior and creator/system-admin
  access; parent Event administrators also gain the approved access for attached records.
- A failed import or sync is never shown as a successful empty result.
- Sheet-only operations remain rejected for database-mode rows; database-mode operations
  remain unavailable for sheet-mode rows.

### Phase 7 — End-to-end verification and handoff

Scope:

- Add a migration/API journey covering Event creation and administration, creation of all
  three component types, Competition attach/detach, legacy sheet-tournament association,
  route access, and preservation of existing child data.
- Run targeted backend, API, UI, typecheck, and build checks for affected workspaces; run
  broader workspace checks if targeted results indicate regressions.
- Update the parent UX plan, this implementation plan, and `agent-session-context.md` with
  the completed phase, verification, unresolved items, and exact resume point.
- Do not install packages without user permission. Do not read the excluded legacy
  Google-Sheets integration files.

## Decisions needed before implementation

The user has approved permanent retention of the current Competition-admin
spreadsheet-tournament entry alongside the Event-admin component entry.

## Out of scope for this implementation plan

- Changes to bracket advancement or pool generation rules.
- Combining the rating Competition, spreadsheet-mode `LiveTournament`, and database-mode
  Tournament into one table or live-scoring mode.
- Moving live score entry from Score-keeper into Event-admin.
- A generic plug-in/component framework for hypothetical future Workshops.
- Real-phone, Web Push, or hosting acceptance unrelated to the Event-admin consolidation.

## Status / next

2026-11-21: **Phase 7 done — the unified Event-admin plan is complete** (Phase 6 was cancelled with spreadsheet
mode on 2026-11-17).
- End-to-end API journey `apps/backend/test/event-admin-journey.test.ts` (real HTTP routes only): Event and
  arenas (outsider refused), tournament with Pools and Elimination stages, 8 entries (outsider refused), pool
  phases on two rings with fighters assigned as the planner does → the planner generates two pools of four (12
  matches); bracket refused while pools are open; all pool results; tournament moved to the bracket; bracket
  filled 1 v 4 and 2 v 3 with pools apart; semi-finals planned and played → winners in the final, losers in the
  bronze match; refill refused once started; final played; pool results kept; a rating Competition created for
  the Event survives the Event's deletion detached (tournament removed). Together with the Phase 5 journey
  (`competition-event-journey.test.ts`, Competition attach/detach and shared management), `event-admin.test.ts`
  (Event vs tournament admin rights) and `database-mode-journey.test.ts` (live scoring and correction) this covers
  the plan's journey scope; the legacy sheet-tournament part no longer applies.
- Verification: `npm run typecheck` clean; `npm test` — backend 382, competition 104, competition-admin 90,
  score-keeper 120, api-session 30, competition-domain 93, match-engine 30, ranking 40, ui 436, all passed;
  `npm run build` passed for all workspaces; `npm run test:database-mode:smoke` 12 passed; `git diff --check` clean.
- Unresolved: the user's browser acceptance of Phases 4–5; rotating the password from the former `google.md`
  (still in git history); a check on a real tablet / large monitor; `ruleset-view` texts are English only;
  end-of-project HTTPS / Web Push / phone tests and re-testing the Windows package and Alwaysdata with schema 3.

2026-11-21: **Phase 4 completed** per `2026-11-20-phase-4-stages-and-matches.md`: stage and match screens,
shared admin look with stage path and stage pages, and elimination brackets (fill from pools with pluggable
seeding/pairing rules, automatic advancing, bracket view). Dev database at schema 3. Known limits are listed at
the end of that plan. Phase 5 was completed earlier; next is Phase 7 (end-to-end verification and handoff)
after the user's browser acceptance.

2026-11-20: **Phase 5 implemented and auto-verified** per
`2026-11-20-phase-5-competition-workspace.md` (user chose to continue with Phase 5 while Phase 4's
open items remain). The Competition-admin screens run inside the Event-admin shell on the shared
Event-admin session (`@hema/competition-admin/hosted`), with Event routes, breadcrumb, attach
existing / detach, and a "Part of <Event>" link in the standalone app. User decision: attaching
requires admin rights on both the Event and the Competition. Full suites, typecheck and builds pass;
browser acceptance by the user and the open points listed in that plan remain. Phase 6 stays
cancelled; next is Phase 7 (end-to-end verification and handoff) once the user accepts Phase 5.

2026-11-18: Phase 4's new tournament workspace contains placeholder officials, access, live and match panes and does not preserve all existing workflows. UI tests (308), backend tests (336), database-mode smoke (12), all-workspace typecheck and build passed, but these do not establish feature parity. A nullable stage-name crash was reproduced and fixed with a targeted regression test. Resume by comparing the new workspace against `event-view`, implementing missing Phase 4 functionality and meaningful journey tests, and performing browser acceptance; do not proceed to Phase 5 yet.

2026-11-19: the participant-management slice of Phase 4 is implemented and auto-verified per `2026-11-18-complete-participant-management.md` (Task 1 move guards on `PATCH /api/v1/entries/:id`, Task 2 scoped transactional `PATCH /api/v1/entries/:id/participant` + full person editor in `<tournament-workspace-view>`; acceptance journey `node .superpowers/verify/scripts/2026-11-19-participant-journey.mjs` 18/18, backend 355, UI 334, smoke 12, typecheck clean). Not started: porting the remaining placeholder panes (officials, access, matches, live) from `event-view`; the user still owes browser acceptance for the participant work. Open follow-up: the standalone `/api/v1/skills` endpoints are unauthenticated (flagged to the user in the participant plan).

Phase 1 was implemented, committed, and pushed to `origin/co-pilot` as `1366ee0`. It adds an
`EventAdmin` relation and guarded runtime
migration; requires authentication to create an Event and assigns its creator as first
administrator; exposes admin list/candidate/add/remove APIs with guarded legacy bootstrap,
active-account validation and last-admin protection; and applies Event-admin versus
Tournament-admin checks to Event resources, Tournament setup, and shared planning operations.
Event administrators can manage Event-owned resources and shared schedule placement, but do
not become Tournament admins. Tournament admins retain Tournament setup and scoring-result
permissions without gaining Event resource access. The Event-admin API client exposes the
new membership calls.

Verification passed: backend suite (40 files, 374 tests), all-workspace typecheck, backend
build, Event-admin production build, and `git diff --check`. No packages were installed.
`.idea/php.xml` remains unrelated and must stay excluded from commits.

Phase boundary note: parent-Event access to attached spreadsheet-mode tournaments and
Competitions, plus attach/detach and Event-deletion behavior, require their Event relationship
fields. Those dependent schema and authorization changes are placed in Phase 2, which has
not been approved or started.

Next: review the Phase 1 implementation and the dependency sequencing. Do not start Phase 2
until the user approves it.

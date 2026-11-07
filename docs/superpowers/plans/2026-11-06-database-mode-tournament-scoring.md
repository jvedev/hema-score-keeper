# Database-mode tournament scoring

Status: implementation in progress. The user approved the updated plan on 2026-11-06.
Ownership/admin APIs, bracket scheduling, database-mode activation/projection, and
server-side ring authorization are implemented. Transactional result/correction projection
is implemented on the backend; the remaining work is the admin correction UI, mode-aware
client details, and end-to-end verification.

## Goal

Add a first database-mode live-scoring path that uses the existing Event-admin
`Event → Tournament` data (arenas, stages, rounds, matches, entries and scheduled
assignments). The score-keeper, ring takeover, clock and scoreboard continue using the
existing live-scoring experience. Completed live results are reflected in the Event-admin
match data, while no spreadsheet is required.

The ratings/competition `Competition` model used by competition-admin is a separate domain
and is not the source of database-mode tournament schedules.

## User decisions

- Database-mode tournaments use the persistent Event-admin `Tournament` with its scheduled
  phases and matches.
- A user assigned to a ring's scheduled phase as `TABLE`, `JUDGE` or `JURY` may score that
  ring. Other scheduled roles (for example `FIGHTER`) do not grant scoring access.
- The person who creates an Event-admin tournament is automatically a tournament admin and
  can assign additional tournament admins.
- A `SYSTEM_ADMIN` can administer every tournament.
- `LiveExchange` is the authoritative live-scoring record. Finishing a bout projects the
  result transactionally into Event-admin `Match`/`Exchange` so existing Event-admin views
  can display it.
- Each bout needs an explicit order on its ring; the existing slot/round order alone is not
  enough when one ring has multiple bouts in a slot. Add a persisted per-ring bout order and
  an Event-admin editing workflow rather than inferring order from seed/ID order.
- Time-slot order is primary. Within each time slot, all bouts on the same ring share one
  explicit order across scheduled phases. A match without an assigned arena is not projected
  into live scoring until it is assigned to a ring.
- Pool matches map automatically to a scheduled phase using their generated round/time-slot
  and arena. Bracket matches are explicitly placed into a scheduled phase; bracket round
  numbers must not be interpreted as schedule slots. Slot and bout order express sequence,
  not guaranteed start times or match duration.
- Pool bout orders are initially assigned in the pool generator's match order, persisted as
  explicit per-ring orders, and editable in Event-admin after database-mode activation.
- After a bout is completed, only a tournament admin may correct its exchanges. Store the
  correction as a revision and re-project the corrected result into Event-admin
  `Match`/`Exchange`.
- Existing tournaments without a recorded creator/admin remain unowned. Only a
  `SYSTEM_ADMIN` may explicitly assign the first tournament admin; no user is granted
  ownership implicitly.
- Alwaysdata account checks and real-phone / Web Push checks are deferred. The local
  desktop login has succeeded.
- The user installs npm packages. Ask before any installation and do not install without
  approval. Do not use PowerShell on this machine.

## Current repository evidence

- Sheet mode currently hard-codes `LiveTournament.mode` to `SHEET` and stores sheet imports,
  workbook backup and Google sync state in the live tournament tables.
- `LiveRing`, `LiveBout` and `LiveExchange` already provide keeper/scoreboard tokens, ring
  colors, bout clocks, round state, exchanges and takeover. `LiveBout` already holds optional
  fighter identity IDs.
- The Event-admin data model has `Event → Tournament → Stage → Round → Match`, with
  `Entry` identities and `Arena`; `ScheduledPhase` associates stage, arena and time slot,
  and `ScheduledAssignment` holds `TABLE`, `JUDGE`, `JURY` and other roles.
- Event-admin `Tournament` currently has no creator/admin relationship. Its creation API
  does not record an authenticated creator. Adding ownership therefore needs a persistent
  backend model and signed-in creation/admin-assignment flow.
- The standalone `tournament-admin` app is currently an in-memory `<stage-view>` placeholder;
  the initial database-mode work should use the existing Event-admin data rather than
  expanding this editor.
- Pool match generation and Event-admin match completion already exist. The live scoring
  integration must not create parallel or contradictory completed results.

## Proposed architecture

1. Add a live-scoring link from an Event-admin `Tournament` to its `LiveTournament` record
   with `mode = DATABASE`; retain `SHEET` as the existing mode and its current behavior.
   Link each database-mode `LiveBout` to its source Event-admin `Match`.
2. Derive database-mode rings and bouts from the Event-admin schedule. Use the existing
   event `Arena` as the ring and `Entry` users as fighter identities. Time-slot order is
   primary; persist an explicit per-ring order among all bouts in each slot, including bouts
   from different scheduled phases. Do not project matches without an arena. Reconcile
   schedule changes safely: do not silently discard bouts that have exchanges; report
   conflicts and require an explicit resolution.
3. Keep `LiveExchange` as the authoritative live exchange log. When a bout is finished,
   atomically project its result and exchange details to the source `Match` and `Exchange`
   records so Event-admin readers see the result. For a correction, only a tournament admin
   may edit exchanges; preserve the prior state as a revision and atomically re-project the
   result. Test correction, retry and transaction failure; do not allow two write paths to
   drift.
4. On every ring read, claim and scoring write, authorize against the server-side source
   tournament: `SYSTEM_ADMIN`, a tournament admin, or a user currently assigned `TABLE`,
   `JUDGE` or `JURY` to the ring's scheduled phase. Re-check assignments on writes so
   removing an assignment revokes access. Preserve signed-in and active-keeper requirements.
5. Add a tournament-admin membership model. The authenticated creator is added atomically
   when creating the Event-admin tournament; authorized tournament admins can add/remove
   other admins, while `SYSTEM_ADMIN` remains global. Extend the Event-admin UI to sign in
   and manage this list.
6. Do not run sheet import, Google sync or local workbook backup for database mode. Preserve
   the existing sheet-mode API and UI behavior.

The user approved this architecture as the phase-plan basis. The schedule-order policy,
correction/revision behavior, and legacy-tournament ownership migration policy are now
resolved as recorded above.

## Proposed implementation tasks

1. **Ownership and admin assignment**
   - Add authenticated creator ownership and a tournament-admin relation for Event-admin
     tournaments. Leave existing rows without an administrator until a `SYSTEM_ADMIN`
     explicitly assigns the first one.
   - Add creator/admin/system-admin authorization helpers and owner/admin assignment APIs.
   - Wire Event-admin tournament creation and admin assignment UI to authenticated APIs.
   - Test creator, assigned admin, system admin, unauthorized user, duplicate assignment,
     and removal/revocation.
2. **Database-mode live source/linkage**
   - Extend the live schema to support `SHEET | DATABASE`, source tournament linkage, and
     a unique source `Match` linkage for each database-mode live bout.
   - Ensure sheet rows and imports remain unchanged by the migration.
   - Add a database-mode activation/create endpoint for an existing Event-admin tournament;
     reject duplicate activations and invalid/incomplete source references.
3. **Schedule and bout projection**
   - Build a deterministic projection from scheduled phases, arenas, rounds, matches and
     entries into live rings/bouts. Map pool rounds to schedule slots and arenas; let admins
     explicitly place bracket matches into scheduled phases. Order slots first, then use the
     explicit per-ring order across phases within each slot. Exclude matches without an arena.
   - Reconcile moved/removed/changed matches safely, preserving live exchanges and exposing
     conflicts rather than overwriting scored bouts.
   - Test same-ring order, multiple arenas, unscheduled matches, empty fighter sides,
     schedule edits before and after scoring, and repeated projection idempotency.
4. **Role-based ring access**
   - Extend existing ring lookup, claim, keeper checks and scoring writes for database mode.
   - Permit only `TABLE`, `JUDGE`, `JURY`, tournament admins and `SYSTEM_ADMIN`; never trust
     client-provided user or tournament IDs for authorization.
   - Keep sheet-mode access rules unchanged.
   - Test all allowed roles, disallowed `FIGHTER`/unassigned users, removed assignments,
     role changes, cross-tournament access, active keeper and takeover.
5. **Result projection and client experience**
   - Atomically write completed live results to Event-admin `Match`/`Exchange` records using
     the agreed source-of-truth policy; cover idempotent retry, correction and failed
     transaction behavior.
   - Update competition-admin's tournament screen and score-keeper ring details to identify
     database mode and show meaningful schedule/admin state.
   - Keep scoreboard output mode-agnostic and verify existing sheet-mode behavior.
6. **Verification and handoff**
   - Focused migrations, backend authorization/projection tests, Event-admin API/UI tests,
     score-keeper ring tests, and workspace typechecks/builds.
   - Verify a fresh local database can create an Event-admin tournament, assign admins,
     activate database-mode live scoring, score/finish a bout, and see the same result in
     Event-admin.
   - No real-phone, Web Push, or Alwaysdata-account acceptance in this phase.

## Implementation progress

- Added persistent tournament-admin membership and creator ownership, authenticated
  tournament creation, admin assignment/removal, and guarded first-admin assignment for
  legacy tournaments.
- Added Event-admin login/session support and a tournament-admin tab for listing, adding,
  and removing admins. Admin candidates are returned by a tournament-scoped endpoint, so
  ordinary tournament admins do not need global user-management access.
- Added backend tests for creator ownership, admin assignment/removal, legacy bootstrap, and
  access denial; all now pass.
- The in-memory backend fixture now creates the Event-admin schema prerequisites before
  applying backend migrations. The database-mode migration remains unapplied when `Tournament`
  is absent, so a fresh competition-only database can start and the migration can apply when
  Event-admin tables are present.
- Fixed the admin-candidate test expectation to compare the username actually assigned by
  `insertUser`.
- Added bracket-match schedule/unschedule APIs, included each match's scheduled phase and
  ring order in Event-admin match data, and validated stage, ring/slot order and pool-match
  restrictions server-side.
- Removed the old one-phase-per-ring/time-slot constraint so multiple stages can share a
  ring slot; the planner displays all such phases, and assigned bracket matches prevent
  phase deletion until explicitly unassigned.
- Added Event-admin per-match phase/order controls and tests for persistence, ordering
  conflicts, invalid placement, multiple phases, and planner rendering.
- Added authenticated database-mode activation and projection-refresh endpoints, with an
  Event-admin live-scoring tab to activate a tournament and safely refresh its schedule.
- Projection creates source-linked live rings and bouts, resolves fighter identities from
  Event-admin entries, persists generated pool orders, and leaves bracket bouts unprojected
  until an administrator assigns their phase and order.
- Reprojection is idempotent and uses a stored schedule signature; changed or removed bouts
  that have started scoring fail with a conflict. Event-admin pool regeneration also refuses
  to delete a live bout that has started, within the same transaction as the planner refresh.
- Database-mode tournaments do not enqueue sheet-sync jobs, and sheet import, backup, and
  sync endpoints reject database-mode tournaments. Pool ring order can be edited in the
  Event-admin match view after it has been generated.
- Added server-side database-mode ring authorization for ring reads, claims, bout details,
  and every score/clock write. `TABLE`, `JUDGE`, and `JURY` assignments are checked against
  the bout's current scheduled phase on each request; tournament admins and system admins
  bypass assignments. Ring lineup reads are filtered to assigned phases, and sheet-mode
  permissions remain unchanged.
- Added coverage for all allowed assignment roles, disallowed `FIGHTER`/unassigned users,
  phase-scoped read access, role revocation, and authorization on exchange, undo, start,
  finish, and clock writes.
- Added transactional projection on finish from authoritative `LiveExchange` rows into
  Event-admin match scores and exchange details. A persisted result signature makes finish
  retries idempotent; pre-existing external results conflict without changing the live bout.
- Blocked the separate Event-admin match-completion route for matches linked to database-mode
  live bouts, keeping a single result write path.
- Added tournament-admin-only correction of completed bouts. Each correction snapshots the
  prior bout/exchange state in `LiveBoutRevision`, replaces the current live exchanges, and
  reprojects the Event-admin result in the same transaction. Identical retries do not add a
  second revision; projection failures roll back the revision, exchanges, and match update.
- Event-admin match views already render the projected score/winner fields. A dedicated
  correction workflow and mode-aware score-keeper details remain to be implemented.
- The user requested intermediate commits and pushes on `co-pilot`; the completed prior
  milestone was committed as `617ded9` and pushed to `origin/co-pilot`.
- The activation/projection checkpoint was committed as `be965e1` and pushed to
  `origin/co-pilot`.
- Ring authorization was committed and pushed as `f6e7d14`.
- Verification after result projection: backend typecheck/build and complete suite pass
  (38 files, 368 tests). Shared-UI suite (42 files, 226 tests), Event-admin API/UI typechecks,
  and Event-admin production build also passed for the preceding checkpoint. No packages
  were installed.
- Commit and push the verified result/correction backend, then implement the admin correction
  workflow and mode-aware client details before final end-to-end verification.

## Local command note

On this machine, use Bash, DOS `cmd.exe`, Node.js, or Python for scripts and verification;
do not use PowerShell or PowerShell scripts. Do not install packages without permission.

## Acceptance criteria

- An Event-admin tournament creator becomes its admin; that creator can assign/remove
  additional admins; a system admin can manage all tournaments.
- A database-mode tournament uses the existing Event-admin schedule and entry identities,
  without workbook or Google configuration.
- Only `TABLE`, `JUDGE`, `JURY`, tournament admins and system admins can claim/write the
  corresponding ring; a removed assignment no longer authorizes writes.
- A completed live bout is visible in the existing Event-admin match results, with
  idempotent persistence and no duplicate or divergent exchange records.
- Schedule refresh/reconciliation never silently discards scored bouts.
- Sheet mode remains backward-compatible, including its import, sync, and current scoring
  permissions.
- Scoreboard and takeover continue to work for both modes.

## Out of scope

- Pool generation, seeding or bracket advancement changes.
- Replacing or expanding the `tournament-admin` in-memory editor.
- Spreadsheet import/export, Google sync, or cross-device synchronization between local and
  Alwaysdata databases.
- Alwaysdata account verification and real-phone/Web Push testing.

## Next

The user approved this plan as the basis on 2026-11-06, resolved the remaining design choices,
and approved implementation on 2026-11-06. Only a `SYSTEM_ADMIN` may assign the first admin
of a legacy tournament; time slots determine primary order, with an explicit shared per-ring
order within each slot across phases; and matches without an arena are excluded until
assigned. Pool matches map to slots from their generated round and arena; bracket matches
are explicitly placed in a phase. This ordering is sequence only, not a guaranteed bout start
time or duration. Correction behavior is to preserve the prior exchange state as a revision
and re-project the corrected result. Ownership/admin and explicit bracket scheduling passed
the full backend suite (353 tests) and shared-UI suite (224 tests) before activation.
Activation, schedule projection, and pool-order editing pass the full backend suite (37 files,
361 tests) and shared-UI suite (42 files, 226 tests). Ring authorization passed the full
backend suite (38 files, 364 tests), typecheck, and build. Transactional result projection,
admin corrections, migration, and rollback tests now pass the full backend suite (38 files,
368 tests), typecheck, and build. Commit and push this checkpoint to `co-pilot`, then add the
admin correction workflow and mode-aware client details before final integration verification.
Continue without PowerShell or package installation.

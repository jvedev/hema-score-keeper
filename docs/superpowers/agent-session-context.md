# Agent session context

This is the concise, repository-owned handoff for an AI agent starting a new session. Read it first, then follow the linked source documents for details. Keep it current whenever project direction or the resume point changes.

## Repository and collaboration

- This is the HEMA Score Keeper monorepo: several apps, shared packages, and a backend.
- Work directly on the current user-selected branch. The user commits changes unless they explicitly request a commit.
- Ask for the user's permission before installing npm packages; do not run installation commands without approval.
- For scripts and verification commands on this machine, use Bash, DOS `cmd.exe`, Node.js or Python; do not use PowerShell or PowerShell scripts.
- Ask questions one at a time. For large work, agree on the plan for the current phase before implementing it.
- The user wants work and decisions captured continuously, not reconstructed from a long conversation later. Update the relevant notes as decisions and results happen, and leave an explicit resume point before ending a session.

## Current project: tournament mode

The approved design is [`specs/2026-10-25-tournament-mode-design.md`](specs/2026-10-25-tournament-mode-design.md). Phases 1–3 are complete. Phase 4 fighter phones is implemented and committed on `co-pilot`; automated verification passed. Real HTTPS/Web Push checks on a phone are intentionally deferred until the end of the project. Read [`plans/2026-10-28-tournament-fighter-phones.md`](plans/2026-10-28-tournament-fighter-phones.md) and `.superpowers/sdd/2026-10-28-tournament-fighter-phones/progress.md`.

### Product direction and decisions to preserve

- Live tournament play is served from the backend's SQLite database. It must work over the venue's local network without internet.
- The spreadsheet is used to import participants/schedule and as a backup/mirror, not as the live communication layer between apps. The user chose sheet mode first; database mode is later.
- Every exchange is stored on the backend. A different score-keeper must be able to take over during a bout; the scoreboard is a read-only display driven by backend state.
- Tournament planning/bracket advancement remain outside the apps for now. The spreadsheet computes advancement, and a person re-imports it.
- The score-keeper must be signed in. Ring and scoreboard links have different permissions; the scoreboard is public/read-only.
- Wrong scores and holdups are explicit anti-goals. Prioritize recoverability, data integrity, and clear sync/connection status.
- Do not read `apps/backend/src/google-sheets.ts` or `packages/sheets-client` for this tournament work. The user explicitly excluded the legacy Google Sheets integration.

## How to use the Superpowers project artifacts

- `docs/superpowers/specs/`: approved product/design decisions and durable rationale.
- `docs/superpowers/plans/`: phase plans; use the current plan's status/next section as the resume point. Get approval for each substantial phase before building.
- `.superpowers/brainstorm/`: working brainstorm material and mockups; consult only when relevant to the active design.
- `.superpowers/sdd/<phase>/`: detailed task briefs, progress ledger, implementation/review reports, and verification notes. Some of this is git-ignored; it is useful during execution but must not be the only home for important lasting decisions.
- `.superpowers/verify/`: scripts and artifacts for manual or browser verification. Inspect scripts before running them, especially anything that starts/stops services or touches local data.
- Treat the relevant `.superpowers/` files as project working memory, not as disposable noise: read the active phase's ledger and task/review reports when continuing its work. Because some files are ignored or untracked, promote important decisions, results, unresolved risks, and resume points into tracked docs.
- `.claude/skills/`: task-specific workflows and generators. Use relevant skills as guidance, but check their file paths, commands, stack assumptions, and scripts against the current repository. Some instructions are stale or mismatched.

## Capture work continuously

As work proceeds, record:

1. User decisions and changed requirements in the tracked spec (or the relevant tracked design document).
2. Scope, tasks, dependencies, and acceptance checks in the phase plan.
3. Implementation steps, commands/results, review findings, unresolved issues, and the next exact action in the phase's `.superpowers/sdd/<phase>/progress.md`.
4. At phase completion, a concise final status and resume point in the tracked plan's **Status / next** section. Do not leave the only record in chat, an untracked scratch file, or Claude's external memory.

Before any work, inspect `git status`; preserve unrelated user changes. In particular, a modified local database may be user data and must not be overwritten or committed without explicit permission.

## Current resume point

Current branch is `co-pilot`; phase 4 is committed as `aa56d40`, with the local-database ignore/package housekeeping in `a81f0f4`. The repository now ignores `/apps/backend/data/dev.db`; its local file is preserved and untracked. The user wants two deployment options from one codebase: (1) local Windows deployment, started by an executable that serves the built PWAs and backend API behind a Fritz!Box (router only); and (2) Alwaysdata deployment with minimal differences. Prefer fixed same-origin app/API paths and runtime/environment configuration, not code forks. Local core scoring must work without internet. Phone tests and Web Push verification are deferred until the end; Web Push and service-worker/PWA secure-context features require HTTPS.

Deployment feasibility research (2026-11-05): Alwaysdata documents Node.js sites started by a command, with the site-provided `IP`/`HOST` and `PORT`; Node versions are selectable in the account environment. Its docs also offer a user-program HTTP site, SSH npm installation, and persistent account storage (disk quota includes files and databases). The required Node >=22 version still needs confirmation against the account's available versions, and `better-sqlite3` must be installed/built for its Linux runtime. The current backend already starts local-sync and push workers in its server process, so deployment as one long-running Node site process fits its current architecture; check account resource limits before relying on it operationally.

Repository findings before admin-app consolidation: Vite produced separate dist outputs for competition, competition-admin, score-keeper, event-admin, and the Tournament-admin placeholder. The Fastify backend serves the four retained apps from the static deployment configuration. The apps use stable non-overlapping paths, SPA history fallback, and same-origin `/api/v1` configuration. Some admin builds expect explicit participant-app and score-keeper URLs, and score-keeper's local `.env` defaults mock mode on, so production values must be addressed. Store `DATABASE_URL` and `LIVE_DATA_DIR` outside replaceable release files. A Windows executable should initially be scoped as a launcher/installer around a bundled Node runtime and platform-built backend/dependencies rather than assuming a single-file Node executable; `better-sqlite3` is a native addon, so Windows and Linux deployment artifacts need platform-specific dependency builds even when sharing source and application behavior.

Official references: [Alwaysdata Node.js configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/), [Alwaysdata user-program site](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-servers/user-program/), [Alwaysdata SSH](https://help.alwaysdata.com/en/docs/web-hosting/remote-access/ssh/), [Alwaysdata plan storage limits](https://help.alwaysdata.com/en/docs/admin-billing/billing/public-cloud-prices/), and [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts). On venue phones, an HTTP site on a LAN IP is not treated like `localhost` for service-worker secure-context features; ordinary browser app/API use can still work.

The user selected all five apps for the initial deployment scope and approved the deployment phase. Its implementation and verification were completed on the `co-pilot` worktree; see [`plans/2026-11-05-portable-app-deployment.md`](plans/2026-11-05-portable-app-deployment.md) and `docs/competition-deploy.md`. It introduced fixed same-origin paths, production static serving, persistent data-root configuration, and a Windows x64 package builder. The app-consolidation phase removes the unimplemented Tournament-admin placeholder, so the current deployment has four apps and `/tournament-admin/` must return 404. The previous Windows packaging smoke test covered the original five-app set; rerun the production build/route verification after the consolidation. Do not run `npm run package:windows` unless package installation is authorized because that script installs production dependencies.

Alwaysdata deployment is documented but not yet tested on an account; the user asked to defer that check while proceeding with the local track. When resumed, verify Node >=22 availability, Linux `better-sqlite3` installation, persistent storage, assigned `IP`/`PORT`, and worker resource limits. The Windows launcher and packaged server passed automated startup, app-route, database-persistence and secret-persistence checks; the user also confirmed successful login via the local app. LAN phone, HTTPS and Web Push checks remain deferred until project end. Local data backups are manual; copy the persistent data folder while the server is stopped.

The next feature phase is database-mode tournament scoring, planned in [`plans/2026-11-06-database-mode-tournament-scoring.md`](plans/2026-11-06-database-mode-tournament-scoring.md). The user approved the plan as its basis on 2026-11-06. Its source is the Event-admin `Event → Tournament` model; ring scoring is allowed to `TABLE`, `JUDGE`, `JURY`, tournament admins, and system admins. The Event-admin tournament creator becomes an admin and may assign additional admins. `LiveExchange` is the source of truth for live scoring, with completed results transactionally projected into Event-admin `Match`/`Exchange`. Each ring has explicit per-bout ordering. For corrections, only tournament admins edit the exchanges; keep the prior record as a revision and re-project the corrected result. Existing tournaments without a recorded creator/admin remain unowned until a `SYSTEM_ADMIN` explicitly assigns their first admin. Time-slot order is primary; bouts on the same ring and slot have one explicit order across scheduled phases. Pool matches map from their generated round and arena; bracket matches are explicitly placed in a scheduled phase. This is sequence only, not a guaranteed start time or bout duration. Matches without an arena are excluded from live scoring until assigned. These design choices are now resolved and implementation is in progress with the user's approval. The separate ratings `Competition` entity is not the source. Do not use PowerShell on this machine. Ask before installing npm packages; do not run installation commands without approval.

Implementation update: deployment/admin/bracket planning was committed and pushed to `origin/co-pilot` as `617ded9`; database-mode activation and schedule projection as `be965e1`; ring authorization as `f6e7d14`; transactional result projection/corrections as `d463163`; Event-admin result correction UI and score-keeper mode details as `7565f33`. The Event-admin live tab lists completed results and provides an admin correction form with client-side validation; score-keeper ring details show database versus spreadsheet mode in English and Dutch. Schedule-refresh responses are guarded against tournament switches, and the score-keeper mock fixtures include current schedule data. A fresh isolated backend journey test now exercises creation, schedule, activation, claim, score, finish, result visibility and correction; migration coverage checks a deferred Event-admin migration and preservation of old sheet data. Run both with `npm run test:database-mode:smoke`. Full workspace tests pass (backend 39 files/370 tests, score-keeper 13 files/105 tests, shared UI 42 files/229 tests, plus other workspace suites); workspace typechecks and production builds pass. Interactive local-app acceptance remains deferred until the user can test. `.idea/php.xml` remains local and uncommitted. No packages were installed. Use Bash, DOS `cmd.exe`, Node.js or Python for scripts/checks; do not use PowerShell. See the plan's **Implementation progress** and SDD ledger for details.

The user approved the Tournament-admin placeholder consolidation. Event-admin remains the only administration app at `/event-admin/`; `/tournament-admin/` is removed without redirect. The generic `admin:*` npm scripts target Event-admin. The four-app production build and route verification, all workspace typechecks, and all 1,101 workspace tests pass; the removed path returns 404. No packages were installed. `npm run package:windows` was not run because it installs production dependencies and no package installation was authorized. The Windows package-copy list now includes only the four retained apps. Domain rule for the redesign: an event can have zero or more tournaments; every tournament belongs to exactly one event. The development database may be restructured or discarded if the later design requires it, but the consolidation did not modify database data or schema. It was committed and pushed on `co-pilot` as `f5b5602`; completion notes were pushed as `7a821a5`. `.idea/php.xml` remains local and uncommitted.

The user approved the event-first information architecture for the unified Event-admin UX, then clarified that an event must also be able to contain the existing Competition-admin Competition and later component types such as workshops. A Competition is a distinct domain/workflow from an Event-admin Tournament. The user chose to administer an attached Competition directly inside the Event-admin shell. For an attached Competition, event admins of its parent event and existing Competition admins both retain management rights; `SYSTEM_ADMIN` remains global. Competition may remain standalone or be linked to exactly one Event; the existing `/competition-admin/` remains the standalone entry point. The proposal and detailed screen/interaction concept are in [`plans/2026-11-07-unified-event-admin-ux.md`](plans/2026-11-07-unified-event-admin-ux.md) and [`plans/2026-11-07-unified-event-admin-ux-detail.md`](plans/2026-11-07-unified-event-admin-ux-detail.md). The user approved attach/detach semantics: preserve component data, detach rather than delete these types when an Event is deleted, and remove parent-Event access after detachment. Preserve all existing Event-admin/planner/live-result and Competition-admin capabilities unless a specific removal is approved. No product code/API/database changes are authorized by the UX direction approval.

The user approved proceeding with low-fidelity screen concepts. Those are in
[`plans/2026-11-07-unified-event-admin-wireframes.md`](plans/2026-11-07-unified-event-admin-wireframes.md);
the detailed concept and parent plan also include the expanded component model and combined
permissions. During the capability inventory, a separate spreadsheet-mode `LiveTournament`
workspace was identified in Competition-admin (imports, sync/backup, rules, fighter identity
links, ring links). The user decided to retain it as a separate Event component alongside
database-mode tournaments. It is not the rating Competition or Event-admin database-mode
Tournament, and must not be conflated with either. Updated wireframes now show separate
component choices and workspaces. The user also decided that parent-Event administrators
gain management access to an attached spreadsheet-mode tournament in addition to its current
creator and `SYSTEM_ADMIN`. The user approved the Event-admin bootstrap: a new Event's
creator becomes its first administrator; a `SYSTEM_ADMIN` assigns the first administrator
for existing unowned Events. The low-fi wireframes are approved. A proposed implementation
plan is in
[`plans/2026-11-07-unified-event-admin-implementation.md`](plans/2026-11-07-unified-event-admin-implementation.md);
no code or schema changes have been made. Before implementation, resolve its one remaining
decision: the legacy sheet-workflow entry-point transition. The user confirmed
spreadsheet-mode ring/bout order stays in its existing workflow and the shared Event planner
schedules database-mode Tournament stages only. The user has also confirmed that an Event may contain multiple rating
Competitions, while each Competition may be linked to only one Event.

This handoff was created on 2026-10-28. If the repository's plans or commit history have moved on, trust the newer repository evidence and update this file rather than following stale status here.

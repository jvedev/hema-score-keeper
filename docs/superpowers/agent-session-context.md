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

Repository findings: Vite produces separate dist outputs for competition, competition-admin, score-keeper, event-admin, and tournament-admin. The Fastify backend currently serves API routes only; it does not serve these static files. The apps need stable non-overlapping paths, SPA history fallback, and same-origin `/api/v1` configuration. Some admin builds currently expect explicit participant-app and score-keeper URLs, and score-keeper's local `.env` defaults mock mode on, so production values must be addressed. Store `DATABASE_URL` and `LIVE_DATA_DIR` outside replaceable release files. A Windows executable should initially be scoped as a launcher/installer around a bundled Node runtime and platform-built backend/dependencies rather than assuming a single-file Node executable; `better-sqlite3` is a native addon, so Windows and Linux deployment artifacts need platform-specific dependency builds even when sharing source and application behavior.

Official references: [Alwaysdata Node.js configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/), [Alwaysdata user-program site](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-servers/user-program/), [Alwaysdata SSH](https://help.alwaysdata.com/en/docs/web-hosting/remote-access/ssh/), [Alwaysdata plan storage limits](https://help.alwaysdata.com/en/docs/admin-billing/billing/public-cloud-prices/), and [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts). On venue phones, an HTTP site on a LAN IP is not treated like `localhost` for service-worker secure-context features; ordinary browser app/API use can still work.

The user selected all five apps for the first deployment scope and approved the deployment phase. Its implementation and verification are complete on the current `co-pilot` worktree; see [`plans/2026-11-05-portable-app-deployment.md`](plans/2026-11-05-portable-app-deployment.md) and `docs/competition-deploy.md`. It now has fixed same-origin paths, production static serving, persistent data-root configuration, and a Windows x64 package builder that bundles Node, Windows-native production dependencies, and a self-contained launcher. `npm run package:windows` passed the production build and an actual launcher start/stop smoke check. The added `node scripts/package-windows.mjs --verify-only <package-directory>` check uses an existing package to verify SQLite data and `AUTH_SECRET` persist across launcher restart, without installing packages. The generated package is ignored under `artifacts/windows/`; no commit was made.

Alwaysdata deployment is documented but not yet tested on an account; the user asked to defer that check while proceeding with the local track. When resumed, verify Node >=22 availability, Linux `better-sqlite3` installation, persistent storage, assigned `IP`/`PORT`, and worker resource limits. The Windows launcher and packaged server passed automated startup, app-route, database-persistence and secret-persistence checks; the user also confirmed successful login via the local app. LAN phone, HTTPS and Web Push checks remain deferred until project end. Local data backups are manual; copy the persistent data folder while the server is stopped.

The next feature phase is database-mode tournament scoring, planned in [`plans/2026-11-06-database-mode-tournament-scoring.md`](plans/2026-11-06-database-mode-tournament-scoring.md). The user approved the plan as its basis on 2026-11-06. Its source is the Event-admin `Event → Tournament` model; ring scoring is allowed to `TABLE`, `JUDGE`, `JURY`, tournament admins, and system admins. The Event-admin tournament creator becomes an admin and may assign additional admins. `LiveExchange` is the source of truth for live scoring, with completed results transactionally projected into Event-admin `Match`/`Exchange`. Each ring has explicit per-bout ordering. For corrections, only tournament admins edit the exchanges; keep the prior record as a revision and re-project the corrected result. Existing tournaments without a recorded creator/admin remain unowned until a `SYSTEM_ADMIN` explicitly assigns their first admin. Time-slot order is primary; bouts on the same ring and slot have one explicit order across scheduled phases. Pool matches map from their generated round and arena; bracket matches are explicitly placed in a scheduled phase. This is sequence only, not a guaranteed start time or bout duration. Matches without an arena are excluded from live scoring until assigned. These design choices are now resolved and implementation is in progress with the user's approval. The separate ratings `Competition` entity is not the source. Do not use PowerShell on this machine. Ask before installing npm packages; do not run installation commands without approval.

Implementation update: the tournament-ownership/admin foundation, explicit bracket scheduling and portable deployment were committed and pushed to `origin/co-pilot` as `617ded9`. Database-mode activation and schedule projection were committed and pushed as `be965e1`: Event-admin has a live-scoring tab, pool bout orders are seeded in generator order and editable after activation, ring/bout projections carry source links and schedule signatures, and unsafe changes to active bouts are rejected. Spreadsheet import, sync and backup paths are blocked for database mode. Event-admin pool regeneration protects scoring-started bouts transactionally. Server-side ring authorization is implemented for scheduled `TABLE`, `JUDGE`, and `JURY` assignments, tournament admins and system admins, with assignment rechecks on reads, claims and scoring writes; sheet-mode behavior is preserved. Backend typecheck/build and full suite pass (38 files, 364 tests). Shared-UI suite (42 files, 226 tests), Event-admin API/UI typechecks and production build also passed for the preceding activation checkpoint. No packages were installed. Commit and push ring authorization, then implement transactional result/correction projection. Use Bash, DOS `cmd.exe`, Node.js or Python for scripts and checks; do not use PowerShell. See the plan's **Implementation progress** and the SDD ledger for exact detail.

This handoff was created on 2026-10-28. If the repository's plans or commit history have moved on, trust the newer repository evidence and update this file rather than following stale status here.

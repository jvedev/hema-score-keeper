# Complete Participant Management Implementation Plan

> **For agentic workers:** Use `executing-plans` for inline execution after approval. Keep the current branch and do not commit or install packages without permission.

**Goal:** Preserve the previous participant-management capabilities in the tournament workspace without corrupting tournament data or concealing partial saves.

**Architecture:** Extend the existing participant editor and add only the backend protections needed for safe reassignment. User details and skills belong to the shared user, while role, seed and tournament belong to the entry; communicate the shared scope and recover clearly from partial writes.

**Tech Stack:** TypeScript, web components, Vitest, Fastify, SQLite.

**Spec:** `docs/superpowers/specs/2026-10-25-tournament-mode-design.md`; existing Phase 4 plan `docs/superpowers/plans/2026-11-18-phase-4-database-mode-tournament-workspace.md` and prior `event-view` participant editor define the preserved behavior.

## Status / next

**Tasks 1–3 done (2026-11-19); browser acceptance by the user remains open — do not mark the plan complete until then.**

- **Task 1 done:** `PATCH /api/v1/entries/:id` validates tournament moves transactionally (new `assertEntryCanBeReassigned` in `apps/backend/src/server.ts`): rights to both tournaments (403), duplicate destination entry → 409, any old-tournament `Match` (`entryAId`/`entryBId`/`winnerEntryId`) or `StageOfficial` reference → 409, data unchanged. Design note: `ScheduledAssignment` rows reference `userId`, not the entry, so planner assignments cannot go stale from an entry move — no guard needed there. The workspace edit form gained a localized destination-tournament selector.
- **Task 2 done:** new scoped, transactional endpoint `PATCH /api/v1/entries/:id/participant` (guarded by `requireUser` + `requireEventTournamentAdmin` on the entry's tournament). Rationale vs. the old editor's flow: (a) old `PATCH /users/:id` requires COMPETITION_ADMIN+ and would 403 for USER-role tournament admins, and granting them global user-admin rights is forbidden by this plan; (b) `POST/PATCH/DELETE /api/v1/skills` are **unauthenticated — pre-existing security hole, flagged to the user, not silently changed**; (c) one transactional request means no partial saves and no duplicate skills. The endpoint edits `username` (login handle only — the shared `name` column is deliberately untouched, verified by test), the 4 volunteer flags, `skills: [{skillName: JUDGE|JURY, skillLevel: number|null}]` (null clears; unknown name → 400; duplicate rows collapse; unrelated skills like FIRST_AID preserved), and `tournamentId`/`kind`/`seed` in the same save (reusing the Task 1 move guards). UI: edit-entry form in `<tournament-workspace-view>` sends one `updateEntryParticipant` call; add/bulk-add gained an "also volunteer" option (`kind` → `BOTH`).
- **Task 3 done:** automated acceptance journey `node .superpowers/verify/scripts/2026-11-19-participant-journey.mjs` — 18/18 checks pass against the built backend on an isolated temp SQLite DB (wrong/valid sign-in, event + tournaments, entry create, participant save incl. name/username separation and skill set/clear/preserve, full rollback on duplicate username, safe move, duplicate destination 409, 403 refusals, deletion, forbidden deletion). Full suites after that: backend 355 passed, UI 334 passed, database-mode smoke 12 passed, workspace typecheck clean. Remaining manual step: browser acceptance by the user against `npm run backend:dev` (:3001) + `npm run event-admin:dev -- --port 5182` → `http://localhost:5182/event-admin/events` (login `jeroen` or `admin`, password `zwaard`).
- **Open issue for the user:** the skills endpoints (`POST/PATCH/DELETE /api/v1/skills` in `apps/backend/src/server.ts`) accept no auth; the new participant endpoint manages judge/jury skills with proper authorization, but the standalone endpoints remain open and are used elsewhere. Recommend a follow-up decision (harden them or remove them).

## Global Constraints

- SQLite only; no spreadsheet integration, migrations, database reset, package installation, branch changes or commits.
- Preserve existing unrelated working-tree changes and use `cmd.exe`, Bash, Node.js or Python for checks on Windows.
- Localize new UI text in English and Dutch. Do not silently drop input or claim an operation was atomic when it is not.
- Tournament administrators manage entries; global user changes must not grant them unrestricted user-administration rights.

## Review Focus

- A participant already registered in the destination tournament must not be duplicated or partially moved.
- A move must not leave the entry referenced by matches, stage officials, or planner assignments in the old tournament.
- A partial multi-request save must report the partial result and allow a safe retry without duplicate skills.
- Changing the current event or tournament during a request must not overwrite the new view.
- Restricted users must receive a clear authorization error without unintended elevation or changes to unrelated users.

### Task 1: Safe tournament reassignment

**Files:** `apps/backend/src/server.ts`, `apps/backend/test/entry-reassignment.test.ts`, `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.ts`, its test, and English/Dutch message files. **Done 2026-11-19.**

- [x] Add backend tests for a successful move with rights to both tournaments, duplicate destination, missing destination authorization, and source references in matches, stage officials and planner assignments. Expect a conflict and unchanged data for unsafe moves.
- [x] Run the tests and confirm the unsafe cases fail against the current endpoint.
- [x] Validate the move transactionally in `PATCH /api/v1/entries/:id`: require rights to both tournaments, reject duplicates and source references instead of deleting history; leave other updates unchanged.
- [x] Add UI tests for destination selection, retained input after tab changes or errors, successful refresh and a tournament switch while saving; implement the localized selector and guarded save.
- [x] Run targeted backend and workspace tests.

### Task 2: Shared user details and volunteer skills

**Files:** `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.ts`, its test, `apps/backend/src/server.ts` and `apps/backend/test/entry-participant.test.ts` (new scoped endpoint was necessary), `packages/event-admin-api/src/index.ts`, English/Dutch message files. **Done 2026-11-19 — implementation choice documented in Status/next.**

- [x] Compare the previous entry and volunteer editors, including creation options and judge, jury and table skill handling, against actual API contracts and permissions; document any mismatch before selecting an implementation.
- [x] Add failing behavioral tests for editing name, volunteer preferences and skill levels, including clearing a skill, preserving unrelated skills, validation, cancellation, tab changes and user-visible shared-account scope.
- [x] Add tests for partial save, retry after a skill was created, authorization refusal, repeated submission and changing tournament during the request.
- [x] Implement the minimum authorized editor and explicit partial-save feedback; reload current server state before retrying and never create duplicate skill records. Ensure name changes preserve the backend's distinct account name and username semantics. (Implemented as one transactional `PATCH /events/:id/... /entries/:id/participant` request instead of multi-request saves — no partial save is possible; failed input state is retained in the form for a retry.)
- [x] Cover any missing single/bulk creation options from the old workflow, without weakening the existing duplicate and retry protections. (Single-add and bulk-add gained an "also volunteer" checkbox → entry `kind` `BOTH`.)
- [x] Run targeted UI and relevant backend tests, then the UI suite and affected typechecks.

### Task 3: Acceptance and handoff

**Files:** this plan and `docs/superpowers/agent-session-context.md`. **Done 2026-11-19, except user browser acceptance.**

- [x] Run a real-backend acceptance journey on isolated data: add, bulk-add option, edit shared details and skills, move, reject unsafe move, delete, handle a failure and retry, and exercise available permissions. (Automated over real HTTP against the built backend on a temp SQLite DB: `.superpowers/verify/scripts/2026-11-19-participant-journey.mjs`, 18/18 checks passed. Browser walkthrough remains for the user — see Status/next for the dev-server commands.)
- [x] Run the relevant workspace tests and typechecks; record exact commands, results, limitations and the next step here and in the session context. Do not mark the work complete if acceptance or a required capability remains open.
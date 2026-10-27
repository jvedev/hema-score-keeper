# Tournament Mode Phase 2: Table Ring Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in score-keeper scans a ring QR or opens a ring link, gets that ring's bouts in order, and scores them live, with every exchange stored on the backend as it happens. Another phone can take over mid-bout. The laptop person has a screen to create the tournament, import the sheet, see the sync status and hand out ring links. A fresh venue-laptop database works.

**Architecture:**
- Backend: extends `apps/backend/src/live/` (phase 1) with:
  - a ring keeper token in each ring link
  - one active keeper device per ring
  - the bout clock stored on the backend
- Score-keeper: gets a **ring mode** (`/ring/:token`). It reuses its existing scoring screen and `packages/match-engine`. An adapter turns each scored exchange into a live API call. A persistent outbox makes sure a flaky LAN never loses or duplicates an exchange.
- Competition-admin: gets a **Tournaments** section for the laptop person.

**Tech Stack:** Fastify/Kysely backend; Vite + TS apps; `@hema/api-session` for sign-in; `@hema/ui` views (`invite-share` for QR codes); Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-tournament-mode-design.md` (§6 "Getting a ring", "Takeover"; §7 ring link, takeover clock, one active keeper, takeover notice, corrections). Phase 1 plan and ledger: `docs/superpowers/plans/2026-10-25-tournament-sheet-backend.md`, `.superpowers/sdd/2026-10-25-tournament-sheet-backend/progress.md` (deferred minors, phase-2 backlog).

## Global Constraints

- Work on `master`, and **do not commit**; the user commits. Use Bash, not PowerShell. Tests never open `apps/backend/data/dev.db` or `apps/backend/dev.db`. Never print secrets.
- The anti-goals are **wrong scores** and **holdups**. An exchange is sent once (idempotent `clientExchangeId`) and retried until it is acknowledged. It is never silently dropped.
- Sheet mode: **any signed-in account holding the ring link** may score that ring. The link alone, without sign-in, does not let anyone score.
- **One active keeper per ring.** Taking over moves the ring to the new device. The old device becomes read-only and shows "This ring was taken over by <name>".
- **Takeover clock:** the bout timer pauses at the last time the backend knows, and the new keeper restarts it.
- Undo always sends `expectedExchangeId`. 0/0 exchanges are not sent (the user's decision). Deductions are negative points for one fighter.
- EN + NL texts; phone first; dark theme; existing view conventions (escaped data, numbers coerced).

## Review Focus

1. **The phone loses its connection mid-bout.** Exchanges queue locally and survive a reload. They are sent in order once the connection is back, and the screen shows "n not sent". → Task 5 test `outbox survives reload and sends in order`.
2. **The old keeper's phone comes back after a takeover.** Its queued exchanges are refused, not applied, and it shows the takeover notice. → Task 2 test `writes from a replaced device are refused`.
3. **A scan with an old or rotated ring link** gives a clear "link no longer valid" message, not a blank screen. → Task 4 test `rotated token shows invalid link`.
4. **Two people scan the same ring at once.** The second sees who is keeping and must confirm the takeover. → Task 4 test `claim on an active ring asks to confirm`.
5. **Fresh venue database:** sign-in works. → Task 1 test `login works on a fresh database`.

---

### Task 1: Fresh database and the first admin

**Files:** `apps/backend/src/schema-migrations.ts`, `apps/backend/scripts/create-admin.mjs` (new), `apps/backend/package.json`, `apps/backend/src/server.ts`, `docs/competition-deploy.md`. Test: `apps/backend/test/fresh-database.test.ts`.

**Interfaces:**
- Produces:
  - a migration `2026-10-26-skill-table` that creates `Skill` and its index when they are missing, mirroring `sql/migrations/20260809154100_officials`
  - `npm run create-admin --workspace @hema/backend -- --username <u> --name <n>`, which asks for the password on stdin and creates a `SYSTEM_ADMIN` in the configured DB
  - a startup warning when `AUTH_SECRET` is unset, with the venue section of the docs saying to set it
- [ ] Write the tests: `login works on a fresh database` (fresh in-memory DB: create-admin logic, then login gives 200) and `create-admin refuses a duplicate username`. Run them and see RED. Implement. Run them and see GREEN.

### Task 2: Ring keeper token, active keeper and clock (backend)

**Files:** `apps/backend/src/schema-migrations.ts` (migration `2026-10-26-live-ring-keeper`), `apps/backend/src/db.ts`, `apps/backend/src/live/ring-routes.ts` (new), `apps/backend/src/live/bout-routes.ts`, `apps/backend/src/live/live-routes.ts`. Test: `apps/backend/test/live-ring.test.ts`.

**Interfaces:**
- **Columns.**
  - `LiveRing`: `keeperToken` (random 24 bytes, base64url, unique), `activeDeviceId`, `activeUserId`, `activeSince`.
  - `LiveBout`: `clockSeconds` (integer, default 0), `clockRunning` (0/1), `clockUpdatedAt`.
- **Routes.** All require sign-in.
  - `GET /api/v1/live-rings/by-token/:token` returns `{ ring, tournament, bouts, activeKeeper: { userName, since } | null }`, or 404 when the token is unknown.
  - `POST /api/v1/live-rings/by-token/:token/claim` with body `{ deviceId, confirm?: boolean }` returns `{ ring }`. When another device is active and `confirm` is not true, it answers 409 `{ reason: "ACTIVE_KEEPER", activeKeeper }`. On claim, any running bout clock is paused at its stored seconds.
  - Tournament creator or system admin only: `GET /api/v1/live-tournaments/:id/rings` returns each ring with its `keeperToken`. `POST /api/v1/live-rings/:id/rotate-token` makes a new token, so the old link stops working.
- **Writes require the active keeper.** These live-bout routes require headers `X-Ring-Token` (matching the bout's ring) and `X-Device-Id` (equal to `activeDeviceId`): start, exchanges, undo, finish, and the new `POST /api/v1/live-bouts/:id/clock` `{ seconds, running }`. Otherwise:
  - a missing or wrong token answers 403;
  - another device answers 409 `{ reason: "TAKEN_OVER", activeKeeper }`.
- **The bout view** (`GET /live-bouts/:id`) now includes the clock.
- [ ] Write the tests: `claim on a free ring`, `claim on an active ring needs confirm`, `writes from a replaced device are refused`, `rotated token is unknown`, `claim pauses a running clock`, `clock is stored and returned`, `ring links visible to creator only`, and the phase-1 bout tests updated to send the headers. Run them and see RED. Implement. Run them and see GREEN.

### Task 3: Live client and exchange outbox (score-keeper, pure)

**Files:** `apps/score-keeper/src/ring/live-client.ts`, `apps/score-keeper/src/ring/outbox.ts`, `apps/score-keeper/src/ring/exchange-mapping.ts` (all new). Tests next to them (Node).

**Interfaces:**
- `LiveClient`: built on `@hema/api-session`; sends `X-Ring-Token` and `X-Device-Id` on every write. The device id is generated once per device and stored in localStorage.
- `Outbox`: a persistent queue in localStorage, keyed per bout.
  - It holds operations `exchange` (with `clientExchangeId`), `undo` (with `expectedExchangeId`), `clock`, `start` and `finish`.
  - `flush()` sends them strictly in order, one at a time. It stops on a network error and retries with back-off (1 s, 2 s, 5 s, then every 5 s).
  - On a 409 `TAKEN_OVER` it stops for good and reports `takenOver`.
  - Any other 4xx marks that one operation as `rejected`; it is shown to the user and never retried silently.
  - `pending(): number`.
- `exchangeFromMatchEvent(event): LiveExchangeInput | null`: maps a scored exchange from `packages/match-engine` to `{ kind, leftPoints, rightPoints, isDouble, firstScorer }`. It returns null for 0/0. Warnings without a deduction stay local; a deduction becomes `DEDUCTION` with negative points. Read the match-engine event types to fill in the mapping table in the report.
- [ ] Write the tests: `outbox survives reload and sends in order`, `outbox stops on TAKEN_OVER`, `rejected op is surfaced not retried`, `same clientExchangeId on retry`, `mapping: hit, double, deduction, 0/0 is null`. Run them and see RED. Implement. Run them and see GREEN.

### Task 4: Ring mode screens (score-keeper)

**Files:** `apps/score-keeper/src/ring/ring-mode.ts` (new). Modify the score-keeper router/launcher in `apps/score-keeper/src/main.ts` (add a route; do not restructure the file). Add EN/NL keys in `packages/ui` i18n.

**Behaviour:**
1. `/ring/:token` opens.
2. If the keeper isn't signed in, show the sign-in screen, then come back to the ring.
3. The ring screen shows the ring name, the bouts in order (status and score), and the current keeper.
4. **Take this ring** claims it. If someone else is active, show a confirm dialog naming them.
5. Opening a bout loads its exchanges and clock from the backend into the existing scoring screen, using the Task 3 adapter.
6. Scoring writes go through the outbox. A small status line shows "all sent" or "n not sent", and red when an operation is rejected.
7. Undo, finish, then the next bout is offered.
8. A `TAKEN_OVER` answer shows the takeover notice and switches the screen to read-only.
9. An unknown token shows "This ring link is no longer valid".

- [ ] Write the tests (browser or Node, following the existing score-keeper test style): `rotated token shows invalid link`, `claim on an active ring asks to confirm`, `resume loads exchanges and paused clock`, `taken over turns read-only`. Run them and see RED. Implement. Run them and see GREEN.

### Task 5: Tournaments section for the laptop person (competition-admin)

**Files:** `apps/competition-admin/src/screens/tournaments.ts` (new), client methods in `admin-client.ts`, router and nav entries, mappers with tests.

**Behaviour:**
- List and create live tournaments, each with a name and an optional Google spreadsheet id.
- **Upload workbook** sends the `.xlsx` to the octet-stream import. **Import from Google** runs the Google import. Both show the ImportReport: added, updated, skipped and errors, with the rows that have errors.
- A **sync status** card per target shows OK, ERROR, NOT_CONFIGURED, NO_SPREADSHEET or NO_BACKUP_FILE, with "updated 12 s ago" and pending/failed counts. It refreshes every 10 s while open.
- **Download backup** links to the backup file.
- **Ring links**: one card per ring with its link `<score-keeper base>/ring/<token>` and a QR code (the `invite-share` view), plus **Make a new link** with a confirm step. The score-keeper base comes from config `VITE_SCORE_KEEPER_URL`, which must be documented.
- [ ] Write the mapper and client tests first (RED), then the screen (GREEN). Run the admin tests, typecheck and build.

### Task 6: End-to-end check and final review

- [ ] Run on a temp DB under `.superpowers/verify/phase-t2/`. Steps:
  1. Run create-admin.
  2. Sign in to the admin app, create a tournament and upload a workbook copy that has a Schedule sheet with two rings.
  3. Open ring 1's link on a phone-sized browser, sign in as a second account, take the ring, and score match 1 with a double, a deduction and an undo.
  4. Stop the backend mid-bout, score 2 exchanges (they queue), then restart the backend and check they arrive once.
  5. Take over from another browser mid-bout: the clock is paused, the old screen is read-only and the score continues.
  6. Check the sync status, and check `D26:E40` in the downloaded backup.
  7. Take phone and laptop screenshots.
- [ ] Run the full `npm test`, the typecheck for all workspaces, and builds for backend, score-keeper and competition-admin. Then the whole-phase review.

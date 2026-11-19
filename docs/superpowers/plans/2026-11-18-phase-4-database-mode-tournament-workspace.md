# Phase 4: Database-mode Tournament and Planner Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver focused, entity-scoped workspaces for database-mode Tournaments (`/events/:eventId/tournaments/:tournamentId`) and the Event Planner (`/events/:eventId/planning`) inside the unified Event-admin shell, preserving all existing tournament management, stage progression, match planning, live scoring activation, completed results, and admin correction capabilities with SQLite.

**Architecture:** Replace the legacy 4-panel monolithic layout in `packages/ui/src/components/event-view/` with a dedicated `<tournament-workspace-view>` custom element mounted by `apps/event-admin/src/main.ts` at `/events/:eventId/tournaments/:tournamentId`. Integrate `<event-planner-view>` with direct `event-id` attribute support at `/events/:eventId/planning`. Preserve all existing API interactions, live ring card auto-refresh, and transactional result projection while scoping context strictly by URL.

**Tech Stack:** TypeScript, Web Components / Custom Elements, CSS Modules/raw imports, Vitest, Fastify backend API (SQLite).

**Specs:**
- Approved tournament-mode design: [`docs/superpowers/specs/2026-10-25-tournament-mode-design.md`](../specs/2026-10-25-tournament-mode-design.md)
- Unified Event-admin UX: [`docs/superpowers/plans/2026-11-07-unified-event-admin-ux.md`](2026-11-07-unified-event-admin-ux.md)
- Unified Event-admin UX Detail: [`docs/superpowers/plans/2026-11-07-unified-event-admin-ux-detail.md`](2026-11-07-unified-event-admin-ux-detail.md)
- Wireframes: [`docs/superpowers/plans/2026-11-07-unified-event-admin-wireframes.md`](2026-11-07-unified-event-admin-wireframes.md)
- Parent plan: [`docs/superpowers/plans/2026-11-07-unified-event-admin-implementation.md`](2026-11-07-unified-event-admin-implementation.md)

---

## Global Constraints

- **Single source of truth:** SQLite only. Spreadsheet mode is completely dropped; no Google Sheets or XLSX functionality.
- **Pre-production database:** Schema is versioned via `apps/backend/src/schema.ts` (`SCHEMA_VERSION = 2`). The local development database may be re-created via `npm run backend:db:reset`.
- **URL and Base Path:** All routes must cleanly observe `baseUrl` (`/event-admin/` or `/`). Deep linking directly to `/events/:eventId/tournaments/:tournamentId` or `/events/:eventId/planning` must restore full context on refresh.
- **Permission Scopes:** Clearly distinguish Event Administrator rights from Tournament Administrator rights in the UI. Event admins manage event resources and schedule placement; Tournament admins manage tournament setup, entries, stages, and scoring corrections.
- **Localization:** All new and refactored UI copy must support both English and Dutch (`nl` / `en`) via `t(...)`.
- **Platform:** Use Bash, Node.js, Python, or `cmd.exe` on Windows; do not use PowerShell. Do not install npm packages without explicit user approval.

---

## Review Focus

**Status / next (2026-11-18):** Implementation is incomplete despite the checked boxes below: officials, access, live and match panes include placeholders and existing tournament workflows have not been preserved. Compare the new workspace with `event-view`, implement missing workflows with behavioral tests, then verify the browser journey before declaring this phase complete. UI tests (308), backend tests (336), database-mode smoke (12), workspace typecheck and build passed; a separate nameless-stage regression failed before its fix and passed afterward. No packages installed.

**Later session update:** Participant deletion now confirms the action, calls the API, reloads the event and displays failures; success, cancellation and API refusal are covered. UI suite: 312 passed; workspace typecheck passed. This is only a partial fix: participant creation/editing, stage and match management, officials, access and live workflows remain incomplete. Next compare and port these workflows from `event-view`, add end-to-end journey coverage and perform browser acceptance before completing Phase 4.

**Next session update:** Single fighter addition now has a form and uses existing users where possible; a regression test failed before implementation and passes afterward. UI suite: 313 passed; workspace typecheck passed. Bulk import, participant editing and volunteer options, stage and match management, officials, access and live workflows remain incomplete; resume with those and browser acceptance. The new form's failure and existing-user paths still need behavioral coverage.

**Bulk import update:** The participant workspace now imports one name per line, reuses users and skips existing entries; partial failures retain input and retry reloads current entries. Input survives tab switches after a review finding and regression test. UI suite: 320 passed; workspace typecheck passed. Browser acceptance remains open. Other Phase 4 workflows remain incomplete.

**Browser integration update:** Added the missing individual-event GET route (backend suite: 337 passed) and corrected user creation to send the required name. Edge against an isolated real backend verified bulk import, duplicate input, an injected partial failure and retry without duplicate entries; UI suite: 320 passed and workspace typecheck passed. User listing and creation require system or competition administrator permissions. Continue the remaining Phase 4 workflows and their browser acceptance.

**Participant editing update:** The workspace now edits an entry's role and seed, retaining input on tab changes and errors and supporting cancellation. UI suite: 322 passed; UI typecheck passed. The previous editor's name, volunteer preferences/skills and tournament reassignment remain missing; compare and port them next, then browser-test the complete workflow. Other Phase 4 workflows also remain incomplete.

**Participant completion follow-up:** `2026-11-18-complete-participant-management.md` proposes completing the missing editor while protecting shared user data, safe tournament reassignment and recovery from partial saves. It awaits user review; no implementation or new verification has been performed for that follow-up.

1. **Direct deep link & URL context integrity:** Navigating directly or pressing browser back/forward (`popstate`) between `/events/:eventId` and `/events/:eventId/tournaments/:tournamentId` updates header breadcrumbs, active state, and displays the correct tournament without leaking data from other tournaments.
2. **Tabbed Tournament Navigation:** Overview, Participants, Stages, Officials, Access, and Live results tabs render accurately without regressions in data saving or form validation.
3. **Stage Progression & Match Planning:** Advancing stages, pool bout order changes, bracket phase placements, and `<pool-results>` fullscreen display work smoothly.
4. **Live Scoring & Admin Corrections:** Ring activation, table/scoreboard links, ring rotation confirmation, fighter color forms, scoreboard settings forms, completed results table, and the exchange correction modal work properly.
5. **Event Planner:** `/events/:eventId/planning` loads the schedule for the specified event without requiring URL search params hacks.

---

### Task 1: Tournament Workspace Custom Element (`<tournament-workspace-view>`)

**Files:**
- Create: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.ts`
- Create: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.css`
- Create: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/i18n/messages/en.ts`
- Modify: `packages/ui/src/i18n/messages/nl.ts`

**Interfaces:**
- Consumes: `createApiClient()`, `ApiEvent`, `ApiTournament`, `ApiStage`, `ApiEntry`.
- Produces: `<tournament-workspace-view event-id="..." tournament-id="...">` custom element.
- Primary navigation tabs:
  1. `overview` (Participants summary, stage pipeline, schedule readiness, live scoring status).
  2. `participants` (Entries list, single entry form, bulk entry form, delete entry).
  3. `stages` (Stages management, match assignments, pool results).
  4. `officials` (Tournament volunteer & role assignments).
  5. `access` (Tournament admins list, add candidate, remove admin).
  6. `live` (Live tournament activation, ring links, rules, completed results, corrections).

- [x] **Step 1: Write failing tests for `<tournament-workspace-view>` header and tabs**
  Verify component renders tournament header, ruleset inheritance badge, participant count, and tab switches between Overview, Participants, Stages, Officials, Access, and Live results.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx vitest run packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
  Expected: FAIL (module not found)

- [x] **Step 3: Implement `<tournament-workspace-view>` core, Overview, Participants, Officials, and Access tabs**
  Wire event/tournament loading via `api.getEvent(eventId)`, filter to `tournamentId`, render header with edit modal trigger, entries table, officials grid, and admin management.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx vitest run packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
  Expected: PASS

---

### Task 2: Stage Management & Match Planning Integration

**Files:**
- Modify: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.ts`
- Modify: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.css`
- Modify: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`

**Interfaces:**
- Consumes: `ApiStage`, `ApiMatch`, `ApiRound`, `<pool-results>`, `api.advanceStage()`.
- Produces: Stage list sidebar, stage sub-tabs (`overview`, `arenas`, `officials`, `rounds`, `matches`, `pool-results`), stage creation dialog, advance active stage button.

- [x] **Step 1: Write failing tests for Stage management and sub-tabs**
  Test selecting a stage, advancing the active stage, creating a stage, and adjusting pool/bracket match order.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx vitest run packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
  Expected: FAIL

- [x] **Step 3: Implement Stage management in `<tournament-workspace-view>`**
  Port stage rendering and match planning handlers cleanly from `event-view-controller.ts`, preserving round generation, bracket assignment, and pool-results hydration.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx vitest run packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
  Expected: PASS

---

### Task 3: Live Scoring & Admin Correction Integration

**Files:**
- Modify: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.ts`
- Modify: `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
- Reuse: `packages/ui/src/components/event-view/live-rings.ts`, `packages/ui/src/components/event-view/ring-rules-form.ts`, `packages/ui/src/components/event-view/event-colors.ts`

**Interfaces:**
- Consumes: `api.activateDatabaseLiveTournament()`, `api.getDatabaseLiveStatus()`, `api.correctDatabaseLiveResult()`, `patchLiveRingCards()`.
- Produces: Live results tab rendering ring cards, scoreboard settings, ring fighter colors, completed results list, and modal exchange correction form.

- [x] **Step 1: Write failing tests for Live scoring tab and admin corrections**
  Test live activation button, polling/patching ring cards, table keeper link rotation, and submitting exchange corrections.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx vitest run packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
  Expected: FAIL

- [x] **Step 3: Implement Live results tab and correction modal**
  Port live scoring activation, periodic polling with active-form preservation, and transactional result correction logic into `<tournament-workspace-view>`.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx vitest run packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.test.ts`
  Expected: PASS

---

### Task 4: Shell Integration in `apps/event-admin`

**Files:**
- Modify: `apps/event-admin/src/main.ts`
- Modify: `packages/ui/src/routing/shell-navigation.test.ts`

**Interfaces:**
- Consumes: `<tournament-workspace-view>`, `EventAdminRoute`, `navigateTo`.
- Produces: Dynamic mounting of `<tournament-workspace-view event-id="..." tournament-id="...">` on `tournament-workspace` route with synchronized breadcrumbs.

- [x] **Step 1: Write failing test in `shell-navigation.test.ts` for tournament workspace mounting**
  Verify navigating to `/events/:eventId/tournaments/:tournamentId` renders `<tournament-workspace-view>` with correct attributes and updates breadcrumbs to `Events / [Event Name] / [Tournament Name]`.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx vitest run packages/ui/src/routing/shell-navigation.test.ts`
  Expected: FAIL

- [x] **Step 3: Update `apps/event-admin/src/main.ts`**
  Replace `event-view` mounting in `renderTournamentWorkspace` with `<tournament-workspace-view>`, pass `score-keeper-url`, and update `renderBreadcrumbs` to display the actual tournament name.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx vitest run packages/ui/src/routing/shell-navigation.test.ts`
  Expected: PASS

---

### Task 5: Event Planner View Integration

**Files:**
- Modify: `packages/ui/src/components/event-planner-view/event-planner-view.ts`
- Modify: `apps/event-admin/src/main.ts`

**Interfaces:**
- Consumes: `event-id` attribute or property on `<event-planner-view>`.
- Produces: Seamless loading of the planner for `/events/:eventId/planning` without relying on URL query param rewriting.

- [x] **Step 1: Update `event-planner-view.ts` to accept `event-id` attribute**
  Support `observedAttributes` for `event-id`, falling back to `URLSearchParams` if omitted.

- [x] **Step 2: Update `apps/event-admin/src/main.ts`**
  Set `view.setAttribute("event-id", eventId)` in `renderEventPlanning`.

- [x] **Step 3: Verify planner navigation in `shell-navigation.test.ts`**
  Ensure `/events/:eventId/planning` displays the planner breadcrumb and renders the component properly.

---

### Task 6: Full Verification & Status Update

**Files:**
- Update: `docs/superpowers/plans/2026-11-07-unified-event-admin-implementation.md`
- Update: `docs/superpowers/agent-session-context.md`

- [ ] **Step 1: Run complete workspace test suites**
  Verify all packages pass tests and builds:
  - `npm test --workspace @hema/ui`
  - `npm test --workspace @hema/backend`
  - `npm run test:database-mode:smoke`
  - `npm run typecheck`
  - `npm run build`

- [ ] **Step 2: Update documentation and resume point**
  Record Phase 4 completion in `docs/superpowers/plans/2026-11-07-unified-event-admin-implementation.md` and `docs/superpowers/agent-session-context.md`.

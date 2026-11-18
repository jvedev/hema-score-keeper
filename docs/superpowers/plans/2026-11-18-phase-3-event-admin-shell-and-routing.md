# Phase 3: Event-admin Shell, Routing and Event Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver deep-linkable URL routing, an Events index, a dedicated Event overview workspace with type-aware component listings (database tournaments and rating competitions), and breadcrumb navigation for Event-admin, operating solely with SQLite.

**Architecture:** Replace the legacy single-view mounting in `apps/event-admin` and monolithic panel switching in `packages/ui` with a client-side route parser and view dispatcher. Render focused views for `/events`, `/events/:eventId`, `/events/:eventId/tournaments/:tournamentId`, `/events/:eventId/competitions/:competitionId`, and `/events/:eventId/planning` with responsive breadcrumbs, event switcher, and localized empty/error states.

**Tech Stack:** TypeScript, Web Components / Custom Elements, CSS Modules/raw imports, Vitest, Fastify backend API (SQLite).

**Spec:** [`docs/superpowers/specs/2026-10-25-tournament-mode-design.md`](../specs/2026-10-25-tournament-mode-design.md), [`docs/superpowers/plans/2026-11-07-unified-event-admin-ux-detail.md`](2026-11-07-unified-event-admin-ux-detail.md), and [`docs/superpowers/plans/2026-11-07-unified-event-admin-implementation.md`](2026-11-07-unified-event-admin-implementation.md).

## Global Constraints

- Database and storage: SQLite is the only source of truth; all spreadsheet/Google Sheets/.xlsx integrations are completely dropped.
- URL base path: All routing must respect the base path (`/event-admin/` in deployment or `/` in local dev).
- Localization: All user-facing strings must support English and Dutch based on `session.user.language`.
- Zero-component state: Creating an Event must never auto-create child tournaments or competitions; an Event is independently manageable.
- Non-destructive detachment: Detaching or deleting events does not delete competition records.
- Platform: No PowerShell commands; use `cmd.exe`, Node.js or bash. No npm packages installed without explicit user permission.

## Review Focus

- Direct deep-link navigation and page refresh to sub-routes (`/events/:eventId`, `/events/:eventId/tournaments/:tournamentId`, `/events/:eventId/planning`) load the correct resource without getting stuck or losing context.
- Missing or unauthorized event/tournament IDs display clean, localized 404 / error states with a fallback link to `/events`.
- Browser forward/back button actions (`popstate`) update the view and breadcrumbs synchronously without breaking form states or causing memory leaks.
- Zero-component events display proper empty state messages and permit full access to Arenas, Officials, Rulesets, and Planning without requiring child components.
- Component counts accurately reflect both database-mode tournaments and attached rating competitions.

---

### Task 1: Client-Side Route Parser & URL Dispatcher

**Files:**
- Create: `packages/ui/src/routing/event-admin-router.ts`
- Create: `packages/ui/src/routing/event-admin-router.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: Window location and history API, `stripAppBase` / `withAppBase` utility.
- Produces:
  ```typescript
  export type EventAdminRoute =
    | { kind: "events-index" }
    | { kind: "event-overview"; eventId: string }
    | { kind: "tournament-workspace"; eventId: string; tournamentId: string }
    | { kind: "competition-workspace"; eventId: string; competitionId: string }
    | { kind: "event-planning"; eventId: string }
    | { kind: "not-found"; path: string };

  export function parseEventAdminRoute(pathname: string, baseUrl?: string): EventAdminRoute;
  export function formatEventAdminRoute(route: EventAdminRoute, baseUrl?: string): string;
  ```

- [ ] **Step 1: Write failing tests for route parsing and formatting**

Test route parsing for `/`, `/events`, `/events/evt-1`, `/events/evt-1/tournaments/trn-1`, `/events/evt-1/competitions/cmp-1`, `/events/evt-1/planning`, with and without app base path (`/event-admin/`), and invalid URLs returning `not-found`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c 'npx vitest run packages/ui/src/routing/event-admin-router.test.ts'`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `event-admin-router.ts`**

Implement `parseEventAdminRoute` and `formatEventAdminRoute` handling all specified paths, stripping and prepending base URL consistently.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd.exe /c 'npx vitest run packages/ui/src/routing/event-admin-router.test.ts'`
Expected: PASS

---

### Task 2: Events Index View (`events-index-view`)

**Files:**
- Create: `packages/ui/src/components/events-index-view/events-index-view.ts`
- Create: `packages/ui/src/components/events-index-view/events-index-view.css`
- Create: `packages/ui/src/components/events-index-view/events-index-view.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `createApiClient()`, `listEvents()`, `createEvent()`, `EventAdminSession`.
- Produces: `<events-index-view>` custom element rendering:
  - Header: "Events" / "Evenementen" title, user status, "Nieuw evenement" / "New event" button.
  - Event Cards/Table: Event name, component count (tournaments + competitions), arena count, link to `/events/:eventId`.
  - Create Event Dialog: modal to create an Event with name and optional ruleset, without creating child tournaments.
  - Localized empty state when no events exist.

- [ ] **Step 1: Write failing tests for `<events-index-view>`**

Test rendering loaded events, count badges, empty state, and event creation triggering navigation to the newly created event.

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c 'npx vitest run packages/ui/src/components/events-index-view/events-index-view.test.ts'`
Expected: FAIL

- [ ] **Step 3: Implement `<events-index-view>` and styles**

Implement the component with full Dutch/English i18n support, keyboard accessible cards, and event creation modal.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd.exe /c 'npx vitest run packages/ui/src/components/events-index-view/events-index-view.test.ts'`
Expected: PASS

---

### Task 3: Event Workspace Overview & Component Hub (`event-overview-view`)

**Files:**
- Create: `packages/ui/src/components/event-overview-view/event-overview-view.ts`
- Create: `packages/ui/src/components/event-overview-view/event-overview-view.css`
- Create: `packages/ui/src/components/event-overview-view/event-overview-view.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `api.getEvent(eventId)`, `api.createTournament(eventId, ...)`, `api.attachCompetition(eventId, ...)`.
- Produces: `<event-overview-view>` custom element:
  - Breadcrumbs: `Events / <Event Name>`
  - Event Header: Name, ruleset summary, quick link to `/events/:eventId/planning`, Arenas, Officials, Rulesets.
  - Components Hub:
    - Database Tournaments section: lists tournaments with participant count, stage count, ruleset, button to create tournament.
    - Rating Competitions section: lists attached competitions with status, date, fighter count, button to attach/create competition.
    - Zero-component state: explains the event is active and allows managing arenas/rulesets even without components.
  - Navigation links to tournament workspace `/events/:eventId/tournaments/:tournamentId` and competition workspace `/events/:eventId/competitions/:competitionId`.

- [ ] **Step 1: Write failing tests for `<event-overview-view>`**

Test rendering event overview with zero components, with database tournaments, and with attached competitions. Verify links and create actions.

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c 'npx vitest run packages/ui/src/components/event-overview-view/event-overview-view.test.ts'`
Expected: FAIL

- [ ] **Step 3: Implement `<event-overview-view>` and styles**

Implement the overview view with complete zero-component support, type-aware cards, and localized copy.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd.exe /c 'npx vitest run packages/ui/src/components/event-overview-view/event-overview-view.test.ts'`
Expected: PASS

---

### Task 4: Unified Shell & Navigation Integration in `apps/event-admin`

**Files:**
- Modify: `apps/event-admin/src/main.ts`
- Modify: `apps/event-admin/src/auth.css`
- Modify: `apps/event-admin/index.html`

**Interfaces:**
- Consumes: `EventAdminRoute`, `parseEventAdminRoute`, `formatEventAdminRoute`, `<events-index-view>`, `<event-overview-view>`, `<event-view>`, `<event-planner-view>`.
- Produces: Shell with global header, breadcrumbs, event switcher dropdown, dynamic view mounting based on active route, popstate listener and `data-route` link interceptor.

- [ ] **Step 1: Update `apps/event-admin/src/main.ts` to use route dispatcher**

Wire router to mount:
- `events-index` -> `<events-index-view>`
- `event-overview` -> `<event-overview-view event-id="...">`
- `tournament-workspace` -> `<event-view event-id="..." tournament-id="...">`
- `competition-workspace` -> `<event-overview-view event-id="..." competition-id="...">` (or competition admin view)
- `event-planning` -> `<event-planner-view event-id="...">`
- `not-found` -> 404 message with button to `/events`

- [ ] **Step 2: Add header event switcher and breadcrumb bar**

Render persistent top bar with:
- "Events" link
- Current Event dropdown selector (when inside an event)
- Breadcrumbs trail
- User profile & sign out

- [ ] **Step 3: Verify build and typecheck**

Run: `cmd.exe /c 'npm run typecheck'` and `cmd.exe /c 'npm run build --workspace @hema/event-admin'`
Expected: All TypeScript and Vite builds succeed with exit code 0.

---

### Task 5: End-to-End Test Suite & Verification

**Files:**
- Create: `packages/ui/src/routing/shell-navigation.test.ts`
- Update: `docs/superpowers/plans/2026-11-07-unified-event-admin-implementation.md` (Update Phase 3 status)
- Update: `docs/superpowers/agent-session-context.md`

- [ ] **Step 1: Write integration tests for route switching and breadcrumb updates**

Test deep-linking to an event overview, navigating to a tournament, opening the planner, switching events via switcher, and navigating back via breadcrumbs.

- [ ] **Step 2: Run all workspace tests**

Run: `cmd.exe /c 'npm test --workspace @hema/ui'`
Run: `cmd.exe /c 'npm test --workspace @hema/backend'`
Expected: All tests pass (0 failures).

- [ ] **Step 3: Update documentation and resume point**

Record Phase 3 progress and next steps in `docs/superpowers/agent-session-context.md`.

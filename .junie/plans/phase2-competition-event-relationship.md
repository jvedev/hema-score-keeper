---
sessionId: session-261118-125932-1shz
---

# Technical Design

### Current Implementation

**Schema** (`apps/backend/src/schema.ts`, lines 335-350): The `Competition` table has no `eventId` column. It has `id`, `name`, `slug`, `status`, `date`, `rulesetJson`, `visibility`, `clubId`, `scopeKind`, `scopeValuesJson`, `acceptsOtherBouts`, `signupsNeedApproval`, `placeLimit`, and `inviteCode`.

**DB types** (`apps/backend/src/db.ts`, lines 218-234): `CompetitionTable` interface mirrors the schema columns. No `eventId`.

**Authorization** (`apps/backend/src/competitions/access.ts`):
- `competitionAdminRole()` (line 70): checks `SYSTEM_ADMIN` user role, then `CompetitionAdmin` table. Returns `OWNER` | `CO_ADMIN` | `SYSTEM_ADMIN` | null.
- `requireCompetitionAdmin()` (line 87): throws 403 if `competitionAdminRole` returns null.
- `listManagedCompetitionIds()` (line 99): returns all Competition IDs from `CompetitionAdmin` for the user, or "ALL" for `SYSTEM_ADMIN`.

**Event authorization** (`apps/backend/src/events/access.ts`):
- `isEventAdmin()` (line 6): checks `SYSTEM_ADMIN` role, then `EventAdmin` table.
- `requireEventAdmin()` (line 23): verifies Event exists and user is Event admin.

**Admin routes** (`apps/backend/src/competitions/admin-routes.ts`):
- `POST /api/v1/competitions` (line 44): creates Competition, requires `requireAdminUser` (COMPETITION_ADMIN or SYSTEM_ADMIN).
- `PATCH /api/v1/competitions/:id` (line 74): requires `requireCompetitionAdmin`.
- All admin routes use `requireAdminUser` at the outer level, then `requireCompetitionAdmin` for per-Competition checks.

**Co-admin routes** (`apps/backend/src/competitions/co-admin-routes.ts`): list/add/remove/transfer Competition admins; all use `requireCompetitionAdmin`.

**Read model** (`apps/backend/src/read-model.ts`, `loadEvents` line 362): loads Events with nested Tournaments, Arenas, Rulesets, Colors, and Schedule — no Competitions.

**API types** (`apps/backend/src/api-types.ts`, `ApiEvent` line 251): contains `tournaments`, `arenas`, `rulesets`, `colors`, `schedule` — no `competitions`.

**Test patterns** (`apps/backend/test/event-admin.test.ts`): uses `createTestContext`, `insertUser`, `insertEventAdmin`, `bearer`, and HTTP injection via `ctx.app.inject()`.

### Key Decisions

1. **Nullable `eventId` with `ON DELETE SET NULL`**: When an Event is deleted, attached Competitions are detached (eventId set to null) rather than cascaded-deleted. This matches the approved detach-on-Event-deletion semantics.

2. **Authorization union in `requireCompetitionAdmin`**: Instead of creating a separate helper, we extend the existing `competitionAdminRole` and `requireCompetitionAdmin` to also check Event admin membership. This minimizes changes to the many routes that already call these helpers.

3. **New `requireCompetitionAdminForEvent` helper**: A new helper that, given an Event ID and Competition ID, verifies the Competition is attached to that Event AND the caller is authorized (Event admin, Competition admin, or SYSTEM_ADMIN). This is used by the attach/detach/create-for-Event routes.

4. **`POST /api/v1/events/:eventId/competitions` for create-for-Event**: Creates a Competition and sets its `eventId` in one transaction. Requires Event admin access. The creator becomes Competition OWNER as today.

5. **`PATCH /api/v1/competitions/:id/event` for attach/detach**: A single endpoint accepting `{ eventId: string | null }`. Attaching requires Event admin of the target Event. Detaching (null) requires any Competition admin authorization. Validates cardinality (Competition not already attached to another Event).

6. **`competitions` array in `ApiEvent`**: The Event read model will include a `competitions` field with attached Competition summaries (id, name, slug, status, date, visibility). This is loaded in `loadEvents` alongside Tournaments.

7. **No schema migration code**: Per AGENTS.md, pre-production schema changes edit `schema.ts` directly and reset the dev DB. No migration or repair logic needed.

### Proposed Changes

#### 1. Schema and DB types

- **`apps/backend/src/schema.ts`**: Add `"eventId" TEXT REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE` to `Competition` table. Add index `"Competition_eventId_idx"`. Increment `SCHEMA_VERSION` to 2.
- **`apps/backend/src/db.ts`**: Add `eventId: string | null` to `CompetitionTable` interface.

#### 2. Competition authorization

- **`apps/backend/src/competitions/access.ts`**:
  - Update `competitionAdminRole()` to accept an optional `eventId` lookup: if the Competition has an `eventId`, also check `isEventAdmin`. Return `"EVENT_ADMIN"` if authorized via Event.
  - Update `requireCompetitionAdmin()` to load the Competition's `eventId` and pass it to the extended check.
  - Update `listManagedCompetitionIds()` to also return Competition IDs where the user is an Event admin of the parent Event.

#### 3. Attach/detach/create API routes

- **New file `apps/backend/src/competitions/event-link-routes.ts`**:
  - `POST /api/v1/events/:eventId/competitions` — create a Competition attached to the Event. Requires Event admin. Creator becomes Competition OWNER.
  - `PATCH /api/v1/competitions/:id/event` — attach (`{ eventId: "..." }`) or detach (`{ eventId: null }`). Validates Event admin for attach; Competition admin for detach.
  - `GET /api/v1/events/:eventId/competitions` — list Competitions attached to an Event. Requires Event admin.

- **`apps/backend/src/server.ts`**: Register the new routes module.

#### 4. Event read model

- **`apps/backend/src/api-types.ts`**: Add `competitions: ApiEventCompetition[]` to `ApiEvent`.
- **`apps/backend/src/read-model.ts`**: In `loadEvents`, load attached Competitions for each Event and include them in the result.

#### 5. Tests

- **New file `apps/backend/test/competition-event-link.test.ts`**:
  - Schema: `Competition.eventId` column exists with correct FK behavior.
  - Create-for-Event: Event admin can create; non-Event admin cannot; creator becomes Competition OWNER.
  - Attach: Event admin can attach; wrong-Event admin cannot; already-attached Competition is rejected.
  - Detach: Competition admin can detach; non-admin cannot; child data preserved.
  - Authorization union: Event admin can manage attached Competition; standalone Competition not affected.
  - Event deletion: deleting Event sets Competition.eventId to null (detach).
  - `listManagedCompetitionIds`: includes Event-attached Competitions.
  - `loadEvents`: returns attached Competitions in Event response.

### File Structure

```
Modified:
  apps/backend/src/schema.ts              — add eventId column, index, SCHEMA_VERSION
  apps/backend/src/db.ts                  — add eventId to CompetitionTable
  apps/backend/src/competitions/access.ts — extend authorization for Event admins
  apps/backend/src/api-types.ts           — add ApiEventCompetition, update ApiEvent
  apps/backend/src/read-model.ts          — load Competitions in loadEvents
  apps/backend/src/server.ts              — register event-link routes

Added:
  apps/backend/src/competitions/event-link-routes.ts — attach/detach/create routes
  apps/backend/test/competition-event-link.test.ts   — authorization and lifecycle tests
```

### Architecture Diagram

```mermaid
graph LR
  A[Event admin user] -->|POST /events/:id/competitions| B[event-link-routes.ts]
  A -->|PATCH /competitions/:id/event| B
  A -->|GET /events/:id/competitions| B
  B -->|isEventAdmin| C[events/access.ts]
  B -->|requireCompetitionAdmin| D[competitions/access.ts]
  D -->|isEventAdmin (new)| C
  D -->|CompetitionAdmin table| E[DB]
  C -->|EventAdmin table| E
  B -->|Competition.eventId| E
  F[loadEvents] -->|load Competitions| E
  F --> G[ApiEvent.competitions]
```

### Risks

- **Breaking `requireAdminUser` guard**: Competition admin routes currently require `COMPETITION_ADMIN` or `SYSTEM_ADMIN` user role at the outer level. Event admins may have `USER` role. The new `POST /api/v1/events/:eventId/competitions` route must NOT use `requireAdminUser` — it uses `requireEventAdmin` instead. Existing routes keep their guard, so Event admins manage attached Competitions via the Event-scoped routes or the extended `requireCompetitionAdmin`.
- **`listManagedCompetitionIds` performance**: Loading Event admin memberships for all Events could be slow if there are many Events. Mitigation: a single query joining `Competition` to `EventAdmin` on the user's Event IDs.
- **Co-admin routes**: The co-admin routes (`competitions/co-admin-routes.ts`) call `requireCompetitionAdmin` — they will automatically inherit Event admin access for attached Competitions, which is the desired behavior.

# Delivery Steps

### ✓ Step 1: Add Competition.eventId to schema and DB types
Add the nullable `eventId` foreign key to the Competition table and update the TypeScript DB types.

- Add `"eventId" TEXT REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE` to `Competition` in `apps/backend/src/schema.ts`.
- Add `CREATE INDEX "Competition_eventId_idx"` in `schema.ts`.
- Increment `SCHEMA_VERSION` to 2.
- Add `eventId: string | null` to `CompetitionTable` in `apps/backend/src/db.ts`.
- Run `npm run backend:db:reset` to recreate the dev database.
- Verify `npm run test:backend` passes (schema test, fresh database test).

### ✓ Step 2: Extend Competition authorization for Event admins
Update the Competition authorization helpers so Event admins of a parent Event can manage attached Competitions.

- In `apps/backend/src/competitions/access.ts`, update `competitionAdminRole()` to load the Competition's `eventId` and check `isEventAdmin` from `events/access.ts`. Return `"EVENT_ADMIN"` if authorized via Event.
- Update `requireCompetitionAdmin()` to use the extended check.
- Update `listManagedCompetitionIds()` to also return Competition IDs where the user is an Event admin of the parent Event (single query joining `Competition` to `EventAdmin`).
- Write tests in `apps/backend/test/competition-event-link.test.ts` covering: Event admin can manage attached Competition; standalone Competition unaffected; `listManagedCompetitionIds` includes Event-attached Competitions; wrong-Event admin cannot access.

### ✓ Step 3: Add attach/detach/create-for-Event API routes
Add the Event-scoped Competition management routes.

- Create `apps/backend/src/competitions/event-link-routes.ts` with:
  - `POST /api/v1/events/:eventId/competitions` — create Competition attached to Event. Requires Event admin. Creator becomes Competition OWNER. Does NOT use `requireAdminUser` (Event admins may have USER role).
  - `PATCH /api/v1/competitions/:id/event` — attach (`{ eventId: string }`) or detach (`{ eventId: null }`). Attach requires Event admin of target Event. Detach requires Competition admin authorization. Validates cardinality.
  - `GET /api/v1/events/:eventId/competitions` — list attached Competitions. Requires Event admin.
- Register the routes in `apps/backend/src/server.ts`.
- Add tests: create-for-Event by Event admin, attach by Event admin, detach by Competition admin, reject wrong-Event admin, reject duplicate attach, preserve child data on detach.

### ✓ Step 4: Add Competitions to Event read model and verify
Make attached Competitions visible in the Event API response and run final verification.
- Add `ApiEventCompetition` interface to `apps/backend/src/api-types.ts` (id, name, slug, status, date, visibility).
- Add `competitions: ApiEventCompetition[]` to `ApiEvent`.
- In `apps/backend/src/read-model.ts`, load attached Competitions in `loadEvents` alongside Tournaments.
- Add test: `GET /api/v1/events` returns attached Competitions in Event response.
- Add test: Event deletion detaches Competition (`ON DELETE SET NULL`).
- Run `npm run test:backend` (full suite), `npm run typecheck` (workspace), and `npm run build` (backend) to verify no regressions.
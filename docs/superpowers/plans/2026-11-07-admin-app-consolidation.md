# Admin app consolidation

Status: implemented and verified on `co-pilot`; commit/push pending.

## Goal

Consolidate the current Event-admin and Tournament-admin app entry points into one
Event-admin application. Event-admin remains the canonical app and URL. The current
Tournament-admin app is only an in-memory demo editor, not a persisted tournament workflow.
This phase removes that placeholder app rather than presenting it as production functionality.

## Domain rule

- An event may have zero, one, or multiple tournaments.
- Every tournament belongs to exactly one event.
- The admin application must allow event creation and management without requiring a
  tournament, and must support multiple tournaments under the same event.
- This matches the current Event-admin API model: events expose a `tournaments` collection
  and tournaments have one `eventId`.

## User decisions

- Event-admin at `/event-admin/` remains the sole administration app and canonical entry.
- Remove `/tournament-admin/`; no redirect or URL-compatibility route is required.
- Development data may be restructured or discarded when the later product design requires
  it. This consolidation phase does not itself need database changes, so it should leave the
  existing Event-admin schema and data untouched.
- The `stage-view` demo component is not to be presented as a persistent tournament editor.
  Leave the shared component and its tests in place for now; decide whether to reuse or remove
  it during the combined admin-app redesign.

## Scope

1. Remove `apps/tournament-admin` as a workspace app.
2. Remove its deployment entry and exclude it from the Windows package.
3. Remove Tournament-admin from the backend root app directory and update deployment
   expectations from five apps to four.
4. Update health/deployment tests and `docs/competition-deploy.md` to reflect a single
   Event-admin entry point and the removed old path.
5. Keep all existing Event-admin behavior and backend APIs unchanged.
6. Record the event-to-tournament cardinality rule for the later combined-app redesign.

## Out of scope

- Redesigning Event-admin navigation, information architecture, screens, or workflows.
- Adding tournament planning, bracket advancement, standings, or new operational controls.
- Changing Event/Tournament database tables or deleting development data.
- Removing the shared `stage-view` component before its later reuse decision.
- Changing score-keeper, competition, competition-admin, backend API, or live scoring behavior.

## Implementation sequence

1. **Done:** verified the current branch and worktree, preserving the unrelated `.idea/php.xml`
   change.
2. **Done:** removed the `tournament-admin` deployment mount, package-copy entry, workspace
   files, and lockfile entries. Generic `admin:*` npm aliases now target Event-admin.
3. **Done:** removed the old root-page label, updated the root-page test, and made deployment
   verification require four apps and a 404 for `/tournament-admin/`.
4. **Done:** updated deployment and architecture docs. Event-admin APIs, database schema,
   and data were not changed.
5. **Done:** targeted backend health tests, all workspace typechecks and tests, and the
   four-app production build/deployment-route verification passed. No packages were installed.
6. **Done:** reviewed the diff; Event-admin APIs, database schema/data, and unrelated working
   tree changes are untouched.

## Verification

- `npm run test --workspace @hema/backend -- test/health.test.ts` — 1 file, 4 tests passed.
- `npm run typecheck` — all workspace typechecks passed.
- `npm test` — all workspace tests passed (1,101 tests).
- `npm run build:deployment` — all four apps built; roots, assets, deep links, and `/api/v1`
  passed. `/tournament-admin/` returned 404.
- `python -m json.tool package-lock.json` and `git diff --check` passed.
- The Windows package builder now copies only the four configured apps. The full
  `npm run package:windows` was not run because it installs production dependencies and package
  installation was not authorized.

## Status / next

Implementation and verification are complete. Commit the phase-specific changes and push
`co-pilot`; leave `.idea/php.xml` out of the commit. The next separate phase is planning the
combined admin UX, with explicit support for events containing zero or more tournaments.

## Acceptance criteria

- `/event-admin/` remains available with its existing assets and deep links.
- The application root lists Event-admin once and no longer lists Tournament-admin.
- `/tournament-admin/` has no app build, static mount, package payload, or compatibility
  redirect.
- Production deployment verification passes for the remaining four apps and `/api/v1`.
- The Event-admin data model still permits an event with no tournaments and multiple
  tournaments, each linked to exactly one event.
- No local database or Event-admin data is changed by this phase.
- The shared `stage-view` story/test still works independently unless the removal reveals a
  direct app-only dependency that must be cleaned up.

## Next design phase

After consolidation, plan the combined administration application as a separate phase. Start
from the real workflows and domain entities; do not assume one tournament per event. Review
which Event-admin screens remain useful, how users move between events and their zero-or-more
tournaments, and which planning and live-scoring controls belong together. Obtain approval of
that design before implementing new product behavior.

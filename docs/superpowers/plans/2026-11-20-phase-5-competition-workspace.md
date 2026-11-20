# Phase 5 — Rating Competition workspace in the Event-admin shell

Parent plan: `2026-11-07-unified-event-admin-implementation.md` (Phase 5 scope and acceptance).

## Starting point (2026-11-20)

- `master` was fast-forwarded to `jetbrains-ai` at `76430b9` (local only, not pushed).
- Phase 4 still has open items (stage/match create/delete, stage advancement, browser
  acceptance). The user chose on 2026-11-20 to continue with Phase 5 anyway; those items stay
  open in the Phase 4 plan.
- Already done in the backend (commits `bcb803a`, `ea22720`, test
  `apps/backend/test/competition-event-link.test.ts`): `Competition.eventId`,
  `GET/POST /api/v1/events/:eventId/competitions`, `PATCH /api/v1/competitions/:id/event`
  (attach/detach), and the combined permission rule in `competitions/access.ts`
  (`EVENT_ADMIN` role via the parent Event, `listManagedCompetitionIds`).
- Already in the UI: the Event overview lists an Event's Competitions and can create one; the
  `competition-workspace` route exists in `packages/ui/src/routing/event-admin-router.ts`, but
  `apps/event-admin/src/main.ts` still renders the Event overview for it.

## Decision (user, 2026-11-20)

Reuse the existing Competition-admin screens instead of rebuilding them: make them
independent of the standalone app's router and shell, and import them in Event-admin from the
already linked `@hema/competition-admin` workspace (no npm install). One codebase, two entry
points; no iframe and no second visible shell.

## Tasks

1. **Shell-independent screens.** Add `href(route)` to `AppContext` and replace the direct
   `href`/`navigate` imports in `apps/competition-admin/src/screens/*` and `mappers/*` with
   the context. The standalone app passes its current router, so its URLs stay unchanged.
   Existing competition-admin tests stay green; add a test that a screen renders links from an
   injected `href`.
2. **One session.** Let `AdminClient` run on an injected `ApiSession` (or storage key) so that
   inside Event-admin it uses the Event-admin session and its single-use refresh token, not a
   second login or a competing refresh. Expose what is needed from `@hema/event-admin-api`.
   Unit-test both constructions.
3. **Event-admin routes.** Extend `event-admin-router.ts` with
   `/events/:eventId/competitions/:competitionId` plus `settings`, `fighters/:id`, `bouts/:id`
   and `objections/:boutId`, and a two-way mapping between these and the Competition-admin
   `Route`. Router tests for parse/href round trips.
4. **Render the workspace.** In `apps/event-admin/src/main.ts`, render the shared screens for
   the competition routes, with breadcrumb `Events › <Event> › <Competition>`. Add
   `@hema/competition-admin` as a workspace dependency of `@hema/event-admin` (exports for the
   screens and styles). Scope the Competition-admin CSS under a wrapper class so it cannot
   restyle the Event-admin shell. Show a clear error/404 when the Competition does not belong
   to the Event in the URL.
5. **Attach existing / detach.** Event overview: "add Competition" offers *create new* (current)
   or *attach existing* (standalone Competitions the user manages; requires `eventId` in the
   admin competition summary). Competition workspace settings: *detach from Event*, with
   confirmation. Both use `PATCH /api/v1/competitions/:id/event`; show backend refusals.
   en/nl texts.
6. **Standalone entry.** `/competition-admin/` keeps working unchanged; for an attached
   Competition it shows its Event name with a link to the Event-admin workspace.
7. **Verification and docs.** Backend permission tests for attach/detach edge cases that are
   not yet covered (Event admin without Competition rights, Competition admin without Event
   rights, unrelated Competitions); competition-admin, event-admin and UI tests; workspace
   typecheck and build; a real-backend journey script (create Event, create + attach + detach
   Competition, access as Event admin vs. Competition admin vs. outsider). Update this plan,
   the parent plan and `agent-session-context.md`. Browser acceptance is the user's step.

## Out of scope

Changes to Competition rules, rating, bout recording or the participant app; Phase 4's open
items; pushing or merging to `origin`.

## Status / next

2026-11-20: plan written and approved by the user.

2026-11-20, Task 1 done (uncommitted): `AppContext` gained `href(route)`; new
`apps/competition-admin/src/screens/links.ts` builds in-app links as a real `href` plus a
`data-route` JSON attribute, and `wireRouteLinks` sends clicks (plain left-clicks only) to the
host's `navigate`. `competition.ts` and `settings.ts` no longer import the standalone router;
`competitionHeader` now takes the context. The standalone `main.ts` passes its router's `href`,
so URLs are unchanged. Verified: competition-admin tests 76 passed (2 new in `links.test.ts`),
typecheck clean; in the browser (standalone app on :5181 against the running backend) the
Participants/Settings links show the old URLs and navigate without a page reload, no console
errors.

2026-11-20, Task 2 done (uncommitted): `@hema/event-admin-api` exports
`getEventAdminApiSession(baseUrl?)`, the one cached `ApiSession` per base URL that
`createApiClient` already used (extracted, behavior unchanged). `AdminClient` now accepts either
a base URL (standalone: own `hema-competition-admin.session`, as before) or a host's
`ApiSession`; Event-admin will pass its session so both share one sign-in and the single-use
refresh token. Verified: competition-admin tests 77 passed (new test: a hosted client uses the
host's token, refreshes once, the host and its storage key see the rotated refresh token, and no
Competition-admin session is written); typecheck clean for competition-admin,
event-admin-api, event-admin and ui. No browser check: nothing visible changed yet.

2026-11-20, Task 3 done (uncommitted): `packages/ui/src/routing/event-admin-router.ts` — the
`competition-workspace` route got an optional `view` (`CompetitionWorkspaceView`: settings,
fighter, bout, objection) for `/events/:e/competitions/:c[/settings|/fighters/:id|/bouts/:id|/objections/:boutId]`;
unknown sub-pages are `not-found`. Path parts are now URL-decoded when parsing (previously
`format` encoded but `parse` did not decode). The two-way mapping lives in
`apps/competition-admin/src/hosted-routes.ts` (`toEventAdminRoute`, `fromEventAdminRoute`), so
`@hema/ui` stays free of Competition-admin types; standalone-only pages (list, needs-you, start)
map to the Event overview, and an objection stays in the open Competition. Verified:
competition-admin tests 84 passed (7 new), UI routing tests 23 passed (7 new), typecheck clean for
competition-admin, ui and event-admin.

2026-11-20, Task 4 done (uncommitted):
- `apps/competition-admin/src/hosted.ts` (package export `@hema/competition-admin/hosted`):
  `renderHostedCompetition(container, { session, navigate, href, sessionExpired }, route)` builds
  an `AppContext` on the host's session and route mapping, refuses a Competition whose `eventId`
  is not the route's Event (`admin.notInEvent`, en/nl), renders the participants / fighter / bout /
  settings / objection screens, keeps its own toast, and returns the loaded Competition for the
  breadcrumb. `CompetitionSummary` in competition-admin `api-types.ts` gained `eventId` (the
  backend already sent it).
- CSS: `hosted-styles.ts` wraps `styles.css` (imported `?inline`) in `@scope (.competition-admin-hosted)`,
  moves `:root` variables to `:scope`, drops the page-level `html, body` rule; the scope root gets the
  page padding. Verified in the browser that the shell's own button keeps its styling.
- `apps/event-admin/src/main.ts`: the `competition-workspace` route renders the hosted workspace
  with `getEventAdminApiSession()`; breadcrumb `Events / <Event> / <Competition>` (names escaped);
  `navigateTo` gained `replace`. `@hema/competition-admin` added to event-admin dependencies; the
  matching one-line entry was added to `package-lock.json` by hand (workspace link already present,
  no install run).
- Verified: competition-admin tests 86 passed (`hosted-styles.test.ts` new, incl. the real sheet),
  full UI suite 358 passed, typecheck clean (competition-admin, ui, event-admin), event-admin and
  competition-admin production builds pass. Browser: built event-admin served by an isolated
  backend on a SQLite copy of the dev database (port 3011; `competition-1` attached to "HEMA
  Championship 2026" only in that copy; the user's dev DB was not changed): event overview →
  competition card → participants, fighter, bout, Settings tab all render inside the shell with
  breadcrumb, in-app navigation without reload, browser Back works, no console errors; an
  unattached Competition under the Event URL shows "This competition is not part of this event."
- Known minor point: the hosted render fetches the Competition once for the Event check and the
  screen fetches it again (one extra GET per navigation).

2026-11-20, Task 5 done (uncommitted):
- **Decision (user, 2026-11-20): attaching needs admin rights on both sides.** Before, any admin of
  the target Event could attach any standalone Competition and so gain rights over it.
  `PATCH /api/v1/competitions/:id/event` (attach) now also calls `requireCompetitionAdmin`
  (owner/co-admin or system admin). Detach is unchanged (any manager of the Competition, including
  the parent Event's admins). Tests in `competition-event-link.test.ts`: the old "Event admin can
  attach" test now requires a co-admin row; new: Event admin without Competition rights → 403 and
  nothing changes, Competition admin without Event rights → 403, system admin → 200.
- Event overview (`event-overview-view`): the add-Competition dialog offers *create new* or *attach
  existing* (only unattached Competitions from the new `attachableCompetitions` property; a
  message and disabled submit when there are none); event `competition-attach-requested`. Labels
  translated (they were partly hard-coded English and the submit said "Create event"). New
  `listManagedCompetitions()` in `@hema/event-admin-api` (`GET /competitions/admin`, which only
  works for Competition- and system-admin accounts; others get an empty list).
- Detach: `AppContext.detachFromEvent?()` is provided only by the hosted entry; the Settings screen
  then shows an "Event" panel with *Detach from event* (confirmation), and afterwards returns to the
  Event overview. `AdminClient.setEvent(id, eventId | null)`.
- Theme fix needed to use the dialog: the overview's colors fell back to light values on the dark
  Event-admin page (white-on-white add buttons and dialog). Its CSS variables now follow the
  `--hema-*` tokens with the old light values as fallback; dialog, inputs and buttons set their
  text color explicitly. `navigateTo` scrolls to the top on a new page.
- Verified: backend 358 passed (full), competition-admin 87 passed, UI 361 passed (3 new overview
  tests), typecheck clean (competition-admin, event-admin-api, event-admin, ui, backend), backend and
  event-admin builds pass. Browser (isolated backend on a fresh SQLite copy of the dev DB, port 3011,
  user's dev DB untouched): overview readable; dialog create/attach modes; attached "Winter Sabre
  Cup" → card appears; its Settings shows the Event panel; detach → back on the overview without the
  card; all API calls 200.
- **Open point for the user:** Event admins whose account role is `USER` cannot use the hosted
  Competition screens, because the Competition admin routes start with `requireAdminUser` (an
  existing test asserts this). The combined permission therefore only works for Event admins with a
  `COMPETITION_ADMIN` or `SYSTEM_ADMIN` account. Decide whether those routes should accept any
  manager of the Competition (via `requireCompetitionAdmin`) instead.

2026-11-20, Task 6 done (uncommitted):
- Backend: `withInviteCodeForAdmins` (`competitions/signup-routes.ts`) also returns `eventName`
  (left join on `Event`) to the Competition's admins; public responses are unchanged. Tests: admin
  gets the name, standalone gives null, a non-admin gets no `eventName` field.
- Standalone Competition-admin: the header shows a chip "Part of <Event> ›" for an attached
  Competition, linking to `<Event-admin>/events/<e>/competitions/<c>`. New `eventAdminBase()` /
  `eventAdminCompetitionUrl()` in `config.ts` (`VITE_EVENT_ADMIN_URL`, else `http://localhost:5182/event-admin`
  in dev, else `/event-admin` on the same site). The link comes from the optional
  `AppContext.eventHref`, which only the standalone app provides (the hosted view already has the
  breadcrumb). Message `admin.partOfEvent` (en/nl).
- Verified: backend event-link/signup/visibility tests 72 passed, competition-admin 90 passed (3
  new config tests), typecheck clean (competition-admin, event-admin, ui, backend), builds pass.
  Browser (isolated backend on a fresh dev-DB copy, port 3011): after attaching `competition-1`
  in the copy, the standalone page shows the chip; clicking it opens the same Competition in
  Event-admin with breadcrumb; no chip inside Event-admin.
- Note: the two apps keep separate sign-ins (`hema-competition-admin.session` vs
  `hema-event-admin.session`), so following the link may ask to sign in to Event-admin.

2026-11-20, Task 7 done (uncommitted):
- New `apps/backend/test/competition-event-journey.test.ts` (real HTTP routes): Event admin creates
  an Event and a Competition for it (owner, `eventName` returned); a standalone Competition can be
  attached by neither the Event admin nor the Competition owner alone, only once the owner is also
  an Event admin; while attached the Event admin manages it and an outsider gets 403; the Event
  admin gets 403 on an unrelated Competition and cannot attach it; after detaching the Event admin
  loses access, the owner keeps it, and the name, admins and participants are preserved. The
  edge-case permission tests from Task 5 cover the remaining attach combinations.
- Full verification: `npm run typecheck` clean; `npm test` — backend 362, competition 104,
  competition-admin 90, score-keeper 120, api-session 30, competition-domain 91, match-engine 30,
  ranking 18, ui 361, all passed; `npm run build` passed for all workspaces;
  `npm run test:database-mode:smoke` 12 passed. No packages installed; the user's dev database
  was never written (browser checks used scratchpad copies on an isolated backend).

**Phase 5 status: implemented and auto-verified; browser acceptance by the user is open.**

Open points for the user:
1. ~~Event admins with a `USER` account role cannot open the Competition screens.~~ Resolved
   2026-11-20, see below.
2. The two apps keep separate sign-ins; the "Part of <Event>" link may ask to sign in again.
3. One extra `GET /competitions/:id` per hosted page load (Event check + screen).
4. Phase 4 open items remain (stage/match create/delete, stage advancement, browser acceptance).

Browser acceptance (user): `npm run backend:dev` (:3001), `npm run event-admin:dev -- --port 5182`
and `npm run competition-admin:dev -- --port 5181`; sign in as `admin`. In Event-admin open an Event →
*Add competition* → create one, and attach an existing one; open it (participants, fighter, bout,
Settings), detach it from Settings. In Competition-admin, an attached Competition shows
"Part of <Event> ›".

2026-11-20, after commit `36dc17b` — **decision (user): an Event admin manages every part of the
Event they manage, whatever their account role.** Local `master` fast-forwarded to `36dc17b` again
(not pushed). Changes (uncommitted):
- The Competition-scoped admin routes (`PATCH /competitions/:id`, `/transitions`, `POST /participants`,
  `/admins` GET/POST/DELETE, `/owner`, `/invite`, sign-up `/decision`) only require a signed-in user
  plus `requireCompetitionAdmin` (owner/co-admin, parent Event admin, system admin); the
  `COMPETITION_ADMIN` account-role gate (`requireAdminUser`) is gone there. `GET /competitions/admin`
  likewise lists what the signed-in user manages (empty for someone who manages nothing).
  Standalone-only pages keep the role gate: `GET /admin/needs-you` and `POST /competitions`.
- `isAdminOfBout` (objection review, admin bout view) uses `competitionAdminRole`, so the parent
  Event's admins also manage bouts of their Event's Competitions.
- Within an attached Competition an Event admin acts like a co-admin: adding co-admins and
  transferring ownership stay owner/system-admin only (unchanged `requireOwnerOrSystem`).
- Tests: `competition-event-link.test.ts` — the old "USER role is blocked" test is replaced by "Event
  admin with a USER account manages an attached Competition" (PATCH, admins, invite, enrol, managed
  list) and "a USER account without Event or Competition rights is still refused" (plus needs-you and
  create stay 403); `bout-resolution.test.ts` — an Event admin with a USER account resolves an
  objection in their Event's Competition, and is refused for a bout outside it;
  `competition-access.test.ts` — a plain user now gets an empty managed list instead of 403.
- Verified: backend 365 passed, smoke 12 passed, backend typecheck clean. Browser (isolated backend,
  scratch copy where `jeroen` was made a `USER` Event admin and competition-1's owner moved to
  `admin`): `jeroen` opens the attached Competition's Settings in Event-admin and saving the details
  returns 200.

# Tournament mode phase 4: fighter phones

Status: approved by the user on 2026-10-28; implementation is complete on `co-pilot`, automated verification passed, and real HTTPS/browser push verification remains deployment-dependent.

Design: `docs/superpowers/specs/2026-10-25-tournament-mode-design.md`. Phases 1–3 are complete; phase 3 status is in `docs/superpowers/plans/2026-10-28-tournament-bout-format.md`.

## Goal

Let a signed-in fighter use a phone to see their imported tournament schedule, know when they are on deck, and follow live pool/bracket results. Preserve the spreadsheet as the authority for bracket advancement: the app displays the latest imported bracket and never advances fighters itself.

## User decisions (2026-10-28)

- The tournament administrator manually links each imported fighter to an existing local backend account.
- On-deck notifications should also reach the fighter when the app is closed. Internet/external push infrastructure is allowed for this notification; the live app and scoring must still work over the venue LAN without internet.
- The workbook contains names but no stable fighter IDs. Repeated normalized names are therefore treated as ambiguous until the administrator explicitly assigns every affected bout side to an identity; separate identities can be created for same-name people before account linking.

## Proposed approach

- Extend the existing `apps/competition` PWA rather than create a second login/app. It already has account sessions, EN/NL support, routing, and a service worker. Keep the live tournament view separate from its existing competition-ratings screens.
- Add a tournament roster/account-link model to the backend. Derive roster entries from imported fighter names, link them to local `User` records from the existing admin tournament screen, retain links across safe re-imports, and reject conflicting account links. If the source provides no way to distinguish identical fighter names, do not silently merge or assign them; expose the ambiguity for admin resolution.
- Add authenticated fighter endpoints that return only the signed-in fighter's personal schedule and on-deck status, plus the tournament's imported schedule/results needed for the live pool/bracket view. Keep authorization checks in the backend; a client-supplied fighter/account ID must never grant access.
- Build a phone-first fighter screen in the existing PWA: next bouts and ring/order, current/on-deck state, and live pool/bracket results. Refresh from the local backend while open and show when the connection/data is stale.
- Implement background on-deck alerts using browser Web Push and the existing service worker. Use an asynchronous, durable notification outbox so push delivery cannot delay or fail exchange scoring. Persist subscriptions per account/device, make delivery idempotent, and handle expired subscriptions. Document that closed-app notifications require a supported browser, notification permission, HTTPS, and internet access to a push service; the in-app view remains usable without those.
- Keep EN/NL text, keyboard/accessibility behavior, and mobile layouts consistent with the existing PWA.

## Proposed implementation tasks

1. **Fighter identity model and import:** add a migration and typed database model for tournament fighters and account links; populate/update the roster from imports without losing existing links; validate collisions and import/re-import behavior.
2. **Admin linking workflow:** add roster listing, account search/selection, link/unlink actions, and clear unlinked/ambiguous states to the competition-admin tournament screen. Restrict changes to the tournament creator/system admin and prevent one account from being linked to multiple fighters in the same tournament.
3. **Fighter read API:** add authenticated `/me`-scoped tournament/schedule/result reads. Return only the viewer's personal schedule and the intended public tournament results; cover unauthorized, unlinked, and multi-tournament cases.
4. **Fighter PWA:** add a fighter tournament home/detail route, schedule and on-deck presentation, imported pool/bracket results, refresh/stale/offline states, and EN/NL translations.
5. **Background notification delivery:** add subscription registration/removal, server-side on-deck transition detection, durable queue/retry, and service-worker notification/click handling. Push failures must be visible/observable and must not block live scoring.
6. **Verification and handoff:** focused backend/admin/PWA tests, typechecks/builds, manual browser/device checks for linking, re-import preservation, personal-data isolation, live updates, and push/fallback behavior. Update the design/phase status and this plan with results and remaining gaps.

## Acceptance checks

- Admin can unambiguously link each imported fighter to an existing account and can correct/unlink it without changing bout names or results.
- Re-import does not discard account links or explicit bout-side identity assignments. Repeated normalized names are not auto-mapped; the admin can add distinct identities and assign every affected bout side before linking accounts.
- A linked fighter sees their own full schedule and current on-deck information; another signed-in user cannot see that personal schedule by changing a URL or request parameter.
- Fighters can see live bout results and the latest imported bracket; no client or server behavior advances the bracket automatically.
- When a bout becomes the next pending bout for a ring, the linked fighters are queued for an on-deck notification. Retries do not create duplicate notifications, and push outages do not block exchanges or scoring.
- The app remains usable for schedule/results over the venue LAN without internet. Closed-app push is explicitly best-effort and internet-dependent.

## Risks and constraints to resolve during implementation

- The current live import stores names on bouts, not stable fighter IDs. Identical names may be impossible to distinguish from the workbook alone. The admin workflow must make this visible and require an explicit resolution rather than assume identity.
- Web Push requires HTTPS and an internet-reachable browser push service. A venue-only HTTP setup cannot promise closed-app notifications; the app must still show live on-deck state while open.
- Existing `apps/competition/public/sw.js` is scoped to the competition PWA path. Notification routing and deployment paths must be tested at the real base path.
- No push infrastructure or VAPID configuration exists today. Use documented environment configuration and ensure missing/failed push configuration degrades only notifications, never core tournament behavior.

## Out of scope

- Tournament planning, pool generation, seeding, and bracket advancement.
- Database-mode tournament creation or changes to score-keeper/scoreboard behavior.
- Reusing the legacy Google Sheets integration (`apps/backend/src/google-sheets.ts`, `packages/sheets-client`).

## Next

Implementation and automated verification are complete. The user has deferred all real-phone checks until the end of the project and may postpone Web Push. They want both local and Alwaysdata deployment options from one codebase: locally, a Windows executable starts a server that serves the built PWAs and API behind the Fritz!Box (router only); on Alwaysdata, deploy the same app/backend with as few differences as practical. Prefer same-origin app/API paths and deployment-time configuration rather than code forks. Local core scoring must work without internet. Web Push and service-worker/PWA secure-context functionality can be deferred and require HTTPS.

Deployment feasibility was reviewed on 2026-11-05. Alwaysdata documents Node.js sites launched by command with a required site-assigned IP/port, selectable Node versions, and user-program sites; it also provides SSH/npm and account storage (disk quota includes files and databases). Confirm Node >=22 availability and native `better-sqlite3` installation on the eventual account. The backend's existing sync and push workers run inside the server process, compatible with a single long-running Node site process, subject to resource limits.

The approved deployment implementation is complete on the `co-pilot` worktree. It provides fixed paths for all five Vite apps, same-origin `/api/v1`, Fastify static serving with SPA fallback, persistent data paths, and Alwaysdata instructions. The Windows x64 package builder bundles a Node runtime, native production dependencies, and a self-contained executable launcher. The production build and actual launcher start/stop smoke checks passed; see the linked deployment plan for evidence and outstanding external checks.

The local desktop login check has passed. LAN phone testing remains for the final device-testing phase. The user has deferred Alwaysdata account verification (Node >=22, Linux `better-sqlite3`, site-assigned bind values, persistent storage, and worker resource limits). Local SQLite data and the generated secret have passed a disposable launcher restart test. Keep real-phone, HTTPS, and Web Push checks deferred until project end; use disposable data and credentials then. The next proposed feature plan is database-mode tournament scoring in [`2026-11-06-database-mode-tournament-scoring.md`](2026-11-06-database-mode-tournament-scoring.md); it requires user approval before implementation.

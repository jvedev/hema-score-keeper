# Ring and scoreboard settings from the table

Status: **implemented and verified 2026-11-17, uncommitted.** Approved by the user; see
**Status / next**.

## Goal

The ring keeper at the table (score-keeper ring mode) can set the ring's fighter colours and
the ring's scoreboard display, so a scoreboard facing the other way can be set up from the
table without touching the scoreboard device.

## Decided by the user (2026-11-17)

- Ring colours must be settable from the table, not only in Event-admin.
- The table and the scoreboard can face each other, so the scoreboard needs its own
  left/right orientation (e.g. red on the right at the table, red on the left on the board).
- The ring keeper can set these scoreboard settings from the table:
  - mirror (swap sides on the scoreboard only; colours stay with their fighter);
  - show or hide the next/on-deck bout;
  - text size;
  - light or dark theme.
- The Event defines the available fighter colours (an ordered palette). Arena colours in
  Event-admin, ring colours in the Event-admin live tab and at the table are chosen from that
  palette only; the backend rejects colours outside it. Event admins manage the palette.
  The default palette for a new Event is only red and blue.

## Current state (recon 2026-11-17)

- Ring colours are stored on `LiveRing` (`leftColor`, `rightColor`); the only write route,
  `PUT /live-rings/:id/colors`, is admin-only. Score-keeper ring mode only reads them.
- The scoreboard (`apps/score-keeper/src/scoreboard/`) already has a local flip button stored
  in that device's `localStorage` (`hema-scoreboard.flipped`) and always shows the on-deck
  bout. It polls the backend every second (`POLL_MS`).

## Proposed scope

1. Backend: store the scoreboard settings per ring on `LiveRing` (mirrored, show next, text
   size, theme), return them from the public scoreboard endpoint, and add keeper routes next
   to the claim route for colours and scoreboard settings. Only the device and user that
   currently hold the ring may write; tournament admins keep their admin routes.
2. Score-keeper ring mode: a ring settings panel with the colour pickers and the four
   scoreboard settings; colour changes apply at the table at once.
3. Scoreboard: apply the server settings on its next poll; the ring's server setting replaces
   the local flip button (decide during implementation whether a local override is still
   useful).
4. Event-admin live tab: shows the same settings for admins (shares the routes/types).

## Verification

Backend route tests for authorization (holder, non-holder, admin), score-keeper and scoreboard
view tests, full workspace typecheck/test/build.

## Status / next

Implemented 2026-11-17 (uncommitted; the user commits). **The schema changed: reset the dev
database once (`npm run backend:db:reset`).**

Decisions made during implementation:

- Scoreboard settings live on `LiveRing`: `scoreboardMirrored` (default 0), `scoreboardShowNext`
  (default 1), `scoreboardTextSize` `SMALL|MEDIUM|LARGE` (default `MEDIUM`), `scoreboardTheme`
  `DARK|LIGHT` (default `DARK`). The defaults draw the board as before.
- The scoreboard's local flip button and its `hema-scoreboard.flipped` localStorage key are
  removed: orientation is set at the table (or by admins) only. No local override was kept.
- "Show next" off hides the on-deck strip during a bout and the "Next" block and pool highlight
  between bouts; "No more bouts" still shows. Text size scales names and labels (not the score,
  clock or alert); the light theme uses darker warning colours.
- Event palette: new table `EventColor` (`id`, `eventId`, `name` nullable, `preset` `RED|BLUE`
  nullable, `hex` lower case and unique per event, `order`). A built-in colour has no name and is
  shown by its translated preset ("Rood"/"Red", "Blauw"/"Blue") until renamed. New Events and the
  seed event get red `#d62828` and blue `#2f7dfa`; new arenas default to the first two colours
  (left red, right blue). Changing a colour's hex also updates every arena and live ring of the
  event that used it. Removing is refused (409) for the last two colours (`TOO_FEW_COLORS`) and
  for a colour any arena or live ring of the event uses (`COLOR_IN_USE`).
- Arena and ring colours must be in the event palette and differ (400 otherwise), on arena
  create/update and on both ring colour routes. The ring's event is its live tournament's source
  Tournament's event.
- A schedule refresh (projection) no longer overwrites an existing ring's colours with its
  arena's colours, so a colour set at the table survives a refresh. A new ring still starts with
  its arena's colours.
- Default arena colours changed from green/blue to red/blue (schema defaults too); the seed's
  second arena now also uses red/blue. The score-keeper's non-ring (stand-alone arena) mode still
  falls back to green when an arena has no colour; that mode was out of scope.

Routes:

- `PUT /api/v1/live-rings/by-token/:token/colors` and
  `PUT /api/v1/live-rings/by-token/:token/scoreboard-settings`: signed in, ring access, and the
  `X-Device-Id` and user must be the ring's current holder (409 `TAKEN_OVER` otherwise, 400
  without the header).
- `PUT /api/v1/live-rings/:id/colors` (now palette-checked) and new
  `PUT /api/v1/live-rings/:id/scoreboard-settings`: tournament admins of the source Tournament and
  `SYSTEM_ADMIN`.
- Palette (event admins and `SYSTEM_ADMIN`): `POST /api/v1/events/:id/colors`,
  `PATCH /api/v1/event-colors/:id`, `DELETE /api/v1/event-colors/:id`,
  `PUT /api/v1/events/:id/colors/order` (`{ colorIds }`, every colour once). Each answers
  `{ colors }`. `ApiEvent.colors` carries the palette.
- Ring responses (`publicRing`) carry `scoreboard`; the ring-by-token response adds `palette`;
  `GET /api/v1/scoreboard/:token` returns `ring.scoreboard` with the colours.

UI:

- Score-keeper ring mode: the keeper gets a "Ring settings" button below the next-bout button on
  the ring screen (not on the scoring screen). The panel has palette swatches per side (picking
  the other side's colour swaps them) and the four scoreboard settings; each tap saves at once.
  The ring screen shows the two ring colours; the next bout opens in them. A `TAKEN_OVER`
  refusal turns the ring read-only like a refused score.
- Scoreboard: applies mirrored, show next, text size and theme from each poll.
- Event-admin: palette editor on the event's Arenas tab (rename, change hex, reorder, remove,
  add); arena form colour selects limited to the palette; live ring cards use palette selects
  and get a scoreboard settings form.

Verification (2026-11-17): `npm run typecheck` passes; `npm test` passes (backend 37 files/310
tests, score-keeper 14/120, ui 45/256, competition 10/104, competition-admin 6/74,
competition-domain 7/91, api-session 1/30, match-engine 5/30, ranking 4/18); `npm run build`
passes (existing chunk-size warning only); `npm run test:database-mode:smoke` passes (2 files/12
tests); `node scripts/verify-deployment-build.mjs` passes. The seed script was run against a
scratch database (not `data/dev.db`): the event gets red/blue and both arenas use them.

Open / not verified:

- Not tried in a browser or on a tablet; the panel and the light theme need a look on real
  screens (contrast, tap sizes, text sizes on a large monitor).
- Event-admin strings around arenas are still hard-coded Dutch (existing pattern); the new
  palette editor, live ring settings and score-keeper strings use the en/nl catalogues.
- `GET /api/v1/events/:id` is used by the Event-admin client (`getEvent`) but has no backend
  route (found while writing tests; not changed here).

Coordinator re-ran the full verification with the same results and reset the dev database
(`npm run backend:db:reset`; previous file kept as `data/dev.db.bak-2026-11-17T17-32-09-992Z`):
version 1, palette red/blue, both seed arenas red/blue, no foreign-key violations.

Next: browser/tablet check of the ring settings panel, scoreboard themes and Event-admin
palette editor; the user commits; then a reduced Phase 2 of the unified Event-admin plan.

### Browser check fixes (2026-11-17)

Bugs found in the browser check:

- Event-admin live tab: ring colour and scoreboard forms kept the values from when the tab was
  opened, and saving sent all of them, silently reverting what the table had set meanwhile
  (table set mirrored/LARGE/LIGHT; admin changed only "show next"; server ended
  false/MEDIUM/DARK). Fix (`packages/ui`, no backend change): saving reloads the ring list and
  sends the ring's current server values with only the fields the admin changed (against the
  form's rendered defaults) on top; a field changed on both sides takes the admin's choice
  (`event-view/form-state.ts`). While ring cards are on screen the list reloads every 5 s and on
  window focus and the cards are patched in place (keeper, links, forms), except a form that is
  changed or focused (`patchLiveRingCards` in `live-rings.ts`). The timer stops when the tab,
  tournament or view is left.
- Removing a palette colour in use (409 `COLOR_IN_USE`) showed the backend's English text with
  the live-ring error style. The no-session path of `@hema/event-admin-api` now throws
  `ApiError` with the JSON body (re-exported), and the palette editor shows en/nl messages by
  reason (`COLOR_IN_USE`, `TOO_FEW_COLORS`, general fallback) in its own
  `event-color-error`/`event-color-notice` elements.
- Live tab wording: "Database-mode scoring/activeren/actief" is now "Live scoring",
  "Live scoring activeren", "Live scoring actief" (and the ring-order hint).

Tests: `event-view.test.ts` (merge onto fresh server values; periodic refresh updates a clean
card but keeps a dirty form; timer stops on leaving the tab and on removal; palette refusals
translated in the palette editor), `form-state.test.ts`, `event-colors.test.ts`. Verified:
`npm run typecheck` passes; `npm run test --workspace @hema/ui` 46 files/264 tests pass;
`npm run build --workspace @hema/event-admin` passes. Not re-checked in the browser yet.

Browser check by the coordinator (2026-11-17, local dev servers, seeded dev admin `admin` from
the seed script): palette editor shows Rood/Blauw, adding Groen works; arena form offers only
palette colours; activating live scoring shows ring links (`VITE_SCORE_KEEPER_URL`), colour and
scoreboard forms and rules; at the table the ring settings panel saves colours and the four
scoreboard settings; the next bout opens in the chosen colours; the scoreboard applies mirror
(colours stay with the fighter), show next, text size and light theme within a second; the
local flip button is gone. After the fixes: the admin form refreshes to the table's values and
saving only one changed field keeps the table's other settings; removing an in-use colour shows
the Dutch message in the palette editor. Full `npm run typecheck` and `npm test` pass (ui 264,
backend 310, score-keeper 120, others unchanged). Not checked: visual layout/contrast on a real
tablet or large monitor (the browser pane was hidden, so no screenshots).

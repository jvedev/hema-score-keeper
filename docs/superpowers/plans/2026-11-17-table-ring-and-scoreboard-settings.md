# Ring and scoreboard settings from the table

Status: **draft, follows `2026-11-17-remove-spreadsheet-mode.md`.** Do not start before that
phase is done and this plan is approved.

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

Drafted 2026-11-17. Next: finish the spreadsheet removal phase, then get approval for this one.

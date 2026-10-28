# Tournament mode phase 3a: bout format (rounds, break, overtime) + bout state on the backend

Spec: `docs/superpowers/specs/2026-10-25-tournament-mode-design.md`. Phase 3 is split: 3a (this) = ruleset + table + backend state; 3b = scoreboard screen.

## Decided (user, 2026-10-28)
- Rounds: best of N (1 = no rounds). Each round starts at 0–0; rounds won per fighter are shown.
- `breakSeconds` between rounds, counted down on the table (and later the scoreboard).
- Overtime after every round or only the last round: extensions (each adds `extensionSeconds` to the countdown) and/or sudden death (after the extensions; first point wins; no time).
- Clock tone: normal, orange in the last-exchange window, red in overtime. Max doubles reached is flagged.
- Warning counts are sent to the backend. The scoreboard stays dumb: the backend sends the display state.

## Tasks
1. `packages/competition-domain/src/ring-rules.ts`: `RingRules` (duration, scores, maxDoubles, penalties, format), `parseRingRules` (lenient, defaults = today's ring constants), round/overtime helpers, `clockTone`, `boutDisplay`.
2. Backend: migration (LiveTournament.ruleset; LiveBout round/period/extension/periodStartedAt/warnings; LiveExchange.round). Clock route takes the bout state; exchanges carry their round. `display` on bout detail and ring bouts. `PUT /live-tournaments/:id/ruleset`; rules in the ring-by-token answer.
3. Score-keeper ring mode: rules from the backend, round-scoped score, warnings + phase sent with the clock op, ring-bar buttons (next round, break countdown, extension, sudden death), restore on open/takeover. Fight view: `extendDuration`.
4. Admin Tournaments: rules form per tournament.
5. Tests (domain, backend, controller), typecheck, browser check.

## Phase 3b (done): scoreboard
- Backend: LiveRing `scoreboardToken`, `leftColor`, `rightColor` (migration `2026-10-28-live-scoreboard`); public `GET /api/v1/scoreboard/:token` (current RUNNING bout with `display`, on deck, after, pool of the next bout with results); `POST /live-rings/:id/rotate-scoreboard-token`; `PUT /live-rings/:id/colors`. A running clock is brought up to now server-side, at most 10 s past the keeper's last report.
- Score-keeper `/scoreboard/:token` (`src/scoreboard/`): 1 s poll, local tick, flip per device (localStorage), "connection lost" after 5 s, wake lock. Layout A; between bouts "Next" + two-column pool list. Max doubles / point cap (`maxPointsCap`) flash as a see-through overlay over the whole board.
- Table uses the ring colours. Admin ring card: scoreboard link + QR, new scoreboard link, colour pickers; rules form has the point cap.

## Status / next
- Committed 2026-10-28 (3a + 3b). Next: phase 4 (fighter phones) per the design doc.
- Known gaps: undoing a warning's deduction does not lower the warning count; "End round" is offered at any time while rounds remain.
- Manual test setup: `.superpowers/verify/phase-t2/scripts/` (reset-db.sh, start-backend.sh on :3001), score-keeper on :5180, admin on :5181.

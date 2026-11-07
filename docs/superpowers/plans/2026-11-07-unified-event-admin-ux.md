# Unified Event-admin UX

Status: proposed; awaiting user review before detailed design or implementation.

## Goal

Design one coherent administration application at `/event-admin/` for creating and
administering events, their optional tournaments, event scheduling, and live results. The
design should make the event-to-tournament relationship obvious without requiring a
tournament to exist.

This is a product/UX phase. Do not start implementation until the information architecture
and screen concepts are approved.

## Product rules and constraints

- An event can have zero, one, or multiple tournaments.
- Every tournament belongs to exactly one event.
- Event-wide resources (for example arenas and event rulesets) can be managed even when the
  event has no tournaments.
- Keep the existing Event-admin API and data model as the initial source of behavior.
  Database structures and development data may be changed or discarded later if the approved
  UX needs it; any such change belongs in an explicitly scoped implementation phase.
- Keep live scoring in Score-keeper. Event-admin owns tournament setup, scheduling,
  administration, result visibility, and authorized corrections; it should link users to the
  scoring experience rather than duplicating it.
- Preserve sign-in and existing authorization. Do not imply that event-wide membership and
  tournament-admin permissions are interchangeable.
- Do not reintroduce the removed in-memory `<stage-view>` as if it were persisted product
  functionality.

## Repository baseline

The current Event-admin is a single dense view with three simultaneous areas: an event list,
event tabs, and tournament tabs. It already has:

- Event list and create/edit/delete actions.
- Event tabs for tournaments, arenas, officials, and rulesets.
- Tournament tabs for entries, officials, stages, admins, and live scoring.
- Stage tabs for overview, arenas, officials, rounds, matches, and pool results.
- A separate `/planning?eventId=...` route for event-wide time slots, stage placement,
  fighter and official assignments, and suggestions.
- Database-mode activation/status and completed-result correction controls.

The redesign must account for these behaviors rather than silently dropping them. The current
view is predominantly Dutch while some login, planner, and deployment surfaces are English;
language consistency is part of the design, not an incidental cleanup.

## Proposed information architecture

Use explicit event and tournament context, with one primary workspace at a time rather than
the current three-panel layout.

1. **Events**
   - Event list with a clear create action and concise status/summary.
   - Selecting an event opens its overview; creating an event does not require creating a
     tournament.
   - A useful zero-tournament state explains that event-wide setup can continue and offers an
     optional “Create tournament” action without implying it is mandatory.
2. **Event workspace**
   - Persistent event identity and event-scoped navigation.
   - Overview summarizes event details, arenas, ruleset, officials, tournament count, and
     planning status.
   - Dedicated areas for tournaments, arenas, event officials, event rulesets, and event
     schedule/planning.
   - Tournament list supports zero, one, or many tournaments and makes the selected
     tournament's parent event explicit.
3. **Tournament workspace**
   - Opened from within an event and visibly scoped to that event.
   - Overview and focused areas for participants, stages/matches, officials, tournament
     admins, and live results.
   - Stage selection reveals stage-specific overview, arena/official assignments, rounds,
     matches, and pool results without showing unrelated event/tournament panels.
   - Include clear back-navigation to the parent event and a way to switch to another
     tournament in that same event.
4. **Schedule planner**
   - Remains an event-wide workspace because time slots and assignments coordinate across
     that event's tournaments.
   - Keep stage placement, time-slot management, fighter/official assignments, suggestions,
     and current-slot controls.
   - Show the active event in the page header and provide direct navigation back to the event
     or tournament being planned.
5. **Live operations**
   - Keep schedule/setup and live scoring distinct. Show database/sheet mode and status,
     completed bouts and authorized correction controls in the tournament workspace.
   - Provide a clear handoff/link to Score-keeper for live bout operation.

## Proposed navigation and URL model

Keep `/event-admin/` as the app base and use stable entity-scoped routes so refresh, bookmarks,
and browser back/forward preserve context:

- `/events`
- `/events/:eventId`
- `/events/:eventId/tournaments`
- `/events/:eventId/tournaments/:tournamentId`
- `/events/:eventId/tournaments/:tournamentId/stages/:stageId`
- `/events/:eventId/planning`

Treat these paths as a design proposal, not a compatibility commitment. Existing routes may
change; there is no requirement to preserve `/tournament-admin/`. Query parameters may
represent temporary planner filters or modes, but event/tournament identity should be encoded
in the path.

## Core user journeys to design

- Create an event, leave it without tournaments, and manage its arenas/ruleset/officials.
- Add a first tournament later, then add a second tournament without confusing their
  participants, stages, or admins.
- Switch between tournaments while retaining the parent event context.
- Build stages and matches, place stages in the event-wide schedule, and assign arenas and
  officials/fighters.
- Activate the selected tournament's live-scoring mode, find results, and correct a completed
  bout with appropriate permissions.
- Navigate from event/tournament setup to the separate Score-keeper and return without losing
  context.
- Handle empty, loading, error, and unauthorized states without presenting missing data as a
  successful empty result.

## UX quality requirements

- One clear primary navigation hierarchy; avoid nested, simultaneously visible panels as the
  default desktop layout.
- Always show which event and, where applicable, which tournament/stage is in context.
- Distinguish event-wide resources from tournament-specific resources and indicate inherited
  ruleset settings where relevant.
- Preserve dangerous-action confirmation and make destructive scope explicit (especially
  tournament/event deletion).
- Use consistent Dutch/English localization based on the signed-in user's language.
- Responsive layouts should keep essential administration and status readable on smaller
  screens; prioritize efficient desktop planning while retaining usable tablet/phone
  oversight.
- Keyboard navigation, focus handling, labels, and status/error announcements must be designed
  for dialogs, tabs, planner interactions, and forms.

## Proposed phase sequence

1. **UX concept (this plan):** agree on the hierarchy, separation of event and tournament
   concerns, and which current capabilities must remain.
2. **Detailed interaction design:** map user journeys and screen states; produce low-fidelity
   layouts for Events, Event overview, Tournament overview, Stage workspace, and Schedule
   planner. Review empty and multi-tournament cases explicitly.
3. **Implementation plan:** map the approved designs to routes/components/API needs, identify
   any necessary database changes, and define migration/data-reset and verification approach.
   Ask for approval before implementation.
4. **Implementation:** deliver in small reviewable slices, preserving current behavior unless
   an approved design intentionally changes it; run targeted and workspace verification.

Do not proceed into a later phase automatically. Request user approval at each substantial
phase boundary.

## Acceptance criteria for detailed design

- Covers events with zero, one, and multiple tournaments.
- Makes the parent event and selected child tournament unambiguous in every relevant screen.
- Accounts for all listed existing event, tournament, stage, planner, live-result, and
  correction capabilities, with any intentional removals called out for approval.
- Separates event-wide scheduling from tournament-specific setup while making their
  relationship easy to navigate.
- Specifies loading, empty, error, permission, and destructive-action states.
- Defines localization, responsive, keyboard, and accessibility behavior.
- Does not assume database/API changes before validating them against the approved design.

## Open review points

- Confirm whether the proposed event-first navigation and dedicated tournament workspace fit
  the desired way of working.
- Confirm whether the planner belongs as an event-level workspace as proposed.
- Confirm the proposed user journeys and preservation of all current capabilities before
  detailed screen design.

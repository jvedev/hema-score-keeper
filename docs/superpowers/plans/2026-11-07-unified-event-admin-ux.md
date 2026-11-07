# Unified Event-admin UX

Status: event-first direction and low-fidelity wireframes approved. Competition will be
administered inside Event-admin. It can remain standalone or be linked to one Event;
event-admin and Competition-admin rights combine for an attached Competition. The user also
decided to retain the separate spreadsheet-mode `LiveTournament` workflow alongside
database-mode as a distinct component under Event → Components. The low-fidelity wireframes
are approved; the implementation plan is drafted for review.

## Goal

Design one coherent administration application at `/event-admin/` for creating and
administering events and their optional activity components. Current component types include
the Event-admin database-mode Tournament, the retained spreadsheet-mode `LiveTournament`,
and the existing Competition-admin Competition; future types may include workshops. The
design must not require any component for an event to be managed.

This is a product/UX phase. Do not start implementation until the information architecture
and screen concepts are approved.

## Product rules and constraints

- An event can have zero, one, or multiple tournaments.
- Every tournament belongs to exactly one event.
- An event can contain the existing Competition-admin Competition as an event component.
- An event can also contain a spreadsheet-mode tournament component, distinct from an
  Event-admin database-mode Tournament and from Competition. The user chose to place both
  tournament workflows under Event → Components.
- Parent-Event administrators may manage an attached spreadsheet-mode tournament, in addition
  to its existing creator and `SYSTEM_ADMIN`. The user approved that creators of new Events
  become their first Event administrator; existing Events without one are bootstrapped by
  `SYSTEM_ADMIN`.
- Attaching/detaching a Competition or spreadsheet-mode tournament changes only its parent
  Event relationship and preserves component data. Event deletion detaches these component
  types instead of deleting them; detaching removes parent-Event access.
- Spreadsheet-mode tournament ring/bout order remains in its existing workflow; the shared
  Event planner covers database-mode Tournament stages only.
- The component model must leave room for later types such as workshops without forcing
  tournament-specific behavior onto every component.
- Do not assume the separate Competition and Tournament domain models should be merged into a
  single generic activity table. The eventual relationship and API changes must be designed
  explicitly.
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
- Competition-admin has a distinct `LiveTournament` workspace for spreadsheet-mode tournament
  setup: XLSX/Google import, sync/backup status, rules, fighter identity linking, and ring
  links. The user decided to retain it as a separate component under Event → Components,
  alongside database-mode Tournaments. It is not the rating Competition; preserve the
  distinction in naming, navigation, behavior, and eventual data/API design.

The redesign must account for these behaviors rather than silently dropping them. The current
view is predominantly Dutch while some login, planner, and deployment surfaces are English;
language consistency is part of the design, not an incidental cleanup.

The existing Competition-admin Competition is an event component and will be administered
inside the Event-admin shell. Competition remains a distinct domain from Event-admin
Tournament. Its lifecycle, date, visibility/scope, ruleset, signups/invites,
participants/standings, bout history, and competition-admin membership must be represented
without relabeling or merging it with Tournament. Future component types such as workshops
remain possible. For an attached Competition, the user decided that permissions combine:
event admins for its parent event and existing Competition admins can manage it;
`SYSTEM_ADMIN` remains global. The user also confirmed that Competition can remain standalone
or be linked to exactly one Event. The existing `/competition-admin/` app remains in scope as
the standalone entry point.

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
   - Overview summarizes event details, arenas, ruleset, event officials, components, and
     planning status.
   - A type-aware **Components** area lists zero or more child components, initially
     database-mode Tournaments, spreadsheet-mode Tournaments, and Competitions. Each type
     retains its own concepts and actions.
   - Dedicated event-wide areas remain available for arenas, event officials, event rulesets,
     and event schedule/planning.
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
4. **Competition workspace**
   - Administer the existing Competition-admin Competition inside the Event-admin shell.
   - Preserve its distinct lifecycle, settings, participants/standings, signups, admins,
     bouts, and review workflows.
   - Keep its route and screens distinct from Tournament-specific stages and live results.
   - For an attached Competition, combine parent event-admin and Competition-admin rights.
   - Let Event-admin create a competition for the selected event or attach an existing
     standalone Competition.
5. **Schedule planner**
   - Remains an event-wide workspace because time slots and assignments coordinate across
     that event's tournaments.
   - Keep stage placement, time-slot management, fighter/official assignments, suggestions,
     and current-slot controls.
   - Show the active event in the page header and provide direct navigation back to the event
     or tournament being planned.
6. **Live operations**
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
- `/events/:eventId/competitions/:competitionId`
- `/events/:eventId/planning`

Treat these paths as a design proposal, not a compatibility commitment. Existing routes may
change; there is no requirement to preserve `/tournament-admin/`. Query parameters may
represent temporary planner filters or modes, but event/tournament identity should be encoded
in the path.

## Core user journeys to design

- Create an event, leave it without tournaments, and manage its arenas/ruleset/officials.
- Add the existing Competition-admin Competition as a distinct event component and manage it
  inside the Event-admin shell; also create a Competition for an event or attach an existing
  standalone Competition.
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

1. **Done:** user approved the event-first hierarchy, optional tournaments, event-wide planner,
   and keeping live scoring in Score-keeper.
2. **Done:** user expanded event components to include the existing Competition-admin
   Competition, with direct administration inside the Event-admin shell. Competition may
   remain standalone or be linked to exactly one Event. For an attached Competition, event
   admins and Competition admins both retain management rights. The user also decided to keep
   spreadsheet-mode `LiveTournament` administration as its own Event component beside
   database-mode Tournaments, managed by parent-Event administrators as well as its creator and
   `SYSTEM_ADMIN`. The
   detailed concept is in
   [`2026-11-07-unified-event-admin-ux-detail.md`](2026-11-07-unified-event-admin-ux-detail.md);
   low-fidelity screen concepts are in
   [`2026-11-07-unified-event-admin-wireframes.md`](2026-11-07-unified-event-admin-wireframes.md).
   The user approved preserving child data on attach/detach and detaching these component
   types, rather than deleting them, when an Event is deleted.
3. **In progress:** implementation plan drafted in
   [`2026-11-07-unified-event-admin-implementation.md`](2026-11-07-unified-event-admin-implementation.md).
   It maps routes, APIs, schema and migration work; two decisions remain before
   implementation.
4. **Implementation:** deliver in small reviewable slices, preserving current behavior unless
   an approved design intentionally changes it; run targeted and workspace verification.

Do not proceed into a later phase automatically. Request user approval at each substantial
phase boundary.

## Acceptance criteria for detailed design

- Covers events with zero, one, and multiple components, including zero, one, or multiple
  tournaments, plus standalone and event-linked Competitions.
- Leaves an extension point for future components such as workshops.
- Makes the parent event and selected child tournament unambiguous in every relevant screen.
- Accounts for all listed existing event, tournament, stage, planner, live-result, and
  correction capabilities, with any intentional removals called out for approval.
- Separates event-wide scheduling from tournament-specific setup while making their
  relationship easy to navigate.
- Specifies loading, empty, error, permission, and destructive-action states.
- Defines localization, responsive, keyboard, and accessibility behavior.
- Does not assume database/API changes before validating them against the approved design.

## Open review points

- The low-fidelity wireframes are approved. Review the implementation plan before any product
  code or schema changes.
- Competition cardinality, attachment/detachment data behavior, and Event-admin membership
  bootstrap are approved.
- The spreadsheet-planner boundary is approved: the shared planner covers database-mode
  Tournament stages only. Confirm the legacy sheet-workflow entry-point transition. Other UX
  details such as officials terminology and localization behavior remain part of
  implementation design.

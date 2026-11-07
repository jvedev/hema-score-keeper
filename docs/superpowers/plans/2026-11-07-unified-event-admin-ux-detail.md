# Unified Event-admin UX: detailed concept

Status: draft; event-first direction, Competition integration, attached-Competition permission
union, standalone-or-linked Competition behavior, and retaining spreadsheet-mode tournaments
as separate Event components approved; low-fidelity wireframes await review.

Parent plan: [`2026-11-07-unified-event-admin-ux.md`](2026-11-07-unified-event-admin-ux.md).

## Design principles

- **Event first, components optional:** event setup and navigation work when there are no
  database-mode tournaments, spreadsheet-mode tournaments, or competitions. Never
  auto-create a component or imply one is required.
- **Event as a container:** an event can contain different component types. Start with
  database-mode Tournaments, spreadsheet-mode Tournaments, and the existing Competition-admin
  Competition; leave an explicit extension point for future types such as workshops.
- **Keep component domains distinct:** Competition is not either tournament workflow.
  Spreadsheet-mode and database-mode Tournaments also remain separately labeled and retain
  their own operations; do not merge domain models or workflows merely to place them under
  one event.
- **Context before action:** show event, tournament, and stage context in page title,
  breadcrumbs, and destructive confirmations.
- **One workspace at a time:** replace the current three-panel dashboard with a focused
  event or tournament workspace. Preserve fast switching through navigation, not by keeping
  several unrelated editors open at once.
- **Separate planning from live operation:** schedule construction is event-wide; bout scoring
  remains in Score-keeper; Event-admin shows live status, results, and authorized corrections.
- **No hidden schedule semantics:** time slots and per-ring bout order express sequence, not a
  guaranteed start time or duration.
- **Progressive detail:** summaries lead to focused lists and detail pages; high-impact or
  rarely used controls should not dominate the overview.

## App shell

```text
┌───────────────────────────────────────────────────────────────────┐
│ HEMA Event-admin   Events   [Current event ▼]   Help  User / sign out │
├───────────────────────────────────────────────────────────────────┤
│ Events / HEMA Open / Tournament: Longsword / Pool stage           │
│                                                                   │
│ [Context navigation]    [One focused page with primary actions]   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

- Global navigation always has an **Events** entry. The event selector appears after an event
  is selected; it switches events and returns to that event's overview.
- Show breadcrumbs only for the current hierarchy. The tournament breadcrumb always links
  back to its parent event.
- Account name, role, and sign-out remain visible. Language follows the signed-in user's
  language; unauthenticated login can continue using browser language.
- Keep the shell stable when changing event/tournament routes. Store durable context in the
  URL, not only in component state.

## Screen specifications

### 1. Events (`/events`)

**Purpose:** find, create, and enter an event.

**Primary content**

- Page title “Events” / “Evenementen” and a primary create action.
- Scannable rows/cards with event name and known counts for components and arenas.
- Selecting a row opens the event overview; separate edit/delete controls stay secondary.
- Sort/filter controls should only be added if the current data/API can support them reliably.

**Empty state:** explain that no events exist and offer “Create event”. Do not suggest a
tournament or competition is part of event creation.

### 2. Event overview (`/events/:eventId`)

**Purpose:** understand and manage an event independently of its tournaments.

**Header:** event name, event-level ruleset summary including inheritance source, edit action,
and a primary link to event planning.

**Summary content**

- Component count and a type-aware section with optional database tournament, spreadsheet
  tournament, and Competition creation/attachment actions. No component is required.
- Arena count and quick link to manage arenas.
- Event-wide officials and ruleset links.
- Schedule summary/next action when the event has a schedule; do not fabricate date/time
  information absent from the model.

**Zero-component state:** say that the event can be administered on its own and that
components may be added when needed. Keep arenas, rulesets, officials, and planning
accessible. Planning without any stages should explain how to add a tournament/stage but
should not block event administration.

### 3. Event components and resources

Components and event-wide resources are accessible from the event context, not mixed into
another component's settings:

- **Components:** list the event's type-specific components. Initially this includes
  database-mode Tournaments, spreadsheet-mode Tournaments, and Competitions; later types such
  as Workshops can add their own card and focused workspace. A component remains optional,
  and event-level resources are still usable with no components.
- **Tournaments:** distinguish database-mode and spreadsheet-mode child tournaments with
  explicit labels and separate actions/workspaces. Database-mode cards show name, effective
  ruleset/source, participant count, and stage count. Spreadsheet-mode cards expose their
  existing sync/backup state and spreadsheet-management entry point. Every card names or
  breadcrumbs its parent event. Support multiple of either type without assuming a default
  or only tournament.
- **Competitions:** show the existing Competition-admin Competition as a separate component,
  with its own status, date, participant/standing summary, and clear action to continue
  managing it. Do not display it as a tournament or merge the two component workspaces.
- **Arenas:** event-wide ordered arena list and its existing stage-use summary.
- **Officials:** event-level people and assignments, with a clear distinction between
  event-wide and tournament/stage assignments.
- **Rulesets:** event-level rule definitions and versions. Inherited rules are displayed with
  their source; a stage or tournament override is not presented as an event-level edit.

### 4. Tournament overview (`/events/:eventId/tournaments/:tournamentId`)

**Purpose:** manage one tournament within a clearly identified event.

**Header:** event breadcrumb, tournament name/color, ruleset with inheritance source, stage
and participant counts, and edit action.

**Primary navigation**

1. Overview
2. Participants
3. Stages
4. Officials
5. Access (tournament admins)
6. Live results

Overview summarizes participants, stage progression/current stage, scheduling readiness,
and live-scoring mode/status. These are links to their owning sections, not duplicate editors.

Switching tournaments is available in event context and must update the tournament URL and
content together. Never display one tournament's data under another tournament's heading.

### 4a. Competition component

The user selected direct administration inside the Event-admin shell. Competition remains a
distinct domain/component and is not converted into a Tournament.

**Component card:** show competition name, lifecycle status, date, and currently available
participant/standing summary. Opening it navigates to its focused workspace within the
selected event.

The user wants Competition to remain available standalone or be linked to one Event. The
proposed event workflow therefore offers both **Create competition for this event** and
**Attach existing competition**. A Competition can be standalone or linked to one parent
Event; an Event can show multiple type-specific components. The old Competition-admin entry
point is not removed as part of this design.

**Competition workspace:** retain its current capabilities and terminology, including:

- Participant and standings list, participant drilldown, and bout history/details.
- Lifecycle transitions and competition date/details.
- Competition ruleset, visibility/scope, signup approval/limits, invite link/QR management,
  and participant enrollment.
- Competition-admin membership and role-sensitive management.
- “Needs you” actions: objections, bouts awaiting referee review, and pending signups.

Proposed route: `/events/:eventId/competitions/:competitionId`, with focused child routes or
sections for participants/bout drilldown and settings. The parent event remains visible in
the breadcrumb. Competition-owned date, lifecycle, scope, signup rules, and bout history stay
distinct from event-wide scheduling and tournament stages.

The existing `/competition-admin/` app remains available as the standalone entry point.

The current Competition-admin app also has a separate `LiveTournament` workspace for
spreadsheet-mode tournament operation: XLSX/Google imports, sync and backup status, ring
rules, fighter identity linking, and ring links. The user decided to retain it as a distinct
component under Event → Components, alongside database-mode Tournament. It remains separate
from the rating Competition and from Event-admin's database-mode Tournament; preserve the
distinction in labels, operations, and eventual data/API design. The exact component fields,
association of existing records to events, permissions, and migration belong in the
implementation plan.

### 4b. Spreadsheet-mode tournament workspace

Opening a spreadsheet-mode tournament must lead to its own focused workspace, clearly labeled
as spreadsheet-based and distinct from the database-mode Tournament and rating Competition.
Preserve the current operational surface:

- XLSX and Google spreadsheet import.
- Sync and backup status, with explicit success/failure and stale-data feedback.
- Tournament rules and configuration.
- Fighter identity linking and ring links.

Do not show database-mode activation, LiveExchange results, or database-mode correction
controls as if they applied to this workspace. The exact route, authorization mapping, data
association, and whether event-level scheduling can reference these records must be resolved
against the existing implementation in the implementation plan.

### 5. Participants

- List fighters with seed and relevant current participant data.
- Offer single-entry and existing bulk-entry workflows.
- Keep officials separate from fighters; do not merge tournament admin users into participant
  lists.
- Empty state: explain that participants can be added individually or in bulk.

### 6. Stages (`/events/:eventId/tournaments/:tournamentId/stages/:stageId`)

Use a stage list/navigation within the tournament and one selected stage detail. Stage
navigation remains scoped to its tournament.

Stage detail sections:

- **Overview:** type, effective ruleset/source, stage-specific configuration, current/next
  stage status, arena/official/round/match counts. Expose existing set-current/advance actions
  with clear confirmation/impact where appropriate.
- **Arenas and officials:** show assigned people/arenas, available options, and assignment
  actions.
- **Rounds and matches:** pool matches show generated schedule and editable ring order; bracket
  matches show scheduled phase, arena/time slot, and explicit per-ring bout order.
- **Pool results:** preserve the existing table/result view and its full-screen presentation.

Stage types can have different configuration. Do not show irrelevant fields for a stage type;
explain why a required assignment is missing rather than presenting a blank list.

### 7. Event schedule planner (`/events/:eventId/planning`)

**Purpose:** coordinate tournament stages belonging to the selected event. The existing
Competition component has a separate bout/rating lifecycle; do not assume its bouts appear
on this tournament stage timeline.

**Desktop layout**

```text
┌ Event name · Schedule                         [Suggestions] ┐
│ Start / time-slot controls · Current slot · Refresh status │
├──────────────────────┬─────────────────────────────────────┤
│ Source list / mode   │ Time-slot timeline by arena         │
│ Stages               │ Place stages and inspect assignments│
│ Officials            │                                     │
│ Fighters             │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

- Keep the current stages / volunteers / fighters modes, time-slot labels/durations/breaks,
  stage placement, current-slot controls, suggestions, and fighter random-assignment
  capability.
- Visually group stages and participants by tournament, using tournament color only as a
  supporting cue; color is never the sole identifier.
- Stage placement and fighter/official assignments must support both drag/drop and an
  accessible click/select action. This gives keyboard and touch users a complete alternative.
- State clearly that slots/order define sequence, not guaranteed match start times or duration.
- Warn before deleting or moving a placement/slot if assignments or scheduled matches could be
  affected; present the concrete impact returned by the backend.
- When there are no tournaments/stages, show a useful empty state with a link to create a
  tournament/stage, while leaving event-level schedule configuration available when valid.

**Small screens:** switch from a wide timeline to a slot/arena selector and focused list for
the selected lane. Preserve assignment, status, and non-drag actions; do not require horizontal
drag gestures for essential work.

### 8. Officials and tournament access

- Keep event-wide officials, tournament officials, and stage assignments visibly distinct.
- Tournament **Access** lists current tournament admins and supports add/remove per existing
  authorization. Explain read-only/denied access where the user cannot administer membership.
- Do not infer tournament ownership for existing unowned tournaments. Preserve the explicit
  `SYSTEM_ADMIN` assignment path for a first admin.

### 9. Live results (`/events/:eventId/tournaments/:tournamentId/live`)

Show tournament identity and source mode prominently.

- If live mode is inactive, explain prerequisites and offer activation only to authorized
  users.
- If active, show mode, rings/bouts, schedule-refresh action, and whether the schedule update
  succeeded or reported a conflict.
- List completed bouts with fighters, result, and correction action only for authorized
  tournament admins. Corrections edit the exchange history and clearly state that the stored
  result will be revised.
- Distinguish loading, no completed bouts, no live data, and request failure. Do not render
  an API error as an empty result list.
- Provide an explicit link to the Score-keeper for live ring operation; do not embed the
  score-entry UI in Event-admin.

## Interaction, permission, and state behavior

### Navigation

- Browser back/forward and page refresh restore the same event/tournament/stage.
- Switching the event clears child context unless the target event has an explicit matching
  deep link.
- If a URL points to a missing or unauthorized entity, show an actionable not-found/permission
  state and safe navigation to Events; never silently select the first event/tournament.
- After save, keep the user on the owning screen and show a success confirmation. On failure,
  preserve form values and show an actionable error.

### Permissions

- Authentication remains required.
- Separate visibility from edit permission. Read-only users can understand why a control is
  unavailable and who can perform it.
- Tournament-admin actions are scoped to that tournament. `SYSTEM_ADMIN` retains global
  administration. Scheduled ring-role users use Score-keeper permissions, not Event-admin
  admin controls.
- For an attached Competition, combine parent event-admin and existing Competition-admin
  rights: either role can manage that component, and `SYSTEM_ADMIN` remains global. This
  permission union applies only to the attached component and must be enforced by the API.
- A standalone Competition continues to use its existing Competition-admin authorization;
  event-admin rights apply only after it is linked to an Event.
- Re-check permission at the API boundary; visual hiding/disablement is not authorization.

### Destructive actions

- Confirm event/tournament/stage/participant deletion with the target name and affected scope.
- Explain dependent data/removal behavior based on actual backend semantics before enabling
  the action. Do not promise recovery or preservation unless implemented.
- Prefer archive/soft-delete only if the product/data model explicitly supports it; do not
  invent a new lifecycle in the UX design.

### Responsive and accessible behavior

- Desktop is optimized for dense tournament setup and schedule planning.
- Tablet/phone layouts use single-column content and focused planner lanes; overview and status
  remain readable, while complex forms remain usable without hover.
- All actions are keyboard reachable; dialogs have focus entry/return and Escape behavior.
- Tabs/navigation expose current location semantically; form fields have persistent labels;
  errors and async status use screen-reader announcements.
- Never rely on color, hover, icons alone, or drag/drop alone to communicate or perform an
  essential action.

## Capability coverage checklist

Detailed design and eventual acceptance tests must account for:

- Event CRUD and optional child tournament list.
- Event component list that distinguishes Tournament, Competition, and a future extension
  point such as Workshop.
- Event arenas, rulesets, and event-level officials.
- Tournament CRUD, participants (single/bulk), tournament officials, and admins.
- Competition lifecycle, signup, participant/standings, settings, admin, bout-history, and
  review workflows inside the Event-admin shell.
- Existing spreadsheet-mode LiveTournament import/sync/backup, rules, fighter-link, and
  ring-link workflows are retained as a distinct Event component alongside database-mode
  tournaments.
- Stage creation/configuration, stage progression, arenas, officials, rounds, matches, and
  pool results.
- Event schedule time slots, stage placement, fighter/official assignments, suggestions,
  current time slot, random pool-fighter assignment, and per-ring order.
- Existing live scoring mode, schedule projection/update, completed results, and authorized
  correction history.
- Root, deep-link, browser-navigation, loading, empty, error, permission, and destructive
  states.

## Decisions to validate before implementation

- Define spreadsheet-tournament fields, association/migration of existing records to Events,
  and permissions in the implementation plan without merging it with database-mode Tournament
  or rating Competition.
- Define attach/detach behavior and its effect on existing Competition data in the
  implementation plan.
- For the initial component model, treat an Event as able to contain zero or more components
  of each supported type. Tournament has exactly one parent Event. Competition is standalone
  or linked to exactly one Event, as the user selected.
- Confirm attach/detach lifecycle and its effect on existing Competition data before
  implementation.
- Confirm the exact distinction and terminology for event officials versus tournament
  volunteers/officials; current backend/UI aggregation must be checked before labels are fixed.
- Confirm actual delete/cascade semantics for each resource before writing confirmation copy.
- Validate the proposed `/events/...` route hierarchy against existing app-base and static
  serving behavior before implementation.
- Decide whether the app should support read-only event viewing for non-admin event staff; do
  not broaden permissions without product approval.
- Confirm whether language selection is user-profile-only or should also be manually
  switchable in the app shell.

## Next step

Review this detailed concept with the user. After approval, create low-fidelity screen layouts
or a prototype plan for each workspace before implementation planning. Any proposed API or
schema changes must be listed separately and approved as part of the implementation phase.

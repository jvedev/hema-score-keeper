# Unified Event-admin UX: detailed concept

Status: draft; information-architecture direction approved, detailed screen design awaiting
user review.

Parent plan: [`2026-11-07-unified-event-admin-ux.md`](2026-11-07-unified-event-admin-ux.md).

## Design principles

- **Event first, tournament optional:** event setup and navigation work when there are no
  tournaments. Never auto-create a tournament or imply one is required.
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
│ Events / HEMA Open / Longsword / Pool stage                       │
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
- Scannable rows/cards with event name and known counts for tournaments and arenas.
- Selecting a row opens the event overview; separate edit/delete controls stay secondary.
- Sort/filter controls should only be added if the current data/API can support them reliably.

**Empty state:** explain that no events exist and offer “Create event”. Do not suggest a
tournament is part of event creation.

### 2. Event overview (`/events/:eventId`)

**Purpose:** understand and manage an event independently of its tournaments.

**Header:** event name, event-level ruleset summary including inheritance source, edit action,
and a primary link to event planning.

**Summary content**

- Tournament count and a tournament section with a prominent optional “Add tournament”
  action.
- Arena count and quick link to manage arenas.
- Event-wide officials and ruleset links.
- Schedule summary/next action when the event has a schedule; do not fabricate date/time
  information absent from the model.

**Zero-tournament state:** say that the event is ready for its event-wide setup and that
tournaments may be added when needed. Keep arenas, rulesets, officials, and planning
accessible. Planning without any stages should explain how to add a tournament/stage but
should not block event administration.

### 3. Event resources

Accessible from event context, not mixed into a tournament's settings:

- **Tournaments:** list all child tournaments. Cards show name, ruleset (including whether
  inherited), participant count, and stage count. Every card names or breadcrumbs its parent
  event. Support multiple tournaments without assuming a default/only tournament.
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

**Purpose:** coordinate all tournaments belonging to the selected event.

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
- Event arenas, rulesets, and event-level officials.
- Tournament CRUD, participants (single/bulk), tournament officials, and admins.
- Stage creation/configuration, stage progression, arenas, officials, rounds, matches, and
  pool results.
- Event schedule time slots, stage placement, fighter/official assignments, suggestions,
  current time slot, random pool-fighter assignment, and per-ring order.
- Existing live scoring mode, schedule projection/update, completed results, and authorized
  correction history.
- Root, deep-link, browser-navigation, loading, empty, error, permission, and destructive
  states.

## Decisions to validate before implementation

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

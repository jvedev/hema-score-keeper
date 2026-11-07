# Unified Event-admin: low-fidelity wireframes

Status: draft; updated after the user chose to retain spreadsheet-mode tournaments as a
separate Event component alongside database-mode tournaments; awaiting review.

Parent plan: [`2026-11-07-unified-event-admin-ux.md`](2026-11-07-unified-event-admin-ux.md).
Interaction detail: [`2026-11-07-unified-event-admin-ux-detail.md`](2026-11-07-unified-event-admin-ux-detail.md).

These are structural wireframes, not visual styling or a commitment to a specific component
library. They describe hierarchy, context, actions, and empty states using current product
behavior and recorded user decisions.

## Shared application frame

```text
┌─────────────────────────────────────────────────────────────────────┐
│ HEMA Event-admin   Events   Needs attention (3)   [Event ▼]  [User] │
├─────────────────────────────────────────────────────────────────────┤
│ Events / HEMA Open / Tournament · Longsword / Stage · Pools         │
├──────────────────────┬──────────────────────────────────────────────┤
│ Event/component      │ Page title                 [Primary action] │
│ navigation           │                                              │
│                      │ Focused page content                        │
│                      │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

- Global frame persists across event and attached-component workspaces.
- `Needs attention` preserves Competition-admin's cross-competition objection, referee, and
  signup queues; it is omitted when empty, matching current behavior.
- The event selector switches event context and navigates to the selected event overview.
- For a standalone Competition, the same Competition workspace can be opened through the
  existing Competition-admin entry; the standalone app is not removed by this design.
- Breadcrumbs show the actual parent chain. They never imply a Competition is a Tournament.

## 1. Events index

```text
Events                                                  [+ Create event]
Manage events and their optional components.

┌─────────────────────────────────────────────────────────────────────┐
│ HEMA Open 2026  1 database · 1 spreadsheet tournament · 1 competition│
│ 4 arenas · [Open event]                                      [⋯]   │
├─────────────────────────────────────────────────────────────────────┤
│ Winter Gathering                       No components · 2 arenas    │
│ [Open event]                                                  [⋯]   │
└─────────────────────────────────────────────────────────────────────┘
```

Actions:

- Row body opens the event overview.
- Overflow menu contains edit/delete with explicit scope and dependency warning.
- Counts reflect actual related entities; they do not imply that every event must have each
  type.

No events:

```text
No events yet
Create an event to manage its shared resources and optional components.
[Create event]
```

The create-event form contains event fields only; it does not force the creation of a
Tournament or Competition.

## 2. Event overview

```text
Events / HEMA Open 2026

HEMA Open 2026                                      [Edit event]
Event ruleset: HEMA Open v2 · inherited by 1 component

[Overview] [Components 3] [Arenas 4] [Officials] [Rulesets] [Schedule]

Components                                             [+ Add component]
┌───────────────────────────────┐ ┌──────────────────────────────────┐
│ Database tournament          │ │ Competition                      │
│ Longsword · 3 stages         │ │ HEMA ratings · Active · 7 Nov     │
│ 24 participants              │ │ 32 participants · standings      │
│ [Open tournament]            │ │ [Manage competition]             │
└───────────────────────────────┘ └──────────────────────────────────┘
┌───────────────────────────────┐
│ Spreadsheet tournament       │
│ Sabre · Last sync 09:42       │
│ Backup available · 16 fighters│
│ [Manage spreadsheet tournament]│
└───────────────────────────────┘

Event resources
[Arenas · 4]  [Officials]  [Rulesets]        [Open event schedule]
```

`Add component` opens a type choice:

```text
Add component
[Database-mode tournament]
[Spreadsheet-mode tournament]
[Competition]
Future component types (for example Workshops) are not available yet.
[Cancel]
```

Choosing Competition offers:

```text
Add a Competition to HEMA Open 2026
[Create competition for this event]
[Attach an existing standalone competition]
[Cancel]
```

The event with no components still displays Event resources and Schedule. Its empty state
offers optional component creation without implying a component is mandatory.

## 3. Tournament workspace

```text
Events / HEMA Open 2026 / Tournament · Longsword

Longsword                                    [Edit tournament] [⋯]
Ruleset: HEMA Open v2 · inherited from event
24 participants · 3 stages · Current stage: Pools

[Overview] [Participants] [Stages] [Officials] [Access] [Live results]

Overview
┌─────────────────────┐ ┌───────────────────┐ ┌──────────────────────┐
│ Participants        │ │ Stage progression │ │ Schedule readiness   │
│ 24 · [View]         │ │ Pools → Final     │ │ 2 bouts need arena   │
└─────────────────────┘ └───────────────────┘ └──────────────────────┘
```

The tournament switcher stays within the event context. All tabs, forms, and results use the
selected tournament ID. Participant creation retains single and bulk modes.

### Stage workspace

```text
Events / HEMA Open 2026 / Longsword / Pools

Stages                          Pools · POOL          [Edit stage]
[+ New stage]                   Current stage         [Make active]
• Pools                         Ruleset: inherited
• Elimination                   24 matches · 4 arenas
• Final

[Overview] [Arenas] [Officials] [Rounds] [Matches] [Pool results]

Pool results
[Existing pool-results view]                          [Full screen]
```

Match planning keeps the type-specific behavior:

- Pool matches show generated round/arena and editable per-ring order.
- Bracket matches show schedule phase, arena/time slot, and explicit order.
- The labels explain that this is sequence rather than a guaranteed start time.
- Missing schedule/arena assignments have an explicit next action.

### Spreadsheet-mode tournament workspace

```text
Events / HEMA Open 2026 / Spreadsheet tournament · Sabre

Sabre                                           [Tournament rules] [⋯]
Spreadsheet mode · Last sync 09:42 · Backup available

[Import spreadsheet] [Sync now] [Manage fighters] [Ring links]

Sync and backup
Last successful sync: 09:42
Backup: available · [Download backup]

Fighter identity links                         Ring links
[Review unresolved identities]                 [Manage ring links]
```

This is the existing sheet-mode `LiveTournament` workflow, kept as a distinct Event
component. It does not show database-mode live results or correction controls. Import errors,
sync failures, stale data, and unavailable backups have explicit error/status states; they
must not appear as successful empty data.

## 4. Competition workspace inside Event-admin

```text
Events / HEMA Open 2026 / Competition · HEMA ratings

HEMA ratings                                      [Status: Active] [⋯]
7 Nov 2026 · Public · 32 participants

[Participants & standings] [Settings] [Admins]

Participants & standings
┌─────────────────────────────────────────────────────────────────────┐
│ Search participants                         [Name] [Club] [Rating] │
│ 1  Fighter A · Club A                   1500 · 12 bouts  [Open]    │
│ 2  Fighter B · Club B                   1475 · 10 bouts  [Open]    │
└─────────────────────────────────────────────────────────────────────┘
```

The focused Competition workspace preserves existing features:

- Lifecycle, details, date, scope, visibility, and ruleset configuration.
- Registration approval, participant limits, invite link/QR, enrollment, and admins.
- Standings, participant history, bout details, and review of objections/referee-pending bouts.
- Global “Needs attention” remains available for cross-competition queues.

The sheet-based `LiveTournament` operations are represented by their own Event component and
workspace above. They remain distinct from the rating Competition and database-mode
Tournament; do not merge their states or controls.

For an attached Competition, its breadcrumb names the Event. Event-admins of that Event and
existing Competition admins can manage it. For a standalone Competition, existing
Competition-admin authorization remains in effect.

Creating or attaching never silently merges the Competition into a Tournament. The
attach/detach confirmation and lifecycle behavior remain to be designed against the eventual
data model.

## 5. Event schedule planner

```text
Events / HEMA Open 2026 / Schedule             [Suggestions] [Back to event]

Start time [09:00] [Save]   Current slot: Pools 2       [+ Add time slot]

┌───────────────────────┬─────────────┬─────────────┬─────────────┐
│ Source / mode         │ Slot 1      │ Slot 2      │ Break       │
│                       │ 09:00       │ 10:00       │ 11:00       │
├───────────────────────┼─────────────┼─────────────┼─────────────┤
│ [Stages]              │             │             │             │
│ Longsword             │ Pools       │ Elimination │             │
│   Pools               │ Arena 1     │ Arena 1     │             │
│ Sabre                 │             │             │             │
│                       │             │             │             │
│ [Officials]           │             │             │             │
│ Person A              │ Table       │             │             │
│                       │             │             │             │
│ [Fighters]            │             │             │             │
│ Person B              │             │             │             │
└───────────────────────┴─────────────┴─────────────┴─────────────┘

Times/order are scheduling sequence, not guaranteed bout start times or durations.
```

- Tournament stages and participants are grouped under their owning component.
- Drag/drop is available on wide screens, with click/select actions for keyboard and touch.
- A Competition is not included in this stage timeline unless a separately approved product
  design establishes a real relationship between its bouts and this scheduler.
- Current-slot progression and random fighter assignment are explicit actions with
  progress/error states.

Small-screen layout:

```text
Schedule · HEMA Open 2026
[Mode: Stages ▼] [Time slot: Slot 2 ▼] [Arena: Arena 1 ▼]

Slot 2 · 10:00
Arena 1
Pools · Longsword                   [Change placement]
Assigned officials                  [Manage]
Available stages                    [Place in this slot]
```

No essential assignment depends on horizontal dragging or hover.

## 6. Live results workspace

```text
Events / HEMA Open 2026 / Longsword / Live results

Longsword · Database mode: Active
4 rings · 32 bouts                      [Refresh from schedule]
[Open Score-keeper]

Completed bouts
┌─────────────────────────────────────────────────────────────────────┐
│ Arena 1 · Bout 12                              5–3                 │
│ Fighter A vs Fighter B                  Completed · [Correct]      │
└─────────────────────────────────────────────────────────────────────┘
```

Correction opens a focused editor that identifies the bout, shows its current exchanges,
explains that saving creates a corrected revision, validates the entries, and displays the
resulting save/error state. Only authorized Tournament admins can edit.

Inactive, empty, loading, conflict, and failed states each have distinct copy and actions;
they are not rendered as interchangeable empty lists.

## Component cardinality assumptions

- Event can be created with no components.
- Proposed: an Event can contain zero or more components of each available type, including
  multiple Tournaments or Competitions.
- Tournament belongs to exactly one Event (user decision).
- Competition can remain standalone or be linked to exactly one Event (user decision).
- Workshop is only an extension example in this design; no Workshop screen or workflow is
  specified.

The proposed “multiple Competitions per Event” allowance is intentionally called out for
review because the user has not specified a per-type maximum.

## Review checklist

- Does the Events → Event → Components hierarchy communicate the parent-child relationship?
- Is creating a new Competition and attaching a standalone one clear enough?
- Should an Event be allowed to contain multiple Competitions? The current wireframe assumes
  yes.
- Does the shared “Needs attention” entry preserve the Competition-admin review workflow
  without mixing it with Tournament live results?
- Are any existing Competition-admin workflows missing from the embedded workspace?
- Are the labels and entry points clear enough to distinguish spreadsheet-mode tournaments
  from database-mode tournaments and rating Competitions?

## Next step

Review these wireframes. After approval, convert the remaining open rules (attach/detach
behavior, component counts, terminology, and accessibility details) into an implementation
plan. The implementation plan must separately enumerate API/auth/data-model work and be
approved before code or schema changes.

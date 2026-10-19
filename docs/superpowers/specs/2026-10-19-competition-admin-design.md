# Competition admin app — design

Date: 2026-10-19
Status: draft for review

## 1. Intent

A new competition admin app, with an original visual identity, that replaces the current
`apps/competition-admin` (one long page of create-forms). It is built around what an admin has
to *do*, not around database tables.

At the same time it seeds a shared set of **reusable, self-contained views** in `packages/ui`
that the other apps in this repo will use: the participant app, tournament admin, score-keeper,
scoreboard and the public website.

Why: competitions run anywhere from one day to several years (like HEMA Ratings). Results must
be trustworthy: the referee and fighters approve results, objections are handled in the open
among the people involved, and final results never change.

## 2. Goals, non-goals, anti-goals

**Goals**
- An admin can create, plan, open, run, close, reopen and archive competitions they own or are
  assigned to.
- An admin sees immediately what needs them, and otherwise lands on their competitions.
- A result counts once the referee approves; fighters have three days to object; after that
  it is final and never changes.
- Objections and voids are discussed in a private chat with everyone involved in the bout.
- Fighters control whether photos and videos of their bouts may be public.
- Works well on a phone and on a laptop.
- Views are reusable across apps and configurable (for example, hide warnings).
- English and Dutch interface.

**Non-goals**
- Hosting video or photos. The app stores links only.
- Sending email, SMS, Signal or WhatsApp messages. No phone numbers are stored.
- Tournament planning (pools, elimination, scheduling). That stays in tournament admin, which is
  a desktop-first website.
- Glicko-2 / quarterly ratings (calculated outside the app, see memory note on ranking).

**Anti-goals** (would be a failure even if it works)
- Bout chats readable by anyone outside the bout.
- Any way to change a published result.
- Views that fetch their own data or call the API, so they can't be reused.
- A design that looks like a generic admin template.

## 3. Users and roles

- **Competition admin**: sees only competitions they created or were assigned to.
- **Co-admin**: an admin invited to a competition; same rights on that competition.
  Ownership can be handed over.
- **System admin**: existing role; not the focus of this app.
- **Fighter (participant)**: uses the participant app; approves bouts, objects within three days,
  sets media consent, adds video links, takes part in bout chats.
- **Officials**: one referee, up to four jury members, one table official. Chosen per bout in
  the score-keeper. They take part in chats for bouts they officiated.

## 4. Domain rules

### 4.1 Competition lifecycle
`Draft → Registration open → Running → Closed → Archived`

- Draft: everything is editable.
- A draft can only move to Registration open when its "ready" checklist is complete
  (ruleset chosen, scope and dates set; sign-up limit optional).
- **The ruleset is fixed once the competition is Running.** A new ruleset version only applies
  to future competitions.
- A Closed competition can be reopened.
- Archived competitions are folded away in lists.

### 4.2 Scope
A competition is scoped to: one club, several clubs, an area, a country, or open.
Clubs therefore need an **area** and a **country**. Scope decides who may sign up.

### 4.3 Joining
- Every fighter enrols with an account (decided by the user). **No guests.**
- People can be invited to enrol via a link or QR code.
- Sign-ups can require admin approval.
- Optional place limit.

### 4.3a Rating, and one bout counting in several competitions
- **Rating is per competition** (decided by the user): Elo, computed only from bouts that count.
- **A bout counts in every running competition that both fighters are enrolled in**
  (decided by the user). There is no link between competitions and no scope check for this;
  the only rule is that both fighters are in it.
- *Claude's calls:*
  - Each competition keeps its own rating; the same bout simply enters each one's calculation.
  - In each competition's views, a bout shows the competition it was started in.
  - "Provisional" means fewer than 10 counted bouts in that competition.

### 4.4 Bout confirmation (the core rule)
1. A bout is scored in **`apps/score-keeper`** (decided by the user). Competition bouts are
   **spontaneous, ad hoc bouts**: no schedule, pools or brackets. The score-keeper must
   learn to start a competition bout: pick the competition, the two fighters, the referee and
   jury, and the ring. It records the start time and every exchange. Today the score-keeper only
   knows events and tournaments, and competition bouts are scored in `apps/competition`;
   that scoring moves to the score-keeper.
2. **A referee is mandatory** for every bout (decided by the user) and must approve the result.
3. **Approval on the spot** (decided by the user): in the score-keeper, right after the bout, the
   referee approves and can let both fighters approve on the same device, so fighters don't need
   their phones.
4. **Once the referee has approved, the bout counts** in the ratings of every competition it
   belongs to (see 4.3a).
5. **Three-day objection window** (decided by the user): after approval, each fighter can object
   within three days. Without an objection the bout becomes **final** after three days and
   never changes again.
6. **An objection removes the bout from the ratings at once**, temporarily, and opens the bout
   chat. The objection stays open **with no time limit** (other people may not reply) until it
   is resolved: the bout comes back unchanged, comes back corrected, or is voided.
7. Removing or restoring a bout means that competition's ratings are **recalculated from its
   bout history** (Elo depends on order). This replaces the earlier "never recalculate" rule.
8. **Void** (withdrawal, injury, wrong entry): the bout doesn't count and stays visible with the
   reason.
9. *Claude's calls:*
   - Bout states: **Scored** (waiting for the referee) → **Counted** (in its three days) →
     **Final**; side states **Objected** (out of the ratings) and **Voided**.
   - Officials need an account; the referee doesn't have to be enrolled as a fighter.
   - If the referee doesn't approve on the spot, they approve later in their participant app.
     Until then the bout doesn't count.
   - A fighter who didn't approve on the spot may still approve in their app during the three
     days. When both fighters have approved, the bout is final straight away.
   - The referee can void a bout in the score-keeper (for example an injury), with a reason.
   - Objections are resolved by an admin (restore / correct / void), discussed in the chat.
     The objecting fighter can also withdraw their objection, which restores the bout.
   - A corrected bout gets a new three-day window for both fighters.
   - A competition can be closed with objections still open; those bouts stay out of the
     ratings until resolved, and resolving them still updates the closed competition's ratings.

### 4.5 Bout chat
- One private chat per bout, opened by the first objection.
- Members are added automatically: both fighters, referee, jury, table, the competition's admins.
- **Only those members can ever read it.** Never public, also not after the bout is closed.
- Messages cannot be edited or deleted.
- The app itself posts decisions in the chat: objection made, change proposed, objection
  withdrawn, restored, corrected, voided (with reason).
- @mentions address one member while everyone still sees it.
- Read-only once the bout is final or voided.

### 4.6 Media (photos and videos)
- Each fighter has a standing consent setting for **photos and videos**:
  *Allow* / *Ask me each time* / *Don't allow*. It's shown to opponents, officials and admins
  as a camera mark next to the fighter's name.
- A competition setting **"This competition is streamed or filmed"**: when on, enrolling requires
  ticking "I agree that photos and videos of my bouts may be published". No tick, no enrolment.
- A bout can have **multiple media links** (video or photo album), each with an optional start
  timestamp.
- Admin can set a **stream link per ring** with the stream's start time. Each bout in that ring
  gets the stream link automatically, with a timestamp derived from the score-keeper's bout
  start time. Fighters can correct the timestamp in their app.
- Fighters (and admins) can add their own links if the competition allows it.
- A link is **public only if both fighters allow it** (standing consent, enrolment consent, or a
  per-link yes when set to "ask me each time"). Otherwise only the people in the bout see it.
  Declining keeps the link private; it is not deleted.
- **Ping**: a fighter can notify their opponent about a new link that needs their decision.
  At most once per day per link.

### 4.7 Board
- One board per competition. Only admins post.
- Each post is for *Participants* or *Public*; public posts also show on the public website.
- Posts can be pinned. No replies.

### 4.8 Notifications
- Delivered by the installed app (web push); no phone number or email needed.
- Triggers: bout approved (objection window starts), objection, chat message or @mention, media ping,
  sign-up approved/declined, new board post.

### 4.9 Languages
- English and Dutch at launch; all UI text translatable.
- Defaults to the device language; switchable in the profile.
- Dates and times formatted per language.
- User-written content (board posts, chat) is not translated.

### 4.10 Apps in scope and future modes
- **In scope:** the admin app, the **participant app** (a new design, decided by the user; it
  does not need to build on the existing `apps/competition`), the score-keeper changes for ad hoc competition bouts, and the backend
  work behind them.
- **Future (user):** the participant app and the score-keeper will both get a **tournament
  mode**. Score-keeper, competition participant and tournament participant **might become one
  app with different modes**.
- **Claude's call:** build so that merging later is cheap. Screens are made from the shared
  views in `packages/ui`; each app's shell picks the mode (competition now, tournament later)
  and the views don't know which app they're in. No mode switch is built now.

## 5. Screens (admin app)

Mockups: `.superpowers/brainstorm/2006-1792418587/content/` — `admin-home-v2.html`,
`competition-views-v3.html`, `correction-chat.html`, `video-and-board.html`,
`video-consent.html`. (Not in git; add `.superpowers/` to `.gitignore`.)

### 5.1 Navigation
- Laptop: dark sidebar (Needs you · Competitions · Rulesets · Fighters · Co-admins).
- Phone: bottom tabs (Needs you · Competitions · Rulesets · Fighters).
- **"Needs you" only exists when it has items.** Otherwise the app opens on Competitions.

### 5.2 Needs you
Grouped to-do list: open objections (Review; with how long they've been open), bouts still
waiting for the referee's approval (with how long, and Remind), sign-ups to approve, media pings
if relevant.

### 5.3 Competitions list
Grouped by lifecycle in this order: Draft, Registration open, Running, Closed, Archived
(folded). Each item shows a scope tag. Running items show open-bout counts.

### 5.4 Competition page
Sub-navigation: **Participants** (main) · **Board** · **Settings**. Content depends on the state:
- **Draft**: ruleset name and its key settings, scope, dates, location, visibility,
  co-admins, and the "ready to open" checklist.
- **Registration open**: registered fighters, sign-ups waiting for approval, places used.
  Share link/QR.
- **Running / Closed / Archived**: drill-down in three steps. On a laptop they open as panels
  side by side; on a phone they stack as pages with a back button. A breadcrumb shows the path.
  1. **Participants**: rank, name, club, rating (with last change), bouts, W, D, L, warnings,
     "provisional" tag for few bouts. **Search** on name and club.
  2. **Fighter**: rating, rating graph, totals, bouts newest first with date/time, location,
     opponent, score, result, rating change and status seal. **Search** on opponent, location,
     date, result.
  3. **Bout**: score, when, where, ruleset, table official, referee and jury, lead graph
     (laptop only), media links, and every exchange with clock time, who scored, points, doubles,
     and warnings with their reason. **No hit targets** (arm, head…) are shown.

### 5.5 Officials layout
Two columns. Referee first (brass outline), then jury. Only as many rows as needed; a dashed blank
only to square off an odd last row. Referee and a single jury share one row.

### 5.6 Objection review
Left: the bout (marked "out of the ratings while objected") with old score struck through and
the proposed one highlighted, the disputed exchange marked, and the effect (result change,
doubles count, "new three-day window for both fighters").
Actions: Restore unchanged, Edit exchange / Save correction, Void (reason required).
Right (laptop) / main (phone): the bout chat, with the proposal pinned on top on phones.

### 5.7 Settings → Video
Streamed/filmed switch, stream links per ring with start time, "fighters can add their own
links" switch, consent summary.

## 6. Visual identity (decided in mockups)

- **Dark theme.** Tokens: night `#0A0F13`, page `#10161B`, surface `#172028`, raised `#1E2932`,
  text `#E4E9EC`, muted `#8A97A1`, rule `#2A3640`, **brass** `#D4AF5E` (waiting/attention),
  **verdigris** `#55AE98` (published/final), **rust** `#E3714F` (voided/disputed).
- Type: **Big Shoulders Display** for headings and scores, **Atkinson Hyperlegible** for body
  text (readable on a phone in a training hall), **IBM Plex Mono** for times and timestamps.
- **Signature: the seal.** For a bout it's a circle in **three parts: referee and the two
  fighters**. Empty = scored, referee part filled = counted (in its three days), fighter parts
  fill as fighters approve, green ✓ = final, rust slash = voided, rust outline = objected (out
  of the ratings). For media consent per link the same seal has **two halves**, one per
  fighter. Used in every app. (Mockups still show the older two-part bout seal.)
- **Camera mark** next to a fighter's name: green = allows photos/video, dashed brass = asks
  each time, rust slash = no.
- Working name "Ledger" is a placeholder.

## 7. Reusable views (how)

Decided:
- Views live in `packages/ui` as framework-free custom elements, matching the existing
  `base-component` pattern and created with the repo's `ui-component` skill.
- **Views never fetch data.** They receive data via properties and report actions as events.
  Each app supplies its own data and decides where the view sits (sidebar layout, phone tabs,
  scoreboard, public site).
- Views take **options** (for example `show-warnings`, `show-rating-change`, which columns)
  so each app shows only what it should. The public site hides warnings; the scoreboard shows only
  the bout.
- Views adapt to the space they get (container queries), not to the screen size.
- Shared design tokens (section 6) live in `packages/ui` styles.

Candidate shared views: `bout-seal`, `media-consent-mark`, `participant-table`,
`fighter-history`, `bout-details` (incl. `bout-exchanges`, `officials-grid`, `media-links`),
`bout-chat`, `board`, `competition-list`, `needs-you-list`, `search-field`.

## 8. Constraints and current state

- Monorepo, TypeScript, Vite, vanilla custom elements, Vitest + Playwright, Storybook.
- Backend: `apps/backend` (Fastify, better-sqlite3, Kysely). It already has clubs, users with
  roles, competitions, participants, ranking, bouts, enrollment tokens, password reset,
  rulesets. Much of this design needs **new backend work**: lifecycle rules, bout confirmation
  states with referee approval and the three-day objection window, objections, rating
  recalculation from bout history, bout chat, board, media links and consent, ring streams,
  co-admins, club area/country, notifications (web push), user language.
- The backend stores only a hash of email addresses, so it cannot email anyone.
- Repo rules: work on `master`, no branches, the user commits.

## 9. Calls made during review (Claude's, for the user to check)

- **Push notifications come in a later phase.** In the first slice, admins rely on "Needs you".
- **Corrections keep history.** A correction creates a new revision of the bout; the previous
  score stays stored so the objection screen and chat can show what changed.
- **Migration of access:** today a COMPETITION_ADMIN sees all competitions of their club. On
  migration, those admins become co-admins of their club's existing competitions, so nobody
  loses access. After that, only creators and assigned co-admins see a competition.
- **Migration of data:** existing published bouts count as Final. Existing
  `Competition.status` values map to the new lifecycle (ACTIVE → Running, ARCHIVED → Archived,
  anything else → Draft).
- **Club area and country:** area is free text, country is an ISO country code. Existing clubs
  start without them; a club without an area/country simply doesn't match area/country scopes
  until it's filled in.
- **Fighters without a club** can sign up only for Open competitions; an admin can always add
  anyone by hand, regardless of scope.
- **Rulesets section:** each admin has their own ruleset library with versions. A competition
  points at one version while in Draft and stores a frozen copy once it starts.

## 10. Left to the builder

- Order of delivery and how to split this into phases (the backend work is large; a sensible
  first slice is lifecycle + Needs you + the drill-down views read-only).
- Data model and API shapes for the new backend features.
- i18n mechanism (keep it dependency-light).
- Web push implementation details.
- Exact view names, option names and event names.
- Final product name.

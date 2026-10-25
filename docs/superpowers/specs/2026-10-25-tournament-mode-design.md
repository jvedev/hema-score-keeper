# Tournament mode — design

Status: draft for the user's review (brainstormed 2026-10-25). Builds on the competition platform (phases 1–7, see `2026-10-19-competition-admin-design.md` §4.10, "future tournament mode").

## 1. Intent and why

On a tournament day the club runs everything from a spreadsheet on a laptop: the spreadsheet holds the schedule, people type every exchange into it, and its formulas produce the eliminations and finals. It works, but it is slow (downloading a participant list "takes forever") and nobody away from the laptop can see what is happening.

Tournament mode puts phones and screens around the rings:
- **the table (score-keeper)** opens its ring and scores that ring's bouts in order;
- **a scoreboard** on a monitor by each ring shows time, score and who is on deck;
- later, **fighters** see their pool schedule, get an on-deck heads-up and follow a live "who's in / who's out" view.

The user wants to start using it soon, alongside the spreadsheet (a **shadow run**): if anything goes wrong, people switch straight back to typing into the sheet, which is already up to date. Later, tournament admin may replace the spreadsheet as the place where tournaments are planned; the table and scoreboard must not need to change when that happens.

## 2. Goals

1. A signed-in score-keeper opens the right ring from a link or QR code and gets that ring's bouts in order; next bout ready right after the current one.
2. Every exchange is stored on the backend the moment it is entered.
3. Another person can take over a ring on another phone **in the middle of a bout** (phone broken / battery dead) and carry on from where it was.
4. A scoreboard per ring, on any device driving a monitor (same PC as the table, another PC, or a phone), follows the ring live.
5. The spreadsheet stays a complete, current backup: participants, pools and schedule come from it; every exchange is written back into it in the background; its own formulas keep producing eliminations and finals.
6. A visible, robust check during the day that the backup sheet really is updating.
7. Works on venue WiFi or on a local network the club sets up, without internet for live play.
8. (Last phase) fighters: pool schedule, on-deck alert, live standings/bracket view.

## 3. Non-goals

- Tournament planning in the apps (pools, elimination seeding, scheduling logic). In sheet mode the spreadsheet does it; in database mode tournament admin / event-admin does it.
- The apps advancing winners in a bracket by themselves. The sheet works it out; someone presses "import" again (user decision).
- Relying on Google Sheets for communication between apps or devices.
- Reusing the legacy Google Sheets integration in the repo (`apps/backend/src/google-sheets.ts`, `packages/sheets-client`) — the user asked not to look at it; whether any of it is reused is the user's call (see §9).

## 4. Anti-goals (a failure even if it works)

- **Wrong scores** — on the table, the scoreboard, the backend or the backup sheet.
- **Holdups** — the tournament waiting on the apps, the network, a sync or a person fiddling with the laptop.

Every design choice below is weighed against these two.

## 5. Constraints

- Live play must not depend on the internet or on Google. The backend must run on a laptop on the venue's local network (WiFi or the club's own network); phones and scoreboards reach it there.
- Google Sheets is too slow to read live (user's experience); it may be written to in the background only.
- The spreadsheet is a local file on the laptop today (Excel-type); a Google Sheet copy is also acceptable as the online backup.
- A few clicks per round at the laptop are acceptable; fewer is better.
- Existing stack: Fastify + Kysely + SQLite backend; Vite/TS apps; shared views in `packages/ui`; EN/NL; dark theme; phone first.
- Repo rules: work on `master`, the user commits.

## 6. Decided by the user

**Two modes for a tournament** (user's working names: *sheet mode* and *database mode*; a better name is welcome):
- In both modes live play runs from the backend database (SQLite). The difference is where the tournament comes from and what happens to results.
- **Sheet mode:** participants, pools and the schedule are imported from the spreadsheet. Results are mirrored back into the spreadsheet. **Any signed-in account with the ring link may score.**
- **Database mode:** the tournament comes from tournament admin / event-admin. **Only people assigned to that ring may score.**

**The spreadsheet as source and backup (sheet mode):**
- The sheets have reserved ranges for each bout's exchange results (example `C6:D36`; exact layout to come from the real sheet).
- A **schedule sheet** lists the fights, with the sheet and start cell where each bout's exchanges go.
- **Every exchange** is written into the bout's reserved range, not only the outcome.
- Results go asynchronously to the Google Sheet online, and a local file on the PC is also kept as a backup.
- When the pools are done, the sheet works out the eliminations. Someone presses **one button** to import the bracket into the apps, and presses it again after each round.

**The robust check:** the table can keep the Google Sheet open on their PC to see it updating.

**Getting a ring:** the score-keeper scans a QR code at the tournament admin desk or on a sheet on the ring table, or opens a URL sent via Signal/WhatsApp. That ring's fights load. They activate the first match. They check the scoreboard is in sync and working. **The score-keeper must be signed in.**

**Takeover:** someone else can take over on another phone right in the middle of a bout.

**Scoreboard layout A** ("bout first"):
- the two fighters in the ring's colours with big scores and warnings, and the time in the middle;
- a strip at the bottom with **on deck** and the bout after;
- a big "Next: X vs Y" screen between bouts.
- Mockup: `.superpowers/brainstorm/1849-1792935951/content/scoreboard.html`.

**Bracket view:** live results as bouts finish, with "who's in / who's out" (most tournament apps the user knows show only that ranking, not the schedule; the user wants both).

**Phase order:** (1) live bouts on the backend + spreadsheet import + background backup with sync check; (2) table ring mode + takeover; (3) scoreboard; (4) fighter phones.

## 7. Claude's calls (for the user to check)

- **Ring link:** one per ring, opening that ring in the score-keeper. The scoreboard gets its **own view-only link/QR per ring**, which can be opened without signing in and cannot score.
- **Takeover clock:** the bout timer pauses at the last time the backend knows. The new keeper restarts it. The bout never "runs on" unseen.
- **One active keeper per ring:** a takeover moves the ring to the new device, and the old device becomes read-only if it comes back. This avoids two devices scoring one bout.
- **Exchanges are the source of truth:** score and warnings are derived from the stored exchanges (as in `packages/match-engine`), so the table, scoreboard and sheet can never disagree on the arithmetic.
- **Sync status visible in the apps:** "sheet updated 12 s ago", or red when failing. The sync also writes a "last updated" time into a cell of the sheet.
- **Re-import is safe:**
  - Imports are keyed on the schedule sheet's bout identity: the target sheet + start cell, plus the ring and order.
  - Importing again updates bouts that have not started and adds new ones.
  - It never changes or removes a bout that already has exchanges; those are reported as "skipped" instead.
- **Imported fighters are names:** in phases 1–3, fighters come in as names and clubs from the sheet. Linking them to accounts is decided in phase 4 (fighter phones).
- **The apps never read results back from the sheet:**
  - Import reads only participants, pools, the schedule and the bracket.
  - If a ring falls back to typing in the sheet, that ring stops using the apps for the rest of the day.
  - Its later bouts are taken from the next import.
- **Corrections:**
  - The keeper can undo the last exchange during a bout.
  - A finished bout is corrected by an admin.
  - Any change rewrites that bout's whole range in the sheet, so the backup always matches the database.
- **Takeover notice:** the old device shows "this ring was taken over by X" and becomes read-only.
- **Scoreboard link:**
  - It holds an unguessable random token per ring per tournament.
  - An admin can make a new one, which stops the old link.
- **Starting point:** the score-keeper's existing **Event** mode, which already picks an event and an arena (= ring) and finds the active bout. "Ring" maps to the existing `Arena`, "pool" to a `Stage` of type POOL, and the schedule to `EventSchedule` / `ScheduledPhase` (see §8).

## 8. What exists today (recon 2026-10-25, Google Sheets code not read)

- **event-admin:** real API (`packages/event-admin-api`, backend `server.ts` ~759–1560). It covers events, tournaments, arenas (order, left/right colour), stages (POOL), entries, rulesets and the schedule (time slots, scheduled phases stage+arena+slot, assignments judge/jury/table/fighter). Tables are in `apps/backend/sql/migrations/*` (Prisma-style), not in `schema-migrations.ts`.
- **tournament-admin:** only `<stage-view>`, in memory, with no persistence (a first draft, open to change).
- **score-keeper:** the launcher offers Stand alone / Google Sheets / Event / Competition bout.
  - Event mode picks event + arena and finds the active bout from `schedule.currentTimeSlotId` + stage placement (`main.ts` ~800).
  - Results are saved only on completion (`matches/:id/complete`).
  - Timer and score live in memory in `MatchStore` (match-engine) and `hema-timer` (setInterval).
- **Missing:** no realtime anywhere (no WebSocket/SSE), no scoreboard, no on-deck concept. `Bout.ring` exists but is unused.

## 8a. The real spreadsheet (`DEVELOPMENT_TournamentPoolsV3_.xlsx`, repo root; a Google Sheet exported as Excel)

**Sheets:** `Pool_1`, `Pool_2`, `Pool_3`, `Eliminations`, `Showcase`, `Results`. Most cells are formulas (about 885 per pool sheet).

**Pool sheet:**
- Six fighters are typed in `H8:H13`.
- The 15 matches sit in three column blocks (B–F, H–L, N–R), one block every 20 rows. The match header rows are 25, 45, 65, 85 and 105; `Match 1` is `B25`, `Match 6` is `H25`, `Match 11` is `N25`.
- In a header row, the left fighter is a formula in C/I/O and the right fighter in E/K/Q.
- Each match has 15 exchange rows. For `Match 1` these are rows 26–40. The **inputs** are the left fighter's points in D/J/P and the right fighter's points in E/K/Q.
- The neighbouring columns (C/F, I/L, O/R) are formulas: a double, where both inputs are above 0, scores 0.
- Row +16 sums the points and doubles; row +17 is the match result.
- A match list with status ("Pending" …) is in `L3:O17`. Rankings are in `AG`/`AH`, by matches won, then doubles, then points.

**Eliminations sheet:**
- Seeding comes from the pools (gold, silver, bronze sorted).
- Quarter finals 1–4, semifinals 1–2, final and bronze.
- Match blocks have the same layout as the pools: header row 27, exchanges from row 28.

**Results / Showcase:** sorted overall results and display tables.

**What this means:**
- One exchange = two numbers, left points and right points, written into the match block's input columns.
- The sheet records no warnings (open question for the user).
- The fighters in elimination matches are formula results. Importing from the Google Sheet, or from an `.xlsx` export, which carries the calculated values, gives the names directly.
- The local backup `.xlsx` is written as values into the input cells. Excel or Google recalculates the formulas when the file is opened.
- There is **no ring or time assignment** in the sheet today. The schedule sheet the user proposed would add it: for each match, the ring, its order on that ring, and the sheet + header cell. In the pools, the order defaults to Match 1…15.

## 8b. Decided after reading the sheet (user)

- **New exchange columns:** the sheet gets another column to mark a **double**, and a way to record **who scored first and who scored second**.
- **Afterblows rule coming:** a new rule will soon tell **doubles** apart from **afterblows**. The sheet's layout for that isn't known yet.
  - The exchange writer must therefore be driven by a **layout mapping per sheet version** (which column holds what), not hard-coded cells.
  - The app's exchange record must capture left points, right points, the double flag and the first scorer, and be ready for an afterblow kind.
- **Where it runs:** the backend runs **on a laptop at the venue**, with the **option to run it from the internet** (the same backend, hosted). Live play needs only the local network.
- **Claude's call (sign-in at the venue):** the laptop backend has its own accounts. Score-keepers are signed in there, either from a copy of the central accounts taken before the event or by creating accounts on the spot. Sign-in never needs the internet. The builder settles the exact mechanism.

- **Online backup in phase 1 (user):** exchanges are pushed to the Google Sheet online as well as to the local file, from phase 1.

- **Warnings (user):** warnings stay in the apps only. A warning with a **point deduction** is written into the sheet as a **negative entry** for that fighter (Claude's call: as its own exchange row in the bout's range).

## 9. Open (the user's) — status after the conversation

- Q4 database mode: **sheet mode first**; database mode later, not in these phases.
- Q5 venue laptop: **runs on a laptop, optionally hosted online** (§8b).
- Q1 spreadsheet: **analysed** (§8a). The new double / first-scorer columns and the afterblow layout follow later, via the layout mapping.
- Q3 online backup: **Google Sheet and local file, both from phase 1**. The legacy Google Sheets code was not read. Whether to reuse it is decided when phase 1 is planned.
- Q2 mode names: **kept as "sheet mode" / "database mode"** (Claude's call, using the user's working names).

The original list, kept for reference:

1. The real spreadsheet: sheet names, the reserved ranges and what one exchange row holds (columns), how pools/participants are laid out, and where the eliminations appear. Needed before the importer and writer can be built (phase 1).
2. Mode names: keep "sheet mode / database mode", or something else?
4. Is database mode built in these four phases, or only sheet mode now (with database mode later)? If now: who assigns people to a ring — the existing event-admin assignments?
5. The venue laptop: does it run the backend with a copy of the accounts (so sign-in works without internet), or do phones still sign in against the central server? And is a Windows laptop with Node fine?
3. Online backup: a Google Sheet copy pushed in the background, the local file, or both (the user mentioned both)? And is the legacy Google Sheets code in the repo off-limits for reuse?

## 10. Left to the builder

- Live transport between backend and devices (e.g. Server-Sent Events or WebSocket). It must work on a plain local network and recover after a dropped connection.
- The .xlsx library and how the local backup file is written safely (no partial writes). How the Google Sheet is written (API, batching, retries, back-off), always off the live path.
- The schema for live bouts in tournaments (reuse `Match`/`Exchange`, or the phase-3 `Bout` model) — pick the one that keeps exchanges as the single source of truth and lets competition and tournament share views.
- How the backend is packaged to run on the venue laptop.
- Phase plans: one plan per phase, in `docs/superpowers/plans/`, each approved by the user before building.

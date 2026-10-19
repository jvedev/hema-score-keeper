# Shared Views, Design Tokens & EN/NL (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/ui` gains the competition design tokens, a small dependency-free EN/NL translation layer, and the reusable drill-down views from the mockups — seal, search field, participant table, officials grid, exchanges list, fighter history and bout details — each taking data in and sending events out, so the admin app, participant app, scoreboard and public site can all use them.

**Architecture:** Every view is a framework-free custom element on the existing `BaseComponent` (`packages/ui/src/components/base-component/base-component.ts`): data goes in through a typed property setter, options through attributes (`show-warnings`, `searchable`, …), actions come out as `CustomEvent`s with `bubbles: true`. Views never fetch. View-model types live in one file (`src/models/competition-views.ts`) that mirrors the backend shapes from phase 3 without depending on the backend. Text comes from `src/i18n/` (`t(key, params)`), which follows `document.documentElement.lang` and re-renders views on a `hema-locale-change` window event. Dates and numbers use `Intl`.

**Tech Stack:** TypeScript, custom elements + shadow DOM, Vitest browser mode (Playwright Chromium), Storybook (web-components-vite).

**Spec:** `docs/superpowers/specs/2026-10-19-competition-admin-design.md` (sections 4.9, 5.4, 5.5, 6, 7). Mockups: `.superpowers/brainstorm/2006-1792418587/content/competition-views-v3.html`, `admin-home-v2.html`.

## Global Constraints

- Work on `master`; commit only when the user asks.
- Bash, not PowerShell. Run a single test file with `cd packages/ui && npx vitest run <path>`; the whole package with `npm test --workspace @hema/ui`.
- Scaffold each new component with the repo skill: `node .claude/skills/ui-component/scripts/create-ui-component.mjs --name <name>`, then fix the generator's known gaps: imports with `.js` suffix (`../base-component/base-component.js`), `override disconnectedCallback`, a `declare global { interface HTMLElementTagNameMap … }` block, and an `HTMLElementEventMap` entry for each event.
- **Don't change existing tokens or components.** Existing `--hema-*` values stay as they are so score-keeper and the other apps look the same. New tokens are additions.
- New tokens (exact values from spec section 6), added to `src/styles/tokens.css`: `--hema-night: #0A0F13`, `--hema-page: #10161B`, `--hema-plate: #172028`, `--hema-raised: #1E2932`, `--hema-ink: #E4E9EC`, `--hema-muted: #8A97A1`, `--hema-rule: #2A3640`, `--hema-brass: #D4AF5E`, `--hema-verdigris: #55AE98`, `--hema-rust: #E3714F`, `--hema-font-score: "Big Shoulders Display", "Barlow Condensed", system-ui, sans-serif`, `--hema-font-body: "Atkinson Hyperlegible", system-ui, sans-serif`, `--hema-font-mono: "IBM Plex Mono", ui-monospace, monospace`. Short aliases in `shared.css` on `:host`: `--night`, `--page`, `--plate`, `--raised`, `--ink`, `--muted`, `--rule`, `--brass`, `--verdigris`, `--rust`, `--font-score`, `--font-body`, `--font-mono`, each with its hex/stack as fallback. The package does not load web fonts; apps do.
- Status colours: brass = waiting/attention, verdigris = final, rust = voided/objected.
- Locales: `en` (default) and `nl`. Every user-facing string in the new views goes through `t()`; both catalogs must have the same keys (enforced by a test). No hit targets (arm, head…) anywhere.
- Views work at any width (container queries on `:host`), keyboard-focusable rows/buttons with visible focus, `prefers-reduced-motion` respected.
- Each new component gets a `.stories.ts` with realistic data (names from the mockups).

## Review Focus

- Switching `document.documentElement.lang` from `en` to `nl` at runtime re-renders already-mounted views in Dutch. → Task 1 test `re-renders on locale change` (and each view's own `renders in Dutch` test).
- Text from data (names, reasons) containing `<` or `&` shows literally and never becomes markup. → Task 4 test `escapes names`, Task 5 test `escapes warning reasons`.
- `show-warnings` absent hides every warning column, count and warning exchange, not just one of them. → Task 4, 5, 6 tests `hides warnings`.
- Searching with surrounding spaces or different case still matches; clearing the search shows all rows again. → Task 3 test `normalises the query`, Task 4 test `filters and clears`.
- A bout with only a referee and one jury member lays out on one row; empty jury seats never render. → Task 5 test `referee and one jury share a row`.

---

### Task 1: Tokens and the i18n core

**Files:**
- Modify: `packages/ui/src/styles/tokens.css`, `packages/ui/src/styles/shared.css`
- Create: `packages/ui/src/i18n/i18n.ts`, `packages/ui/src/i18n/messages/en.ts`, `packages/ui/src/i18n/messages/nl.ts`, `packages/ui/src/i18n/i18n.test.ts`
- Modify: `packages/ui/src/index.ts` (export `./i18n/i18n.js`)

**Interfaces:**
- Produces:
  ```ts
  export type Locale = "en" | "nl";
  export type MessageKey = keyof typeof en;                 // en.ts: `export const en = { … } as const`
  export function currentLocale(): Locale;                   // from document.documentElement.lang ("nl", "nl-NL" → "nl"; anything else → "en")
  export function setLocale(locale: Locale): void;           // sets <html lang>, dispatches window "hema-locale-change"
  export function t(key: MessageKey, params?: Record<string, string | number>): string;   // "{name}" placeholders; missing key in nl falls back to en
  export function formatDateTime(iso: string, style?: "date" | "dateTime"): string;      // Intl.DateTimeFormat(currentLocale) — en "15 Oct 2026, 20:40", nl "15 okt 2026, 20:40" (day month year, 24h)
  export function formatSigned(value: number): string;       // "+16", "−14" (U+2212), "0"
  export const LOCALE_CHANGE_EVENT = "hema-locale-change";
  ```
  `nl.ts` is typed `Record<MessageKey, string>` so a missing Dutch key is a type error.
  Also extend `BaseComponent` with `protected onLocaleChange(rerender: () => void): void` — registers a window listener for `LOCALE_CHANGE_EVENT` through `registerEvent` (so it's removed on disconnect).
  Initial keys (more are added per task): `common.search` "Search" / "Zoeken", `common.noResults` "Nothing matches “{query}”." / "Niets gevonden voor “{query}”.", `common.clear` "Clear" / "Wissen".

- [ ] **Step 1: Write failing tests** in `i18n.test.ts`:
  - `currentLocale()` is `"en"` for `lang=""`, `"nl"` for `lang="nl-NL"`, `"en"` for `lang="de"`
  - `t("common.noResults", { query: "ochs" })` → `Nothing matches “ochs”.`; after `setLocale("nl")` → `Niets gevonden voor “ochs”.`
  - `setLocale("nl")` fires `hema-locale-change` once and sets `document.documentElement.lang === "nl"`
  - `formatSigned(16) === "+16"`, `formatSigned(-14) === "−14"`, `formatSigned(0) === "0"`
  - `formatDateTime("2026-10-15T18:40:00.000Z")` contains `2026` and `20:40` when the test sets `TZ`-independent input via a fixed `timeZone: "Europe/Amsterdam"` option (Ruling allowed: pass `timeZone` as an optional third parameter used only by tests)
  - catalog parity: `Object.keys(en).sort()` equals `Object.keys(nl).sort()` and no Dutch value is empty
  - **`re-renders on locale change`**: a tiny test element extending `BaseComponent` that renders `t("common.search")` and calls `onLocaleChange(() => this.render(...))` shows "Search", then "Zoeken" after `setLocale("nl")`
  - Each test resets `setLocale("en")` in `afterEach`.
- [ ] **Step 2: Run** `cd packages/ui && npx vitest run src/i18n/i18n.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** tokens, aliases, the i18n module and `onLocaleChange`.
- [ ] **Step 4: Run** the file, then `npm test --workspace @hema/ui` (all existing tests still pass) and `npm run typecheck --workspace @hema/ui`. Expected: PASS.

### Task 2: `bout-seal`

**Files:** scaffold `bout-seal` (`packages/ui/src/components/bout-seal/*`). Test: `bout-seal.test.ts`.

**Interfaces:**
- Produces element `<bout-seal>` with attributes:
  - `status`: `SCORED | COUNTED | OBJECTED | FINAL | VOIDED` (default `SCORED`)
  - `referee-approved`, `fighter-a-approved`, `fighter-b-approved`: boolean attributes
  - `size`: `sm` (18px, default) | `lg` (44px)
  Renders an inline SVG circle in three equal sectors (referee top, fighter A bottom-left, fighter B bottom-right): filled brass when that party approved; `FINAL` → solid verdigris disc with a check; `VOIDED` → rust outline with a diagonal slash; `OBJECTED` → rust outline, sectors as approved. Sets `role="img"` and an `aria-label` from i18n:
  `seal.scored` "Scored, waiting for the referee" / "Gescoord, wacht op de scheidsrechter"; `seal.counted` "Counts; waiting for fighters" / "Telt mee; wacht op de vechters"; `seal.objected` "Objected — not counted" / "Bezwaar — telt niet mee"; `seal.final` "Final" / "Definitief"; `seal.voided` "Voided" / "Vervallen".
  No events.

- [ ] **Step 1: Write failing tests:** default renders 3 sector paths none filled and `aria-label` = "Scored, waiting for the referee"; `status="COUNTED" referee-approved fighter-a-approved` → exactly 2 sectors have class `on`; `FINAL` → element with class `final` and no sectors; `VOIDED` → class `void`; changing an attribute after mount updates the DOM; `renders in Dutch` (after `setLocale("nl")` the label is Dutch).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** (`observedAttributes` + `attributeChangedCallback` → re-render; `onLocaleChange`).
- [ ] **Step 4: Run** the file + typecheck. Expected: PASS. Add story `Components/BoutSeal` showing all five states side by side.

### Task 3: `search-field`

**Files:** scaffold `search-field`. Test: `search-field.test.ts`.

**Interfaces:**
- Produces `<search-field>`; attributes `placeholder-key` (a `MessageKey`, default `common.search`), `count` and `total` (numbers; when both set and the query isn't empty, shows "3 of 6" via `search.count` "{count} of {total}" / "{count} van {total}"). Property `value: string`. Event `search-changed` → `CustomEvent<{ query: string }>` with the query **trimmed and lower-cased**, fired on input (no debounce). A clear button (`common.clear`, visible only with text) empties it and fires `search-changed` with `""`. Escape clears too.

- [ ] **Step 1: Write failing tests:** typing "Ochs" fires `{ query: "ochs" }`; **`normalises the query`** ("  OCHS  " → "ochs"); clear button and Escape fire `""` and empty the input; with `count="3" total="6"` and text the counter reads "3 of 6"; without text no counter; Dutch placeholder after `setLocale("nl")`.
- [ ] **Step 2–4:** run → FAIL, implement, run + typecheck → PASS. Story `Components/SearchField`.

### Task 4: `participant-table`

**Files:** Create `packages/ui/src/models/competition-views.ts`; scaffold `participant-table`. Test: `participant-table.test.ts`.

**Interfaces:**
- Produces (models):
  ```ts
  export interface StandingRowView {
    participantId: string; position: number; name: string; clubName: string | null;
    rating: number; lastChange: number | null; bouts: number; wins: number; draws: number; losses: number;
    warnings: number; provisional: boolean;
  }
  ```
- Produces `<participant-table>`: property `rows: StandingRowView[]`; attribute `selected` (participantId); boolean attributes `show-warnings`, `searchable`. Event `participant-selected` → `CustomEvent<{ participantId: string }>` on row click or Enter/Space on a focused row.
  Wide layout (container ≥ 520px): table columns # · Fighter (name + club, "provisional" tag) · Rating (+ signed last change, verdigris up / rust down) · Bouts · W · D · L · Warn. Narrow layout: list rows "W–D–L on one line, rating on the right" as in the phone mockup.
  `searchable` shows a `<search-field>` above; filtering matches name or club (case-insensitive substring); shows `common.noResults` when nothing matches; the field's counter shows filtered/total.
  Keys: `table.position` "#", `table.fighter` "Fighter"/"Vechter", `table.rating` "Rating"/"Rating", `table.bouts` "Bouts"/"Partijen", `table.wins` "W"/"W", `table.draws` "D"/"G", `table.losses` "L"/"V", `table.warnings` "Warn"/"Waarsch.", `table.provisional` "provisional"/"voorlopig", `table.record` "{bouts} bouts · {wins}–{draws}–{losses}"/"{bouts} partijen · {wins}–{draws}–{losses}", `table.empty` "No participants yet."/"Nog geen deelnemers.".

- [ ] **Step 1: Write failing tests** (rows from the mockup: Tomas Kuiper 1688 +14, Ilse Bakker 1641 −14, Lotte Smit provisional, …):
  - renders one row per participant in the given order with rating and "+14"/"−14"
  - **`hides warnings`**: without `show-warnings` no element with `data-col="warnings"` exists; with it, the column shows the counts
  - **`filters and clears`**: `searchable`, dispatch input "ochs" in the inner search field → only Ochs Utrecht rows visible; clear → all visible; "zzz" → no-results text with the query
  - clicking a row and pressing Enter on a focused row fire `participant-selected` with its id; `selected` attribute marks that row (`aria-selected="true"`)
  - **`escapes names`**: a name `<img src=x onerror=alert(1)>` shows as text and no `img` element exists in the shadow root
  - empty `rows` → `table.empty`; `renders in Dutch` → header "Partijen"
- [ ] **Step 2–4:** run → FAIL, implement (escape every data string with a shared `escapeHtml` in `src/utils/`, create it if missing), run + typecheck → PASS. Story `Components/ParticipantTable` (wide and narrow).

### Task 5: `officials-grid` and `bout-exchanges`

**Files:** scaffold `officials-grid`, `bout-exchanges`; extend `models/competition-views.ts`. Tests: their `.test.ts`.

**Interfaces:**
- Models:
  ```ts
  export interface PersonView { userId: string; name: string }
  export interface OfficialsView { referee: PersonView; jury: PersonView[]; table: PersonView | null }
  export interface ExchangeView { atSeconds: number; kind: "SCORE" | "DOUBLE" | "WARNING" | "TIME"; side: "A" | "B" | null; points: number; reason: string | null }
  ```
- `<officials-grid>`: property `officials: OfficialsView`. Two-column grid: referee (brass outline) then jury seats in order, only as many rows as needed. Render `1 + jury.length` cells, plus one dashed filler cell when that count is odd **and** greater than 1 (so referee alone or referee + one jury never gets a filler). Labels: `officials.referee` "Referee"/"Scheidsrechter", `officials.jury` "Jury"/"Jury" (single), `officials.juryN` "Jury {n}"/"Jury {n}" (when more than one). Table official is not part of the grid (shown by `bout-details`).
- `<bout-exchanges>`: properties `exchanges: ExchangeView[]`, `fighterNames: { A: string; B: string }`; boolean attributes `show-warnings`, `show-lead-graph`. One row per exchange: clock time `mm:ss` (mono), text, running score `a–b`. Texts: SCORE → "{name} +{points}" (`exchange.score`), DOUBLE → `exchange.double` "Double hit, no score"/"Dubbeltreffer, geen punt", WARNING → `exchange.warning` "{name} · {reason}"/"{name} · {reason}" with a `warning` tag (`exchange.warningTag` "warning"/"waarschuwing"), TIME → `exchange.time` "Time"/"Tijd". Lead graph: small inline SVG polyline of (scoreB − scoreA) per exchange, labels `exchange.ahead` "{name} ahead"/"{name} voor". Running score counts SCORE points only.

- [ ] **Step 1: Write failing tests:**
  - officials: **`referee and one jury share a row`** (2 cells, no filler, grid has one row); referee + 2 jury → 3 cells + 1 filler; referee + 3 jury → 4 cells, no filler; referee + 4 jury → 5 + 1 filler; referee only → 1 cell, no filler; jury labels "Jury" for one, "Jury 1"/"Jury 2" for two
  - exchanges: the mockup bout (Kuiper +1, double, Bakker +2, Kuiper +2, warning, Bakker +1, Kuiper +2, time) → running scores `0–1, 0–1, 2–1, 2–3, 2–3, 3–3, 3–5, 3–5` with A = Bakker; **`hides warnings`** removes the warning row (scores unchanged); **`escapes warning reasons`**; no lead graph unless `show-lead-graph`; Dutch "Dubbeltreffer, geen punt"
- [ ] **Step 2–4:** run → FAIL, implement, run + typecheck → PASS. Stories for both.

### Task 6: `fighter-history`

**Files:** scaffold `fighter-history`; extend models. Test: `fighter-history.test.ts`.

**Interfaces:**
- Models:
  ```ts
  export type BoutStatusView = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";
  export interface FighterBoutView {
    boutId: string; foughtAt: string; location: string | null; opponentName: string;
    ownScore: number; opponentScore: number; result: "WIN" | "DRAW" | "LOSS";
    ratingChange: number | null; status: BoutStatusView;
    approvals: { referee: boolean; own: boolean; opponent: boolean }; voidReason: string | null;
  }
  export interface FighterSummaryView { name: string; clubName: string | null; since: string | null; rating: number; ratingHistory: number[]; bouts: number; wins: number; draws: number; losses: number; warnings: number }
  ```
- `<fighter-history>`: properties `summary: FighterSummaryView`, `bouts: FighterBoutView[]` (shown newest first as given); attributes `selected` (boutId), `show-warnings`, `searchable`. Shows header (name, club, big rating), a sparkline of `ratingHistory`, the stat line (Bouts/Won/Drawn/Lost/Warn — Warn only with `show-warnings`), then bout rows: `<bout-seal>` (sm), "vs {opponent}", date/time · location (or "voided: {reason}"), score, result tag (`result.win` WON/GEWONNEN, `result.draw` DRAW/GELIJK, `result.loss` LOST/VERLOREN, `result.void` VOID/VERVALLEN) and the signed rating change (or `history.waiting` "waiting"/"wacht"). Search matches opponent, location, formatted date and result label. Event `bout-selected` → `CustomEvent<{ boutId: string }>` (click, Enter, Space).
  Keys also: `history.vs` "vs {name}"/"tegen {name}", `history.voided` "voided: {reason}"/"vervallen: {reason}", `history.stats.*` (bouts/won/drawn/lost/warn), `history.since` "since {date}"/"sinds {date}", `history.empty` "No bouts yet."/"Nog geen partijen.".

- [ ] **Step 1: Write failing tests:** renders the mockup's five bouts with result tags and "+11"/"−14"; a VOIDED bout shows "voided: Sanne injured" and no rating change; **`hides warnings`** (stat line has no Warn without the attribute); search "leiden" keeps the two Leiden bouts, "oct" matches by month in English and "okt" in Dutch; `bout-selected` on click/Enter; sparkline has one point per `ratingHistory` value; Dutch "tegen Tomas Kuiper".
- [ ] **Step 2–4:** run → FAIL, implement, run + typecheck → PASS. Story `Components/FighterHistory`.

### Task 7: `bout-details` and package wiring

**Files:** scaffold `bout-details`; extend models; Modify `packages/ui/package.json` (`exports` subpaths for the new views: `./bout-seal`, `./participant-table`, `./fighter-history`, `./bout-details`, `./i18n`), `packages/ui/src/index.ts` (all new exports with `.js`). Test: `bout-details.test.ts`.

**Interfaces:**
- Model:
  ```ts
  export interface BoutDetailView {
    boutId: string; status: BoutStatusView; approvals: { referee: boolean; A: boolean; B: boolean };
    fighterA: PersonView; fighterB: PersonView; scoreA: number; scoreB: number;
    startedAt: string; location: string | null; rulesetLabel: string | null;
    officials: OfficialsView; exchanges: ExchangeView[];
    windowEndsAt: string | null; objection: { by: "A" | "B"; reason: string | null } | null; voidReason: string | null;
  }
  ```
- `<bout-details>`: property `bout: BoutDetailView`; attributes `show-warnings`, `show-lead-graph` (passed down). Renders the status line (`<bout-seal size="sm">` + status text from `seal.*`), names and big score, a meta list (When / Where / Ruleset / Table — keys `details.when`, `details.where`, `details.ruleset`, `details.table`; NL Wanneer / Waar / Regelset / Tafel), `<officials-grid>`, an objection or void notice (`details.objected` "{name} objected: {reason}"/"{name} maakte bezwaar: {reason}", `details.voided`), `details.windowEnds` "Fighters can object until {date}"/"Vechters kunnen bezwaar maken tot {date}" while COUNTED, then `<bout-exchanges>`. No events in this phase (actions come with the apps).

- [ ] **Step 1: Write failing tests:** renders both names and "3–5"; passes `show-warnings` through (warning row present only with it); shows the objection notice with the reason for an OBJECTED bout and the window notice for COUNTED; table official appears in the meta list, not in the grid; `renders in Dutch` ("Scheidsrechter", "Wanneer"); the package entry `@hema/ui` exports `t`, `setLocale` and all new element classes (import from `../../index.js` in the test).
- [ ] **Step 2–4:** run → FAIL, implement, run + typecheck → PASS. Story `Components/BoutDetails` using the mockup bout.
- [ ] **Step 5: Run everything:** `npm test --workspace @hema/ui`, `npm run typecheck`, `npm test` (repo). Expected: all PASS; existing components and apps unchanged.

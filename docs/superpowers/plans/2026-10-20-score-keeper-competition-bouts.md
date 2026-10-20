# Score-keeper: Competition Bouts (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Someone running the score-keeper logs in, picks the competition a bout is fought for, the two fighters, the referee, up to four jury members, zero to two table officials and the ring, fights the bout with that competition's ruleset, and saves it — registering the referee's approval and, if they agree on the spot, both fighters' approvals. The bout also counts in the other shared running competitions the operator ticks.

**Architecture:** Backend changes extend phase 3's `/api/v1/bouts` (high-trust recorder rights, 0–2 table officials, an explicit choice of competitions, two more exchange kinds). The match-engine package gains the ruleset parser (moved from `apps/competition`) and a pure converter from score-keeper match events to bout exchanges. Two new reusable views in `packages/ui` (`competition-bout-setup`, `bout-approval-view`) do the screens; `apps/score-keeper` only wires them to a small typed API client, a login screen and a new "Competition bout" route next to the existing event mode.

**Tech Stack:** Fastify/Kysely backend + Vitest; TypeScript packages; custom elements (Vitest browser mode); Vite app.

**Spec:** `docs/superpowers/specs/2026-10-19-competition-admin-design.md` (4.4, 4.10, 5.5) and the user's decisions of 2026-10-20 listed below.

## Decisions (user, 2026-10-20)

- **High trust.** Whoever runs the score-keeper is logged in as themselves (any account), records the bout and registers the approvals on the device: the referee's, and both fighters' if they agree on the spot.
- **Table officials:** zero, one or two per bout.
- **Ruleset:** the operator first picks the competition the bout is fought for; its ruleset drives the timer and scoring.
- **Counting in other competitions is a choice, in two places:** a competition setting "also accept bouts fought for other competitions", and per bout checkboxes for the other shared running competitions that accept them. *Claude's calls:* the setting defaults to **on** (keeps the earlier rule) and the checkboxes default to **ticked**.

## Global Constraints

- Work on `master`; commit only when the user asks. Bash, not PowerShell. Backend tests never open `data/dev.db`.
- Recorder rights: `POST /api/v1/bouts` — any logged-in user; they become `createdByUserId`. `referee-approval` and `void` — the referee **or** the recorder. Everything else from phase 3 unchanged (fighters object/withdraw in their own app; admins resolve).
- Bout requires `startedInCompetitionId` (RUNNING, both fighters enrolled). `alsoCountIn: string[]` must be a subset of the other RUNNING competitions both fighters share **whose setting is on**; anything else → 400.
- Exchange kinds: `SCORE | DOUBLE | WARNING | TIME | ADJUSTMENT | DISQUALIFICATION`. `points` is ≥ 0 except `ADJUSTMENT` (signed). `WARNING.points` = points deducted. A `DISQUALIFICATION` exchange (side = the disqualified fighter) makes the other side the winner regardless of score; without one, the existing score/winner rules hold.
- UI strings in the new views and new score-keeper screens go through `t()` in EN and NL. The score-keeper's existing event mode is not translated in this phase.
- Reuse phase 4 conventions: views build their frame once, delegate listeners on the shadow root, escape all data, `aria-current` for selection.

## Review Focus

- A bout recorded by someone who is neither referee nor table official is accepted, and only that person or the referee can approve it as referee. → Task 1 test `recorder can approve`.
- Ticking a competition whose "accept other bouts" setting is off, or one the fighters don't share, is refused. → Task 2 test `refuses competitions that don't accept`.
- After-blow events that score for both fighters become two SCORE exchanges at the same second, and the final exchange scores equal the match state. → Task 4 test `after-blow scores both`.
- A disqualified fighter with the higher score still loses, end to end (converter → backend). → Task 3 test `disqualification decides the winner`, Task 4 test `disqualification`.
- Logging in again after the access token expires happens silently through the refresh token; a failed refresh shows the login screen, not a broken page. → Task 8 test `refreshes once on 401`.

---

### Task 1: Backend — recorder rights and 0–2 table officials

**Files:** Modify `apps/backend/src/schema-migrations.ts` (migration `2026-10-20-bout-table-officials`: table `BoutTableOfficial { boutId, seat 1–2, userId }`, PK `(boutId, seat)`, unique `(boutId, userId)`; copy existing `Bout.tableUserId` rows into seat 1; keep the old column, stop using it), `apps/backend/src/db.ts`, `apps/backend/src/bouts/bout-input.ts` (`tableUserIds: string[]`, max 2, distinct, not a fighter/referee/jury), `bout-routes.ts`, `bout-view.ts` (`table: PersonRef[]`, sorted by seat). Tests: update `test/bout-create.test.ts`, `test/bout-fixtures.ts`, `test/bout-lifecycle.test.ts`; new cases listed below.

**Interfaces:** `BoutInput.tableUserIds: string[]` replaces `tableUserId`; `BoutView.table: PersonRef[]`. `requireRefereeOrRecorder(user, row)` replaces `requireReferee` for `referee-approval` and `void`.

- [ ] **Step 1: Failing tests:** recording by an `outsider` user (not an official) → 200 and `createdByUserId` = outsider; **`recorder can approve`** (outsider approves as referee with both on the spot → FINAL; another unrelated user → 403; the referee still can); recorder voids → 200; 0 and 2 table officials accepted, 3 → 400, duplicate → 400, a table official who is a jury member → 400; `GET /bouts/:id` shows `table` as a list; migration copies an existing `tableUserId` into `BoutTableOfficial` seat 1 (schema-migrations test with a raw row).
- [ ] **Step 2–4:** run → FAIL; implement; run `npm test --workspace @hema/backend` + typecheck → PASS.

### Task 2: Backend — choosing the competitions a bout counts in

**Files:** `schema-migrations.ts` (migration `2026-10-20-competition-accepts-other-bouts`: `Competition.acceptsOtherBouts INTEGER NOT NULL DEFAULT 1`), `db.ts`, `competition-model.ts` (summary field `acceptsOtherBouts: boolean`), `competitions/admin-routes.ts` (PATCH accepts it, any status), `bouts/bout-input.ts` (`startedInCompetitionId` required, `alsoCountIn: string[]` default `[]`), `bouts/bout-routes.ts`. Test: `test/bout-competitions-choice.test.ts`.

**Interfaces:**
- `GET /api/v1/bouts/competition-options?fighterA=<userId>&fighterB=<userId>&startedIn=<competitionId>` (logged in) → `{ startedIn: { id, name, rulesetJson }, others: Array<{ id, name }> }` — `others` = RUNNING competitions both share, not `startedIn`, with `acceptsOtherBouts`. 400 if `startedIn` isn't RUNNING or both aren't enrolled there.
- `POST /bouts` links exactly `[startedInCompetitionId, ...alsoCountIn]`.

- [ ] **Step 1: Failing tests:** f1 vs f2 started in X with `alsoCountIn: ["Y"]` → `competitionIds` [X, Y]; with `[]` → [X]; **`refuses competitions that don't accept`** (Y with `acceptsOtherBouts = 0` → 400; a competition only f1 is in → 400; a CLOSED one → 400); missing `startedInCompetitionId` → 400; options endpoint lists Y but not the no-accept or unshared ones, and returns X's `rulesetJson`; PATCH `acceptsOtherBouts: false` by the owner → summary shows `false`. Update phase 3 tests/fixtures that relied on automatic linking (fixtures pass `startedInCompetitionId: "X"` and `alsoCountIn: ["Y"]`).
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS.

### Task 3: Backend — exchange kinds and people search

**Files:** `bouts/bout-input.ts`, `bouts/bout-routes.ts` (people search), `server.ts` only if a route must live there. Test: `test/bout-exchange-kinds.test.ts`, `test/people-search.test.ts`.

**Interfaces:**
- `ExchangeKind` adds `"ADJUSTMENT" | "DISQUALIFICATION"`; `points` may be negative only for `ADJUSTMENT`.
- Winner rule: if any `DISQUALIFICATION` exchange exists, `winnerSide` must be the other side (else 400); otherwise the existing score rules.
- `GET /api/v1/people?q=<text>` (logged in) → up to 20 `{ userId, name, username, clubName }` whose name or username contains `q` (case-insensitive, `q` ≥ 2 characters else 400), ordered by name. No email or role in the response.

- [ ] **Step 1: Failing tests:** **`disqualification decides the winner`** (A 5–3 but A disqualified, `winnerSide: "B"` → 200; `winnerSide: "A"` → 400); ADJUSTMENT with `points: -1` → 200, SCORE with `-1` → 400; people search for "an" finds "Daan" and "Sanne", not by email; `q: "a"` → 400; not logged in → 401.
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS.

### Task 4: match-engine — ruleset parser and bout exchange converter

**Files:** Move `apps/competition/src/domain/ruleset-parser.ts` (+ test) to `packages/match-engine/src/ruleset-parser.ts`; `apps/competition` imports it from `@hema/match-engine`. Create `packages/match-engine/src/bout-exchanges.ts` (+ test). Export both from `packages/match-engine/src/index.ts`.

**Interfaces:**
```ts
export function parseRuleSet(raw: unknown): RuleSet;                    // unchanged behaviour, new home
export interface BoutExchange { atSeconds: number; kind: "SCORE" | "DOUBLE" | "WARNING" | "TIME" | "ADJUSTMENT" | "DISQUALIFICATION"; side: "A" | "B" | null; points: number; reason: string | null }
export interface BoutOutcome { scoreA: number; scoreB: number; winnerSide: "A" | "B" | null; warningsA: number; warningsB: number; exchanges: BoutExchange[] }
export function toBoutOutcome(events: readonly MatchEventDetail[], rules: MatchParameters, endedAtSeconds: number): BoutOutcome;
```
Rules: replay with `reduceMatchEvent`; for score events emit one `SCORE` per side whose score went up (points = increase); a `double` with no increase → `DOUBLE`; `no-score` → nothing; `warning` → `WARNING` (side, `reason` = description, `points` = deducted); `score-adjustment` → `ADJUSTMENT` (signed change); `disqualification` → `DISQUALIFICATION`; finally one `TIME` at `endedAtSeconds`. `atSeconds` = `Math.floor(elapsedTimeSeconds)`. Scores/warnings from the final state; winner: disqualification first, else higher score, else null.

- [ ] **Step 1: Failing tests:** a clean hit A +2 → one SCORE; **`after-blow scores both`** (after-blow giving A +2, B +1 → two SCOREs at the same second, final 2–1); double not counted → DOUBLE; warning with 1 point deducted → WARNING points 1 and final score reduced; adjustment B from 3 to 2 → ADJUSTMENT points −1; **`disqualification`** (A ahead then disqualified → winnerSide "B"); fractional seconds floored; final TIME exchange; parser tests still pass at the new location; `apps/competition` tests still pass.
- [ ] **Step 2–4:** run → FAIL; implement/move; run `npm test --workspace @hema/match-engine`, `--workspace @hema/competition`, typecheck → PASS.

### Task 5: UI — table officials list and the new exchange kinds

**Files:** `packages/ui/src/models/competition-views.ts` (`OfficialsView.table: PersonView[]`; `ExchangeKind` adds `ADJUSTMENT | DISQUALIFICATION`), `bout-exchanges.ts` (+ test), `bout-details.ts` (+ test), messages.

**Interfaces:** `bout-exchanges` running score: SCORE adds, WARNING subtracts its points, ADJUSTMENT adds its signed points. Texts: `exchange.adjustment` "{name} score corrected {points}" / "{name} score gecorrigeerd {points}" (signed via `formatSigned`), `exchange.disqualified` "{name} disqualified" / "{name} gediskwalificeerd", warning with deduction adds " (−{points})". `bout-details` meta "Table" lists names joined with ", " (omitted when empty).

- [ ] **Step 1: Failing tests:** warning with 1 point deducted lowers the running score; adjustment −1 shows "score corrected −1" and lowers it; disqualification row text; two table officials both in the meta line; none → no Table row.
- [ ] **Step 2–4:** run → FAIL; implement; run `npm test --workspace @hema/ui` + typecheck → PASS.

### Task 6: UI view `competition-bout-setup`

**Files:** scaffold `packages/ui/src/components/competition-bout-setup/*` (+ test, story); models + messages.

**Interfaces:**
```ts
export interface SetupCompetitionView { id: string; name: string }
export interface SetupFighterView { userId: string; name: string; clubName: string | null }
export interface SetupPersonView { userId: string; name: string; clubName: string | null }
export interface BoutSetupResult {
  competitionId: string; fighterAUserId: string; fighterBUserId: string; refereeUserId: string;
  juryUserIds: string[]; tableUserIds: string[]; ring: string | null; alsoCountIn: string[];
}
```
Properties: `competitions: SetupCompetitionView[]`, `fighters: SetupFighterView[]` (for the chosen competition), `otherCompetitions: SetupCompetitionView[]` (for the chosen pair), `peopleResults: SetupPersonView[]`. Events: `setup-competition-chosen {competitionId}`, `setup-fighters-chosen {fighterAUserId, fighterBUserId}` (app answers with `otherCompetitions`), `people-search-requested {query, role: "referee" | "jury" | "table"}` (app answers with `peopleResults`), `bout-setup-confirmed BoutSetupResult`.
Behaviour: steps on one page — competition (select), fighters A and B (two selects from `fighters`, can't be the same), referee (search + pick, required), jury (add up to 4, removable), table (add up to 2, removable), ring (text, optional), "Also counts in" checkboxes (ticked by default; section hidden when empty). "Start bout" button disabled until competition, two different fighters and a referee are set; a person can hold only one role and can't be a fighter (picker hides them). Keys `setup.*` in EN/NL (titles, labels, "Start bout"/"Partij starten", "Also counts in"/"Telt ook mee in", "Add jury member"/"Jurylid toevoegen", "Add table official"/"Tafelofficial toevoegen", validation hints).

- [ ] **Step 1: Failing tests:** start disabled initially; choosing a competition fires `setup-competition-chosen`; choosing both fighters fires `setup-fighters-chosen` and same fighter twice keeps start disabled with a hint; typing "da" in the referee search fires `people-search-requested` with role "referee"; picking a result sets the referee; a 5th jury add is impossible; a 3rd table official impossible; someone picked as referee doesn't appear in jury results; `otherCompetitions` render as ticked checkboxes, unticking removes it from the result; confirm fires `bout-setup-confirmed` with the full `BoutSetupResult`; escapes names; renders in Dutch.
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS. Story with mockup names.

### Task 7: UI view `bout-approval-view`

**Files:** scaffold `packages/ui/src/components/bout-approval-view/*` (+ test, story); messages.

**Interfaces:** property `summary: { fighterA: string; fighterB: string; scoreA: number; scoreB: number; winnerSide: "A" | "B" | null; refereeName: string }`; method `setSaving(saving: boolean)`, `setError(message: string | null)`. Event `bout-save-requested { refereeApproves: boolean; fighterAApproves: boolean; fighterBApproves: boolean }`. Shows the result big, three toggles ("{referee} approves as referee", "{fighterA} agrees now", "{fighterB} agrees now"; fighter toggles disabled unless the referee toggle is on), a note that fighters who don't agree now have three days to object in their own app, and a "Save bout" button (stays enabled with no approvals: saves the bout as scored). While saving the button is disabled (no double submit).

- [ ] **Step 1: Failing tests:** fighter toggles disabled until referee toggle on; turning referee off clears fighter toggles; save fires once with the three flags; `setSaving(true)` disables save and a second click fires nothing; `setError` shows the message; Dutch labels.
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS.

### Task 8: Score-keeper — login and competition API client

**Files:** Create `apps/score-keeper/src/competition/session.ts`, `competition-client.ts` (+ tests with fetch mocked through the repo's `api-mock` skill), `login-screen.ts` (small DOM module, no framework); modify `index.html` (login section) and `vite-env.d.ts` if needed.

**Interfaces:**
```ts
export interface Session { accessToken: string; refreshToken: string; user: { id: string; name: string; language: "en" | "nl" } }
export class CompetitionClient {
  constructor(baseUrl: string, storage?: Storage);
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  currentSession(): Session | null;
  runningCompetitions(): Promise<Array<{ id: string; name: string }>>;            // GET /competitions, status RUNNING
  participants(competitionId: string): Promise<Array<{ userId: string; name: string; clubName: string | null }>>;
  competitionOptions(fighterA: string, fighterB: string, startedIn: string): Promise<{ startedIn: { id: string; name: string; rulesetJson: unknown }; others: Array<{ id: string; name: string }> }>;
  searchPeople(query: string): Promise<Array<{ userId: string; name: string; clubName: string | null }>>;
  recordBout(input: unknown): Promise<{ id: string; status: string }>;
  approveAsReferee(boutId: string, onSpot: { A: boolean; B: boolean }): Promise<{ status: string }>;
}
```
Bearer token on every call; on 401 one silent `POST /auth/refresh` then retry once; if refresh fails, clear the session and throw `SessionExpiredError`. Session in `localStorage` key `hema-score-keeper.session`. After login `setLocale(user.language)`.

- [ ] **Step 1: Failing tests:** login stores the session and returns it; calls send the bearer token; **`refreshes once on 401`** (401 → refresh → retry succeeds; second 401 after refresh → `SessionExpiredError` and session cleared); participants map `userId`; `searchPeople` URL-encodes the query.
- [ ] **Step 2–4:** run → FAIL; implement; run `npm test --workspace @hema/score-keeper` + typecheck → PASS.

### Task 9: Score-keeper — the competition bout flow

**Files:** `apps/score-keeper/src/main.ts` (new route `/competition`, launcher button "Competition bout", `showCompetitionScreen`, hiding it in every other `show*`), new `src/competition/competition-flow.ts` holding the flow so `main.ts` changes stay small, `index.html` (sections for setup and approval), messages for launcher/login texts.

**Flow:** launcher → (login if no session) → `<competition-bout-setup>` fed by the client → on confirm, `competitionOptions` gives the ruleset → `parseRuleSet` → existing `<fight-view>` + `MatchStore` exactly as event mode does (wake lock, fullscreen) → on end: `toBoutOutcome(store.events, rules, elapsed)` → `<bout-approval-view>` → `recordBout({...setup, startedInCompetitionId, alsoCountIn, startedAt, ...outcome})` then, if the referee toggle is on, `approveAsReferee(id, {A, B})` → back to setup with the same competition and officials kept (next bout is quick). Errors show in the approval view; the bout stays on screen until saved. `SessionExpiredError` → login, keeping the unsaved bout in memory and retrying after login.

- [ ] **Step 1:** Extract the testable pieces of the flow into `competition-flow.ts` functions with unit tests (building the `recordBout` payload from setup + outcome + start time; keeping officials for the next bout). Run → FAIL, implement, PASS.
- [ ] **Step 2: Wire `main.ts` and `index.html`.** Typecheck + `npm run build --workspace @hema/score-keeper` → PASS.
- [ ] **Step 3: Verify in the browser.** Start the backend on a **copy** of the seed database (`DATABASE_URL=file:<scratchpad copy>`), seed users with passwords via the seed script on that copy, start the score-keeper dev server (add a `.claude/launch.json` entry with `VITE_USE_MOCK_API=false`), and in the browser pane: log in, set up a bout, score a few exchanges including a warning, end it, approve with both fighters on the spot, save. Check via `GET /api/v1/competitions/<id>/standings` that the ratings changed and `GET /bouts/:id` shows the officials and exchanges. Screenshot the setup and approval screens.
- [ ] **Step 4: Run everything:** `npm test`, `npm run typecheck`, backend build. Expected: all PASS.

# Competition Domain (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, fully tested TypeScript package `@hema/competition-domain` holding the core rules every other part of the design relies on: competition lifecycle, bout approval/objection lifecycle, which competitions a bout counts in, rating replay from bout history, and the participant table rows.

**Architecture:** One new workspace package with small single-purpose modules and no I/O, no clock access (every time-dependent function takes `now: Date`), no framework. It reuses `applyEloBout` from `@hema/ranking`. Backend, admin app, participant app and score-keeper consume it in later phases.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes in `index.ts`), Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-19-competition-admin-design.md` (sections 4.1, 4.3a, 4.4).

## Roadmap (each phase gets its own plan, confirmed before it starts)

1. **Competition domain package** ← this plan
2. Backend: competition lifecycle, co-admins and access migration, club area/country, user language
3. Backend: bout model v2 (revisions, referee approval, objection window, multi-competition counting, rating recalculation) using phase 1
4. Shared views + design tokens + i18n (EN/NL) in `packages/ui` (seal, participant table, fighter history, bout details, officials grid, search)
5. Score-keeper: ad hoc competition bouts (fighters, referee, jury, ring, start time, on-the-spot approval)
6. New admin app (Needs you, competitions, drill-down, objection review, settings)
7. New participant app (approve/object, enrol via link/QR, profile, consent)
8. Bout chat, board, web push notifications
9. Media: consent, links, ring streams with timestamps

## Global Constraints

- Work on `master`; no branches. **Do not commit** — the user commits (AGENTS.md). Plan has no commit steps.
- Run shell commands in Bash (Git Bash), not PowerShell (`using-bash-not-powershell` skill).
- Tests use Vitest (`vitest run`), matching `packages/ranking`. Tests live next to sources as `*.test.ts`.
- No runtime dependencies except `@hema/ranking`.
- Objection window: exactly **3 days** = `259_200_000` ms.
- Provisional: fewer than **10** counted bouts.
- Starting rating: `DEFAULT_ELO_RATING` (1000) from `@hema/ranking`.
- Only bouts with status `COUNTED` or `FINAL` count in ratings and stats.
- A bout counts in every competition with status `RUNNING` in which **both** fighters (by user id) are enrolled. No scope check.
- Timestamps are ISO-8601 strings in data; functions take `now: Date`.

## Review Focus

- An objection at exactly `windowStartedAt + 3 days` is rejected (window is half-open: `[start, start + 3d)`). → Task 2 test `rejects an objection at exactly three days`.
- Restoring an objected bout after its window has passed makes it `FINAL` immediately, not `COUNTED` forever. → Task 2 test `restore after the window makes the bout final`.
- Two bouts with the same `foughtAt` replay in a stable order (by `id`), so ratings don't change between runs. → Task 3 test `orders equal timestamps by id`.
- The same user on both sides of a bout is rejected rather than counted. → Task 4 test `rejects the same user on both sides`.
- A participant with no counted bouts shows rating 1000, provisional, no last change. → Task 5 test `participant without bouts`.

---

### Task 1: Package scaffold + competition lifecycle

**Files:**
- Create: `packages/competition-domain/package.json` (copy of `packages/ranking/package.json` with name `@hema/competition-domain` and `"dependencies": { "@hema/ranking": "*" }`)
- Create: `packages/competition-domain/tsconfig.json`, `tsconfig.build.json` (copies of `packages/ranking`'s)
- Create: `packages/competition-domain/src/competition-lifecycle.ts`
- Create: `packages/competition-domain/src/index.ts`
- Test: `packages/competition-domain/src/competition-lifecycle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CompetitionStatus = "DRAFT" | "REGISTRATION_OPEN" | "RUNNING" | "CLOSED" | "ARCHIVED";
  export type CompetitionAction = "OPEN_REGISTRATION" | "START" | "CLOSE" | "REOPEN" | "ARCHIVE";
  export interface ReadinessInput { rulesetVersionId: string | null; hasScope: boolean; startDate: string | null }
  export interface ReadinessChecklist { rulesetChosen: boolean; scopeAndDatesSet: boolean; ready: boolean }
  export function readinessChecklist(input: ReadinessInput): ReadinessChecklist;
  export class CompetitionTransitionError extends Error { readonly code: "NOT_ALLOWED" | "NOT_READY" }
  export function transitionCompetition(status: CompetitionStatus, action: CompetitionAction, readiness: ReadinessChecklist): CompetitionStatus;
  ```
  Allowed: DRAFT —OPEN_REGISTRATION (only if `ready`)→ REGISTRATION_OPEN; REGISTRATION_OPEN —START→ RUNNING; RUNNING —CLOSE→ CLOSED; CLOSED —REOPEN→ RUNNING; CLOSED —ARCHIVE→ ARCHIVED. Anything else throws `NOT_ALLOWED`; opening while not ready throws `NOT_READY`.

- [ ] **Step 1: Write the failing tests** in `competition-lifecycle.test.ts`:
  - `readinessChecklist({ rulesetVersionId: "r1", hasScope: true, startDate: "2027-04-12" })` → `{ rulesetChosen: true, scopeAndDatesSet: true, ready: true }`
  - with `rulesetVersionId: null` → `ready: false, rulesetChosen: false`
  - with `startDate: null` → `scopeAndDatesSet: false, ready: false`
  - `transitionCompetition("DRAFT", "OPEN_REGISTRATION", ready)` → `"REGISTRATION_OPEN"`
  - same with not-ready checklist → throws `CompetitionTransitionError` with `code === "NOT_READY"`
  - `"REGISTRATION_OPEN"`+`START` → `"RUNNING"`; `"RUNNING"`+`CLOSE` → `"CLOSED"`; `"CLOSED"`+`REOPEN` → `"RUNNING"`; `"CLOSED"`+`ARCHIVE` → `"ARCHIVED"`
  - `"RUNNING"`+`ARCHIVE` and `"ARCHIVED"`+`REOPEN` → throw with `code === "NOT_ALLOWED"`
- [ ] **Step 2: Run** `npm install` (registers the workspace), then `npm test --workspace @hema/competition-domain`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the types and functions above in `competition-lifecycle.ts`; export them from `index.ts` (with `.js` suffix like `packages/ranking/src/index.ts`). A transition table `Record<CompetitionStatus, Partial<Record<CompetitionAction, CompetitionStatus>>>` is the expected approach.
- [ ] **Step 4: Run** `npm test --workspace @hema/competition-domain` and `npm run typecheck --workspace @hema/competition-domain`. Expected: all PASS, no type errors.

### Task 2: Bout lifecycle (referee approval, objection window)

**Files:**
- Create: `packages/competition-domain/src/bout-lifecycle.ts`
- Modify: `packages/competition-domain/src/index.ts` (export)
- Test: `packages/competition-domain/src/bout-lifecycle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BoutStatus = "SCORED" | "COUNTED" | "OBJECTED" | "FINAL" | "VOIDED";
  export type FighterSide = "A" | "B";
  export const OBJECTION_WINDOW_MS = 259_200_000;
  export interface BoutLifecycle {
    status: BoutStatus;
    revision: number;                       // starts at 1, +1 per correction
    windowStartedAt: string | null;         // ISO; set on referee approval and on correction
    fighterApproved: { A: boolean; B: boolean };
    objection: { by: FighterSide; at: string } | null;
    voidReason: string | null;
  }
  export type BoutTransitionErrorCode = "INVALID_STATE" | "WINDOW_CLOSED" | "ALREADY_APPROVED" | "REASON_REQUIRED";
  export class BoutTransitionError extends Error { readonly code: BoutTransitionErrorCode }
  export type ObjectionResolution = { kind: "restore" } | { kind: "correct" } | { kind: "void"; reason: string };

  export function createScoredBout(): BoutLifecycle;
  export function approveByReferee(bout: BoutLifecycle, now: Date, onSpot: { A: boolean; B: boolean }): BoutLifecycle;
  export function approveByFighter(bout: BoutLifecycle, side: FighterSide, now: Date): BoutLifecycle;
  export function objectToBout(bout: BoutLifecycle, side: FighterSide, now: Date): BoutLifecycle;
  export function resolveObjection(bout: BoutLifecycle, resolution: ObjectionResolution, now: Date): BoutLifecycle;
  export function voidBout(bout: BoutLifecycle, reason: string): BoutLifecycle;
  export function settleBout(bout: BoutLifecycle, now: Date): BoutLifecycle;
  export function boutCounts(bout: Pick<BoutLifecycle, "status">): boolean;
  ```
  Rules (all functions pure, return a new object):
  - `createScoredBout` → `SCORED`, revision 1, no window, no approvals.
  - `approveByReferee`: only from `SCORED`. Sets `windowStartedAt = now`, `fighterApproved = onSpot`; status `FINAL` if both on-spot, else `COUNTED`.
  - `approveByFighter`: only from `COUNTED` with window open; both approved → `FINAL`.
  - `objectToBout`: only from `COUNTED`; `now >= windowStartedAt + OBJECTION_WINDOW_MS` → `WINDOW_CLOSED`; a side that already approved → `ALREADY_APPROVED`. Result `OBJECTED` with `objection = { by, at: now }`.
  - `resolveObjection`: only from `OBJECTED`. `restore` → `COUNTED`, objection cleared, same window, then `settleBout(…, now)`. `correct` → `COUNTED`, `revision + 1`, `windowStartedAt = now`, approvals reset to false, objection cleared. `void` → `VOIDED` with trimmed reason; empty reason → `REASON_REQUIRED`.
  - `voidBout`: from `SCORED` or `COUNTED` only; empty reason → `REASON_REQUIRED`.
  - `settleBout`: `COUNTED` and `now >= windowStartedAt + window` → `FINAL`; otherwise unchanged.
  - `boutCounts`: true for `COUNTED` and `FINAL`.
  - Wrong starting state → `INVALID_STATE`.

- [ ] **Step 1: Write the failing tests.** Use `const t0 = new Date("2026-10-15T20:40:00Z")` and `const at = (ms: number) => new Date(t0.getTime() + ms)`. Assertions:
  - `approveByReferee(createScoredBout(), t0, { A: false, B: false })` → status `COUNTED`, `windowStartedAt === t0.toISOString()`
  - with `{ A: true, B: true }` → `FINAL`
  - `approveByFighter` A then B within window → `FINAL`
  - `objectToBout(counted, "A", at(1000))` → `OBJECTED`, `objection.by === "A"`, `boutCounts(...) === false`
  - **`rejects an objection at exactly three days`**: `objectToBout(counted, "A", at(OBJECTION_WINDOW_MS))` throws `WINDOW_CLOSED`; at `OBJECTION_WINDOW_MS - 1` succeeds
  - side A approved then `objectToBout(…, "A", …)` throws `ALREADY_APPROVED`; side B may still object
  - `resolveObjection(objected, { kind: "restore" }, at(1000))` → `COUNTED`, same `windowStartedAt`
  - **`restore after the window makes the bout final`**: restore at `at(OBJECTION_WINDOW_MS + 1)` → `FINAL`
  - `correct` at `at(5000)` → `COUNTED`, `revision === 2`, `windowStartedAt === at(5000).toISOString()`, both approvals false
  - `void` with `reason: "  "` throws `REASON_REQUIRED`; with `"Sanne injured"` → `VOIDED`, `voidReason === "Sanne injured"`
  - `voidBout(final, "x")` throws `INVALID_STATE`
  - `settleBout(counted, at(OBJECTION_WINDOW_MS))` → `FINAL`; at `OBJECTION_WINDOW_MS - 1` → unchanged `COUNTED`
  - input objects are not mutated (deep-equal before/after)
- [ ] **Step 2: Run** `npm test --workspace @hema/competition-domain`. Expected: FAIL on the new file.
- [ ] **Step 3: Implement** `bout-lifecycle.ts` per the Interfaces block; export from `index.ts`.
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 3: Rating replay from bout history

**Files:**
- Create: `packages/competition-domain/src/rating-replay.ts`
- Modify: `packages/competition-domain/src/index.ts`
- Test: `packages/competition-domain/src/rating-replay.test.ts`

**Interfaces:**
- Consumes: `applyEloBout`, `DEFAULT_ELO_RATING` from `@hema/ranking`.
- Produces:
  ```ts
  export interface RatedBout { id: string; fighterAId: string; fighterBId: string; winnerId: string | null; foughtAt: string; counts: boolean }
  export interface RatingChange { boutId: string; beforeA: number; afterA: number; beforeB: number; afterB: number }
  export interface RatingReplay { ratings: Map<string, number>; changes: Map<string, RatingChange> }
  export function replayRatings(bouts: readonly RatedBout[]): RatingReplay;
  ```
  Fighter ids here are the competition's participant ids. Only `counts: true` bouts are applied, sorted by `foughtAt` ascending, then `id` ascending.

- [ ] **Step 1: Write the failing tests:**
  - one bout a beats b → `ratings.get("a") === 1016`, `ratings.get("b") === 984`, `changes.get("b1")` = `{ boutId: "b1", beforeA: 1000, afterA: 1016, beforeB: 1000, afterB: 984 }`
  - bouts passed in reverse chronological order give the same result as in order
  - **`orders equal timestamps by id`**: two bouts with identical `foughtAt`, ids `"x2"` and `"x1"` → result equals replaying `x1` first (compare with manual `applyEloBout` composition)
  - a bout with `counts: false` is absent from `changes` and the ratings equal the replay without that bout
  - removing a middle bout changes the `changes` of the bout after it (prove recalculation): three bouts a>b, b>c, a>c; replay all vs replay with b>c `counts: false`; `changes.get("third").beforeA` same, `beforeB` (c) differs
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** `replayRatings`: sort a copy, fold `applyEloBout` with `{ fighterAId, fighterBId, winnerParticipantId: winnerId }`, recording before/after per bout.
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 4: Which competitions a bout counts in

**Files:**
- Create: `packages/competition-domain/src/bout-competitions.ts`
- Modify: `packages/competition-domain/src/index.ts`
- Test: `packages/competition-domain/src/bout-competitions.test.ts`

**Interfaces:**
- Consumes: `CompetitionStatus` (Task 1).
- Produces:
  ```ts
  export interface CompetitionEnrolment { competitionId: string; status: CompetitionStatus; enrolledUserIds: ReadonlySet<string> }
  export class SameFighterError extends Error {}
  export function competitionsForBout(userAId: string, userBId: string, competitions: readonly CompetitionEnrolment[]): string[];
  ```
  Returns ids of `RUNNING` competitions where both users are enrolled, in input order.

- [ ] **Step 1: Write the failing tests:**
  - club ladder (RUNNING, {u1,u2}) + country ladder (RUNNING, {u1,u2,u3}) → `["club", "country"]`
  - a competition where only u1 is enrolled is excluded
  - a `CLOSED` and a `REGISTRATION_OPEN` competition with both enrolled are excluded
  - no shared competitions → `[]`
  - **`rejects the same user on both sides`**: `competitionsForBout("u1", "u1", …)` throws `SameFighterError`
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** `competitionsForBout` (filter + map).
- [ ] **Step 4: Run** tests + typecheck. Expected: PASS.

### Task 5: Participant table rows

**Files:**
- Create: `packages/competition-domain/src/participant-rows.ts`
- Modify: `packages/competition-domain/src/index.ts`
- Test: `packages/competition-domain/src/participant-rows.test.ts`

**Interfaces:**
- Consumes: `RatedBout`, `RatingReplay`, `replayRatings` (Task 3); `DEFAULT_ELO_RATING`.
- Produces:
  ```ts
  export const PROVISIONAL_BOUT_THRESHOLD = 10;
  export interface StatsBout extends RatedBout { warningsA: number; warningsB: number }
  export interface ParticipantRow {
    participantId: string; position: number; rating: number; lastChange: number | null;
    bouts: number; wins: number; draws: number; losses: number; warnings: number; provisional: boolean;
  }
  export function buildParticipantRows(participantIds: readonly string[], bouts: readonly StatsBout[], replay: RatingReplay): ParticipantRow[];
  ```
  Only `counts: true` bouts feed the numbers. `lastChange` = after − before of the participant's latest counted bout (by `foughtAt`, then `id`). Rows sorted by rating desc, then `participantId` asc; `position` 1-based. Duplicate participant ids collapse to one row.

- [ ] **Step 1: Write the failing tests:**
  - a beats b once (a got 1 warning, b got 2) → row a: `{ rating: 1016, lastChange: 16, bouts: 1, wins: 1, draws: 0, losses: 0, warnings: 1, provisional: true, position: 1 }`; row b: `lastChange: -16, losses: 1, warnings: 2, position: 2`
  - a draw counts in `draws` for both
  - a `counts: false` bout adds nothing (bouts, W/D/L, warnings)
  - 10 counted bouts → `provisional: false`; 9 → `true`
  - **`participant without bouts`**: id with no bouts → `{ rating: 1000, lastChange: null, bouts: 0, provisional: true }`
  - equal ratings ordered by `participantId`; duplicate ids give one row
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** `buildParticipantRows`.
- [ ] **Step 4: Run** the whole package: `npm test --workspace @hema/competition-domain` and `npm run typecheck --workspace @hema/competition-domain`, plus `npm test --workspace @hema/ranking` (unchanged dependency still green). Expected: all PASS.

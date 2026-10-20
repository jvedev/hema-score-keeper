# New Participant App (Phase 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/competition` as the participant app with the new design: sign in or sign up, a home screen with a to-do block (only when there is something to do) above "My competitions", browsing and joining competitions (also through an invite link or QR code), the competition drill-down without other fighters' warnings, approving or objecting to your own bouts, approving bouts you refereed, and a profile with language. Admins get the other half: sign-ups to accept in "Needs you", and approval, place limit and invite link in Settings. Laptop sidebar, phone bottom tabs, dark theme, English and Dutch.

**Architecture:** Same shape as the admin app: a typed API client, a path router, a layout shell and screens that map API data onto `packages/ui` views, with pure mappers unit-tested in Node. The home screen is a list of **home blocks** chosen by the shell (to-do, my competitions), so a tournament mode can later put its own "now relevant" blocks there without touching the views. The backend gets participant status, self sign-up, invite codes and fighter-safe reads; the privacy rules (warnings, objection reasons) are enforced by the **server**, not just hidden in the UI.

**Tech Stack:** Vite app (vanilla TS), custom elements from `@hema/ui`, Vitest (Node for mappers/client/domain, browser mode for views), Fastify backend tests, one small QR-code library.

**Spec:** `docs/superpowers/specs/2026-10-19-competition-admin-design.md` §3, §4.3, §4.3a, §4.4, §4.9, §4.10, §7.

## User decisions (2026-10-20)

- The participant app **replaces `apps/competition`** (same folder and dev command; the old Sheets-era code goes).
- **Home:** to-do if there is any, then my competitions. Later, tournament mode may show other views first.
- **Joining:** browse joinable competitions **and** invite link / QR code.
- **Approval of sign-ups:** a competition setting, **off by default**; when on, sign-ups wait in the admin's "Needs you".
- **Invite link without an account:** short sign-up on the spot, then enrolled in one go; the invite lets them past the scope check.
- **Visibility:** fighters see standings and every fighter's bouts and exchanges, but **warnings only on their own bouts**; an open objection shows as "under review" without the reason to anyone outside the bout.
- **Leaving:** a fighter can leave **any time**; their bouts stay in the history.

## Scope calls (Claude's, for the user to check)

- **Joinable** means: status Registration open **or Running** (competitions run for years, so people join along the way), the fighter's club fits the scope (spec §9: no club → only Open), not full, and not already in. Archived, Closed and Draft are never joinable.
- **Participant status:** `ACTIVE`, `PENDING` (waiting for admin approval) or `LEFT`. Only `ACTIVE` fighters can be picked for new bouts in the score-keeper and count as "both enrolled" for a bout. A fighter who left keeps their row in the standings marked "left" (their bouts still shaped the ratings) and can join again later, which makes them `ACTIVE` again (or `PENDING`).
- **Declining** a sign-up removes the pending row; the fighter can try again.
- **One invite code per competition**, shown in Settings as a link and a QR code; the admin can make a new code, which stops the old link. The link works while the competition is joinable (scope aside).
- **Place limit** counts `ACTIVE` and `PENDING` fighters. Empty means no limit.
- **QR code:** drawn in the browser with `qrcode-generator` (MIT, no dependencies, ~20 kB). No QR images are stored.
- **To-do for a fighter:** bouts in their three days that they haven't approved (Approve / Object), their own open objections (Withdraw), and bouts where they are the referee and haven't approved yet (Approve). Sorted oldest first.
- **Not in this phase:** bout chat, board and web push (phase 8), media consent and links (phase 9), password change (only the existing reset flow), editing the profile name or club (language only).
- Old views only `apps/competition` used (`competition-selector-view`, `ranking-view`, `bouts-view`, `participants-view`, `new-bout-view` …) stay in `packages/ui` for now; removing them is a later cleanup once the score-keeper is checked.

## Global Constraints

- Work on `master`; commit only when the user asks. Bash, not PowerShell. Backend tests never open `data/dev.db`; browser checks run on a seeded **copy** (`.superpowers/verify/`).
- Views follow phase 4 conventions (data in, events out, frame built once, delegated listeners, escaped data, EN/NL via `t()`, `:host([hidden])` respected). Numbers from stored JSON are coerced before reaching HTML (phase 6 lesson).
- The API client shares one token refresh between parallel requests (phase 6 lesson).
- Layout: sidebar at ≥ 900px, bottom tabs below (Home · Competitions · Profile). Phone first.

## Review Focus

- A fighter never receives another fighter's warnings or an objection reason for a bout they're not in, from any endpoint they can call. → Task 3 tests `fighter view hides others' warnings`, `objection reason only for those involved`.
- Scope is enforced on sign-up by the server; an invite code is the only way past it. → Task 2 test `sign-up outside scope is refused unless invited`.
- A `PENDING` or `LEFT` fighter can't be put in a new bout and doesn't make a bout count in that competition. → Task 2 test `only active fighters can fight`.
- Place limit and approval setting can't be bypassed by two sign-ups at once. → Task 2 test `last place taken once` (transaction).
- With nothing to do, the home screen shows no empty to-do block. → Task 6 test `no to-do block when empty`.

---

### Task 1: Domain — scope check

- [ ] `packages/competition-domain`: `scopeAllows(scope, club | null): boolean` — OPEN allows everyone; CLUB/CLUBS match club id or slug; AREA matches the club's area (case-insensitive, trimmed); COUNTRY matches the ISO code; no club → only OPEN. Tests first.

### Task 2: Backend — participant status, sign-up, invites, approval

- [ ] Migration 14: `CompetitionParticipant.status` (`ACTIVE` default) and `joinedAt`; `Competition.signupsNeedApproval` (default 0), `Competition.placeLimit` (nullable), `Competition.inviteCodeHash` (nullable). Existing participants become `ACTIVE`.
- [ ] `POST /api/v1/competitions/:id/signup` `{ inviteCode? }` → `{ status }`: checks joinable, scope (skipped with a valid code), place limit and approval inside one transaction; re-joining after `LEFT` reuses the row.
- [ ] `DELETE /api/v1/competitions/:id/signup` → `LEFT` (or removes a `PENDING` row).
- [ ] `GET /api/v1/invites/:code` (no login): competition id, name, status, date, joinable.
- [ ] Admin: `POST /api/v1/competitions/:id/invite` (new code, returned once), `PATCH` accepts `signupsNeedApproval` and `placeLimit`, `POST /api/v1/competitions/:id/participants/:participantId/decision` `{ accept: boolean }`; "Needs you" gains `signups[]`.
- [ ] Only `ACTIVE` fighters: bout competition options, `competitionsForBout` enrolment input, standings rows marked `left`.
- [ ] Tests: sign-up inside/outside scope, invite bypass, approval on/off, place limit (incl. two at once), leave and re-join, decline, only active fighters can fight, needs-you sign-ups.

### Task 3: Backend — fighter's home data and fighter-safe reads

- [ ] `GET /api/v1/me/home` → `{ todo: { toApprove[], myObjections[], toReferee[] }, competitions[] }` (my competitions with my status, rank, rating, last change) and `GET /api/v1/me/joinable` (joinable competitions for me).
- [ ] `GET /api/v1/competitions/:id/bouts/:boutId/view` for anyone who may see the competition: bout detail with exchanges; warnings removed unless the viewer fought in, officiated or administers the bout; objection reason only for those involved.
- [ ] Standings for non-admins: `warnings` only on the viewer's own row (others `null`).
- [ ] Tests for each, including the two privacy tests in Review Focus.

### Task 4: UI views

- [ ] `todo-list` (items: kind, bout seal, opponent, age, actions as events `todo-approve`, `todo-object`, `todo-withdraw`, `todo-referee-approve`), `my-competition-list` (my rank/rating/status chip; event `competition-selected`), `join-card` (competition summary, scope line, place info, Join/Leave buttons, pending state; events `join-requested`, `leave-requested`), `invite-share` (link, copy button, QR code via `qrcode-generator`). Stories, browser tests, EN/NL texts.
- [ ] `participant-table` gains a "left" chip; `participant-table` / `fighter-history` / `bout-details` already hide warnings without `show-warnings` — the participant app passes it only on the fighter's own data.

### Task 5: Admin app — sign-ups and invite

- [ ] Needs you shows sign-ups (accept / decline). Settings: "Sign-ups need my approval" switch, place limit, invite link + QR with "Make a new link". Mapper tests.

### Task 6: Participant app — foundation and home

- [ ] Remove the old `apps/competition/src` (Sheets, Google sign-in, mock data) and its unused dependencies; keep the GitHub Pages 404 script.
- [ ] Client (shared refresh), router, shell (sidebar / bottom tabs), sign in, sign up (name, username, password, club, language), invite landing (`/join/:code`: sign in or sign up, then join).
- [ ] Home from home blocks: to-do (hidden when empty) then my competitions; empty state points to Competitions. Mapper tests incl. `no to-do block when empty`.

### Task 7: Participant app — competitions, bouts, profile

- [ ] Competitions: joinable list with `join-card`; join/leave; pending state.
- [ ] Competition page: standings → fighter → bout drill-down (reused views; warnings only on own bouts), my bouts first on my own fighter page.
- [ ] Bout actions: approve, object with reason, withdraw objection, approve as referee (reuse `bout-approval-view` where it fits).
- [ ] Profile: name, club, language switch, sign out.

### Task 8: Browser check, cleanup, review

- [ ] Seed copy DB; as a fighter: sign up through an invite link, join a scoped competition, approve one bout, object to another; as admin: accept a pending sign-up, make a new invite link. Phone and laptop screenshots, Dutch once.
- [ ] Full `npm test`, typecheck, builds; opus final review; fix Critical/Important with TDD; ledger the rest.

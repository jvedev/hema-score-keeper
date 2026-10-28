# Agent session context

This is the concise, repository-owned handoff for an AI agent starting a new session. Read it first, then follow the linked source documents for details. Keep it current whenever project direction or the resume point changes.

## Repository and collaboration

- This is the HEMA Score Keeper monorepo: several apps, shared packages, and a backend.
- Work directly on the current user-selected branch. The user commits changes unless they explicitly request a commit.
- Ask questions one at a time. For large work, agree on the plan for the current phase before implementing it.
- The user wants work and decisions captured continuously, not reconstructed from a long conversation later. Update the relevant notes as decisions and results happen, and leave an explicit resume point before ending a session.

## Current project: tournament mode

The approved design is [`specs/2026-10-25-tournament-mode-design.md`](specs/2026-10-25-tournament-mode-design.md). Phases 1–3 are complete. Phase 4 fighter phones is approved and in progress on `co-pilot`; read [`plans/2026-10-28-tournament-fighter-phones.md`](plans/2026-10-28-tournament-fighter-phones.md) and `.superpowers/sdd/2026-10-28-tournament-fighter-phones/progress.md`.

Phases 1–3 are complete. The phase-4 plan has been approved and implementation is underway on `co-pilot`.

### Product direction and decisions to preserve

- Live tournament play is served from the backend's SQLite database. It must work over the venue's local network without internet.
- The spreadsheet is used to import participants/schedule and as a backup/mirror, not as the live communication layer between apps. The user chose sheet mode first; database mode is later.
- Every exchange is stored on the backend. A different score-keeper must be able to take over during a bout; the scoreboard is a read-only display driven by backend state.
- Tournament planning/bracket advancement remain outside the apps for now. The spreadsheet computes advancement, and a person re-imports it.
- The score-keeper must be signed in. Ring and scoreboard links have different permissions; the scoreboard is public/read-only.
- Wrong scores and holdups are explicit anti-goals. Prioritize recoverability, data integrity, and clear sync/connection status.
- Do not read `apps/backend/src/google-sheets.ts` or `packages/sheets-client` for this tournament work. The user explicitly excluded the legacy Google Sheets integration.

## How to use the Superpowers project artifacts

- `docs/superpowers/specs/`: approved product/design decisions and durable rationale.
- `docs/superpowers/plans/`: phase plans; use the current plan's status/next section as the resume point. Get approval for each substantial phase before building.
- `.superpowers/brainstorm/`: working brainstorm material and mockups; consult only when relevant to the active design.
- `.superpowers/sdd/<phase>/`: detailed task briefs, progress ledger, implementation/review reports, and verification notes. Some of this is git-ignored; it is useful during execution but must not be the only home for important lasting decisions.
- `.superpowers/verify/`: scripts and artifacts for manual or browser verification. Inspect scripts before running them, especially anything that starts/stops services or touches local data.
- Treat the relevant `.superpowers/` files as project working memory, not as disposable noise: read the active phase's ledger and task/review reports when continuing its work. Because some files are ignored or untracked, promote important decisions, results, unresolved risks, and resume points into tracked docs.
- `.claude/skills/`: task-specific workflows and generators. Use relevant skills as guidance, but check their file paths, commands, stack assumptions, and scripts against the current repository. Some instructions are stale or mismatched.

## Capture work continuously

As work proceeds, record:

1. User decisions and changed requirements in the tracked spec (or the relevant tracked design document).
2. Scope, tasks, dependencies, and acceptance checks in the phase plan.
3. Implementation steps, commands/results, review findings, unresolved issues, and the next exact action in the phase's `.superpowers/sdd/<phase>/progress.md`.
4. At phase completion, a concise final status and resume point in the tracked plan's **Status / next** section. Do not leave the only record in chat, an untracked scratch file, or Claude's external memory.

Before any work, inspect `git status`; preserve unrelated user changes. In particular, a modified local database may be user data and must not be overwritten or committed without explicit permission.

## Current resume point

Read `docs/superpowers/plans/2026-10-28-tournament-fighter-phones.md` and `.superpowers/sdd/2026-10-28-tournament-fighter-phones/progress.md`. The fighter portal, explicit same-name identity resolution, account-scoped API, admin linking, and Web Push/outbox are implemented. Remaining phase-4 work is final broader verification and any manual HTTPS/browser/device checks. Preserve pre-existing `apps/backend/data/dev.db` and `package.json` changes.

This handoff was created on 2026-10-28. If the repository's plans or commit history have moved on, trust the newer repository evidence and update this file rather than following stale status here.

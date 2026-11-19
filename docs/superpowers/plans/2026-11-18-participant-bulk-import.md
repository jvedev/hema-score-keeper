# Participant Bulk Import Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement and track the steps below.

**Goal:** Restore safe bulk participant entry in the tournament workspace.

**Architecture:** Extend the existing participant form and use the existing user, entry and event APIs. Refresh after partial writes, retaining names on failure so a retry can safely reuse entries.

**Tech Stack:** TypeScript, web components, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-participant-bulk-import-design.md`

## Global Constraints

- No spreadsheet or file import, package installation, database reset, or commits.
- Preserve unrelated working-tree changes and the existing Phase 4 functionality.

## Review Focus

- Case-insensitive duplicate names and existing tournament entries must not create duplicates.
- A failure after a successful write must leave input available and allow a safe retry.
- Switching tournament during an import must not display results or errors in the new tournament.
- Blank lines and whitespace must not create users.
- A double submission must not start a second import.

### Task 1: Bulk participant entry

**Status:** Implemented; UI suite (320 tests), typecheck and the real-backend browser scenario described below passed. Independent review identified input loss on tab switch; fixed with a regression test.

**Real-backend browser check:** Added the missing individual-event GET route and corrected the client to send the required `name` alongside `username`. Edge against an isolated seeded backend verified new users, duplicate input, an injected failure on the second entry, retained input and retry without duplicate entries. UI suite: 320 passed; workspace typecheck passed. User listing and creation require system or competition administrator permissions.

**Files:** Modify `packages/ui/src/components/tournament-workspace-view/tournament-workspace-view.ts`, its adjacent test file, and `packages/ui/src/i18n/messages/en.ts` and `nl.ts`.

- [x] Add behavioral tests for multiline entry, existing users and entries, duplicate/blank names, volunteer policy, cancellation, partial failure and retry, double submission, and changing tournaments during a request.
- [x] Run `npm test --workspace @hema/ui -- src/components/tournament-workspace-view/tournament-workspace-view.test.ts`; confirm the new tests fail because bulk import is missing.
- [x] Implement a bulk form with preserved input, localized labels and error reporting; use existing APIs sequentially and refresh after partial writes. Guard asynchronous updates against tournament changes.
- [x] Run the targeted tests, full UI suite and `npm run typecheck`; fix failures without weakening assertions.
- [x] Update `docs/superpowers/agent-session-context.md` and the Phase 4 plan with results and outstanding work.
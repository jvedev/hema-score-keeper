# Agent instructions

This file is the single source of truth for every AI coding agent in this repository
(GitHub Copilot, Claude Code, and others). Tool-specific files only point here:

- `CLAUDE.md` — imports this file for Claude Code.
- `.github/copilot-instructions.md` — points GitHub Copilot here.

Put shared rules in this file, not in the tool-specific files, so all agents behave the same.

# Repository workflow

- Work directly on the current user-selected branch. Do not create, switch, or rename branches unless explicitly requested.
- Do not commit or push unless the user explicitly asks for it.
- Before any work, inspect `git status` and preserve unrelated working-tree changes. A modified local database may be user data; never overwrite or commit it without explicit permission.
- Ask for permission before installing npm packages.
- On Windows, run scripts and checks with Bash (Git Bash), `cmd.exe`, Node.js, or Python; do not use PowerShell or PowerShell scripts.
- Do not run broad service stop/kill scripts without checking their exact effects first.
- Database schema: `apps/backend/src/schema.ts` is the single baseline (version in `PRAGMA user_version`). Until the first production release, change the schema by editing that file (and `BackendDatabase` in `src/db.ts`), then recreate the dev database with `npm run backend:db:reset`; do not add migrations or repair code. Real migrations keyed on `user_version` come only once production data must be kept.

# Current work and resume point

- Start with `docs/superpowers/agent-session-context.md`: project summary, decisions to preserve, and the current resume point. Do not rely on status lines elsewhere being up to date.
- Approved tournament-mode design: `docs/superpowers/specs/2026-10-25-tournament-mode-design.md`.
- Phase plans live in `docs/superpowers/plans/`; read the active plan's "Status / next" section before continuing it.
- Spreadsheet mode is dropped (user decision 2026-11-17): SQLite is the only source of truth. Do not add new Google Sheets/xlsx functionality. The removal work is planned in `docs/superpowers/plans/2026-11-17-remove-spreadsheet-mode.md`; reading the spreadsheet code is allowed only to remove it.
- Nothing is in production yet: no data, schema migrations, or API compatibility needs to be preserved between commits unless the user says otherwise. The local development database may be discarded and reseeded.

# Working with plans and session context

- Ask clarifying questions one at a time. For multi-phase work, plan and review one phase at a time; do not continue into later phases without agreement.
- Record decisions, progress, test results, open issues, and the precise next step as they emerge. Do not rely on chat history or an agent's machine-local memory to preserve project state; other people and other agents must be able to continue from the repository alone.
- Put lasting design decisions in the tracked spec, and phase scope/status/next steps in the tracked plan.
- `.superpowers/` is git-ignored, local working memory (brainstorms, SDD ledgers, task reports, verification notes). Use it when it exists in your checkout, but it will be missing for colleagues: always copy important conclusions into tracked docs under `docs/superpowers/`.
- Before finishing a work session, update the relevant progress/status documents with what changed, what was verified, unresolved concerns, and where to resume.

# Skills

- Shared, task-specific skills live in `.claude/skills/<name>/SKILL.md` (with optional `scripts/`). Claude Code and GitHub Copilot (VS Code agent mode) both discover skills there; keep a skill in this one location only — do not duplicate it under `.github/skills/`.
- Skill scripts are plain Node.js (`.mjs`) so they work from any agent and shell.
- Follow current repository code and package scripts over stale or mismatched skill instructions. Verify paths, frameworks, and commands before using them.

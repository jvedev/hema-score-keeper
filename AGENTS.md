# Repository workflow

- Work directly on `master`; do not create or rename branches unless the user explicitly requests it.
- Keep completed work consolidated into one working `master` branch.
- Don't commit changes to `master`; this will be done by the user.

# Current work: tournament mode

- Start with `docs/superpowers/agent-session-context.md` for the project summary, current status, and how to resume.
- Approved design: `docs/superpowers/specs/2026-10-25-tournament-mode-design.md`.
- Latest phase plan/status: `docs/superpowers/plans/2026-10-28-tournament-bout-format.md`; read its "Status / next" section first.
- Phases 1–3 are complete; the latest phase commit is `885e6be`. Verify the current Git state rather than assuming whether it has been pushed.
- Next is phase 4 (fighter phones): prepare a short plan and get the user's approval before implementation.
- Do not read `apps/backend/src/google-sheets.ts` or `packages/sheets-client` for tournament mode; the user explicitly asked to keep that legacy integration out of scope.

# Working with plans and session context

- Ask clarifying questions one at a time. For multi-phase work, plan and review one phase at a time; do not continue into later phases without agreement.
- Record decisions, progress, test results, open issues, and the precise next step as they emerge. Do not rely on chat history or Claude's machine-local memory to preserve project state.
- Put lasting design decisions in the tracked spec, and phase scope/status/next steps in the tracked plan. Use `.superpowers/sdd/<phase>/` for detailed task briefs, execution ledgers, and review evidence; copy important conclusions back into tracked docs so they survive outside this checkout.
- Use relevant `.superpowers/` brainstorms, SDD ledgers, task reports, and verification notes as working memory when available; they often contain useful detail that does not fit in the concise handoff. Check whether these files are ignored or untracked before relying on them as the only durable record.
- Before finishing a work session, update the relevant progress/status documents with what changed, what was verified, unresolved concerns, and where to resume.
- Follow current repository code and package scripts over stale or mismatched instructions in `.claude/skills`. In particular, verify paths, frameworks, and commands before using them.
- Do not run broad service stop/kill scripts without checking their exact effects first.

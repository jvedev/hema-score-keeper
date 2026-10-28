# Copilot instructions

Before repository work, read [`AGENTS.md`](../AGENTS.md) and [`docs/superpowers/agent-session-context.md`](../docs/superpowers/agent-session-context.md). Those files contain the workflow, project decisions, and current resume point.

For tournament-mode work, read the approved design and the latest phase plan before proposing or changing behavior. Ask the user to approve a plan before starting a new substantial phase. Ask questions one at a time, and record decisions, progress, verification results, open concerns, and the next step in the repository as work happens.

Use relevant `.superpowers/` brainstorms, phase ledgers, task reports, and verification notes as working memory when available. They may contain useful implementation context absent from the concise tracked handoff. Promote important decisions and outcomes into tracked docs because some `.superpowers/` files are ignored or untracked.

Preserve unrelated working-tree changes. Normally work on `master` and do not commit unless the user explicitly requests a branch or commit. Do not read `apps/backend/src/google-sheets.ts` or `packages/sheets-client` for tournament-mode work.

Treat `.claude/skills/` as potentially useful task-specific guidance, not unquestionable authority: verify its paths, scripts, and technology assumptions against the current repository before applying them.

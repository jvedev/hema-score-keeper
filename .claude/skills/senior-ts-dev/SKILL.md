---
name: senior-ts-dev
description: "Use this skill for ANY TypeScript implementation work — writing new modules, refactoring, fixing bugs, or reviewing code. Enforces senior-level engineering standards: SOLID principles, testable/clean code, and strict typing, using Jest for testing. Trigger whenever the user asks to write, modify, or review .ts/.tsx code, add a feature, fix a bug, refactor a module, or improve code quality — even if they don't explicitly mention SOLID, clean code, or testing."
---

# Senior TypeScript Developer

You are operating as a top-of-the-bill senior TypeScript engineer. Every piece of code you write is expected to be production-grade: typed, tested, documented, and structurally sound. Speed matters, but not at the cost of correctness — you offload the repetitive verification work (docs, tests) to subagents so you can stay focused on the actual engineering decisions.

## Stack assumptions (this repo)

- **Language:** TypeScript, `strict: true` always. Never weaken `tsconfig.json` to make an error disappear.
- **Test runner:** Jest, run via `npm test` (workspace-aware: `npm run test --workspaces --if-present`). Test files live alongside source as `*.test.ts`, e.g. `packages/mcp-server/test/query-validation.test.ts`.
- **Build/dev:** `packages/mcp-server` and `packages/backend` build with plain `tsc` (`npm run build` / `npm run check` for `tsc --noEmit`) and run in dev via `tsx watch`. `packages/pwa` is the exception and uses Vite (`npm run dev:pwa`, Vite build). Don't introduce a second bundler or dev server in any package.
- **Imports (the IDE linter flags "import can be shortened" otherwise):**
  - **Tests import from the package's public entry**, `../src`, not from the individual file (`../src/crypto.js`). Tests run through ts-jest as CommonJS, so the directory import resolves to `src/index.ts`. This also keeps tests on the public API. Only reach into a specific file for something deliberately not exported from `index.ts`.
  - **One import statement per module.** Merge `import { a } from "../src"; import { b } from "../src";` into `import { a, b } from "../src";`. Type-only names go in the same statement as `type X`.
  - **Source files under `src/` keep explicit relative file paths with `.js`** (`./crypto.js`). The build is ESM with `NodeNext`, where `./` or `./index` without an extension does not resolve at runtime. Never "shorten" these.
  - Other workspace packages are always imported by package name (`@nova/bitwarden`), never by relative path into their `src`.
- **Package manager:** npm workspaces. Use `npm run <script>`, `npm run <script> --workspace=<name>`, `npm test` — never assume yarn/pnpm lockfiles.

## Core principles (non-negotiable)

### SOLID
- **S**ingle Responsibility — one reason to change per class/module/function. If a function's name needs "and" to describe it, split it.
- **O**pen/Closed — extend via new implementations/composition, not by editing working logic with more `if` branches. Favor strategy objects, discriminated unions, or dependency injection over switch-on-type sprawl.
- **L**iskov Substitution — subtypes (or interface implementations) must be usable anywhere the base type is expected, without surprising behavior.
- **I**nterface Segregation — small, focused interfaces. Don't force a consumer to depend on methods it doesn't use.
- **D**ependency Inversion — depend on abstractions (interfaces/types), not concrete implementations. Inject dependencies (constructor injection or factory functions) rather than reaching for singletons or `new`-ing concrete classes deep inside logic.

### Clean code
- Descriptive names over comments explaining *what* code does. Comments explain *why*, not *what*.
- Small functions (roughly <20 lines as a smell threshold, not a hard rule) that do one thing.
- No magic numbers/strings — named constants or enums.
- Fail fast: validate inputs at boundaries, use TypeScript's type system to make illegal states unrepresentable rather than defensive runtime checks everywhere.
- Avoid `any`. If a type is genuinely unknown, use `unknown` and narrow it.
- Prefer pure functions and immutability (`readonly`, `as const`) where practical; isolate side effects (I/O, network, DOM) behind thin boundaries.

### Testable by construction
- Write code so that dependencies can be substituted in tests (constructor/param injection) without needing to mock modules with `jest.mock()` gymnastics.
- Every new function/class should be testable in isolation. If it's hard to test, that's a design smell — restructure before writing the test, don't reach for excessive mocking to paper over it.
- No hard coverage percentage is enforced — the bar is "is this testable and meaningfully tested," not a number.

### Reuse before writing, but no `utils` lib
- **Search before writing a helper, interface or constant.** Grep `ts/libs/*/src` and `ts/tools/*/src` for existing functionality (same name, same idiom, same purpose) before adding it. Reuse it when it exists and its owner is the right dependency.
- **Extract on the third copy**, when the logic is non-trivial and the copies would change for the same reason. Put it in the lib that owns that responsibility, or a new lib named after the responsibility. Ask the user before creating a new lib, because it changes the package layout of spec §6.1.
- **Never a `utils`, `common`, `shared` or `constants` lib.** It has no single responsibility, every package ends up depending on it, and a change ripples into all of them. A constant lives with the code that gives it meaning (`REDACTED` belongs to `@nova/logging`) and is imported from there.
- **Intentional duplication stays.** Small structural interfaces such as `KekLogger` or `Clock` are copied on purpose so a lib states what it needs without depending on another lib (Interface Segregation, Dependency Inversion). Do not "deduplicate" them into a shared package.

## Workflow for every task

1. **Understand the change.** Read the relevant existing code and types before writing anything. Check for existing patterns/conventions in the repo (see the root `CLAUDE.md`) and follow them unless they conflict with the principles above (flag conflicts to the user rather than silently overriding established repo conventions).
2. **Design before typing code.** Briefly identify: what's the single responsibility here, what should be injected vs. constructed internally, what's the public interface.
3. **Implement.**
4. **Delegate verification, don't do it yourself:**
   - After writing or changing a module, delegate to the **`tester`** subagent (see `.claude/agents/tester.md`) to write/run Jest tests for it and report back only failures or gaps. Don't manually re-derive test files yourself if the subagent is available — that's what it's for.
   - Delegate to the **`documenter`** subagent (see `.claude/agents/documenter.md`) to add JSDoc to exported symbols and update the relevant module's README. Do this in parallel with testing when possible — they don't depend on each other.
   - Once the module is implemented and the tester reports green, delegate to the **`reviewer`** subagent (see `.claude/agents/reviewer.md`) to review the diff for SOLID violations, coupling, missing types, drift from repo conventions, and duplication of functionality that already exists in another lib (see "Reuse before writing"). Run it after tests pass, not instead of them — the reviewer only reads code, it doesn't run anything to confirm behavior.
5. **Review subagent reports.** If the tester reports failures, fix them in the main thread (don't just re-delegate blindly — you need the context of what broke). If the documenter flags something unclear, clarify the implementation or naming, since unclear code is a smell, not just a docs problem. If the reviewer reports findings, fix them yourself in the main thread (you have the design context; don't blindly re-delegate the fix) — unless a finding is a genuine judgment call, in which case surface it to the user instead of guessing.
6. **Don't manually re-run the full test suite** after every micro-edit — the `PostToolUse` hook (see `.claude/hooks/run-related-tests.sh`) already does this for you automatically and will surface failures without you needing to ask. Trust it; don't duplicate the work. Note: this repo also excludes live tests (`test:live`) from `npm test` — don't run those from the hook or on every edit.

## When reviewing existing code

Delegate to the **`reviewer`** subagent (see `.claude/agents/reviewer.md`) rather than reading the whole diff yourself — pass it the files or the "review the current diff" instruction. It flags violations of the above (SRP violations, tight coupling, missing types, untestable singletons, `any` usage) concretely — specific lines and the concrete downside (e.g., "this can't be unit tested without hitting the real DB because `UserService` constructs its own `PrismaClient` internally"), not just principle names. Act on its findings yourself; it only reports, it doesn't fix.

## Delegation is for speed, not avoidance

The point of the subagents and hooks described here is to keep your (the main agent's) context window clean and your attention on the actual design/logic decisions — not to skip rigor. If a subagent's tools aren't available in the current environment, do the documentation and testing work yourself inline rather than skipping it.

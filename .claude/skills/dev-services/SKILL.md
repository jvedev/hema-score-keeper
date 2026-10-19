---
name: dev-services
description: >
  Reliably stop, start, and health-check this repo's dev services and run the
  test suite against a freshly (re)started stack, using a single Node script
  instead of ad-hoc netstat/taskkill commands. Services are auto-discovered
  from the npm workspaces (any package with a dev/start script that binds a
  network port) - no hardcoded list to maintain. Use before editing any
  TypeScript file under a workspace package's src/ (stop the running services
  first so a stale connection or a code change doesn't leave a
  half-restarted, hung process), and whenever asked to run or verify tests
  against a live stack.
---

## Why this exists

Manually juggling `netstat`/`taskkill` for a multi-service dev stack goes
wrong in specific, recurring ways: killing only a `cmd.exe`/npm wrapper PID
and leaving the actual `node`/`tsx` process running as an orphan; restarting
one service before another it depends on at startup is actually ready (e.g.
this repo's backend opens an SSE connection to mcp-server at startup and
crashes if it isn't up yet); or checking too early and reading a
still-booting service as a failure. This skill wraps all of that in one
script so restarts are always done the same, correct way - and it discovers
what to manage itself instead of relying on a list someone has to keep in
sync with the repo.

## Required workflow

- **Before editing** a `.ts` file under any workspace package's `src/`
  (`packages/mcp-server`, `packages/backend`, `packages/pwa`, ...): run `stop`
  first.
- **After the edit**, to verify it: run `test` (starts everything fresh, waits
  until each service is actually healthy, then runs the fast `npm test` suite)
  — or `start` alone if you just need a live stack up for manual/browser
  verification (e.g. via the Browser tool) rather than the jest suite.
- Services are left running after `test`/`start` — there's no automatic
  teardown, so you can immediately poke the running stack afterward.

```bash
node .claude/skills/dev-services/scripts/manage.mjs stop      # force-stop every discovered service
node .claude/skills/dev-services/scripts/manage.mjs start     # start whichever aren't already healthy, wait until ready
node .claude/skills/dev-services/scripts/manage.mjs restart   # stop then start
node .claude/skills/dev-services/scripts/manage.mjs test      # start (as above) + npm test, services left running
node .claude/skills/dev-services/scripts/manage.mjs status    # read-only report, touches nothing
```

## How service discovery works (no hardcoded list)

For every directory matched by the root `package.json`'s `workspaces` globs,
the script:

1. Reads that package's own `package.json` and picks a `dev` script if it has
   one, else `start`. No such script → not a service, skipped.
2. Best-effort scans that package's `vite.config.ts` and top-level `src/*.ts`
   files for a literal `.listen(PORT)` (Express-style) or `port: PORT`
   (Vite-style) number. No port found → it's not a network service (e.g. a
   library's watch-build script with nothing to listen on) — skipped, not an
   error.
3. Anything left is a managed service. Its script string (e.g.
   `tsx watch src/server.ts`) is parsed and, on Windows, run by resolving that
   command's real JS entry point (via the package's own `bin` field, e.g.
   `tsx`'s `dist/cli.mjs`) and invoking it directly through `node.exe` — see
   "Why not just `npm run <script>`" below. POSIX systems, or a resolution
   that fails, fall back to plain `npm run <script> --workspace=<package
   name>`.

In this repo that currently resolves to `mcp-server` (:3001), `backend`
(:3000), and `pwa` (:5173); `@repo/ui`'s watch-build script has no port and is
correctly left alone. Add a fourth workspace package with its own dev server
later and this skill picks it up with zero changes.

## What it actually does

- **`stop`**: for each discovered service, finds every PID bound to its port
  (Windows: parses `netstat -ano`; POSIX: `lsof -ti`) and force-kills it — on
  Windows via `taskkill /F /T /PID` (`/T` kills the whole process tree, not
  just the top-level wrapper, which is exactly the orphan-process failure
  mode this replaces). No identity check on the process — these are dev-only
  ports for this project, so whatever's on them gets stopped, no exceptions.
- **`start`**: for each service (in parallel, no fixed order — see below),
  first checks if it's *already* healthy (skips it if so — idempotent, never
  double-spawns). If the port is occupied but unhealthy (a stuck/zombie
  process), it stops that one service and starts fresh. Otherwise spawns it
  detached (survives after this script exits) with stdout/stderr redirected
  to a log file under `<os tmpdir>/quick-mcp-test-dev-services/<name>.log`,
  then polls a real readiness check (`GET /health` if the service answers it,
  falling back to a plain TCP/HTTP probe otherwise) up to a timeout.
- **No fixed start order, self-healing retries instead**: rather than
  hardcoding "mcp-server before backend", services start concurrently. If one
  crashes because a service it depends on isn't up yet, it's retried (up to 3
  attempts, 2s apart) — by the next attempt the dependency has usually
  finished starting. This is what makes discovery genuinely generic: the
  script never needs to know *which* services depend on *which*.
- **`test`**: `start` (as above), then runs `npm test` from the repo root with
  output streamed live, and leaves the stack running afterward.
- **`status`**: same readiness probes as `start`, but read-only — reports
  `klaar` / `bezet maar ongezond` / `niet actief` per discovered service
  without touching anything.

## Why not just `npm run <script>` (Windows console windows)

Started services must run detached and hidden (no visible window — they're
meant to sit in the background). That's harder than it sounds on Windows,
because `windowsHide`/`CREATE_NO_WINDOW` only suppresses a console for the
*one process this script spawns directly* — not for anything that process
goes on to spawn itself:

- `npm` on Windows is `npm.cmd`, a batch file, which needs its own `cmd.exe`
  to interpret. That nested `cmd.exe` has no console to inherit from a
  hidden parent, so Windows opens it a fresh, visible one.
- Even routing around `npm.cmd` by running npm's own JS CLI directly through
  `node.exe` isn't enough: npm's *internal* implementation of `npm run
  <script>` itself shells out to `cmd.exe` again to execute the script
  string — same problem, one level deeper.

The only way to have zero unhidden processes anywhere in the chain is to
never hand a script string to anything that might shell out on our behalf:
parse the script's command ourselves and run its real JS file directly
through `node.exe` (see `buildSpawnPlan`/`resolveBinEntry` in `manage.mjs`).
`npm run` is still used as a fallback when that resolution isn't possible,
and for the foreground `npm test` step in `test` — that one inherits this
script's own (real, visible) console instead of being hidden, so the nested
`cmd.exe` layers there have a console to inherit and never pop a new one.

## Notes

- `npm test` itself (the fast jest suite) is fully mocked and doesn't need any
  of these services running — the value here is a safe, deterministic restart
  loop for verifying against the *live* stack (manual/browser checks, or the
  opt-in `test:live` suite), not a hard jest dependency.
- For the opt-in live test suite's own *preconditions* (IBM i reachable) —
  a different concern from process lifecycle —
  see the `live-test-preflight` skill instead.
- Port detection is a best-effort source scan, not a guarantee: if a
  service's actual bound port ever diverges from what's literally written in
  its source (e.g. Vite falling back to another port because the configured
  one was still busy), the mismatch is exactly what `stop` (which frees the
  configured port first) is there to prevent in normal use — but a stray
  divergence would show up as "niet actief" in `status` even though something
  is running elsewhere.
- No cross-invocation lock file: this assumes one operator (you) driving the
  stack at a time, not multiple concurrent `stop`/`start` calls racing each
  other.

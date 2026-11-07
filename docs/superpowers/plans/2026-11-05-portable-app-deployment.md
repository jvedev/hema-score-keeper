# Portable local and Alwaysdata deployment

Status: approved; implementation complete, with Alwaysdata account verification deferred by the user.

## User decisions

- Support both local Windows hosting and Alwaysdata hosting from one codebase, with minimal environment-specific differences.
- Local mode runs on one Windows PC behind a Fritz!Box (router/Wi-Fi only), serving the apps and API to phones over the LAN.
- Core tournament scoring must work without internet. Web Push and phone tests are deferred until the end of the project.
- First deployment scope includes all five PWAs: `competition`, `competition-admin`, `score-keeper`, `event-admin`, and `tournament-admin`.

## Goal

Provide a repeatable production deployment in which one backend server serves the five built PWAs and the API from the same origin. On Windows, a user can start it through an executable without separately installing Node.js. On Alwaysdata, the same backend build runs as a managed Node.js site process. Environment configuration and platform-specific packaging may differ; application behavior and route structure should not fork.

## Research findings (2026-11-05)

- Alwaysdata documents Node.js sites started by a command, which must listen on the IP and port assigned to that site. The account selects a Node.js version. A User Program site is another HTTP deployment type.
- Alwaysdata supports SSH and npm package installation; account disk quota includes files and databases. Confirm Node >=22 availability, `better-sqlite3` installation, and resource limits on the actual account.
- The backend already starts local-sync and push workers in its server process, so the existing worker model fits one long-running Node site process, subject to resource limits.
- The repository builds five separate Vite apps. Fastify currently serves APIs but not frontend files. App route bases, static serving, and SPA history fallback must be added.
- Some admin apps expect explicit participant-app and score-keeper URLs; score-keeper's local `.env` defaults mock mode on. Production config must use same-origin relative API paths and real API mode.
- `DATABASE_URL` and `LIVE_DATA_DIR` must point to persistent locations outside replaceable release/build files.
- `better-sqlite3` is a native addon. Windows and Linux require platform-specific dependency installation/builds even if the source, app routes, and configuration contract are shared.
- An HTTP site opened on phones via a LAN IP is not a secure context for service-worker/Web Push features. The ordinary app and same-origin API can still be used over HTTP; local push/installation behavior is explicitly out of scope for this deployment phase.

Official references:

- [Alwaysdata Node.js configuration](https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/)
- [Alwaysdata user-program site](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-servers/user-program/)
- [Alwaysdata SSH](https://help.alwaysdata.com/en/docs/web-hosting/remote-access/ssh/)
- [Alwaysdata plan storage limits](https://help.alwaysdata.com/en/docs/admin-billing/billing/public-cloud-prices/)
- [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)

## Implementation tasks

1. **Done:** defined stable, non-overlapping URL prefixes for all five apps and kept the API at `/api/v1`; production builds use same-origin API paths and cross-app links.
2. **Done:** Fastify serves the built app assets and SPA deep links without shadowing API or health routes.
3. **Done:** added a reproducible Windows release folder containing all five frontend outputs, backend JS, production dependencies, a matching Node runtime, and a self-contained executable launcher.
4. **Done:** made the persistent data root configurable and separate from release files; documented secrets and manual backups.
5. **Done:** packaged and smoke-tested the Windows launcher, including native SQLite startup, LAN-root serving, and graceful shutdown.
6. **Documented; verification deferred:** Alwaysdata build, startup, bind variables, secrets, and persistent paths are documented. The user chose to postpone account verification and continue with the local Windows setup.
7. **Done for build/package checks:** verified all five app roots, deep links, assets, API route, packaged runtime, and launcher start/stop. A real Windows LAN/phone check is deferred with the project's other phone tests.

## Acceptance criteria

- All five PWAs and the backend API are served from one origin, under documented paths, without development servers or mock APIs.
- App-to-app links and deep links work on local Windows and Alwaysdata deployments using the same path contract.
- Local operation only requires launching the Windows executable/folder package and connecting phones to the same LAN; it does not require public router port forwarding or internet access for scoring.
- Database and live workbook data remain intact across app/package updates and server restarts.
- Alwaysdata runs the same application code with only deployment configuration and platform-specific dependency installation differences.
- HTTP LAN mode clearly documents that service workers/Web Push are unavailable there; deferring them does not break normal browser/API use.
- No production secrets or real tournament data are included in build artifacts or committed.

## Out of scope

- Real-phone acceptance testing and Web Push delivery/deep-link verification (deferred to project end).
- Automatic synchronization between local and Alwaysdata databases.
- Public router port forwarding for the venue server.
- Tournament feature changes unrelated to packaging, serving, or runtime configuration.

## Risks and open verification

- Node >=22 must be available on the target Alwaysdata account; verify before relying on hosting there.
- Native SQLite package installation/build may need account-specific build support on Alwaysdata.
- Actual venue-LAN reachability and firewall permissions need a target Windows network/device check.
- Serving all PWAs from one Fastify origin requires careful base-path and history-fallback handling; preserve the competition PWA's existing URLs where practical.
- Local data backups are manual; copy the persistent data directory while the server is stopped.

## Status / next

The user approved this scope on 2026-11-05. Code and documentation are implemented on the existing `co-pilot` branch; nothing was committed. `npm run package:windows` completed successfully and produced a versioned folder under ignored `artifacts/windows/`. That command built and verified the deployment outputs, installed Windows-native production dependencies, and tested the actual launcher starting and gracefully stopping the backend. The focused backend deployment tests (7 tests), backend typecheck, and `git diff --check` also passed. After the user clarified that they install packages themselves and the assistant must ask before any install, no further installs were run; `node scripts/package-windows.mjs --verify-only <package-directory>` was added and used to verify persisted SQLite data and the generated `AUTH_SECRET` across an actual launcher restart.

Alwaysdata account verification (Node >=22, Linux `better-sqlite3`, assigned `IP`/`PORT`, persistent storage, and worker limits) is explicitly deferred by the user. The desktop acceptance check has now passed: the user confirmed they can log in through the local app. The packaged server, static app routes, persistent data and secret across restart have also passed automated checks. LAN phone testing remains deferred until the project end, as do HTTPS/Web Push checks. The next proposed feature phase is in [`2026-11-06-database-mode-tournament-scoring.md`](2026-11-06-database-mode-tournament-scoring.md), awaiting approval. Do not use PowerShell for this machine. Ask before any npm package installation; do not install without approval.

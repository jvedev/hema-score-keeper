# Competition deploy

The four web apps and backend can run from one codebase in two ways: a Windows LAN package
for events, or a Node.js site on Alwaysdata. The production build uses the same fixed app
paths and same-origin API (`/api/v1`) in both places. The participant app can also be hosted
separately on GitHub Pages as described below.

## One-origin deployment: Windows LAN or Alwaysdata

| App | Path |
| --- | --- |
| Competition / fighter app | `/hema-score-keeper/competition/` |
| Competition administration | `/competition-admin/` |
| Score keeper and scoreboard | `/score-keeper/` |
| Event administration | `/event-admin/` |
| Backend API | `/api/v1/` |

Build all production apps and verify their roots, assets and deep links with
`npm run build:deployment`. The score-keeper mock API is disabled for this build.

### Windows venue package

On Windows x64, with Node.js >=22, npm and the .NET 10 SDK installed, run:

```text
npm run package:windows
```

The command builds the apps, packages a matching Windows Node runtime and native SQLite
dependencies, builds the self-contained launcher, and smoke-tests the packaged server. The
result is a versioned folder under `artifacts/windows/`; distribute or copy the complete
folder, not just the executable. Start `HemaScoreKeeper.Launcher.exe`. It serves all four
apps and the API on port 3001, opens the local root page, and prints LAN addresses for phones
on the same Wi-Fi. Set `HEMASCORE_PORT` before launch to use another port.

Allow inbound TCP on that port only for the Windows **Private** network profile if prompted
or if phones cannot connect. Do not configure public router port forwarding. This is HTTP on
the LAN: ordinary app/API use works, but service workers, installable PWA behavior and Web
Push requiring a secure context are not available. Real-phone and push acceptance tests
remain deferred.

Persistent files and generated `AUTH_SECRET` are stored in
`%LOCALAPPDATA%\HemaScoreKeeper`, separately from the versioned app package. Back up this
directory; do not remove it when updating the package. The launcher writes `server.log`
there. The bundled `README.txt` gives the command to create the first system administrator;
the password is requested interactively and is not included in the command line.
Set `HEMASCORE_DATA_DIR` before launch to use a different persistent data directory; keep the
same value between starts and backups.

On the first start the server creates the SQLite database (`dev.db` in the data directory)
from the baseline schema in `apps/backend/src/schema.ts`. Databases are not upgraded between
schema versions yet: a database made by an older build is refused at startup with a message
to recreate it. Until the first production release, move the old `dev.db` aside and start
again (this loses its data).

The package has passed automated checks for app roots, deep links, API availability, and
preserving a disposable database and generated secret across a launcher restart. For the
manual desktop check, use a throwaway data directory (do not point this test at tournament
data). Open **Command Prompt** (`cmd.exe`), change directory to the package folder, and run:

```text
set "HEMASCORE_DATA_DIR=%TEMP%\HemaScoreKeeper-desktop-check"
HemaScoreKeeper.Launcher.exe
```

In a second Command Prompt window, change to the same package folder and create the test admin:

```text
set "HEMASCORE_DATA_DIR=%TEMP%\HemaScoreKeeper-desktop-check"
CreateAdmin.cmd --username desktop-test --name "Desktop Test"
```

The command prompts for a password. Then open `http://127.0.0.1:3001/` on the PC, sign in
to the admin app, and verify that the apps load and the API is reachable. Close the launcher
with Ctrl+C when finished. LAN phone testing remains deferred until the planned final
device-testing phase.

### Alwaysdata

Use an Alwaysdata Node.js site (or User Program) with Node.js >=22 and a persistent writable
data directory. Deploy the repository to the account, then from its repository root:

```text
npm ci
npm run build:deployment
npm prune --omit=dev
```

Configure the site's start command as `npm run start --workspace @hema/backend` with the
repository root as its working directory. The server binds to Alwaysdata's provided `IP`
(or `HOST`) and `PORT`. Configure these environment variables in the site's environment,
not in committed files:

```text
APP_DATA_DIR=/home/<account>/data/hema-score-keeper
DATABASE_URL=file:./dev.db
AUTH_SECRET=<long-random-secret>
```

Create the data directory first and ensure the site user can write to it. The first start
creates the database there from the baseline schema; an existing database from an older
schema version is refused (move it aside to start with a fresh one). Keep the same
`APP_DATA_DIR` and `DATABASE_URL` across deployments so the SQLite database survives release
replacement. Set a stable random `AUTH_SECRET`
before the first use; changing it signs users out. Optional Web Push VAPID values are described in the
environment example, but are not required for local scoring.

Run the first administrator command from the repository root, with the same environment
variables as the server:

```text
npm run create-admin --workspace @hema/backend -- --username <username> --name "<Full name>"
```

It asks for a password interactively. Confirm that the actual Alwaysdata account supports
Node >=22, installs the native `better-sqlite3` dependency, and permits the existing
background workers within its resource limits. Those account-specific checks cannot be
verified from this repository. Open the site's HTTPS root page to reach all four apps.

The Windows package is built on Windows because `better-sqlite3` contains native code;
Alwaysdata installs Linux-native dependencies on its own platform. Source, app paths, and
application behavior are otherwise shared.

## Development database

`npm run backend:db:reset` (from the repository root) builds the backend, moves the current
database aside as `dev.db.bak-<timestamp>`, creates a fresh one from the baseline schema and
fills it with sample data. Stop the backend first. It uses the same `DATABASE_URL` and
`APP_DATA_DIR` as the server (default `apps/backend/data/dev.db`).
`npm run backend:db:seed` only replaces all data in the existing database with the sample data.
Until the first production release, schema changes edit `apps/backend/src/schema.ts` directly
and developers reset their database; there are no migrations.

## GitHub Pages: participant app only

The participant app (`apps/competition`) is also published as a static site at
`<origin>/hema-score-keeper/competition/`. It has no server of its own and needs a separately
hosted backend API.

## GitHub Pages

1. Go to **Settings → Pages** and use **GitHub Actions** as the source.
2. In **Settings → Secrets and variables → Actions → Variables**, set the backend API
   address, including `/api/v1`:

   ```text
   COMPETITION_API_BASE_URL=https://<your backend>/api/v1
   ```

   The workflow (`.github/workflows/deploy-competition-pages.yml`) passes it to the build as
   `VITE_API_BASE_URL` and stops with an error when it is missing.
3. Push to `master` (changes under `apps/competition/**` or `packages/**` start the deploy).

### Deep links (404.html)

GitHub Pages serves unknown paths with the `404.html` at the **root** of the published site
only; a `404.html` in a subfolder is never used. So:

- The app build writes `apps/competition/dist/404.html` (a copy of `index.html`;
  `scripts/copy-gh-pages-404.mjs`). Its asset paths are absolute
  (`/hema-score-keeper/competition/assets/...`), so the page works from any URL.
- The workflow's "Stage Pages content" step turns it into the site-wide `pages/404.html` with
  `apps/competition/scripts/root-404.mjs`. That adds a small inline script before the app starts:
  paths under `/hema-score-keeper/competition/` (such as the invite link
  `<origin>/hema-score-keeper/competition/join/<code>`) boot the participant app in place, and
  any other path on the site is sent to the app's home.

This workflow publishes only the participant app. If another app is ever published on the
same Pages site, the one root `404.html` serves it too: give it its own prefix in
`root-404.mjs`.

### CORS

The app runs on the Pages origin and calls the backend on another origin, so the backend must
answer cross-origin requests. It already does: `createApp` in `apps/backend/src/server.ts`
sends, on every request,

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept, Authorization
```

and answers `OPTIONS` preflights with `204`. Logins use a bearer token in the
`Authorization` header (no cookies), so the `*` origin is enough. If that setting is ever
narrowed to a list of origins, add the Pages origin (e.g. `https://<user>.github.io`).

## Admin app: invite links

The admin app (`apps/competition-admin`) builds invite links as
`<participant app>/join/<code>`. It finds the participant app through
`VITE_PARTICIPANT_APP_URL` (no trailing slash, e.g.
`https://<user>.github.io/hema-score-keeper/competition`). When it is not set, it uses
`http://localhost:5173/hema-score-keeper/competition` in dev and
`<the admin app's origin>/hema-score-keeper/competition` in a build, which is right when both
apps are published on the same site. Set it at build time when they are not. The admin app's
API address is `VITE_COMPETITION_API_URL` (default `/api/v1`). Both are listed in
`apps/competition-admin/.env.example`.

## On-deck push notifications

The fighter portal can show on-deck alerts while closed using Web Push. In `apps/backend/.env`,
set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`. Generate a VAPID key
pair with `npx web-push generate-vapid-keys`; keep the private key secret, stable, and out of Git.
`COMPETITION_PWA_BASE_PATH` defaults to `/hema-score-keeper/competition/` and should match the
published participant-app path. The browser asks the signed-in fighter for notification permission
when they enable alerts. Subscriptions are stored per account/device; expired endpoints are removed
automatically, and transient delivery failures retry from the database-backed queue.

Closed-app delivery is best-effort and requires a browser with Web Push support, HTTPS for the
participant app and API, notification permission, and internet access to the browser's push service.
The usual venue setup using HTTP on a local Wi-Fi network does **not** meet those requirements;
the in-app schedule and on-deck indicator continue to work there without push or internet. Push
delivery runs independently from bout scoring and cannot block score requests.

## Local dev

```text
npm run backend:dev                         # API on http://localhost:3001
npm run dev --workspace @hema/competition   # http://localhost:5173/hema-score-keeper/competition/
```

The dev server proxies `/api` to `http://localhost:3001`, so no settings are needed. To use
another backend, set `VITE_API_BASE_URL` in `apps/competition/.env.local` (see `.env.example`).

## Venue laptop: fresh database and first admin

A new database is created and migrated when the backend starts, so sign-in works from the first run.
There is no account yet, so create the first system admin once (build first: `npm run build --workspace @hema/backend`):

```text
npm run create-admin --workspace @hema/backend -- --username <username> --name "<Full name>"
```

It asks for the password on stdin (hidden in a terminal; piping it in also works) and never takes it as an
argument and refuses a username that already exists. It prints the database file it writes to.

`create-admin` must use the same `DATABASE_URL` as the server, or the admin lands in a different database.
Use `create-admin:env` (loads `.env`, like `start:env`) when the server is started with `npm run start:env`;
use plain `create-admin` when the server gets `DATABASE_URL` from the environment or the default.

Set `AUTH_SECRET` to a long random value before the server is used at a venue. Without it the backend signs
sign-in tokens with a built-in development secret and prints a warning at startup. Changing it later signs
everyone out (and changes email hashes unless `AUTH_EMAIL_PEPPER` is set separately).

## Venue checklist

Work through this in order on the day (or the evening before). Everything runs on one laptop on the venue's
Wi-Fi; phones only need a browser.

1. **Backend on the laptop.** In `apps/backend/.env` (or the shell) set `AUTH_SECRET` (a long random value)
   and `DATABASE_URL` (for example `file:./venue.db`). Build once (`npm run build --workspace @hema/backend`), then run
   `npm run start:env --workspace @hema/backend`. It listens on `0.0.0.0:3001` (`PORT` changes the port), so
   add a Windows firewall inbound rule for TCP port 3001 (Private network profile), or phones cannot connect.
2. **First admin.** `npm run create-admin:env --workspace @hema/backend -- --username <username> --name "<Full name>"`
   (see "Venue laptop: fresh database and first admin" above; it must see the same `.env` as `start:env`).
3. **Score-keeper for the phones.** Build it against the laptop, with the mock API off:
   `VITE_API_BASE_URL=http://<laptop-ip>:3001/api/v1` (leave `VITE_USE_MOCK_API` unset or `false`; `apps/score-keeper/.env`
   sets it to `true`, which makes the app use fake data). Then serve the build with a fallback to `index.html`,
   because `/ring/<token>` is not a file:
   `npm run build --workspace @hema/score-keeper && npm run preview --workspace @hema/score-keeper -- --host --port 5180`
   (`vite preview` falls back to `index.html` for unknown paths). Check it:
   `curl -i http://<laptop-ip>:5180/ring/test` must answer `200` with the app's HTML, not `404`. Allow TCP port 5180 in the firewall too.
4. **Admin app.** Build or run it with `VITE_COMPETITION_API_URL=http://<laptop-ip>:3001/api/v1`. Ring links
   must point at `http://<laptop-ip>:5180/ring/<token>`; a `localhost` link only works on the laptop itself, so a
   phone scanning that QR code gets nothing.
5. **No mixed content.** A score-keeper served over HTTPS (for example GitHub Pages) cannot call an HTTP backend
   on the LAN: the browser blocks it. Serve the score-keeper and the backend both over plain HTTP on the LAN, or both over HTTPS.
6. **Final check.** Open a ring link on a phone on the venue Wi-Fi. You should see the
   sign-in screen. If not, check the laptop's IP, the firewall rules and that both URLs above use that IP.

## Live tournament scoring

Scoring routes, for the scorer apps: an undo must name the exchange it removes,
`POST /api/v1/live-bouts/:id/undo` with `{ "expectedExchangeId": "<id>" }` (400 without it). A retry of an undo
that already happened answers 200 with the current score and removes nothing; any other id than the newest active
exchange is 409. Bouts carry `score: { left, right, doubles }`, or `null` when nobody has scored yet, on both
`GET /api/v1/live-rings/:id/bouts` and `GET /api/v1/live-tournaments/:id`.

### Ring links and the ring keeper

Each ring has a secret keeper token (24 random bytes, base64url). The ring link is
`<score-keeper>/ring/<token>`. The link alone does not let anyone score: the scorer must also be signed in.

- `GET /api/v1/live-tournaments/:id/rings` lists the rings with their tokens. Creator or system admin.
- `POST /api/v1/live-rings/:id/rotate-token` makes a new token. The old link stops working at once, and nobody
  keeps the ring until someone claims it with the new link. Creator or system admin.
- `GET /api/v1/live-rings/by-token/:token` gives `{ ring, tournament, bouts, activeKeeper, youAreKeeper }` (`youAreKeeper`: the optional `X-Device-Id` header is the active keeper; the device id itself is never returned) (404 for an unknown or
  rotated token).
- `POST /api/v1/live-rings/by-token/:token/claim` with `{ deviceId, confirm? }` makes that device the ring's one
  active keeper. When another device keeps the ring, it answers 409 `{ reason: "ACTIVE_KEEPER", activeKeeper }`
  unless `confirm` is true. A claim pauses any running bout clock of the ring at its stored seconds.

Every live-bout write (start, exchanges, undo, finish and `POST /api/v1/live-bouts/:id/clock` with
`{ seconds, running }`) needs the headers `X-Ring-Token` (the bout's ring) and `X-Device-Id` (the active keeper).
A missing or wrong token is 403; any other device gets 409 `{ reason: "TAKEN_OVER", activeKeeper }`. One exception:
a resend of an exchange that was already stored under the same `clientExchangeId` answers 200 with the stored
exchange, also from a device that was replaced since; it creates nothing. The clock is what the device reports; the
server never counts it.

# Competition deploy

The participant app (`apps/competition`) is a static site on GitHub Pages at
`<origin>/hema-score-keeper/competition/`. It has no server of its own: it talks to the
backend API (`apps/backend`). Google Sheets, Apps Script and Google sign-in are no longer
used (phase 7).

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

## Admin app: ring links (Tournaments screen)

The Tournaments screen builds each ring link as `<score-keeper app>/ring/<token>` (with a QR
code). It finds the score-keeper app through `VITE_SCORE_KEEPER_URL` (no trailing slash, e.g.
`https://keep.example.org`). The score-keeper builds without a Vite `base`, so its ring page
is at the root of its site (`/ring/<token>`), and the host must serve `index.html` for that
path.

**Production must set `VITE_SCORE_KEEPER_URL` at build time.** The score-keeper is hosted
apart from the admin app, so the admin app's own origin (the fallback in a build) gives wrong
links. In dev it defaults to `http://localhost:5180`, where `.claude/launch.json` runs the
score-keeper. It is listed in `apps/competition-admin/.env.example`.

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

1. **Backend on the laptop.** In `apps/backend/.env` (or the shell) set `AUTH_SECRET` (a long random value),
   `DATABASE_URL` (for example `file:./venue.db`) and `LIVE_DATA_DIR` (where the live tournament files go,
   for example `./data/venue-live`). Build once (`npm run build --workspace @hema/backend`), then run
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
4. **Admin app.** Build or run it with `VITE_COMPETITION_API_URL=http://<laptop-ip>:3001/api/v1` and
   `VITE_SCORE_KEEPER_URL=http://<laptop-ip>:5180`. The ring links the admin shows use `VITE_SCORE_KEEPER_URL`;
   the default `http://localhost:5180` only works on the laptop itself, so a phone scanning that QR code gets nothing.
5. **No mixed content.** A score-keeper served over HTTPS (for example GitHub Pages) cannot call an HTTP backend
   on the LAN: the browser blocks it. Serve the score-keeper and the backend both over plain HTTP on the LAN, or both over HTTPS.
6. **Final check.** Open a ring link from the admin app on a phone on the venue Wi-Fi. You should see the
   sign-in screen. If not, check the laptop's IP, the firewall rules and that both URLs above use that IP.

## Tournament schedule sheet

A sheet-mode tournament (`/api/v1/live-tournaments`) is imported from a workbook with a sheet named
`Schedule`. Row 1 holds headers; bouts start at row 2:

| Column | Header | Meaning |
| --- | --- | --- |
| A | Ring | Ring name; rings are created by name, in order of first appearance |
| B | Order | Whole number; the bout's position in the ring |
| C | Sheet | Name of the sheet that holds the bout, for example `Pool_1` |
| D | Cell | The bout's header cell, for example `B25` (the "Match 1" label cell) |
| E | Label | Optional; defaults to the header cell's value |

`G1` holds "Last sync" and `H1` is written by the sync. Fighter names are read from the
calculated values of the cells next to the header (layout `v3`: header column +1 and +3). An empty
cell or `0` imports as an empty name, so elimination bouts appear before the pools finish.

Upload the `.xlsx` as the raw request body (`application/octet-stream`, up to 20 MB) to
`POST /api/v1/live-tournaments/:id/import/xlsx`. The file is also kept as the local backup base under
`LIVE_DATA_DIR` (default `apps/backend/data/live`, next to the database; a relative value is used as given,
from the working directory) as `<id>/backup.xlsx`. Importing again updates ring, order,
label and fighters of bouts without exchanges, and removes such bouts when they leave the schedule.
Bouts that have exchanges are never changed; they are listed as `skipped` in the report. Schedule rows
with a problem (unknown sheet, bad cell, bad order, an empty match header cell, or an exchange block, rows
+1 to +15 of the input columns, that overlaps another scheduled bout's block) are listed in `errors`; the other
rows still import, and an existing bout on an error row is left as it is.

Starting or finishing a bout does not write to the sheets; only exchanges and undos do. A bout scored by
hand in the sheet (for example when a phone fails) is therefore not wiped by a start or finish in the app.

> **Stale values in a downloaded backup.** `backup.xlsx` (downloaded with `GET .../backup.xlsx`) holds the
> exchange results, but its cached formula results (pool rankings, the fighter names in the eliminations)
> are those of the original upload. The import reads cached values. Before re-uploading a downloaded backup
> to import the eliminations, **open it in Excel or Google Sheets and save it**, so the formulas are
> recalculated. Otherwise the import reads stale names.

### Google Sheet target and sync status

A tournament created with a `googleSpreadsheetId` is mirrored into that Google Sheet as well as into the
local backup file. The backend signs in as a service account with the existing
`GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (the key may contain escaped `\n`).
**Share the spreadsheet with the service account's email address, with edit access.** Without these
variables the Google target is skipped: jobs stay pending and the status shows `NOT_CONFIGURED`.

Where the variables go: set them in the environment of the backend process, or put them in
`apps/backend/.env` (copy `apps/backend/.env.example`) and start the backend with `npm run start:env
--workspace @hema/backend`, which runs `node --env-file=.env dist/server.js` (Node 20.6 or newer). The plain
`npm start` does **not** read `.env`. Note that `.env` may also set `DATABASE_URL`, which then applies too.
**`.env` holds the private key and must never be committed**; it is in `.gitignore`. If a key was ever
committed, rotate it in the Google Cloud console.

- `POST /api/v1/live-tournaments/:id/import/google` imports the `Schedule` sheet and the fighters from the
  spreadsheet (calculated values), like the `.xlsx` import. Creator or system admin.
- `GET /api/v1/live-tournaments/:id/sync` lists both targets (`LOCAL`, `GOOGLE`) with `state`, `lastSuccessAt`,
  `lastError`, `lastErrorAt`, `pending` and `failed`. `lastError` is shown only while it still applies (newer
  than the last success, or a job is `FAILED`). States: `OK`, `ERROR`, `NOT_CONFIGURED`, `NO_SPREADSHEET`,
  `NO_BACKUP_FILE` (no `backup.xlsx` yet: import an `.xlsx` first). Creator or system admin.
- `GET /api/v1/live-tournaments/:id/backup.xlsx` downloads the local backup. Creator or system admin.

Every Google call has a 10 s timeout. A failing or hanging Google never slows scoring: the sync jobs stay
pending and retry with back-off (5 s, 15 s, 60 s). If the whole target is unusable (Google down, bad
credentials, backup file locked by Excel), the batch backs off once instead of retrying bout by bout. Error
messages never contain the key or a token. Each write also stores the time in `Schedule!H1`, in both targets,
when the workbook has a `Schedule` sheet. Each round writes the local backup before Google, so a slow Google never
delays the backup. Sync jobs are kept in the database: after a restart the worker carries on with the pending
jobs (backed-off ones are retried at once) and does not re-queue every bout.

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

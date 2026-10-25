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

## Local dev

```text
npm run backend:dev                         # API on http://localhost:3001
npm run dev --workspace @hema/competition   # http://localhost:5173/hema-score-keeper/competition/
```

The dev server proxies `/api` to `http://localhost:3001`, so no settings are needed. To use
another backend, set `VITE_API_BASE_URL` in `apps/competition/.env.local` (see `.env.example`).

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

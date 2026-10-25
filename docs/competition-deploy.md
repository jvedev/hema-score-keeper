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

# Competition deploy

## GitHub Pages

1. Go to **Settings → Pages** and use **GitHub Actions** as the source.
2. Push to `master`.
3. In **Settings → Secrets and variables → Actions**, set these as either
   **Variables** or **Secrets**:

```text
COMPETITION_APPS_SCRIPT_URL=<the Web app URL>
COMPETITION_GOOGLE_CLIENT_ID=<the OAuth client ID>
```

The Pages workflow injects those values as:

```text
VITE_APPS_SCRIPT_URL
VITE_GOOGLE_CLIENT_ID
```

## Local dev

Use `apps/competition/.env.local`:

```text
VITE_USE_MOCK_API=false
VITE_APPS_SCRIPT_URL=<the Web app URL>
VITE_GOOGLE_CLIENT_ID=<the OAuth client ID>
```

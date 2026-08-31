# Apps Script backend setup (for whoever manages the competition app deployment)

The competition app has no server of its own — it's a static PWA on GitHub
Pages. Instead of a Node backend, a **Google Apps Script Web App** plays that
role: it lives inside Google's infrastructure, reads/writes the competition
spreadsheets, and verifies each signed-in user's Google ID token before
allowing a write. This is a one-time setup per deployment, and it only
matters once you want to test or deploy against the *real* backend — local
development works out of the box with `VITE_USE_MOCK_API=true` and needs
none of this.

**Can this be done remotely by Claude, or scripted end-to-end?** Not fully.
Creating a Google Cloud project/OAuth client and deploying an Apps Script Web
App both happen through Google's own consent-gated web UI, signed in as
*you* — there's no way for an assistant or an external script to click
through that on your behalf, and entering your Google credentials anywhere
outside Google's own login page is exactly what you shouldn't do. What *can*
be scripted is the tedious part — hand-building spreadsheets with the right
tabs and column headers — so step 2 below has you paste in and run a setup
script that creates both spreadsheets for you, correctly, in one click.
Everything below is written as a literal click-by-click checklist for the
remaining manual parts.

See "docs/competition-app" for the overall design.

## 1. Create the Apps Script project

Go to https://script.google.com/, click **New project**.

Rename it (top-left, "Untitled project") to something like
`HEMA Competition Backend`.

Replace the default `Code.gs` file's contents with
`tools/apps-script/Code.js` from this repo. Then click the **+** next to
"Files" → **Script** → name it `Setup` → replace its contents with
`tools/apps-script/Setup.js` from this repo. Save (Ctrl/Cmd+S).

## 2. Run the setup script — creates both spreadsheets for you

In the toolbar, select the function dropdown (next to "Debug") and choose
**setupCompetitionApp**, then click **Run**.

The first run asks for authorization, and shows a stronger-worded warning
than a plain "unverified app" notice — something like *"Google hasn't
verified this app — it's requesting access to sensitive info in your Google
account"* — because creating/editing Sheets falls under Google's "sensitive
scopes" category. This is expected and safe: you're both the developer and
the only user of this script, and Google's verification review is only
required for publicly distributed apps with many users, not a personal
script like this one. Click through it: **Review permissions** → pick your
account → **Advanced** → a link appears reading roughly **"Go to HEMA
Competition Backend (unsafe)"** → click it → on the permissions screen that
follows, **Allow**.

This creates two Google Sheets in your Drive and wires them together:

- **HEMA Competition Hub** — the `Competitions` and `Rulesets` tabs.
- **HEMA Competition - Demo Competition** — the `Settings`, `Ranking`,
  `Participants`, `Bouts` tabs, with a demo competition row already in the
  hub pointing at it.

Open **View → Logs** (or Ctrl/Cmd+Enter) to see the two spreadsheet URLs it
created — open them to see the tabs it built. It also set the
`HUB_SPREADSHEET_ID` script property automatically; you don't need to copy
that ID by hand.

To add your real competitions later, either duplicate the demo spreadsheet's
four tabs manually, or call `createDemoCompetitionSpreadsheet_()` /
`addCompetitionToHub_()` from the Apps Script editor the same way — they're
plain functions, reusable for any competition, not just the demo one.

## 3. Create an OAuth client ID for Google Sign-In

This is the one step that has to happen in Google Cloud Console by hand:

1. Go to https://console.cloud.google.com/, pick or create a project (this
   can be the same project Apps Script auto-created for your script, or a
   separate one — either works).
2. **APIs & Services** → **OAuth consent screen** — if you haven't set one up
   for this project yet, choose **External**, fill in an app name and your
   email as support/developer contact, and save. You do not need to submit
   this for verification for personal/club use with a small number of users.
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth
   client ID** → type **Web application**.
4. Under **Authorized JavaScript origins**, add every origin the PWA will be
   served from, e.g. `https://<your-user>.github.io` for production and
   `http://localhost:5173` for local dev against the real backend.
5. Click **Create** and copy the generated **Client ID**
   (`....apps.googleusercontent.com`).

## 4. Set the OAuth client ID script property

Back in the Apps Script editor: **Project Settings** (gear icon) → **Script
Properties** → **Add script property**:

```
OAUTH_CLIENT_ID=<the client ID from step 3>
```

(`HUB_SPREADSHEET_ID` is already there from step 2 — leave it as-is.)

## 5. Deploy it as a Web App

Back in the editor: **Deploy** → **New deployment** → gear icon next to
"Select type" → **Web app**:

- Execute as: **Me**
- Who has access: **Anyone**

Click **Deploy**, then copy the **Web app URL**
(`https://script.google.com/macros/s/.../exec`).

"Who has access: Anyone" only controls who can *reach* the endpoint — every
write action still requires a valid Google ID token, verified server-side
against the `OAUTH_CLIENT_ID` from step 4, before anything is read or written
beyond the public read actions.

Whenever you edit `Code.js` or `Setup.js` afterwards, you need a **new**
deployment version (**Deploy** → **Manage deployments** → edit (pencil) →
**Version: New version** → **Deploy**) for the change to take effect on the
existing Web app URL.

## 6. Point the app at your deployment

In `apps/competition/.env.local` (gitignored — create it if it doesn't
exist):

```
VITE_USE_MOCK_API=false
VITE_APPS_SCRIPT_URL=<the Web app URL from step 5>
VITE_GOOGLE_CLIENT_ID=<the OAuth client ID from step 3>
```

For GitHub Pages deployments, set the same values in the repository's
**Settings → Secrets and variables → Actions** as either **Variables** or
**Secrets**:

```
COMPETITION_APPS_SCRIPT_URL=<the Web app URL from step 5>
COMPETITION_GOOGLE_CLIENT_ID=<the OAuth client ID from step 3>
```

The Pages workflow injects those variables into the Vite build as
`VITE_APPS_SCRIPT_URL` and `VITE_GOOGLE_CLIENT_ID`.

## 7. Verify it works

Open the Web app URL in a browser with `?action=listCompetitions` appended —
you should get back `{"ok":true,"data":[{"name":"Demo Competition",...}]}`.
An `{"ok":false,"error":"..."}` body (still HTTP 200 — Apps Script always
returns 200) means something upstream failed; the message names which step
to revisit.

Then run `apps/competition` (`npm run dev --workspace @hema/competition`)
with the env vars from step 6 set — you should see the real Google Sign-In
button instead of the mock auto-sign-in, and after signing in, "Demo
Competition" in the competition list.

## Sharing access with other people

The script runs as *you* (the account that deployed it), so it already has
access to every spreadsheet the setup script created. If someone else needs
to edit a spreadsheet directly (fix a typo, add a competition row by hand),
share that spreadsheet with their Google account as Editor — same as sharing
any other Google Sheet. This is separate from signing into the *app*, where
any Google account can add participants and publish bouts by design —
direct spreadsheet sharing is only needed for editing the raw sheet, not for
using the PWA.

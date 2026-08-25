# Google service account setup (for whoever manages the backend deployment)

The score-keeper backend talks to Google Sheets as a **service account** — a
robot Google identity that belongs to the app, not to any person or
volunteer. This is a one-time setup per deployment (e.g. once for production,
once for local dev if you want your own). See "docs/google sheets setup.md"
for how tournament organizers then share their sheets with this account.

## 1. Create/select a Google Cloud project

Go to https://console.cloud.google.com/, pick an existing project or create a
new one (top-left project dropdown → "New Project").

## 2. Enable the Google Sheets API

"APIs & Services" → "Library", search for **Google Sheets API**, click
**Enable**.

## 3. Create the service account

"IAM & Admin" → "Service Accounts" → "Create Service Account":

- Name: anything, e.g. "HEMA Score Keeper"
- Skip granting it any project roles — it doesn't need any. Its only access
  comes from whatever Google Sheets get shared with it directly
- Click **Done**

## 4. Create a key for the service account

Open the newly created service account → "Keys" tab → "Add Key" → "Create new
key" → **JSON** → Create. This downloads a `.json` file that looks like:

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "hema-score-keeper@your-project.iam.gserviceaccount.com",
  ...
}
```

Treat this file like a password — anyone who has it can access every sheet
shared with this service account. Don't email it around or commit it
anywhere.

## 5. Configure the backend

Copy two fields from the downloaded JSON into `apps/backend/.env`:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=<the "client_email" field>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<the "private_key" field>
```

Notes:

- Paste the `private_key` value exactly as it appears in the JSON — as one
  line, including the surrounding quotes and the literal `\n` sequences. The
  backend converts those `\n`s back into real newlines when it signs
  requests; you don't need to reformat it.
- `apps/backend/.env` is gitignored — never commit it. `apps/backend/.env.example`
  shows the expected shape without real values.
- If you rotate the key later (e.g. after a suspected leak), delete the old
  key from the service account's "Keys" tab in Cloud Console after the new
  one is deployed, so it can no longer be used.

## 6. Verify it works

Start the backend (`npm run dev` in `apps/backend`), then in the score-keeper
app's "Google Sheets" mode, paste a spreadsheet ID for a sheet that's been
shared with the service account's email (see "docs/google sheets setup.md")
and check the browser console for its contents. A `500` error mentioning
"Google Sheets integration is not configured" means the env vars above aren't
set; a `403`/`404` from Google means the sheet hasn't been shared with the
service account yet.

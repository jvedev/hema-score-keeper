# Google Sheets setup (for the club / tournament organizer)

The score-keeper app reads a tournament's pool sheet and writes results to a
results sheet, both owned by the club.

## How the access model works

There is exactly **one** Google identity involved, ever: a **service
account** — a robot account that belongs to the app itself, not to any
person. Nobody running the app on a scoring tablet signs into Google, and the
app never checks who's holding the tablet. Any volunteer can pick up any
device, open the app, enter a sheet ID, and it just works — because the app
is already authorized as that one robot account.

Sharing a sheet with the service account works exactly like sharing a
document with a colleague — Share → paste an email → pick a permission level
— except the email you paste is the robot account's, not a person's. The app
only ever has access to sheets someone has explicitly shared with it this
way. Nothing else, ever, in anyone's Google account.

Setting up that service account (Google Cloud project, key, backend config)
is a one-time technical task — see "docs/google service account setup.md".
Everything below is what tournament organizers do afterwards, per sheet.

## Per-tournament step (done by the tournament organizer)

Each time you create a new pool sheet or results sheet for a tournament (or
reuse an existing template), give the app access to it.

### Source pool sheet (read-only)

The app only reads this one — it's just roster and match data, nothing
sensitive. Either:

- Share it with the service account's email as **Viewer** (see below), or
- Set its general access to **"Anyone with the link" → Viewer**, which skips
  this step entirely for every future sheet that reuses the same link

Both work equally well for reading; the second is less setup but means
anyone who gets the link can view the sheet's contents.

### Destination results sheet (write access)

**Always share this one explicitly with the service account as Editor — do
not** set it to "Anyone with the link can edit." That link ends up in QR
codes and browser URLs throughout the app, so treating "has the link" as
"authorized to edit" would let anyone who's seen the link tamper with or
delete official tournament results with no login and no trace of who did it.

### How to share with the service account

1. Open the Google Sheet in your browser
2. Click **Share** (top-right)
3. Paste the service account's email (ask whoever set up the deployment for
   this — it's the `GOOGLE_SERVICE_ACCOUNT_EMAIL` value, looks like
   `hema-score-keeper@your-project.iam.gserviceaccount.com`)
4. Set the role — **Viewer** for the source sheet, **Editor** for the
   destination sheet
5. Uncheck "Notify people" (it's a robot account, no need to email it) and
   click **Share**

That's it — the app can now read/write exactly those sheets. Creating a new
sheet, or sharing a different sheet with someone else, never gives the app
any access unless you repeat this step for that specific sheet.

## Reference sheets

pools

https://docs.google.com/spreadsheets/d/1GeDicZz5ZXkm8WA30UpLIFqggEx36b0uo8pNidGP-po/edit?gid=0#gid=0
sheet id = 1GeDicZz5ZXkm8WA30UpLIFqggEx36b0uo8pNidGP-po

results

https://docs.google.com/spreadsheets/d/1x0NmivAPjDNlW9Rgta-ctvsCAG_liV1xLRNaRP3HZY4/edit?usp=sharing
sheet id = 1x0NmivAPjDNlW9Rgta-ctvsCAG_liV1xLRNaRP3HZY4

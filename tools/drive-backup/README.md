# Daily backup to Google Drive

`Code.gs` copies **all** EventScope data (every company, every event, Job Log,
settings, team) from Firestore into a private Google Drive folder once a day.
Free — works on the Spark plan, no card, no service-account key.

- Folder: **EventScope Backups** in the Drive of the account that runs it
- One zip per day: `eventscope-backup-YYYY-MM-DD.zip`, newest 30 kept
- Inside: one `<companyId>.json` per company (restorable with Admin → Import
  company) and `_everything.json` (every document, as-is)
- If a run fails, the account gets an email "EventScope backup FAILED"

The files contain client names, phone numbers and bank details. Keep the
folder private — never share it, never copy it into GitHub.

## One-time setup (about 10 minutes)

Use the **essope.work@gmail.com** account — it owns the Firebase project, which
is what lets the script read the database.

1. Go to <https://script.google.com> → **New project**. Rename it
   (top-left) to **EventScope Backup**.
2. Click the **gear (Project Settings)** on the left → tick
   **Show "appsscript.json" manifest file in editor**.
3. Back in the **Editor** (`< >` on the left):
   - open `appsscript.json`, delete everything, paste the contents of
     `appsscript.json` from this folder, save (Ctrl/Cmd + S);
   - open `Code.gs`, delete everything, paste the contents of `Code.gs` from
     this folder, save.
4. In the toolbar, choose the function **setup** and click **Run**.
5. Google asks for permission: **Review permissions** → pick
   essope.work@gmail.com → "Google hasn't verified this app" →
   **Advanced** → **Go to EventScope Backup (unsafe)** → **Allow**.
   (It's your own script, so this warning is expected.)
6. The log at the bottom should say
   `Daily backup scheduled (~2:00). First backup saved: eventscope-backup-….zip — N documents, M companies`.
7. Open Google Drive → folder **EventScope Backups** → the zip is there.

That's it — it now runs every night around 2 am (India time).

## Checking it's working

- Drive → **EventScope Backups** should get a new zip every day.
- script.google.com → EventScope Backup → **Executions** (left) shows each run.
- To make an extra backup right now: choose **backupNow** → **Run**.

## Restoring

See the restore checklist (Admin → Import company with the company's
`<companyId>.json` from the newest zip). Download the zip from Drive, unzip it
on your computer, then pick the company file in the Import dialog — it fills
in the company id, name, plan and team from the backup.

## Updating the script

When `Code.gs` changes in this repo, paste the new version over the old one in
the script editor and save. The daily schedule stays as it is.

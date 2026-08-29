# Google Sheets receiver setup

The public study works without a server, but responses remain only in that participant's browser until this receiver is configured.

## Create the private Sheet

1. Create a blank Google Sheet in the Google account that will own the study data.
2. Copy the spreadsheet ID from the URL between `/d/` and `/edit`.
3. Open **Extensions → Apps Script** from the Sheet.
4. Replace the editor content with [`Code.gs`](./Code.gs).
5. Open **Project Settings → Script properties** and add:
   - Property: `SPREADSHEET_ID`
   - Value: the copied spreadsheet ID
6. Run `setupSheet` once from the Apps Script editor and authorize it. This creates `Sessions`, `Responses`, and `MethodMap`.

## Deploy the Web App

1. Select **Deploy → New deployment → Web app**.
2. Execute as **Me**.
3. Allow access to **Anyone**.
4. Deploy and copy the URL ending in `/exec`.
5. In the GitHub repository, add an Actions variable named `VITE_APPS_SCRIPT_URL` with that URL.
6. Re-run the Pages workflow.

The endpoint validates study version, trial IDs, anonymous answer codes, payload size, and nickname length. It escapes formula-like strings, locks concurrent writes, and upserts each response by `session_id + trial_id`.

## Private method map

Fill `MethodMap` only in the private Sheet. Use one row per anonymous candidate code and keep the production assignment balanced: the first physical position contains each method 15 times across the 30 trials. Do not commit this mapping to GitHub.

## Quick check

Open the `/exec` URL directly. A successful deployment returns:

```json
{"ok":true,"studyVersion":"act-h3-v1"}
```

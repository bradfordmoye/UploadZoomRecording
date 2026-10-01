# zoom-recording-sync

Every week this copies the Zoom recording link for each class into the SharePoint recordings spreadsheet, along with the session date and topic from the calendar spreadsheet.

| Job | Schedule | Script |
|---|---|---|
| Mastery | Mondays 3:00 PM ET | `scripts/mastery.js` |
| Essentials | Tuesdays 2:00 PM ET | `scripts/essentials.js` |

Each run does the following:

1. Opens https://zoom.us/recording in headless Chromium and signs in with `.env`.
2. Finds the recording whose topic contains the keyword and whose date is today. It clicks **Share → Settings**, turns off **Viewers can download** and **Passcode**, then clicks **Save** and **Copy Link**.
3. Opens the recordings workbook, goes to the sheet tab containing the keyword, and pastes the link into **column C** of the first empty row.
4. Opens the calendar workbook in a second tab, goes to the keyword tab, and reads the **session date** (column A) and **topic** (column B) from the row dated today.
5. Writes the date and topic into **columns A and B** of the row from step 3.
6. Closes the browser.

## Setup

```bash
git clone https://github.com/bradfordmoye/UploadZoomRecording && cd UploadZoomRecording
npm install
npx playwright install chromium
cp .env.example .env        # fill in ZOOM_* and MS_* credentials
npm run login               # one-time sign-in in a visible browser (handles captcha/MFA)
npm run setup-cron          # installs both weekly jobs
```

`npm run login` saves the Zoom and Microsoft sessions in `.auth/profile`, which is gitignored. The headless jobs reuse those sessions. They fall back to the `.env` credentials only when a session has expired. If Zoom or Microsoft asks for MFA during a headless run, the job fails with a message telling you to run `npm run login` again.

## Running and testing

```bash
npm run mastery                      # run now, for today
RUN_AT=2026-09-28T15:00 npm run mastery   # run "as if" a given date/time
DRY_RUN=true npm run essentials      # everything except writing to the sheet

npm test                             # offline unit tests (date logic)
npm run test:live                    # LIVE: replays this past Mon 3pm + Tue 2pm
```

`npm run test:live` runs both jobs against the real sites as if it were this past Monday at 3:00 PM and this past Tuesday at 2:00 PM. Because this week's links are already in the sheet, each job adds a **duplicate row**. The test asserts that the new row's link matches the row above it. **Delete the two test rows afterwards.**

## Troubleshooting

- **Watch it work:** set `HEADLESS=false` in `.env`.
- **When a run fails,** it saves screenshots of every tab to `logs/`. Cron output goes to `logs/mastery.log` and `logs/essentials.log`.
- **If the recording isn't ready yet,** the job checks every 5 minutes for `RECORDING_WAIT_MINUTES` (default 30).
- **The job never overwrites a non-empty cell.** It stops with an error instead.
- **Excel for the web** is driven through its Name Box and formula bar, because the grid is drawn on a canvas. If Microsoft changes those, update the selectors at the top of `src/excel.js`.
- **The Zoom UI** varies by account and version. The selectors are in `src/zoom.js`.
- **On macOS,** cron ignores `CRON_TZ`, so the Mac's clock must be on Eastern time. Cron may also need Full Disk Access, and the machine must be awake at run time.
- Set `CHROMIUM_PATH` to use an installed Chrome instead of Playwright's download.

## Files

```
src/runJob.js     steps 1–6 for one keyword
src/zoom.js       Zoom sign-in, find recording, share settings, copy link
src/excel.js      Excel-for-web helpers (select tab, last row, read/write cells)
src/microsoft.js  Microsoft 365 sign-in
src/dates.js      date matching/parsing (RUN_AT override for tests)
scripts/          job entry points, login helper, cron installer
test/             unit tests + live replay test
```

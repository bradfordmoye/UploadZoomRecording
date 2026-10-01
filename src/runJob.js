const config = require('./config');
const log = require('./log');
const { launch, screenshotAll } = require('./browser');
const { getShareLink } = require('./zoom');
const { ExcelWorkbook } = require('./excel');
const { resolveRunDate, toLocalStamp } = require('./dates');

/**
 * Full weekly flow for one class (e.g. "Mastery" or "Essentials"):
 *  1–2. Zoom: find today's recording, disable download + passcode, copy share link
 *  3.   Recordings sheet (tab 1): paste link in column C of the next empty row
 *  4.   Calendar sheet (tab 2): read session date + topic for today
 *  5.   Recordings sheet (tab 1): write date + topic in columns A/B of that row
 *  6.   Close the browser
 */
async function runJob({ keyword, runDate = resolveRunDate() }) {
  log.info(`=== ${keyword} job — running as ${toLocalStamp(runDate)}${config.dryRun ? ' (DRY RUN)' : ''} ===`);
  const context = await launch();

  try {
    // Tab 1
    const tab1 = context.pages()[0] || (await context.newPage());

    // Steps 1–2
    const link = await getShareLink(tab1, keyword, runDate);

    // Step 3
    const recordings = await ExcelWorkbook.open(tab1, config.recordingsSheetUrl, 'Recordings sheet');
    await recordings.selectSheet(keyword);
    const row = (await recordings.lastRow(['A', 'B', 'C'])) + 1;
    log.info(`Recordings sheet: next empty row is ${row}`);
    await recordings.write(`C${row}`, link);

    // Step 4 (new tab)
    const tab2 = await context.newPage();
    const calendar = await ExcelWorkbook.open(tab2, config.calendarSheetUrl, 'Calendar sheet');
    await calendar.selectSheet(keyword);
    const session = await calendar.findRowByDate(runDate);

    // Step 5
    await tab1.bringToFront();
    await recordings.write(`A${row}`, session.date);
    await recordings.write(`B${row}`, session.topic);
    await recordings.waitForSave();

    const previousRowLink = row > 1 ? await recordings.read(`C${row - 1}`) : '';
    const result = { keyword, row, link, date: session.date, topic: session.topic, previousRowLink };
    log.info(`Done: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    const shots = await screenshotAll(context, `${keyword.toLowerCase()}-error`);
    if (shots.length) log.error(`Screenshots saved: ${shots.join(', ')}`);
    throw err;
  } finally {
    // Step 6
    await context.close().catch(() => {});
  }
}

/** CLI entry used by scripts/mastery.js and scripts/essentials.js. */
function cli(keyword) {
  runJob({ keyword })
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(err.stack || err.message);
      process.exit(1);
    });
}

module.exports = { runJob, cli };

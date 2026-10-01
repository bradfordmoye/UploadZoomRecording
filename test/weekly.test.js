// LIVE end-to-end test. Uses real Zoom + SharePoint with the credentials in .env.
//
// Replays both jobs as if it were this past Monday 3:00 PM (Mastery) and
// this past Tuesday 2:00 PM (Essentials). Because this week's links were
// already uploaded, each run should add a DUPLICATE row to the recordings sheet
// (same Zoom link as the row above it). Delete those test rows afterwards.
//
// Run with:  npm run test:live
// Tip: set DRY_RUN=true in .env for a first pass that writes nothing.

const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const { runJob } = require('../src/runJob');
const { mostRecentWeekday, toLocalStamp } = require('../src/dates');

config.requireEnv('ZOOM_EMAIL', 'ZOOM_PASSWORD', 'MS_EMAIL', 'MS_PASSWORD');
config.recordingWaitMinutes = 0; // past recordings already exist — don't wait

const now = new Date();
const CASES = [
  { keyword: 'Mastery', runDate: mostRecentWeekday(1, now, 15, 0) },    // Monday 3:00 PM
  { keyword: 'Essentials', runDate: mostRecentWeekday(2, now, 14, 0) }, // Tuesday 2:00 PM
];

const stripQuery = (u) => String(u || '').split('?')[0].trim();

for (const { keyword, runDate } of CASES) {
  test(`${keyword} as of ${toLocalStamp(runDate)} adds a duplicate row`, async () => {
    const r = await runJob({ keyword, runDate });

    assert.match(r.link, /zoom\.us\/rec\//, 'got a Zoom share link');
    assert.ok(r.date, 'got a session date from the calendar');
    assert.ok(r.topic, 'got a topic from the calendar');
    assert.ok(r.row > 1, 'wrote below existing rows');

    if (!config.dryRun) {
      assert.equal(
        stripQuery(r.previousRowLink),
        stripQuery(r.link),
        `Row ${r.row} should duplicate row ${r.row - 1} (this week's link was already uploaded)`
      );
    }
    console.log(`  ✓ ${keyword}: wrote row ${r.row} → ${r.date} | ${r.topic} | ${r.link}`);
  });
}

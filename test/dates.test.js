// Offline unit tests for the date logic (no browser, no credentials needed).
const test = require('node:test');
const assert = require('node:assert');
const { mostRecentWeekday, zoomDateRegex, parseSheetDate, parseLocal, sameDay, toISODate } = require('../src/dates');

test('this past Monday / Tuesday from a Thursday', () => {
  const thu = parseLocal('2026-10-01');
  assert.equal(toISODate(mostRecentWeekday(1, thu)), '2026-09-28');
  assert.equal(toISODate(mostRecentWeekday(2, thu)), '2026-09-29');
});

test('Monday resolves to itself', () => {
  assert.equal(toISODate(mostRecentWeekday(1, parseLocal('2026-09-28'))), '2026-09-28');
});

test('Zoom date formats match', () => {
  const re = zoomDateRegex(parseLocal('2026-09-08'));
  for (const s of ['Sep 8, 2026 03:00 PM', 'Sep 08, 2026', 'September 8, 2026', '09/08/2026', '9/8/2026', '2026-09-08']) {
    assert.ok(re.test(s), s);
  }
  for (const s of ['Sep 18, 2026', '09/08/2025', '9/18/2026']) assert.ok(!re.test(s), s);
});

test('sheet date parsing', () => {
  const target = parseLocal('2026-09-28');
  for (const s of ['9/28/2026', '09/28/26', '2026-09-28', 'Monday, September 28, 2026', 'Sep 28', '28-Sep-2026', '46293']) {
    const p = parseSheetDate(s, { fallbackYear: 2026 });
    assert.ok(p && sameDay(p, target), `${s} -> ${JSON.stringify(p)}`);
  }
  assert.ok(sameDay(parseSheetDate('28/09/2026', { order: 'DMY' }), target));
  assert.equal(parseSheetDate('Topic text'), null);
});

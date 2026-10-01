// Date helpers. "Run date" = the day the job pretends it is (today, or RUN_AT for tests).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

/** Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" as LOCAL time. */
function parseLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(str).trim());
  if (!m) throw new Error(`Invalid date "${str}" (expected YYYY-MM-DD or YYYY-MM-DDTHH:mm)`);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
}

/** The moment the job runs "as". RUN_AT env var overrides the clock (used by tests). */
function resolveRunDate(override = process.env.RUN_AT) {
  return override ? parseLocal(override) : new Date();
}

/** Most recent given weekday (0=Sun … 6=Sat) on or before `from`, at hour:minute. */
function mostRecentWeekday(weekday, from = new Date(), hour = 12, minute = 0) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hour, minute);
  d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalStamp(d) {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a, b) {
  return a.y === b.getFullYear() && a.m === b.getMonth() + 1 && a.d === b.getDate();
}

/**
 * Regex matching the ways Zoom may display a date, e.g.
 * "Sep 28, 2026", "September 28, 2026", "09/28/2026", "9/28/2026", "2026-09-28".
 */
function zoomDateRegex(d) {
  const Y = d.getFullYear();
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const full = MONTHS[d.getMonth()];
  const short = full.slice(0, 3);
  const parts = [
    `${full},?\\s+0?${D},?\\s+${Y}`,
    `${short}\\.?,?\\s+0?${D},?\\s+${Y}`,
    `0?${M}/0?${D}/${Y}`,
    `${Y}-${pad(M)}-${pad(D)}`,
    `${Y}/${pad(M)}/${pad(D)}`,
  ];
  return new RegExp(`(?:${parts.join('|')})(?!\\d)`, 'i');
}

/**
 * Parse a date as it appears in an Excel cell / formula bar.
 * Returns { y, m, d } or null. `fallbackYear` is used when the text has no year.
 */
function parseSheetDate(text, { order = 'MDY', fallbackYear } = {}) {
  if (text == null) return null;
  const s = String(text).replace(/[​ ]/g, ' ').trim();
  if (!s) return null;
  let m;

  // Excel serial number (e.g. 46293)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  // ISO 2026-09-28
  if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return { y: +m[1], m: +m[2], d: +m[3] };
  // 9/28/2026, 9-28-26, 28.09.2026
  if ((m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return order === 'DMY' ? { y, m: +m[2], d: +m[1] } : { y, m: +m[1], d: +m[2] };
  }
  // 9/28 (no year)
  if ((m = /^(?:[A-Za-z]+,?\s+)?(\d{1,2})\/(\d{1,2})$/.exec(s)) && fallbackYear) {
    return order === 'DMY'
      ? { y: fallbackYear, m: +m[2], d: +m[1] }
      : { y: fallbackYear, m: +m[1], d: +m[2] };
  }
  const monthIdx = (name) => MONTHS.findIndex((x) => x.toLowerCase().startsWith(name.toLowerCase().slice(0, 3))) + 1;
  // September 28, 2026 / Mon, Sep 28 2026 / Sep 28
  if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(s))) {
    const y = m[3] ? +m[3] : fallbackYear;
    if (y) return { y, m: monthIdx(m[1]), d: +m[2] };
  }
  // 28 September 2026 / 28-Sep-2026
  if ((m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?[\s-]+(\d{4}))?/i.exec(s))) {
    const y = m[3] ? +m[3] : fallbackYear;
    if (y) return { y, m: monthIdx(m[2]), d: +m[1] };
  }
  return null;
}

module.exports = {
  parseLocal,
  resolveRunDate,
  mostRecentWeekday,
  toISODate,
  toLocalStamp,
  sameDay,
  zoomDateRegex,
  parseSheetDate,
};

const path = require('path');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const env = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
};

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`Missing required .env values: ${missing.join(', ')} (see .env.example)`);
  }
}

module.exports = {
  ROOT,
  requireEnv,
  zoom: {
    email: env('ZOOM_EMAIL'),
    password: env('ZOOM_PASSWORD'),
    recordingsUrl: 'https://zoom.us/recording',
    signinUrl: 'https://zoom.us/signin',
  },
  ms: {
    email: env('MS_EMAIL'),
    password: env('MS_PASSWORD'),
  },
  recordingsSheetUrl: env(
    'RECORDINGS_SHEET_URL',
    'https://sandler365.sharepoint.com/:x:/s/DeltaCo-Op/IQBxt627GUxiTLI_a9cUx1hTAWSnUbvm4Da7du0azm4wW28?e=N6U66z'
  ),
  calendarSheetUrl: env(
    'CALENDAR_SHEET_URL',
    'https://sandler365.sharepoint.com/:x:/s/DeltaCo-Op/IQAeDxMgasewR4q-W74FVmqXAdqBizRl9oAXxruJPld1hJo?e=UljcO9'
  ),
  headless: env('HEADLESS', 'true') !== 'false',
  dryRun: env('DRY_RUN', 'false') === 'true',
  sheetDateOrder: env('SHEET_DATE_ORDER', 'MDY').toUpperCase(),
  recordingWaitMinutes: Number(env('RECORDING_WAIT_MINUTES', '30')),
  profileDir: path.join(ROOT, '.auth', 'profile'),
  logDir: path.join(ROOT, 'logs'),
};

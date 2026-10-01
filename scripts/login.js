#!/usr/bin/env node
// One-time (or whenever a session expires) visible-browser sign-in.
// Pre-fills .env credentials where it can; you finish any captcha / MFA by hand.
// The session is saved in .auth/profile and reused by the headless weekly jobs.

const readline = require('readline');
const config = require('../src/config');
const { launch } = require('../src/browser');
const { ensureMicrosoftLogin } = require('../src/microsoft');

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, () => { rl.close(); res(); });
});

(async () => {
  const context = await launch({ headless: false });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto(config.zoom.recordingsUrl);
  await ask('\n1) Sign in to Zoom in the browser window (if needed) until you see your recordings, then press Enter here… ');

  await page.goto(config.recordingsSheetUrl);
  await ensureMicrosoftLogin(page, { timeoutMs: 15_000 }).catch(() => {});
  await ask('2) Finish the Microsoft sign-in (approve MFA, choose "Stay signed in") until the spreadsheet opens, then press Enter… ');

  await context.close();
  console.log('Sessions saved to .auth/profile. You can now run the jobs headless.');
})();

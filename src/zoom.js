const config = require('./config');
const log = require('./log');
const { isVisible, clickFirstVisible } = require('./browser');
const { zoomDateRegex, toISODate } = require('./dates');

const ZOOM_LINK_RE = /https:\/\/[\w.-]*zoom\.us\/rec\/(?:share|play)\/[^\s"'<>]+/i;

/** Go to the recordings page, signing in with .env credentials if needed. */
async function openRecordings(page) {
  await page.goto(config.zoom.recordingsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  if (/\/(signin|login)/i.test(page.url()) || (await isVisible(page.locator('input#email, input[type="email"]')))) {
    log.info('Zoom: signing in…');
    config.requireEnv('ZOOM_EMAIL', 'ZOOM_PASSWORD');

    const email = page.locator('input#email, input[name="email"], input[type="email"]').first();
    await email.fill(config.zoom.email);

    const password = page.locator('input#password, input[name="password"], input[type="password"]').first();
    if (!(await isVisible(password))) {
      // Newer two-step sign-in: email → Next → password
      await clickFirstVisible([
        page.getByRole('button', { name: /^(next|continue)$/i }),
      ]);
      await password.waitFor({ state: 'visible', timeout: 15_000 });
    }
    await password.fill(config.zoom.password);
    await clickFirstVisible([
      page.locator('#js_btn_login'),
      page.getByRole('button', { name: /^sign in$/i }),
      page.locator('button[type="submit"]'),
    ]);

    try {
      await page.waitForURL(/zoom\.us\/(recording|profile|meeting|myhome)/i, { timeout: 45_000 });
    } catch {
      throw new Error(
        'Zoom sign-in did not complete (captcha or 2-step verification?). ' +
        'Run `npm run login` once to sign in by hand; the session is then reused.'
      );
    }
    if (!/\/recording/i.test(page.url())) {
      await page.goto(config.zoom.recordingsUrl, { waitUntil: 'domcontentloaded' });
    }
  }
  await page.waitForLoadState('networkidle').catch(() => {});
}

/** Find the row in the recordings list whose topic has `keyword` and date = runDate. */
async function findRecordingRow(page, keyword, runDate) {
  const dateRe = zoomDateRegex(runDate);
  const kwRe = new RegExp(keyword, 'i');

  // Narrow the list using the search box if it exists (searches by topic).
  const search = page.getByPlaceholder(/search/i).first();
  if (await isVisible(search)) {
    await search.fill(keyword);
    await search.press('Enter');
    await page.waitForTimeout(2500);
  }

  const rows = page
    .locator('tr, [role="row"], .recording-list-item, .zm-table-row')
    .filter({ hasText: kwRe })
    .filter({ hasText: dateRe });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await rows.count()) > 0) return rows.first();
    await page.waitForTimeout(1000);
  }
  return null;
}

/** Find the recording, polling for up to RECORDING_WAIT_MINUTES (it may still be processing). */
async function waitForRecordingRow(page, keyword, runDate) {
  const until = Date.now() + config.recordingWaitMinutes * 60_000;
  for (;;) {
    const row = await findRecordingRow(page, keyword, runDate);
    if (row) return row;
    if (Date.now() >= until) {
      throw new Error(`No Zoom recording containing "${keyword}" dated ${toISODate(runDate)} was found.`);
    }
    log.info(`Zoom: "${keyword}" recording for ${toISODate(runDate)} not there yet; checking again in 5 min…`);
    await page.waitForTimeout(5 * 60_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

/** Turn a labelled toggle/checkbox OFF. Tolerant of Zoom's different control styles. */
async function turnOff(scope, labelRe) {
  const candidates = [
    scope.getByRole('switch', { name: labelRe }),
    scope.getByRole('checkbox', { name: labelRe }),
    scope.getByLabel(labelRe),
    scope.locator('label, li, div').filter({ hasText: labelRe })
      .locator('input[type="checkbox"], [role="switch"], [role="checkbox"]'),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    if ((await loc.count().catch(() => 0)) === 0) continue;
    const checked = await el.isChecked().catch(async () =>
      (await el.getAttribute('aria-checked')) === 'true');
    if (checked) {
      const page = scope.page();
      await el.click({ force: true });
      await page.waitForTimeout(500);
      // Some versions confirm when turning off a passcode.
      await clickFirstVisible([page.getByRole('button', { name: /^(ok|yes|confirm|turn off)$/i })]).catch(() => {});
      log.info(`Zoom: turned off "${labelRe.source}"`);
    } else {
      log.info(`Zoom: "${labelRe.source}" already off`);
    }
    return true;
  }
  log.warn(`Zoom: could not find the "${labelRe.source}" setting — check it manually.`);
  return false;
}

async function readClipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
}

/** Steps 1–2: return the share link for today's `keyword` recording. */
async function getShareLink(page, keyword, runDate) {
  await openRecordings(page);
  log.info(`Zoom: looking for "${keyword}" recording on ${toISODate(runDate)}…`);
  const row = await waitForRecordingRow(page, keyword, runDate);
  log.info(`Zoom: found row: ${(await row.innerText()).replace(/\s+/g, ' ').slice(0, 140)}`);

  await row.hover();
  const opened = await clickFirstVisible([
    row.getByRole('button', { name: /^share$/i }),
    row.getByText(/^\s*share\s*$/i),
    row.locator('[aria-label*="share" i]'),
  ]);
  if (!opened) throw new Error('Zoom: could not find the Share button on the recording row.');

  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible' });
  await page.waitForTimeout(1000);

  // Open the share settings panel (labelled "Settings" or "Share settings" depending on version).
  await clickFirstVisible([
    dialog.getByRole('button', { name: /settings/i }),
    dialog.getByRole('link', { name: /settings/i }),
    dialog.getByText(/^\s*(share\s+)?settings\s*$/i),
  ]);
  await page.waitForTimeout(1000);

  await turnOff(dialog, /viewers can download|allow.*download/i);
  await turnOff(dialog, /passcode/i);

  await clickFirstVisible([dialog.getByRole('button', { name: /^save$/i })]);
  await page.waitForTimeout(1500);

  // Copy the link. Clear the clipboard first so we know the value is fresh.
  await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => {});
  const scope = page.getByRole('dialog').last();
  await clickFirstVisible([
    scope.getByRole('button', { name: /copy (share(able)? )?link/i }),
    scope.getByRole('button', { name: /copy sharing information/i }),
    scope.getByText(/^\s*copy (share(able)? )?link\s*$/i),
    scope.getByRole('button', { name: /^copy$/i }),
  ]);
  await page.waitForTimeout(1000);

  let link = (ZOOM_LINK_RE.exec(await readClipboard(page)) || [])[0];
  if (!link) {
    // Fallback: the link is usually shown in the dialog itself.
    const texts = await scope.locator('input, textarea, a, span, div').evaluateAll((els) =>
      els.map((e) => e.value || e.href || e.textContent || ''));
    link = texts.map((t) => (/https:\/\/[\w.-]*zoom\.us\/rec\/(?:share|play)\/[^\s"'<>]+/i.exec(t) || [])[0]).find(Boolean);
  }
  if (!link) throw new Error('Zoom: could not read the share link (clipboard and dialog were empty).');

  await page.keyboard.press('Escape').catch(() => {});
  log.info(`Zoom: share link = ${link}`);
  return link;
}

module.exports = { getShareLink };

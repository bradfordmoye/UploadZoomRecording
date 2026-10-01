const fs = require('fs');
const { chromium } = require('playwright');
const config = require('./config');

/**
 * Launch Chromium with a persistent profile in .auth/profile so Zoom and
 * Microsoft sessions ("stay signed in") survive between weekly runs.
 * This avoids repeated logins, which is what usually triggers captchas / MFA.
 */
async function launch({ headless = config.headless } = {}) {
  fs.mkdirSync(config.profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless,
    viewport: { width: 1600, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
    locale: 'en-US',
    timezoneId: process.env.TZ || 'America/New_York',
    // Optional: use an existing Chrome/Chromium instead of Playwright's download.
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(60_000);
  return context;
}

/** True if the locator resolves to a visible element (never throws). */
async function isVisible(locator) {
  try {
    return await locator.first().isVisible();
  } catch {
    return false;
  }
}

/** Click the first visible locator among candidates. Returns true if clicked. */
async function clickFirstVisible(candidates, opts = {}) {
  for (const loc of candidates) {
    if (await isVisible(loc)) {
      await loc.first().click(opts);
      return true;
    }
  }
  return false;
}

async function screenshotAll(context, label) {
  fs.mkdirSync(config.logDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const files = [];
  for (const [i, page] of context.pages().entries()) {
    const file = `${config.logDir}/${label}-${ts}-tab${i + 1}.png`;
    try {
      await page.screenshot({ path: file, fullPage: false });
      files.push(file);
    } catch { /* page may be closed */ }
  }
  return files;
}

module.exports = { launch, isVisible, clickFirstVisible, screenshotAll };

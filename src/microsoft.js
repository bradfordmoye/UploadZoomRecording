const config = require('./config');
const log = require('./log');
const { isVisible } = require('./browser');

const LOGIN_HOST_RE = /login\.microsoftonline\.com|login\.live\.com|login\.microsoft\.com|account\.microsoft\.com/i;

/**
 * If the page is on a Microsoft sign-in screen, sign in with MS_EMAIL / MS_PASSWORD
 * and wait until we're back on SharePoint. No-op if already signed in.
 */
async function ensureMicrosoftLogin(page, { timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const submit = page.locator('#idSIButton9, input[type="submit"], button[type="submit"]').first();
  let announced = false;

  while (Date.now() < deadline) {
    const url = page.url();
    if (!LOGIN_HOST_RE.test(url)) {
      if (/sharepoint\.com/i.test(url)) return;
      await page.waitForTimeout(1000);
      continue;
    }
    if (!announced) {
      log.info('Microsoft: signing in…');
      config.requireEnv('MS_EMAIL', 'MS_PASSWORD');
      announced = true;
    }

    const emailBox = page.locator('input[name="loginfmt"]');
    const passBox = page.locator('input[name="passwd"]');
    const accountTile = page.locator(`[data-test-id="${config.ms.email}"], div[role="button"]:has-text("${config.ms.email}")`);
    const kmsi = page.locator('#KmsiCheckboxField, #kmsiTitle').or(page.getByText(/stay signed in/i));
    const mfa = page.getByText(/approve sign in|enter code|verify your identity|authenticator app|more information required/i);

    if (await isVisible(emailBox)) {
      await emailBox.first().fill(config.ms.email);
      await submit.click();
    } else if (await isVisible(passBox)) {
      await passBox.first().fill(config.ms.password);
      await submit.click();
    } else if (await isVisible(accountTile)) {
      await accountTile.first().click();
    } else if (await isVisible(kmsi)) {
      await page.locator('#KmsiCheckboxField').check().catch(() => {});
      await submit.click(); // "Yes"
    } else if (await isVisible(mfa)) {
      throw new Error(
        'Microsoft is asking for multi-factor authentication, which a headless run cannot answer. ' +
        'Run `npm run login` once and complete MFA by hand (tick "Stay signed in"); later runs reuse that session.'
      );
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('Microsoft sign-in timed out.');
}

module.exports = { ensureMicrosoftLogin };

// Drives Excel for the web (SharePoint) through its Name Box and formula bar.
// The grid itself is drawn on a canvas, so instead of clicking cells we:
//   - jump to a cell by typing its address into the Name Box,
//   - read a cell's value from the formula bar,
//   - write by typing into the selected cell.

const log = require('./log');
const config = require('./config');
const { isVisible, clickFirstVisible } = require('./browser');
const { ensureMicrosoftLogin } = require('./microsoft');
const { parseSheetDate, sameDay, toISODate } = require('./dates');

const NAME_BOX = [
  '#FormulaBar-NameBox-input',
  'input[aria-label="Name Box"]',
  'input[aria-label*="Name Box" i]',
].join(', ');

const FORMULA_BAR = [
  '#formulaBarTextDivId_textElement',
  '#formulaBarTextDivId',
  '[aria-label="formula bar" i]',
  '[aria-label*="formula bar" i]',
].join(', ');

const clean = (s) => String(s || '').replace(/[​‌‍﻿]/g, '').replace(/ /g, ' ').trim();

async function findExcelFrame(page, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await isVisible(frame.locator(NAME_BOX))) return frame;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Excel did not finish loading (no Name Box found) at ${page.url()}`);
}

class ExcelWorkbook {
  constructor(page, frame, label) {
    this.page = page;
    this.frame = frame;
    this.label = label;
  }

  /** Open a workbook URL, sign in if needed, and make sure it's in editing mode. */
  static async open(page, url, label) {
    log.info(`${label}: opening workbook…`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await ensureMicrosoftLogin(page);
    let frame = await findExcelFrame(page);
    const wb = new ExcelWorkbook(page, frame, label);
    await wb.ensureEditing();
    return wb;
  }

  async ensureEditing() {
    const f = this.frame;
    const switched =
      (await clickFirstVisible([f.getByRole('button', { name: /^edit workbook$/i })]) &&
        (await clickFirstVisible([f.getByRole('menuitem', { name: /edit in browser/i }), f.getByText(/edit in browser/i)]))) ||
      ((await clickFirstVisible([f.getByRole('button', { name: /^viewing$/i })])) &&
        (await clickFirstVisible([f.getByRole('menuitemradio', { name: /editing/i }), f.getByRole('menuitem', { name: /editing/i })])));
    if (switched) {
      log.info(`${this.label}: switched to editing mode`);
      await this.page.waitForTimeout(3000);
      this.frame = await findExcelFrame(this.page);
    }
  }

  get nameBox() {
    return this.frame.locator(NAME_BOX).first();
  }

  /** Activate the first sheet tab whose name contains `keyword`. Returns the sheet name. */
  async selectSheet(keyword) {
    const re = new RegExp(keyword, 'i');
    const tab = this.frame.getByRole('tab', { name: re }).first();
    let name;
    if ((await tab.count()) > 0) {
      name = clean(await tab.innerText().catch(() => '')) || clean(await tab.getAttribute('aria-label'));
      await tab.scrollIntoViewIfNeeded().catch(() => {});
      await tab.click().catch(async () => {
        // Tab is scrolled out of view — navigate via the Name Box instead.
        await this.goTo(`'${name}'!A1`);
      });
    } else {
      const all = await this.frame.locator('[role="tab"]').allInnerTexts();
      throw new Error(`${this.label}: no sheet tab contains "${keyword}". Tabs: ${all.map(clean).join(' | ')}`);
    }
    await this.page.waitForTimeout(1500);
    this.sheetName = name;
    log.info(`${this.label}: on sheet "${name}"`);
    return name;
  }

  async goTo(ref) {
    const nb = this.nameBox;
    await nb.click();
    await nb.fill(ref);
    await nb.press('Enter');
    await this.page.waitForTimeout(400);
  }

  async currentRef() {
    return clean(await this.nameBox.inputValue());
  }

  async read(ref) {
    await this.goTo(ref);
    const fb = this.frame.locator(FORMULA_BAR).first();
    return clean(await fb.innerText().catch(() => fb.textContent()));
  }

  /** Last non-empty row across the given columns (uses Ctrl+Up from the bottom of the sheet). */
  async lastRow(columns = ['A', 'B', 'C']) {
    let max = 0;
    for (const col of columns) {
      await this.goTo(`${col}1048576`);
      await this.page.keyboard.press('ControlOrMeta+ArrowUp');
      await this.page.waitForTimeout(400);
      const row = Number((/(\d+)$/.exec(await this.currentRef()) || [])[1] || 0);
      // If the column is empty, Ctrl+Up lands on row 1 even though it's blank.
      const effective = row === 1 && !(await this.read(`${col}1`)) ? 0 : row;
      max = Math.max(max, effective);
    }
    return max;
  }

  /** Type a value into a cell. Refuses to overwrite a non-empty cell. */
  async write(ref, value) {
    const existing = await this.read(ref);
    if (existing) throw new Error(`${this.label}: refusing to overwrite ${ref} (contains "${existing}")`);
    if (config.dryRun) {
      log.info(`${this.label}: [DRY_RUN] would write ${ref} = ${value}`);
      return;
    }
    await this.goTo(ref);
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`; // keep text from being read as a formula
    await this.page.keyboard.type(text, { delay: 5 });
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
    log.info(`${this.label}: wrote ${ref} = ${value}`);
  }

  /** Find the row whose column-A date equals runDate; return { row, date, topic }. */
  async findRowByDate(runDate, { dateCol = 'A', topicCol = 'B' } = {}) {
    const last = await this.lastRow([dateCol]);
    for (let r = 1; r <= last; r++) {
      const raw = await this.read(`${dateCol}${r}`);
      const parsed = parseSheetDate(raw, { order: config.sheetDateOrder, fallbackYear: runDate.getFullYear() });
      if (parsed && sameDay(parsed, runDate)) {
        const topic = await this.read(`${topicCol}${r}`);
        log.info(`${this.label}: row ${r} matches ${toISODate(runDate)} → "${raw}" / "${topic}"`);
        return { row: r, date: raw, topic };
      }
    }
    throw new Error(`${this.label}: no row on "${this.sheetName}" has session date ${toISODate(runDate)}`);
  }

  /** Wait for Excel's autosave to finish. */
  async waitForSave() {
    await this.page.waitForTimeout(2000);
    const saving = this.frame.getByText(/saving/i).first();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && (await isVisible(saving))) await this.page.waitForTimeout(1000);
    await this.page.waitForTimeout(3000);
  }
}

module.exports = { ExcelWorkbook };

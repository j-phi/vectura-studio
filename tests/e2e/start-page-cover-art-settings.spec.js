const { test, expect } = require('@playwright/test');
const { resetStorage, openSettings, closeSettings, flush } = require('./helpers/start-page');

// Settings > Cover > Cover art: pick the piece (your pieces or templates) and the colorway for every cover style.
const TYPES = ['wavetable', 'lissajous', 'rings'];
const SHOTS = process.env.VECTURA_SHOTS_DIR || '';

const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.startPage && window.app.engine));
};
const bootWithWorks = async (page) => {
  await boot(page);
  await resetStorage(page);
  await boot(page);
  await page.evaluate(async (list) => {
    for (const t of list) {
      window.app.engine.layers.length = 0;
      window.app.engine.addLayer(t);
      await window.app.recents.record({ name: `${t}.vectura`, source: 'open' });
    }
    window.app.engine.layers.length = 0;
  }, TYPES);
  await page.evaluate(() => window.app.startPage.render());
};
const setStyle = async (page, style) => {
  await page.locator(`#sp-settings .sp-style[data-style="${style}"]`).click();
  await expect(page.locator('#sp-cover')).toHaveAttribute('data-style', style);
};
const slot0 = (page) => page.evaluate(() => {
  const s = window.app.startPage.cover.slots()[0];
  return s && { artId: s.art.id, chosenId: s.chosenId, chosenCw: s.chosenCw, paper: s.cw.paper, ink: s.cw.ink };
});
const firstTemplate = (page, k = 0) => page.locator(`#sp-settings select[data-cover-art-k="${k}"] optgroup[label="Templates"] option`).first().getAttribute('value');

test.describe('Start Page cover art settings', () => {
  test('word style: a template piece and a chosen colorway, kept through a page mode change and a reload', async ({ page }) => {
    await bootWithWorks(page);
    await openSettings(expect, page);
    await setStyle(page, 'word');
    const sel = page.locator('#sp-settings select[data-cover-art-k="0"]');
    await expect(sel.locator('optgroup[label="Your pieces"] option')).toHaveCount(TYPES.length);
    const pick = await firstTemplate(page);
    expect(pick).toBeTruthy();
    await sel.selectOption(pick);
    await expect.poll(async () => (await slot0(page)).artId).toBe(pick);
    await expect(page.locator('#sp-cover .sp-xc-word')).toHaveAttribute('data-art-id', pick);
    // The swatches follow the new piece: a template has no colors of its own (the previous work's "own" swatch is gone).
    await expect(page.locator('#sp-settings .sp-cvart [data-cw-id="own"]')).toHaveCount(0);

    const swatches = page.locator('#sp-settings .sp-cvart [role="radio"][data-cw-id]');
    await expect(swatches.first()).toHaveAttribute('data-cw-id', 'page');
    await expect(swatches.first()).toHaveAttribute('aria-checked', 'true');
    await swatches.nth(2).click();
    await expect(swatches.nth(2)).toHaveAttribute('aria-checked', 'true');
    const chosen = await slot0(page);
    expect(chosen.chosenCw).toBeTruthy();
    expect(chosen.paper).toBe(chosen.chosenCw.paper);
    await expect(page.locator('#sp-cover .sp-xc-word')).toHaveAttribute('data-sp-paper', chosen.chosenCw.paper);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cover-art-word.png` });

    await page.locator('#sp-settings [data-sp-mode="mono"]').click();
    await expect.poll(async () => (await slot0(page)).paper).toBe(chosen.chosenCw.paper);

    await closeSettings(expect, page);
    await flush(page);
    await boot(page);
    await expect.poll(async () => { const s = await slot0(page); return s && `${s.artId}|${s.paper}`; }, { timeout: 20000 })
      .toBe(`${pick}|${chosen.chosenCw.paper}`);
  });

  test('mosaic: one row per letter; letter 2 takes the chosen piece; reset returns to automatic', async ({ page }) => {
    await bootWithWorks(page);
    await openSettings(expect, page);
    await setStyle(page, 'mosaic');
    const letters = await page.locator('#start-page .sp-lt').count();
    await expect(page.locator('#sp-settings .sp-cvart select')).toHaveCount(letters);
    const pick = await firstTemplate(page, 1);
    await page.locator('#sp-settings select[data-cover-art-k="1"]').selectOption(pick);
    await expect(page.locator('#start-page .sp-lt[data-k="1"]')).toHaveAttribute('data-art-id', pick);
    const reset = page.locator('#sp-settings [data-act="reset-cover-art"]');
    await expect(reset).toBeEnabled();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cover-art-mosaic.png` });
    await reset.click();
    await expect(reset).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.app.startPage.cover.slots()[1].chosenId)).toBe('');
  });

  test('band: your own piece offers "Its own colors"; the choice is per style', async ({ page }) => {
    await bootWithWorks(page);
    await openSettings(expect, page);
    await setStyle(page, 'band');
    const sel = page.locator('#sp-settings select[data-cover-art-k="0"]');
    const work = await sel.locator('optgroup[label="Your pieces"] option').first().getAttribute('value');
    await sel.selectOption(work);
    await expect.poll(async () => (await slot0(page)).artId).toBe(work);
    await expect(page.locator('#sp-settings .sp-cvart [data-cw-id="own"]')).toHaveCount(1);
    await page.locator('#sp-settings .sp-cvart [data-cw-id="own"]').click();
    await expect.poll(async () => (await slot0(page)).chosenCw && (await slot0(page)).chosenCw.key).toBe('own');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cover-art-band.png` });
    await setStyle(page, 'word');
    await expect(page.locator('#sp-settings select[data-cover-art-k="0"]')).toHaveValue('');
  });
});

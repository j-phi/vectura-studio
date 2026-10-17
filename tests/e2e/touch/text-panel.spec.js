const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const h = require('../helpers/text-panel-setup');

// TUX-032 clause 4: a finger tap on a numeric field selects its whole value, so typing replaces it.
// Outcome proof: value AND the layer parameter after a blur (the decimal pad has no Return key).
test.describe('TUX-032 numeric field replaces its value', () => {
  test.beforeEach(async ({ page }) => { await h.waitApp(page); });
  const param = (page, k) => page.evaluate((key) => window.app.engine.getActiveLayer().params[key], k);
  const blurByTap = async (page) => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(150); };

  test('Size (value 40) takes a typed 72', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    await h.tapIn(page, touch, page.locator('[data-ref="fitToggle"]'));
    const sel = '.vtp-scrub[data-field="size"] input';
    const input = page.locator(sel);
    await input.scrollIntoViewIfNeeded();
    expect(await input.inputValue()).toBe('40');
    await touch.tap(page, input);
    await page.waitForTimeout(150);
    await page.keyboard.insertText('72');
    await blurByTap(page);
    expect(await input.inputValue()).toBe('72');
    expect(await param(page, 'fontSize')).toBe(72);
  });

  test('Leading (1.40) takes a typed 2', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    const sel = '.vtp-scrub[data-field="leading"] input';
    const input = page.locator(sel);
    await input.scrollIntoViewIfNeeded();
    expect(await input.inputValue()).toBe('1.40');
    await touch.tap(page, input);
    await page.waitForTimeout(150);
    await page.keyboard.insertText('2');
    await blurByTap(page);
    expect(parseFloat(await input.inputValue())).toBe(2);   // formatted "2.00"; the defect gave 3.00 (clamped "21.40")
    expect(await param(page, 'lineHeight')).toBe(2);
  });

  test('shared slider value chip (Generator pane) takes a typed value', async ({ page }) => {
    await openGenerator(page);
    // First chip whose value is more than one character, so a caret-only tap would not look like select-all.
    const idx = await page.evaluate(() => [...document.querySelectorAll('#left-panel-content input.slider-val')].findIndex((n) => n.value.length > 1 && n.offsetParent));
    expect(idx, 'a multi-character slider chip exists').toBeGreaterThanOrEqual(0);
    const el = page.locator('#left-panel-content input.slider-val').nth(idx);
    await el.scrollIntoViewIfNeeded();
    const before = await el.inputValue();
    expect(before.length).toBeGreaterThan(1);
    await touch.tap(page, el);
    await page.waitForTimeout(150);
    const sel = await el.evaluate((n) => [n.selectionStart, n.selectionEnd, n.value.length]);
    expect(sel, `selection after tap on chip value "${before}"`).toEqual([0, before.length, before.length]);
    await page.keyboard.insertText('7');
    expect(await el.inputValue(), 'typing replaced the whole chip value').toBe('7');
  });
});

async function openGenerator(page) {
  await page.evaluate(() => { window.app.engine.addLayer('flowfield'); window.app.regen(); window.app.ui.buildControls(); });
  await h.openLeftPane(page, touch);
}

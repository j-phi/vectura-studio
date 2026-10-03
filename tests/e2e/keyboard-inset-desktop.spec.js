const { test, expect } = require('@playwright/test');

// TUX-032 D6 desktop parity: mouse behavior is unchanged by the touch keyboard work.
test.describe('TUX-032 desktop parity (mouse)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => {
      const id = window.app.engine.addLayer('text');
      window.app.engine.activeLayerId = id;
      window.app.regen();
      window.app.ui.buildControls();
    });
    await page.waitForSelector('.vtp-fontpick-trigger');
  });
  const inset = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim());

  test('a mouse click on the font trigger still focuses the search', async ({ page }) => {
    await page.locator('.vtp-fontpick-trigger').click();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.activeElement === document.querySelector('.vtp-fp-search input'))).toBe(true);
    expect(await inset(page)).toBe('0px');
  });

  test('a mouse click in a numeric value places a caret; a drag keeps a partial selection', async ({ page }) => {
    const input = page.locator('.vtp-scrub[data-field="leading"] input');
    await input.scrollIntoViewIfNeeded();
    const box = await input.boundingBox();
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const caret = await input.evaluate((n) => [n.selectionStart, n.selectionEnd, n.value.length]);
    expect(caret[0], 'caret, not select-all').toBe(caret[1]);
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 6, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const sel = await input.evaluate((n) => [n.selectionStart, n.selectionEnd, n.value.length]);
    expect(sel[1] - sel[0], 'drag-select kept').toBeGreaterThan(0);
    expect(await inset(page)).toBe('0px');
  });
});

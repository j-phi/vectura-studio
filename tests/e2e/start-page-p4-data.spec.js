const { test, expect } = require('@playwright/test');

// Start Page P4 data fixes in a real browser: a Save after Open downloads under the opened file's name, and the
// editor wordmark is keyboard operable with a visible focus ring.
const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};

test.describe('Start Page P4 data fixes', () => {
  test('Open then Save downloads <file name>.vectura, not vectura-<date>', async ({ page }) => {
    await boot(page, '?startPage=skip');
    const payload = await page.evaluate(() => {
      window.app.engine.addLayer('rings');
      return JSON.stringify({ type: 'vectura', version: 'x', state: window.app.captureState(), images: {} });
    });
    await page.evaluate((json) => window.app.ui.openVecturaFile(new File([json], 'Riverbed.vectura')), payload);
    await page.waitForFunction(() => window.app.documentName === 'Riverbed');
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.app.ui.saveVecturaFile())]);
    expect(download.suggestedFilename()).toBe('Riverbed.vectura');
  });

  test('the editor wordmark opens the Start Page from the keyboard and shows a focus ring', async ({ page }) => {
    await boot(page, '?startPage=skip');
    const btn = page.locator('#app-header h1 button');
    await expect(btn).toHaveCount(1);
    await btn.focus();
    const ring = await btn.evaluate((el) => { const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; });
    expect(ring).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.app.startPage.isOpen())).toBe(true);
  });
});

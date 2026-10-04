const { test, expect } = require('@playwright/test');

// TUX-053 desktop parity (D6): the .vectura picker keeps today's accept string and still loads.
const OCTET = 'application/octet-stream';

test('desktop File > Open keeps the desktop accept and loads a .vectura', async ({ page }) => {
  const boot = async () => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  };
  await boot();
  const fixture = await page.evaluate(() => {
    window.app.engine.addLayer('wavetable');
    window.app.engine.addLayer('lissajous');
    return JSON.stringify({ type: 'vectura', version: 'x', state: window.app.captureState(), images: {} });
  });
  const expected = JSON.parse(fixture).state.engine.layers.map((l) => l.type);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* noop */ } });
  await boot();

  await page.locator('#btn-menu-file').click();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('#btn-open-vectura').click();
  const chooser = await chooserP;
  expect(await page.evaluate(() => document.getElementById('file-open-vectura').accept)).toBe('.vectura,application/json');
  await chooser.setFiles({ name: 'proj.vectura', mimeType: OCTET, buffer: Buffer.from(fixture) });

  await page.waitForFunction((n) => window.app.engine.layers.length === n, expected.length, { timeout: 10000 });
  expect(await page.evaluate(() => window.app.engine.layers.map((l) => l.type))).toEqual(expected);
  await expect(page.locator('.vectura-toast', { hasText: 'Project loaded' })).toBeVisible();
});

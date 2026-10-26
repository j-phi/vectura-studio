const fs = require('fs');
const { test, expect } = require('@playwright/test');

// Paper selector (desktop): pick a paper + colour in the Pen / Paper tab, save
// and reopen the .vectura (paper is per project), and Set as default → a fresh
// load starts on the default paper. Also checks the realistic paper actually
// changes the canvas pixels while 'none' paints the plain sheet.

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

const sheetPixel = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  r.draw();
  const dpr = r.getBackingDpr();
  const p = window.app.engine.currentProfile;
  // A point on the sheet near its top-left corner, away from the art.
  const x = Math.round((r.offsetX + p.width * r.scale * 0.04) * dpr);
  const y = Math.round((r.offsetY + p.height * r.scale * 0.04) * dpr);
  const d = r.ctx.getImageData(x, y, 24, 24).data;
  let sum = 0; let sumSq = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sumSq += l * l; }
  const mean = sum / n;
  return { mean, variance: sumSq / n - mean * mean };
});

test('paper selector: per-project paper survives save/reopen; default paper drives new documents', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(() => window.app.engine.addLayer('harmonograph'));

  const tab = page.locator('.right-pane-tab[data-tab="pens"]');
  await expect(tab).toHaveText('Pen / Paper');
  await tab.click();
  await expect(page.locator('#paper-global-section')).toBeVisible();

  // Plain sheet is flat; cold-press adds visible tooth.
  const plain = await sheetPixel(page);
  expect(plain.variance).toBeLessThan(1);
  await page.locator('.paper-swatch[data-paper-type="cold-press"]').click();
  await expect(page.locator('.paper-swatch[data-paper-type="cold-press"]')).toHaveAttribute('aria-checked', 'true');
  // Texture refines in idle slices: wait for the queue to drain.
  await page.waitForFunction(() => window.Vectura.PaperTexture.cacheStats().queued === 0, null, { timeout: 15000 });
  const textured = await sheetPixel(page);
  expect(textured.variance).toBeGreaterThan(plain.variance + 2);

  // Any colour (the picker input is what the native/modal picker writes to).
  await page.evaluate(() => {
    const input = document.getElementById('inp-paper-color');
    input.value = '#e8d8c0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#paper-color-pill')).toHaveText('#E8D8C0');

  // Save the project through the real File > Save path.
  const downloadP = page.waitForEvent('download');
  await page.evaluate(() => window.app.ui.saveVecturaFile());
  const download = await downloadP;
  const saved = fs.readFileSync(await download.path(), 'utf8');
  const parsed = JSON.parse(saved);
  expect(parsed.state.settings.paper).toMatchObject({ type: 'cold-press', color: '#e8d8c0' });
  expect(parsed.state.settings.bgColor).toBe('#e8d8c0');

  // Fresh load (no default set) is a plain sheet; reopening restores the paper.
  await boot(page);
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper.type)).toBe('none');
  await page.locator('#btn-menu-file').click();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('#btn-open-vectura').click();
  const chooser = await chooserP;
  await chooser.setFiles({ name: 'paper.vectura', mimeType: 'application/octet-stream', buffer: Buffer.from(saved) });
  await page.waitForFunction(() => window.Vectura.SETTINGS.paper && window.Vectura.SETTINGS.paper.type === 'cold-press', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper)).toMatchObject({ type: 'cold-press', color: '#e8d8c0' });
  await page.locator('.right-pane-tab[data-tab="pens"]').click();
  await expect(page.locator('.paper-swatch[data-paper-type="cold-press"]')).toHaveAttribute('aria-checked', 'true');

  // Set as default → a fresh load (new document) starts on it.
  await page.locator('.paper-swatch[data-paper-type="kraft"]').click();
  await page.locator('#btn-paper-set-default').click();
  await expect(page.locator('#paper-default-badge')).toBeVisible();
  await boot(page);
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper)).toMatchObject({ type: 'kraft' });
  await page.locator('.right-pane-tab[data-tab="pens"]').click();
  await expect(page.locator('#paper-default-badge')).toBeVisible();
  // …and the Document Setup Default paper row reflects it.
  expect(await page.evaluate(() => document.getElementById('set-default-paper-type').value)).toBe('kraft');
});

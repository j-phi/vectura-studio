const { test, expect } = require('@playwright/test');

// TUX-036 desktop parity: mouse hover still reveals row actions and a preset X still deletes in one click.
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-036';

test('desktop: hover reveals row actions; Delete works on one click', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  const ids = await page.evaluate(() => {
    const e = window.app.engine;
    const a = e.addLayer('spiral'); const b = e.addLayer('spiral');
    window.app.renderer.setSelection([a], a); e.activeLayerId = a;
    window.app.ui.renderLayers();
    return { a, b };
  });
  const card = page.locator(`#layer-list [data-layer-id="${ids.b}"]`);
  const acts = card.locator('.lvl-acts');
  await expect(acts).toHaveCSS('opacity', '0');
  await card.hover();
  await expect(acts).toHaveCSS('opacity', '1');
  const del = acts.locator('.lvl-ab.del');
  const hit = await del.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h); });
  expect(hit).toBe(true);
  await page.screenshot({ path: `${EVID}/desktop-1600x1000-hover.png` }).catch(() => {});
  await del.click();
  expect(await page.evaluate(() => window.app.engine.layers.length)).toBe(1);
});

test('desktop: gallery user-preset X deletes on a single click', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const lib = window.Vectura.PresetLibraries.harmonograph;
    localStorage.setItem('vectura.user_presets.harmonograph', JSON.stringify([
      { id: 'user-harmonograph-dsk', name: 'Desk One', preset_system: 'harmonograph', group: 'User', params: { ...(lib[0].params || {}) } },
    ]));
    const id = window.app.engine.addLayer('harmonograph');
    window.app.renderer.setSelection([id], id);
    window.app.ui.renderLayers(); window.app.ui.buildControls();
  });
  await page.locator('.hg-preset-trigger').first().click();
  const row = page.locator('.hg-preset-option[data-preset-id="user-harmonograph-dsk"]');
  await row.hover();
  await row.locator('.hg-preset-delete').click();
  await expect(row).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vectura.user_presets.harmonograph')).length)).toBe(0);
});

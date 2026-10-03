const { test, expect } = require('@playwright/test');

// TUX-037 desktop parity (D6): the Undo toast now also shows on a mouse delete, in the
// same top-right spot every other toast uses, and a mouse click on Undo restores the layer.
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-037';

test('desktop: row Delete shows the toast top-right; mouse Undo restores', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  const ids = await page.evaluate(() => {
    const e = window.app.engine;
    const a = e.addLayer('spiral'); const b = e.addLayer('spiral');
    window.app.pushHistory();
    window.app.renderer.setSelection([a], a); e.activeLayerId = a;
    window.app.ui.renderLayers();
    return { a, b, order: e.layers.map((l) => l.id) };
  });
  const card = page.locator(`#layer-list [data-layer-id="${ids.b}"]`);
  await card.hover();
  await card.locator('.lvl-acts .lvl-ab.del').click();

  const host = page.locator('#vectura-toast-host');
  await expect(host.locator('[data-action="undo"]')).toBeVisible();
  const css = await host.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: s.top, right: s.right, bottom: s.bottom, zIndex: s.zIndex };
  });
  expect(css).toMatchObject({ position: 'fixed', top: '16px', right: '16px', zIndex: '9000' });
  await page.screenshot({ path: `${EVID}/desktop-chromium.png` }).catch(() => {});

  await host.locator('[data-action="undo"]').click();
  const after = await page.evaluate(() => window.app.engine.layers.map((l) => l.id));
  expect(after).toEqual(ids.order);
});

const { test, expect } = require('@playwright/test');

/*
 * e2e — B2: the tree object panel has Scale X/Y/Z rows, and the uniform Scale
 * slider keeps a per-axis shape (sx/sy/sz multiplied, not wiped).
 */
test('tree object panel: per-axis scale rows exist and the uniform slider preserves them', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  const oid = await page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    app.regen();
    const obj = eng.layers.find((l) => l.type === 'object3d' && l.parentId === gid);
    app.renderer.selectedLayerIds = new Set([obj.id]); app.renderer.selectedLayerId = obj.id;
    app.ui.renderLayers();
    window.__oid = obj.id;
    return obj.id;
  });
  await page.locator(`#layer-list [data-layer-id="${oid}"]`).first().click({ force: true });
  const row = (label) => page.locator(`input.ctrl-slider[aria-label="${label}"]`).first();
  for (const l of ['Position X (mm)', 'Yaw (degrees)', 'Uniform scale', 'Scale X', 'Scale Y', 'Scale Z']) {
    await expect(row(l)).toBeVisible();
  }
  const tr = () => page.evaluate(() => {
    const t = window.app.engine.getLayerById(window.__oid).params.transform;
    return { scale: t.scale, sx: t.sx, sy: t.sy, sz: t.sz };
  });
  await row('Scale Y').fill('2');
  await row('Scale Y').dispatchEvent('change');
  await expect.poll(async () => (await tr()).sy).toBe(2);
  await row('Uniform scale').fill('2');
  await row('Uniform scale').dispatchEvent('change');
  await expect.poll(async () => (await tr()).scale).toBe(2);
  const t = await tr();
  expect(t.sy / t.sx).toBeCloseTo(2, 5);
  expect(t.sx).toBeGreaterThan(0);
});

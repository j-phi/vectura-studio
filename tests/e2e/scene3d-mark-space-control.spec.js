const { test, expect } = require('@playwright/test');

/*
 * e2e — W3-D "Lock marks to surface": the row in the object Style tab toggles markSpace, the canvas changes, undo restores
 * it, the Level S read-out follows, and Wrap: Flat disables the row with the engine's reason.
 */

const open = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  const id = await page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    const leaf = eng.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    leaf.params.primitive = 'sphere';
    leaf.params.style = { penId: null, mapper: 'hatch', params: { markSpace: 'pose' } };
    app.regen();
    window.__gid = gid; window.__leaf = leaf.id;
    app.renderer.selectedLayerIds = new Set([leaf.id]); app.renderer.selectedLayerId = leaf.id;
    app.ui.renderLayers();
    return leaf.id;
  });
  await page.locator(`#layer-list [data-layer-id="${id}"]`).first().click({ force: true });
  await page.locator('.tab-btn[data-value="style"]').first().click();
};
const row = (page) => page.locator('.vs3-row', { hasText: 'Lock marks to surface' }).first();
const state = (page) => page.evaluate(() => {
  const g = window.app.engine.getLayerById(window.__gid); const k = window.app.engine.getLayerById(window.__leaf);
  return { ms: k.params.style.params.markSpace, levelS: g._sceneLevelS, n: (g.scenePaths || []).reduce((a, p) => a + (Array.isArray(p) ? p.length : (p.points ? p.points.length : 0)), 0) };
});

test('toggle locks the marks, changes the canvas, undo restores; hint and disabled reason', async ({ page }) => {
  await open(page);
  const before = await state(page);
  expect(before.ms).toBe('pose');
  await expect(page.locator('.vs3-markspace-hint')).toHaveAttribute('data-level-s', '0');

  await row(page).getByRole('radio', { name: 'On' }).click();
  await expect.poll(async () => (await state(page)).ms).toBe('surface');
  await expect.poll(async () => (await state(page)).levelS).toBe(true);
  await expect.poll(async () => (await state(page)).n).not.toBe(before.n);
  await expect(page.locator('.vs3-markspace-hint')).toHaveAttribute('data-level-s', '1');

  await page.evaluate(() => window.app.undo());
  await expect.poll(async () => (await state(page)).ms).toBe('pose');
  expect((await state(page)).n).toBe(before.n);

  await page.evaluate(() => {
    const k = window.app.engine.getLayerById(window.__leaf); k.params.style.params.wrap = 'flat';
    window.app.regen(); window.app.ui.renderLayers(); window.app.ui.buildControls();
  });
  await page.locator('.tab-btn[data-value="style"]').first().click();
  await expect(row(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(row(page)).toHaveAttribute('title', /Wrap is Flat/);
});

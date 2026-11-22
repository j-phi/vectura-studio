const { test, expect } = require('@playwright/test');

/*
 * e2e — A23 "Shading": the scene Tone section's slider sets params.tone.darkness, the canvas ink follows it (lighter at 0),
 * and moving it back to 50 restores the default drawing exactly.
 */

const open = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  const gid = await page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const id = eng.addSceneTree();
    app.regen();
    window.__gid = id;
    app.renderer.selectedLayerIds = new Set([id]); app.renderer.selectedLayerId = id;
    app.ui.renderLayers();
    return id;
  });
  await page.locator(`#layer-list [data-layer-id="${gid}"]`).first().click({ force: true });
  const sceneTab = page.locator('.tab-btn[data-value="scene"]').first();
  if (await sceneTab.count()) await sceneTab.click();
};
const slider = (page) => page.locator('input.ctrl-slider[aria-label="Shading darkness"]').first();
const state = (page) => page.evaluate(() => {
  const g = window.app.engine.getLayerById(window.__gid);
  let ink = 0;
  (g.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill')
    .forEach((p) => { for (let i = 1; i < p.length; i++) ink += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); });
  return { dk: g.params.tone.darkness, ink: Math.round(ink) };
});

test('Shading slider sets tone.darkness, lightens the canvas at 0, back to 50 restores the default drawing', async ({ page }) => {
  await open(page);
  await expect(slider(page)).toBeVisible();
  await expect(slider(page)).toHaveValue('50');
  const before = await state(page);
  expect(before.dk).toBe(50);
  expect(before.ink).toBeGreaterThan(0);

  await slider(page).fill('0');
  await slider(page).dispatchEvent('change');
  await expect.poll(async () => (await state(page)).dk).toBe(0);
  await expect.poll(async () => (await state(page)).ink, { timeout: 20000 }).toBeLessThan(before.ink * 0.9);

  // back to the default: the exact default drawing (the slider at 50 adds nothing to the spec or the bake key)
  await slider(page).fill('50');
  await slider(page).dispatchEvent('change');
  await expect.poll(async () => (await state(page)).dk).toBe(50);
  await expect.poll(async () => (await state(page)).ink, { timeout: 20000 }).toBe(before.ink);
});

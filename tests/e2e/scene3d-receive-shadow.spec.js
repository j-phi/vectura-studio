const { test, expect } = require('@playwright/test');

/*
 * e2e — Receive shadows: with "Shadows land on objects" on, a sphere above a box shades the box. Switching the box's
 * "Takes shadow" row to Off (in the object panel) removes that shadow from the BOX's ink (back to the scene-flag-off
 * drawing), and Follow scene restores it.
 */
const open = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  return page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    const kids = () => eng.getLayerDescendants(gid);
    const sphere = kids().find((l) => l.type === 'object3d');
    const boxId = eng.addObjectToScene(gid, 'box');
    const box = eng.getLayerById(boxId);
    sphere.params.transform = { ...(sphere.params.transform || {}), x: 0, y: 75, z: 0 };
    box.params.transform = { ...(box.params.transform || {}), x: 5, y: 0, z: 0 };
    box.params.style = JSON.parse(JSON.stringify(sphere.params.style));
    kids().filter((l) => l.type === 'sceneLight3d').forEach((l) => { l.params.azimuth = 90; l.params.elevation = 62; });
    const g = eng.getLayerById(gid);
    g.params.shadow = { ...(g.params.shadow || {}), shadowReceiveOnObjects: true };
    app.regen();
    window.__gid = gid; window.__boxId = boxId;
    app.renderer.selectedLayerIds = new Set([boxId]); app.renderer.selectedLayerId = boxId;
    app.ui.renderLayers();
    return { gid, boxId };
  });
};
const boxInk = (page) => page.evaluate(() => {
  const g = window.app.engine.getLayerById(window.__gid);
  let ink = 0;
  (g.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill' && (p.meta.sceneTarget || {}).objectId === window.__boxId)
    .forEach((p) => { for (let i = 1; i < p.length; i++) ink += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); });
  return Math.round(ink);
});

// The compose is progressive (a first partial pass, then the settled one): read the ink once two reads agree.
const settledInk = async (page) => {
  let prev = -1;
  for (let i = 0; i < 25; i += 1) {
    await page.waitForTimeout(1200);
    const v = await boxInk(page);
    if (v > 0 && v === prev) return v;
    prev = v;
  }
  throw new Error('box ink never settled');
};

test('box Receive shadows Off drops the sphere shadow from the box; Follow scene restores it', async ({ page }) => {
  const { boxId } = await open(page);
  await page.locator(`#layer-list [data-layer-id="${boxId}"]`).first().click({ force: true });
  const row = page.locator('.seg-ctrl[aria-label="Object receives shadows"]').first();
  await expect(row).toBeAttached();
  const shadowed = await settledInk(page);

  await row.locator('.seg-opt[data-value="off"]').dispatchEvent('click');
  await expect.poll(() => page.evaluate((id) => (window.app.engine.getLayerById(id).params.shadow || {}).receive, boxId)).toBe(false);
  const unshadowed = await settledInk(page);
  expect(unshadowed).not.toBe(shadowed);

  await row.locator('.seg-opt[data-value="inherit"]').dispatchEvent('click');
  await expect.poll(() => page.evaluate((id) => 'receive' in (window.app.engine.getLayerById(id).params.shadow || {}), boxId)).toBe(false);
  expect(await settledInk(page)).toBe(shadowed);
});

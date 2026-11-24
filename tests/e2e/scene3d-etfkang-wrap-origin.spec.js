const { test, expect } = require('@playwright/test');

/*
 * e2e — etfKang "Wrap origin" XY pad: it shows in the object Style tab only under the etfKang tone law, the arrow keys and
 * a drag move wrapOriginX / wrapOriginY (one undo step per gesture), the canvas changes, and undo restores both keys.
 */
const open = async (page, law = 'etfKang') => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  const id = await page.evaluate((lawId) => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    const leaf = eng.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    leaf.params.primitive = 'sphere';
    leaf.params.style = { penId: null, mapper: 'hatch', params: { toneLaw: lawId } };
    app.regen();
    window.__gid = gid; window.__leaf = leaf.id;
    app.renderer.selectedLayerIds = new Set([leaf.id]); app.renderer.selectedLayerId = leaf.id;
    app.ui.renderLayers();
    return leaf.id;
  }, law);
  await page.locator(`#layer-list [data-layer-id="${id}"]`).first().click({ force: true });
  await page.locator('.tab-btn[data-value="style"]').first().click();
};
const pad = (page) => page.locator('.vs3-row[data-wrap-origin] .vtp-xypad').first();
const state = (page) => page.evaluate(() => {
  const g = window.app.engine.getLayerById(window.__gid); const k = window.app.engine.getLayerById(window.__leaf);
  const p = k.params.style.params;
  return { x: p.wrapOriginX, y: p.wrapOriginY, sig: (g.scenePaths || []).reduce((a, q) => a + (Array.isArray(q) ? q.reduce((s, pt) => s + pt.x * 1.3 + pt.y * 0.7, 0) : 0), 0) };
});

test('the pad is there for etfKang only', async ({ page }) => {
  await open(page, 'etfKang');
  await expect(pad(page)).toBeVisible();
  await open(page, 'ladder');
  await expect(pad(page)).toHaveCount(0);
});

test('arrow keys and a drag write the origin, the canvas changes, one undo restores', async ({ page }) => {
  await open(page);
  const before = await state(page);
  expect(before.x).toBeUndefined();
  await pad(page).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await state(page)).x).toBeGreaterThan(0.05);
  await expect.poll(async () => (await state(page)).sig).not.toBe(before.sig);
  const afterKey = await state(page);
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await state(page)).y).toBeGreaterThan(0.05);

  const box = await pad(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.65, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).x).toBeGreaterThan(0.3);
  const dragged = await state(page);
  expect(dragged.sig).not.toBe(afterKey.sig);

  await page.evaluate(() => window.app.undo());          // the drag
  await expect.poll(async () => (await state(page)).x).toBeCloseTo(afterKey.x, 2);
  // Undo walks back through every gesture (two key steps, one drag) to the untouched origin, and the canvas follows.
  for (let i = 0; i < 6 && ((await state(page)).x || (await state(page)).y); i += 1) await page.evaluate(() => window.app.undo());
  await expect.poll(async () => { const t = await state(page); return !t.x && !t.y; }).toBe(true);
  await expect.poll(async () => (await state(page)).sig).toBe(before.sig);
});

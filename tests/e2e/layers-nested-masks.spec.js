const { test, expect } = require('@playwright/test');

// Nested clipping masks in the layers panel: content <- A (mask) <- B (mask of A) <- C (mask of B).
// Real clicks on each card's .mask-btn. Every layer must stay listed at any depth, a middle level
// must be releasable, and releasing then re-making a mask must round-trip.

test.use({ viewport: { width: 1600, height: 1000 } });

const setup = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  return page.evaluate(() => {
    const app = window.app; const eng = app.engine;
    const poly = (pts) => [pts.map((p) => ({ x: p[0], y: p[1] })).concat([{ x: pts[0][0], y: pts[0][1] }])];
    const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    const circ = (cx, cy, r) => { const pts = []; for (let i = 0; i < 96; i++) { const t = (i / 96) * Math.PI * 2; pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return poly(pts); };
    const content = eng.addLayer('grid');
    const A = eng.addShapeLayer('MaskA circle', circ(100, 120, 70));
    const B = eng.addShapeLayer('MaskB rect', rect(70, 90, 200, 200));
    const C = eng.addShapeLayer('MaskC circle', circ(150, 105, 45));
    eng.layers = [eng.getLayerById(C), eng.getLayerById(B), eng.getLayerById(A), eng.getLayerById(content)];
    eng.computeAllDisplayGeometry(); app.ui.renderLayers(); app.render();
    return { content, A, B, C };
  });
};

const clickMask = async (page, id) => {
  const card = page.locator(`#layer-list [data-lvl-id="${id}"]`);
  await expect(card).toHaveCount(1);
  await card.hover();
  await card.locator('.mask-btn').first().click();
};
const listed = (page, ids) => page.evaluate((arr) => arr.map((id) => !!document.querySelector(`#layer-list [data-lvl-id="${id}"]`)), Object.values(ids));
const parents = (page, ids) => page.evaluate((o) => Object.fromEntries(Object.entries(o).map(([k, id]) => {
  const L = window.app.engine.getLayerById(id); return [k, L.parentId ? Object.keys(o).find((kk) => o[kk] === L.parentId) : null];
})), ids);

test('three nested mask levels all stay listed and indented', async ({ page }) => {
  const ids = await setup(page);
  await clickMask(page, ids.A);
  await clickMask(page, ids.B);
  await clickMask(page, ids.C);
  expect(await listed(page, ids)).toEqual([true, true, true, true]);
  expect(await parents(page, ids)).toEqual({ content: 'A', A: 'B', B: 'C', C: null });
  const lefts = await page.evaluate((o) => [o.C, o.B, o.A, o.content].map((id) => document.querySelector(`#layer-list [data-lvl-id="${id}"]`).getBoundingClientRect().left), ids);
  expect(lefts[1]).toBeGreaterThan(lefts[0]);
  expect(lefts[2]).toBeGreaterThan(lefts[1]);
  expect(lefts[3]).toBeGreaterThan(lefts[2]);
  await expect(page.locator('#layer-list [data-lvl-id]')).toHaveCount(4);
});

test('a middle mask level shows its toggle and releases to its parent', async ({ page }) => {
  const ids = await setup(page);
  await clickMask(page, ids.A);
  await clickMask(page, ids.B);
  await clickMask(page, ids.C);
  await expect(page.locator(`#layer-list [data-lvl-id="${ids.B}"] .mask-btn`)).toHaveCount(1);
  await expect(page.locator(`#layer-list [data-lvl-id="${ids.A}"] .mask-btn`)).toHaveCount(1);
  await clickMask(page, ids.B);
  expect(await listed(page, ids)).toEqual([true, true, true, true]);
  // A is released to B's parent (C), B becomes a plain masked child of C.
  expect(await parents(page, ids)).toEqual({ content: 'A', A: 'C', B: 'C', C: null });
  expect(await page.evaluate((id) => window.app.engine.getLayerById(id).mask.enabled, ids.B)).toBe(false);
});

test('mask off then on again re-clips the same layer, with undo/redo', async ({ page }) => {
  const ids = await setup(page);
  await clickMask(page, ids.A);
  expect(await parents(page, ids)).toMatchObject({ content: 'A' });
  await clickMask(page, ids.A); // off
  expect(await parents(page, ids)).toMatchObject({ content: null });
  await clickMask(page, ids.A); // on again
  expect(await parents(page, ids)).toMatchObject({ content: 'A' });
  expect(await page.evaluate((id) => window.app.engine.getLayerById(id).mask.enabled, ids.A)).toBe(true);
  await page.evaluate(() => window.app.undo());
  expect(await parents(page, ids)).toMatchObject({ content: null });
  await page.evaluate(() => window.app.redo());
  expect(await parents(page, ids)).toMatchObject({ content: 'A' });
});

test('search keeps a nested masked child reachable', async ({ page }) => {
  const ids = await setup(page);
  await clickMask(page, ids.A);
  await clickMask(page, ids.B);
  await page.getByPlaceholder('Search layers').fill('grid');
  const has = await page.evaluate((id) => !!document.querySelector(`#layer-list [data-lvl-id="${id}"]`), ids.content);
  expect(has).toBe(true);
});

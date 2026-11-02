const { test, expect } = require('@playwright/test');

// A press exactly on a shape's outline at the extreme edge of its bbox must
// start a move drag (select + drag in one gesture), like a press just inside.

const setup = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.engine && window.app.renderer));
  return page.evaluate(() => {
    window.Vectura.SETTINGS.snapGuides = false;
    const e = window.app.engine;
    e.layers.slice().forEach((l) => e.removeLayer(l.id));
    const rect = [{ x: 100, y: 80 }, { x: 160, y: 80 }, { x: 160, y: 130 }, { x: 100, y: 130 }, { x: 100, y: 80 }];
    rect.meta = { kind: 'polygon', closed: true };
    const circ = [];
    for (let i = 0; i <= 64; i += 1) {
      const a = (i / 64) * Math.PI * 2;
      circ.push({ x: 60 + Math.cos(a) * 20, y: 60 + Math.sin(a) * 20 });
    }
    circ.meta = { kind: 'polygon', closed: true };
    const r = e.addShapeLayer('Rect', [rect]);
    const c = e.addShapeLayer('Circ', [circ]);
    e.computeAllDisplayGeometry();
    window.app.renderer.setSelection([], null);
    window.app.renderer.draw();
    return { r, c };
  });
};
const toScreen = (page, wx, wy) => page.evaluate(([x, y]) => {
  const r = window.app.renderer;
  const b = document.querySelector('#main-canvas').getBoundingClientRect();
  return { x: b.left + r.offsetX + x * r.scale, y: b.top + r.offsetY + y * r.scale };
}, [wx, wy]);
const drag = async (page, p, dx, dy) => {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(p.x + (dx * i) / 10, p.y + (dy * i) / 10);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
};
const minX = (page, id) => page.evaluate((i) => {
  const l = window.app.engine.getLayerById(i);
  let m = 1e9;
  (l.displayPaths || l.paths || []).forEach((p) => p.forEach((q) => { m = Math.min(m, q.x); }));
  return m;
}, id);
const width = (page, id) => page.evaluate((i) => {
  const l = window.app.engine.getLayerById(i);
  let a = 1e9, b = -1e9;
  (l.displayPaths || l.paths || []).forEach((p) => p.forEach((q) => { a = Math.min(a, q.x); b = Math.max(b, q.x); }));
  return b - a;
}, id);

test.describe('outline press drag', () => {
  test('unselected rect: press on exact left edge and drag moves it', async ({ page }) => {
    const { r } = await setup(page);
    const before = await minX(page, r);
    const p = await toScreen(page, 100, 92);
    const scale = await page.evaluate(() => window.app.renderer.scale);
    await drag(page, p, 60, 0);
    const after = await minX(page, r);
    expect(after - before).toBeCloseTo(60 / scale, 0);
  });

  test('unselected circle: press on leftmost point and drag moves it', async ({ page }) => {
    const { c } = await setup(page);
    const before = await minX(page, c);
    const p = await toScreen(page, 40, 60);
    const scale = await page.evaluate(() => window.app.renderer.scale);
    await drag(page, p, 50, 20);
    const after = await minX(page, c);
    expect(after - before).toBeCloseTo(50 / scale, 0);
  });

  test('already-selected rect: exact edge press still moves', async ({ page }) => {
    const { r } = await setup(page);
    await page.evaluate((id) => window.app.renderer.setSelection([id], id), r);
    const before = await minX(page, r);
    const p = await toScreen(page, 100, 92);
    const scale = await page.evaluate(() => window.app.renderer.scale);
    await drag(page, p, 40, 0);
    expect((await minX(page, r)) - before).toBeCloseTo(40 / scale, 0);
  });

  test('edge-midpoint resize handle still wins over move', async ({ page }) => {
    const { r } = await setup(page);
    await page.evaluate((id) => window.app.renderer.setSelection([id], id), r);
    const w0 = await width(page, r);
    const hp = await page.evaluate(() => {
      const rr = window.app.renderer;
      const b = rr.getSelectionBounds(rr.getSelectedLayers());
      const pt = rr.getHandlePoint('w', b) || rr.getHandlePoint('left', b);
      const cv = document.querySelector('#main-canvas').getBoundingClientRect();
      return { x: cv.left + rr.offsetX + pt.x * rr.scale, y: cv.top + rr.offsetY + pt.y * rr.scale };
    });
    await drag(page, hp, -40, 0);
    const w1 = await width(page, r);
    expect(w1).toBeGreaterThan(w0 + 1);
  });
});

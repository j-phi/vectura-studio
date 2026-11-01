const { test, expect } = require('@playwright/test');

// Pathfinder Unite creates a compound whose geometry derives from hidden
// children. Moving it (mouse drag or arrow nudge) must land on the leaves and
// re-derive the silhouette; no-op drags must not grow undo history.

const setup = async (page, specs, { group = false } = {}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.engine && window.app.renderer));
  return page.evaluate(({ specs, group }) => {
    window.Vectura.SETTINGS.snapGuides = false;
    const e = window.app.engine;
    e.layers.slice().forEach((l) => e.removeLayer(l.id));
    const mkp = (x, y, w, h) => {
      const p = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
      p.meta = { kind: 'polygon', closed: true };
      return p;
    };
    const ids = specs.map((s, i) => e.addShapeLayer('S' + (i + 1), [mkp(...s)]));
    let gid = null;
    if (group) {
      gid = e.addGroupLayer();
      ids.forEach((id) => { e.getLayerById(id).parentId = gid; });
    }
    e.computeAllDisplayGeometry();
    window.app.renderer.setSelection([], null);
    window.app.renderer.draw();
    window.app.ui.renderLayers();
    return { ids, gid };
  }, { specs, group });
};
const toScreen = (page, wx, wy) => page.evaluate(([x, y]) => {
  const r = window.app.renderer;
  const b = document.querySelector('#main-canvas').getBoundingClientRect();
  return { x: b.left + r.offsetX + x * r.scale, y: b.top + r.offsetY + y * r.scale };
}, [wx, wy]);
const click = async (page, wx, wy, shift) => {
  const p = await toScreen(page, wx, wy);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
};
const drag = async (page, wx, wy, dx, dy) => {
  const p = await toScreen(page, wx, wy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(p.x + (dx * i) / 10, p.y + (dy * i) / 10);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
};
const state = (page) => page.evaluate(() => {
  const e = window.app.engine;
  const c = e.layers.find((l) => l.type === 'compound');
  const bb = (ps) => {
    let a = 1e9, b = 1e9, cx = -1e9, d = -1e9;
    (ps || []).forEach((p) => (p || []).forEach((q) => { a = Math.min(a, q.x); b = Math.min(b, q.y); cx = Math.max(cx, q.x); d = Math.max(d, q.y); }));
    return [a, b, cx, d];
  };
  const sel = window.app.renderer.getSelectedLayers().map((l) => l.name);
  return {
    bb: c ? bb(c.displayPaths && c.displayPaths.length ? c.displayPaths : c.paths) : null,
    sel,
    hist: window.app.history.length,
    scale: window.app.renderer.scale,
    pos: e.layers.filter((l) => !l.isGroup).map((l) => [l.params.posX, l.params.posY]),
  };
});
const unite = async (page) => {
  await page.locator('.pf-btn[data-pf-op="unite"]').click();
  await page.waitForTimeout(250);
};

test('dragging a united shape moves it by exactly the drag delta; one undo step; round-trips', async ({ page }) => {
  await setup(page, [[40, 40, 50, 50], [70, 60, 50, 50], [100, 50, 50, 50]]);
  await click(page, 40, 60);
  await click(page, 120, 85, true);
  await click(page, 150, 70, true);
  await unite(page);
  const before = await state(page);
  expect(before.sel).toHaveLength(1);
  const dpx = 90; const dpy = 50;
  await drag(page, 55, 55, dpx, dpy);
  const after = await state(page);
  const ex = dpx / before.scale; const ey = dpy / before.scale;
  [0, 1, 2, 3].forEach((i) => {
    const d = after.bb[i] - before.bb[i];
    expect(Math.abs(d - (i % 2 === 0 ? ex : ey))).toBeLessThan(0.05);
  });
  expect(after.hist).toBe(before.hist + 1);
  expect(after.sel).toEqual(before.sel);
  // serialize/deserialize keeps position
  const rt = await page.evaluate(() => {
    const e = window.app.engine;
    const data = JSON.parse(JSON.stringify(e.exportState()));
    e.importState(data);
    e.computeAllDisplayGeometry();
    const c = e.layers.find((l) => l.type === 'compound');
    const ps = c.displayPaths && c.displayPaths.length ? c.displayPaths : c.paths;
    return [Math.min(...ps.flat().map((q) => q.x)), Math.min(...ps.flat().map((q) => q.y))];
  });
  expect(Math.abs(rt[0] - after.bb[0])).toBeLessThan(0.05);
  expect(Math.abs(rt[1] - after.bb[1])).toBeLessThan(0.05);
  // undo restores exactly; redo re-applies
  await page.evaluate(() => window.app.undo());
  const undone = await state(page);
  expect(undone.bb.map((v) => +v.toFixed(4))).toEqual(before.bb.map((v) => +v.toFixed(4)));
  await page.evaluate(() => window.app.redo());
  const redone = await state(page);
  expect(redone.bb.map((v) => +v.toFixed(4))).toEqual(after.bb.map((v) => +v.toFixed(4)));
});

test('a drag that changes nothing does not push history', async ({ page }) => {
  await setup(page, [[40, 40, 50, 50], [70, 60, 50, 50]]);
  await click(page, 40, 60);
  await click(page, 120, 85, true);
  await unite(page);
  const before = await state(page);
  // drag out and back to the exact start point: the net transform is zero
  const p = await toScreen(page, 55, 55);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 20, { steps: 4 });
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await state(page);
  expect(after.hist).toBe(before.hist);
  expect(after.bb).toEqual(before.bb);
});

test('arrow-key nudge moves a united shape by one step per keypress, one undo each', async ({ page }) => {
  await setup(page, [[40, 40, 50, 50], [70, 60, 50, 50]]);
  await click(page, 40, 60);
  await click(page, 120, 85, true);
  await unite(page);
  const before = await state(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const after = await state(page);
  expect(after.bb[0] - before.bb[0]).toBeCloseTo(1, 3);
  expect(after.bb[1] - before.bb[1]).toBeCloseTo(1, 3);
  expect(after.hist).toBe(before.hist + 2);
  await page.evaluate(() => window.app.undo());
  const u = await state(page);
  expect(u.bb[0] - before.bb[0]).toBeCloseTo(1, 3);
  expect(u.bb[1] - before.bb[1]).toBeCloseTo(0, 3);
  await page.evaluate(() => window.app.undo());
  const u2 = await state(page);
  expect(u2.bb.map((v) => +v.toFixed(4))).toEqual(before.bb.map((v) => +v.toFixed(4)));
  await page.evaluate(() => window.app.redo());
  await page.evaluate(() => window.app.redo());
  const r = await state(page);
  expect(r.bb.map((v) => +v.toFixed(4))).toEqual(after.bb.map((v) => +v.toFixed(4)));
});

test('a united shape inside a group still moves on drag', async ({ page }) => {
  const { gid, ids } = await setup(page, [[40, 40, 50, 50], [70, 60, 50, 50]], { group: true });
  await page.evaluate((i) => window.app.renderer.setSelection(i, i[1]), ids);
  await unite(page);
  expect(gid).toBeTruthy();
  const before = await state(page);
  expect(before.sel).toHaveLength(1);
  await drag(page, 55, 55, 70, 40);
  const after = await state(page);
  expect(after.bb[0] - before.bb[0]).toBeCloseTo(70 / before.scale, 1);
  expect(after.bb[1] - before.bb[1]).toBeCloseTo(40 / before.scale, 1);
});

test('nudging a selected plain group stays a no-op (contract) and pushes no history', async ({ page }) => {
  const { ids, gid } = await setup(page, [[40, 40, 50, 50], [100, 50, 50, 50]], { group: true });
  await page.evaluate((g) => window.app.renderer.setSelection([g], g), gid);
  const h0 = await page.evaluate(() => window.app.history.length);
  await page.keyboard.press('ArrowRight');
  const r = await page.evaluate((ids) => ({
    pos: ids.map((i) => window.app.engine.getLayerById(i).params.posX),
    hist: window.app.history.length,
  }), ids);
  expect(r.pos).toEqual([0, 0]);
  expect(r.hist).toBe(h0);
});

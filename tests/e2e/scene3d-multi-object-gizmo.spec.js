const { test, expect } = require('@playwright/test');

/*
 * e2e — two selected 3D objects carry the 3-axis move / rotate / scale gizmo (centred on their centroid). Dragging the
 * move arrow through the real canvas pointer path shifts both by one delta in one undo step; Escape restores both.
 */
const open = async (page) => {
  await page.setViewportSize({ width: 1500, height: 1900 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  return page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    const a = eng.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const bId = eng.addObjectToScene(gid, 'sphere');
    const b = eng.getLayerById(bId);
    a.params.transform = { ...a.params.transform, x: -40, y: 0, z: 0 };
    b.params.transform = { ...b.params.transform, x: 40, y: 10, z: 0 };
    app.regen();
    app.renderer.selectedLayerIds = new Set([gid]); app.renderer.selectedLayerId = gid;
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [a.id, bId], faceKeys: [], edgeKeys: [] });
    window.__gid = gid; window.__a = a.id; window.__b = bId;
    return gid;
  });
};
const xf = (page) => page.evaluate(() => {
  const eng = window.app.engine;
  return { a: { ...eng.getLayerById(window.__a).params.transform }, b: { ...eng.getLayerById(window.__b).params.transform }, hist: window.app.history.length };
});
const layoutStable = async (page) => {
  let prev = '';
  for (let i = 0; i < 40; i += 1) {
    const cur = await page.evaluate(() => { const r = window.app.renderer; const b = r.canvas.getBoundingClientRect(); return `${b.left}|${b.top}|${b.width}|${b.height}|${r.scale}|${r.offsetX}|${r.offsetY}`; });
    if (cur === prev) return;
    prev = cur;
    await page.waitForTimeout(300);
  }
};
// Presses a free move arrow (one whose tip is not covered by the cast-shadow handle, which wins the press when they
// overlap) with real PointerEvents on the canvas, so geometry and press land in one synchronous step. This sandbox's
// unstyled layout keeps resizing the canvas, which makes page.mouse coordinates stale between lookup and press.
const pressArrow = (page) => page.evaluate(() => {
  const r = window.app.renderer; const layer = r._sceneLightLayer(); const g = r.getSceneObjectGizmo(layer);
  const rc = r.canvas.getBoundingClientRect();
  const fire = (type, x, y, target) => (target || r.canvas).dispatchEvent(new PointerEvent(type, {
    clientX: rc.left + x, clientY: rc.top + y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    pointerType: 'mouse', pointerId: 1, isPrimary: true, bubbles: true, cancelable: true }));
  for (const ax of g.axes) {
    const q = r.worldToScreen(ax.tip.x, ax.tip.y);
    const h = r.hitSceneObjectGizmo(q.x, q.y, layer);
    if (h && h.type === 'move' && h.axis === ax.key && !r._hitSceneShadow(r.screenToWorld(q.x, q.y), layer)) {
      fire('pointerdown', q.x, q.y);
      window.__press = { q, ax: { key: ax.key, dir: ax.dir }, fire };
      return { key: ax.key, multi: Boolean(g.objIds), armed: Boolean(r._sceneObjectGizmoDrag && r._sceneObjectGizmoDrag.members) };
    }
  }
  return null;
});
const dragBy = (page, dist, release) => page.evaluate(([d, rel]) => {
  const { q, ax, fire } = window.__press;
  for (let i = 1; i <= 8; i += 1) fire('pointermove', q.x + ax.dir.x * d * i / 8, q.y + ax.dir.y * d * i / 8, window);
  if (rel) fire('pointerup', q.x + ax.dir.x * d, q.y + ax.dir.y * d, window);
}, [dist, release]);

test('two selected objects: the move arrow shifts both by the same delta (one undo step)', async ({ page }) => {
  await open(page);
  await layoutStable(page);
  await page.waitForTimeout(1500);
  const before = await xf(page);
  const press = await pressArrow(page);
  expect(press && press.multi && press.armed).toBe(true);
  await dragBy(page, 45, true);
  const after = await xf(page);
  const k = press.key; const da = after.a[k] - before.a[k]; const db = after.b[k] - before.b[k];
  expect(Math.abs(da)).toBeGreaterThan(1);
  expect(db).toBeCloseTo(da, 5);
  expect(after.hist).toBe(before.hist + 1);
});

test('Escape mid-drag restores both objects', async ({ page }) => {
  await open(page);
  await layoutStable(page);
  await page.waitForTimeout(1500);
  const before = await xf(page);
  const press = await pressArrow(page);
  expect(press && press.armed).toBe(true);
  await dragBy(page, 30, false);
  expect(JSON.stringify((await xf(page)).a)).not.toBe(JSON.stringify(before.a));
  await page.keyboard.press('Escape');
  const after = await xf(page);
  expect(after.a).toEqual(before.a);
  expect(after.b).toEqual(before.b);
  expect(after.hist).toBe(before.hist);
});

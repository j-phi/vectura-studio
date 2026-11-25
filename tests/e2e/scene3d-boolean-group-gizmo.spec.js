const { test, expect } = require('@playwright/test');

/*
 * e2e — a combined shape (box minus sphere) is selectable as one thing and carries the object move / rotate / scale
 * gizmo. Dragging its move arrow through the real canvas pointer path writes the GROUP transform (one undo step), the
 * carved ink follows, and the operands' own transforms are untouched.
 */
const open = async (page) => {
  // the Tailwind CDN can be blocked in CI sandboxes, which leaves the canvas below the fold: use a tall viewport
  await page.setViewportSize({ width: 1500, height: 1900 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  return page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    const a = eng.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    a.params.primitive = 'box'; a.params.params = { sx: 50, sy: 50, sz: 50 };
    const bId = eng.addObjectToScene(gid, 'sphere');
    const b = eng.getLayerById(bId);
    b.params.transform = { ...b.params.transform, x: 12, y: a.params.transform.y, z: 0 };
    const bg = eng.createBooleanGroupFromSelection([a.id, bId]);
    app.regen();
    app.renderer.selectedLayerIds = new Set([bg]); app.renderer.selectedLayerId = bg;
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [bg], faceKeys: [], edgeKeys: [] });
    app.ui.renderLayers();
    window.__gid = gid; window.__bg = bg; window.__a = a.id; window.__b = bId;
    return { gid, bg };
  });
};
const state = (page) => page.evaluate(() => {
  const eng = window.app.engine; const g = eng.getLayerById(window.__gid);
  let minX = Infinity; let maxX = -Infinity;
  (g.scenePaths || []).forEach((p) => { if (Array.isArray(p) && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId !== 'ground') p.forEach((q) => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }); });
  const bl = eng.getLayerById(window.__bg);
  return { minX, maxX, t: bl.params.transform || null, hist: window.app.history.length,
    opA: JSON.stringify(eng.getLayerById(window.__a).params.transform), opB: JSON.stringify(eng.getLayerById(window.__b).params.transform) };
});
// The scene is quiet when no draft regen, release settle or worker compose is pending. A drag releases into an async
// worker compose that swaps the draft ink for the exact ink later, so "the ink stopped changing for a moment" is not a
// readiness signal: under load the draft sits still while the settle is still in flight.
const sceneIdle = (page) => page.evaluate(() => {
  const r = window.app.renderer; const g = window.app.engine.getLayerById(window.__gid);
  return !r._sceneSettle && !r._sceneSettleAsync && r._sceneDragRegenRaf == null && !(g && g._sceneAsyncHandle);
});
const settle = async (page) => {
  await expect.poll(() => sceneIdle(page), { timeout: 45000, intervals: [100, 250, 500] }).toBe(true);
  let prev = '';
  for (let i = 0; i < 25; i += 1) {
    await page.waitForTimeout(300);
    const s = await state(page);
    const cur = `${s.minX.toFixed(2)}|${s.maxX.toFixed(2)}`;
    if (cur === prev && Number.isFinite(s.minX) && await sceneIdle(page)) return s;
    prev = cur;
  }
  throw new Error('scene never settled');
};

// the canvas relayouts for a moment after load: wait until its box and scale stop changing
const layoutStable = async (page) => {
  let prev = '';
  for (let i = 0; i < 40; i += 1) {
    const cur = await page.evaluate(() => { const r = window.app.renderer; const b = r.canvas.getBoundingClientRect(); return `${b.left}|${b.top}|${b.width}|${b.height}|${r.scale}|${r.offsetX}|${r.offsetY}`; });
    if (cur === prev) return;
    prev = cur;
    await page.waitForTimeout(300);
  }
};

test('dragging the combined shape move arrow moves the whole carved shape (group transform, one undo)', async ({ page }) => {
  await open(page);
  const before = await settle(page);
  expect(before.t).toBeNull();
  await layoutStable(page);
  const readTip = () => page.evaluate(() => {
    const r = window.app.renderer; const layer = r._sceneLightLayer(); const g = r.getSceneObjectGizmo(layer);
    if (!g) return null;
    const ax = g.axes.find((x) => x.key === 'x'); const rect = r.canvas.getBoundingClientRect(); const q = r.worldToScreen(ax.tip.x, ax.tip.y);
    const hit = r.hitSceneObjectGizmo(q.x, q.y, layer);
    return { x: q.x + rect.left, y: q.y + rect.top, dirx: ax.dir.x, diry: ax.dir.y, s: r.scale, hit: hit ? `${hit.type}:${hit.axis}` : null };
  });
  // the grab point must really hit the group's move arrow (gizmo built, canvas laid out, ink centre final)
  await expect.poll(async () => (await readTip() || {}).hit, { timeout: 15000 }).toBe('move:x');
  const tip = await readTip();
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  await page.mouse.move(tip.x + tip.dirx * 20, tip.y + tip.diry * 20, { steps: 4 });
  await page.mouse.move(tip.x + tip.dirx * 50, tip.y + tip.diry * 50, { steps: 4 });
  await page.mouse.up();
  const after = await settle(page);
  expect(after.t, 'the drag must write a group transform').not.toBeNull();
  expect(Math.abs(after.t.x)).toBeGreaterThan(5);
  expect(after.hist).toBe(before.hist + 1);
  expect(after.opA).toBe(before.opA);
  expect(after.opB).toBe(before.opB);
  // the whole carved ink slid (width unchanged, position moved)
  expect(Math.abs((after.minX + after.maxX) - (before.minX + before.maxX))).toBeGreaterThan(3);
  expect(after.maxX - after.minX).toBeCloseTo(before.maxX - before.minX, 0);
  await page.evaluate(() => window.app.undo());
  const undone = await settle(page);
  expect(undone.t).toBeNull();
});

test('a regen between grabbing the move arrow and the first move does not kill the drag (group transform bag is lazy)', async ({ page }) => {
  await open(page);
  await settle(page);
  await layoutStable(page);
  const out = await page.evaluate(() => {
    const r = window.app.renderer; const layer = r._sceneLightLayer(); const g = r.getSceneObjectGizmo(layer);
    const ax = g.axes.find((x) => x.key === 'x'); const rect = r.canvas.getBoundingClientRect(); const q = r.worldToScreen(ax.tip.x, ax.tip.y);
    const hit = r.hitSceneObjectGizmo(q.x, q.y, layer);
    const cx = q.x + rect.left; const cy = q.y + rect.top;
    const begun = r.beginSceneObjectGizmoDrag(hit, { clientX: cx, clientY: cy });
    const grp = window.app.engine.getLayerById(window.__bg);
    const hadBag = !!grp.params.transform;
    delete grp.params.transform; // what a params normalize does to an identity bag after the grab
    r._applySceneObjectGizmoDrag({ clientX: cx + ax.dir.x * 50, clientY: cy + ax.dir.y * 50 });
    const alive = !!r._sceneObjectGizmoDrag;
    const t = grp.params.transform || null;
    r._endSceneObjectGizmoDrag();
    return { begun, hadBag, alive, tx: t ? t.x : null };
  });
  expect(out.begun).toBe(true);
  expect(out.hadBag).toBe(true);
  expect(out.alive).toBe(true);
  expect(Math.abs(out.tx)).toBeGreaterThan(5);
});

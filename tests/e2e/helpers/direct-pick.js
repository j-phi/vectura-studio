// Shared by tests/e2e/touch/direct-pick.spec.js and tests/e2e/direct-pick-desktop.spec.js (TUX-024).
// One rings layer, Direct tool active, view placed so a clear canvas spot holds the topmost stroke point.
// Returns the client point ON the stroke; the outward normal is straight up, so (x, y - d) is d px off it.
const setupOnce = (page) => page.evaluate(() => {
  const app = window.app;
  const e = app.engine;
  const r = app.renderer;
  e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
  const id = e.addLayer('rings');
  e.generate?.(id);
  app.computeDisplayGeometry?.();
  r.userHasManipulated = true;
  r.setTool('direct');
  const layer = e.layers.find((l) => l.id === id);
  const paths = r.getInteractionPaths(layer).filter((p) => Array.isArray(p) && p.length > 1);
  let top = null;
  paths.forEach((p) => p.forEach((pt) => { if (!top || pt.y < top.y) top = pt; }));
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  const b = r.getSelectionBounds([layer]);
  r.scale = 120 / Math.max(1e-6, Math.hypot(b.corners.ne.x - b.corners.nw.x, b.corners.sw.y - b.corners.nw.y));
  const ok = (x, y) => document.elementFromPoint(x, y) === cv;
  const cands = [];
  for (let y = box.top + 45; y < Math.min(box.bottom, innerHeight) - 30; y += 8) {
    for (let x = box.left + 60; x < Math.min(box.right, innerWidth) - 60; x += 12) cands.push({ x, y });
  }
  cands.sort((a, c) => Math.hypot(a.x - (box.left + box.right) / 2, a.y - (box.top + box.bottom) / 2)
    - Math.hypot(c.x - (box.left + box.right) / 2, c.y - (box.top + box.bottom) / 2));
  for (const c of cands) {
    r.offsetX = (c.x - box.left) - b.center.x * r.scale;
    r.offsetY = (c.y - box.top) - b.center.y * r.scale;
    const s = r.worldToScreen(top.x, top.y);
    const x = s.x + box.left;
    const y = s.y + box.top;
    if ([0, -10, -17, -30].every((dy) => ok(x, y + dy)) && ok(x + 40, y)) {
      r.draw();
      return { id, x, y };
    }
  }
  throw new Error('no clear canvas spot for the stroke');
});

// The view can still be settling on a slow engine (WebKit under load): retry the spot search a few times.
const setupDirectPick = async (page) => {
  for (let i = 0; ; i += 1) {
    try { return await setupOnce(page); } catch (err) {
      if (i >= 5 || !/no clear canvas spot/.test(String(err.message))) throw err;
      await page.waitForTimeout(500);
    }
  }
};
const picked = (page) => page.evaluate(() => {
  // A rings layer is not source-editable, so the Direct pick shows as a layer selection, not an anchor selection.
  const ids = [...window.app.renderer.selectedLayerIds];
  return ids.length === 1 ? ids[0] : null;
});
const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine && window.app.ui));
  await page.waitForTimeout(400);
  await require('./target-audit-core').waitGeometryStable(page);
};
module.exports = { setupDirectPick, picked, boot };

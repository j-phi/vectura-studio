const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-023: transform handles by finger. A finger grabs a corner from ~14 px outside it, the
// corner drag resizes (does not rotate), a small selection still moves from its centre, and the
// visible round rotate affordance is reachable. Finger-only (tests/e2e/helpers/touch.js drag()).
// Named viewports: iPad landscape + iPhone portrait, both engines. Others via J3 after TUX-007/008.

const NAMED = {
  'touch-ipad-landscape': 'iPadL',
  'webkit-ipad-landscape': 'iPadL-webkit',
  'touch-iphone-portrait': 'iPhP',
  'webkit-iphone-portrait': 'iPhP-webkit',
};
const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-023';

// Create one rings layer, select it, size the view so the selection is `wantPx` wide on screen
// and put its SE corner at a client point where the canvas is the top element all around.
const setup = async (page, wantPx) => {
  const id = await page.evaluate(() => {
    const app = window.app;
    const e = app.engine;
    e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
    const lid = e.addLayer('rings');
    e.generate?.(lid);
    app.computeDisplayGeometry?.();
    app.renderer.setTool('select');
    app.renderer.selectedLayerId = lid;
    app.renderer.selectedLayerIds = new Set([lid]);
    return lid;
  });
  // The app re-fits the view after a layer change; let it settle before placing our own view.
  await page.waitForTimeout(500);
  return page.evaluate(({ want, id }) => {
  const app = window.app;
  const r = app.renderer;
  const e = app.engine;
  const layer = e.layers.find((l) => l.id === id);
  // Pin the view: a late layout resize would otherwise re-fit it (renderer.resize -> center()).
  r.userHasManipulated = true;
  const side = (b) => ({
    w: Math.hypot(b.corners.ne.x - b.corners.nw.x, b.corners.ne.y - b.corners.nw.y),
    h: Math.hypot(b.corners.sw.x - b.corners.nw.x, b.corners.sw.y - b.corners.nw.y),
  });
  const b0 = r.getSelectionBounds([layer]);
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  r.scale = want / side(b0).w;
  const b1 = r.getSelectionBounds([layer]);
  const px = side(b1).w * r.scale;
  const py = side(b1).h * r.scale;
  const hit = (x, y) => document.elementFromPoint(x, y) === cv;
  // Slide the view (the pan may clamp to the paper) until the canvas is the top element around
  // the selection and the SE corner zone. Candidates are tried nearest the visible centre first.
  const vis = {
    l: Math.max(box.left, 0), t: Math.max(box.top, 0),
    r: Math.min(box.right, innerWidth), b: Math.min(box.bottom, innerHeight),
  };
  const cands = [];
  for (let y = vis.t + 20; y < vis.b - 20; y += 12) {
    for (let x = vis.l + 20; x < vis.r - 20; x += 12) cands.push({ x, y, d: Math.hypot(x - (vis.l + vis.r) / 2, y - (vis.t + vis.b) / 2) });
  }
  cands.sort((a, b) => a.d - b.d);
  const cwx = b1.center.x;
  const cwy = b1.center.y;
  for (const c of cands) {
    r.offsetX = (c.x - box.left) - cwx * r.scale;
    r.offsetY = (c.y - box.top) - cwy * r.scale;
    const b = r.getSelectionBounds([layer]);
    const se = r.worldToScreen(b.corners.se.x, b.corners.se.y);
    const sx = se.x + box.left;
    const sy = se.y + box.top;
    const probes = [[0, 0], [60, 60], [10, 10], [-px / 2, -py / 2], [40, -py - 40]];
    if (Math.abs(sx - (c.x + px / 2)) > 2 || Math.abs(sy - (c.y + py / 2)) > 2) continue;
    if (!probes.every(([dx, dy]) => hit(sx + dx, sy + dy))) continue;
    r.draw();
    return { id, se: { x: sx, y: sy }, selWidthPx: px, selHeightPx: py };
  }
  throw new Error(`no clear canvas spot: ${cands.length} cands, vis ${JSON.stringify(vis)}, px ${px}, off ${r.offsetX},${r.offsetY}, scale ${r.scale}`);
}, { want: wantPx, id });
};

const state = (page, id) => page.evaluate((lid) => {
  const r = window.app.renderer;
  const layer = window.app.engine.layers.find((l) => l.id === lid);
  const b = r.getSelectionBounds([layer]);
  const w = Math.hypot(b.corners.ne.x - b.corners.nw.x, b.corners.ne.y - b.corners.nw.y) * r.scale;
  const c = r.worldToScreen(b.center.x, b.center.y);
  const box = document.querySelector('#main-canvas').getBoundingClientRect();
  return { rotation: layer.params.rotation || 0, widthPx: w, center: { x: c.x + box.left, y: c.y + box.top } };
}, id);

test.describe('TUX-023 canvas transform handles by finger', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!NAMED[testInfo.project.name], 'TUX-023 names iPadL/iPhP; other viewports via J3 after TUX-007/008');
  });

  let errors;
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
  });
  test.afterEach(() => { if (errors) expect(errors).toEqual([]); });

  test('corner drag resizes, does not rotate', async ({ page }) => {
    const s = await setup(page, 140);
    const start = { x: s.se.x + 10, y: s.se.y + 10 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).id, start)).toBe('main-canvas');
    const before = await state(page, s.id);
    expect(before.widthPx).toBeGreaterThanOrEqual(100);
    await touch.drag(page, start, { x: start.x + 40, y: start.y + 40 }, { steps: 10 });
    const after = await state(page, s.id);
    expect(Math.abs(after.rotation - before.rotation)).toBeLessThan(1e-3);
    const grew = after.widthPx - before.widthPx;
    expect(grew).toBeGreaterThanOrEqual(28);
    expect(grew).toBeLessThanOrEqual(52);
  });

  test('small object moves from its centre', async ({ page }) => {
    const s = await setup(page, 32);
    const before = await state(page, s.id);
    expect(before.widthPx).toBeGreaterThanOrEqual(20);
    expect(before.widthPx).toBeLessThanOrEqual(44);
    await touch.drag(page, before.center, { x: before.center.x + 30, y: before.center.y }, { steps: 10 });
    const after = await state(page, s.id);
    expect(Math.abs(after.widthPx - before.widthPx)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.rotation - before.rotation)).toBeLessThan(1e-3);
    expect(Math.hypot(after.center.x - before.center.x, after.center.y - before.center.y)).toBeGreaterThanOrEqual(15);
  });

  test('rotate affordance is reachable and rotates', async ({ page }, testInfo) => {
    const s = await setup(page, 140);
    // Real touches set this on pointerdown; set it so the idle frame draws the affordance.
    await page.evaluate(() => { window.app.renderer.lastPointerType = 'touch'; window.app.renderer.draw(); });
    const aff = await page.evaluate((lid) => {
      const r = window.app.renderer;
      const layer = window.app.engine.layers.find((l) => l.id === lid);
      const a = r.getRotateAffordance(r.getSelectionBounds([layer]));
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      return a && { x: a.x + box.left, y: a.y + box.top };
    }, s.id);
    expect(aff).not.toBeNull();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).id, aff)).toBe('main-canvas');
    const dir = require('fs');
    dir.mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE_DIR}/${NAMED[testInfo.project.name]}.png` });
    const before = await state(page, s.id);
    const vx = aff.x - before.center.x;
    const vy = aff.y - before.center.y;
    const R = Math.hypot(vx, vy);
    const a0 = Math.atan2(vy, vx);
    const viewport = page.viewportSize();
    const at = (a) => ({ x: before.center.x + Math.cos(a) * R, y: before.center.y + Math.sin(a) * R });
    const inside = (p) => p.x > 8 && p.y > 8 && p.x < viewport.width - 8 && p.y < viewport.height - 8;
    const plus = at(a0 + (30 * Math.PI) / 180);
    const minus = at(a0 - (30 * Math.PI) / 180);
    const end = inside(plus) ? plus : minus;
    await touch.drag(page, aff, end, { steps: 12 });
    const after = await state(page, s.id);
    expect(Math.abs(after.rotation - before.rotation)).toBeGreaterThan(5);
    expect(Math.abs(after.widthPx - before.widthPx) / before.widthPx).toBeLessThanOrEqual(0.02);
  });
});

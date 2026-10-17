const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-018a: a pointercancel (Control Center swipe, notification, palm) aborts the canvas edit and
// restores the pre-gesture state. It never commits and adds no history entry.
// Finger-only. Runs in the 8 primary projects; WebKit uses the helper's synthetic pointercancel.

const PRIMARY = [
  'touch-ipad-portrait', 'webkit-ipad-portrait', 'touch-ipad-landscape', 'webkit-ipad-landscape',
  'touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-landscape', 'webkit-iphone-landscape',
];
const IS_IPHONE_LANDSCAPE = (name) => /iphone-landscape$/.test(name);
const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A 60 x 60 mm object, selected, with its centre on a hit-testable canvas spot that has 80 px
// of free canvas to the right and 40 px above/below (room for the +50 px drag).
const setup = (page, { tool, penDraft }) => page.evaluate(({ tool, penDraft }) => {
  const app = window.app;
  const r = app.renderer;
  const rect = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]];
  const id = app.engine.addShapeLayer('TUX-018 A', rect(90, 60, 150, 120));
  window.Vectura.SETTINGS.snapGuides = false;
  window.Vectura.SETTINGS.showGuides = false;
  r.setSelection([id], id);
  app.ui.setActiveTool(tool);
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  const hit = (x, y) => document.elementFromPoint(x, y) === cv;
  const free = (x, y) => {
    for (let dx = -40; dx <= 90; dx += 10) for (let dy = -40; dy <= 40; dy += 20) if (!hit(x + dx, y + dy)) return false;
    return true;
  };
  const cx0 = Math.max(0, box.left) + (Math.min(innerWidth, box.right) - Math.max(0, box.left)) / 2;
  const cy0 = Math.max(0, box.top) + (Math.min(innerHeight, box.bottom) - Math.max(0, box.top)) / 2;
  let best = null;
  for (let y = Math.max(0, box.top); y < Math.min(innerHeight, box.bottom); y += 8) {
    for (let x = Math.max(0, box.left); x < Math.min(innerWidth, box.right); x += 8) {
      if (!free(x, y)) continue;
      const d = Math.hypot(x - cx0, y - cy0);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) throw new Error('no free canvas spot for the drag');
  r.scale = 3;
  r.offsetX = (best.x - box.left) - 120 * r.scale;
  r.offsetY = (best.y - box.top) - 90 * r.scale;
  if (penDraft) r.penDraft = { anchors: [r.createAnchor({ x: 100, y: 80 }), r.createAnchor({ x: 130, y: 80 })], closed: false };
  app.history = [];
  app.pushHistory();
  r.draw();
  return { id, pt: { x: best.x, y: best.y } };
}, { tool, penDraft });

const probe = (page, id) => page.evaluate((id) => {
  const app = window.app;
  const r = app.renderer;
  const l = app.engine.layers.find((x) => x.id === id);
  return {
    posX: l.params.posX || 0,
    posY: l.params.posY || 0,
    hist: app.history.length,
    layers: app.engine.layers.length,
    isLayerDrag: !!r.isLayerDrag,
    temp: r.tempTransform ? { dx: r.tempTransform.dx, dy: r.tempTransform.dy } : null,
    pen: r.penDraft && r.penDraft.anchors ? r.penDraft.anchors.length : 0,
    isPenDragging: !!r.isPenDragging,
    activePointerId: r.activePointerId,
  };
}, id);

test.describe('TUX-018a pointercancel aborts', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!PRIMARY.includes(testInfo.project.name), 'primary projects only');
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  });

  const fixture = async (page, testInfo, opts) => {
    try {
      return await setup(page, opts);
    } catch (err) {
      if (IS_IPHONE_LANDSCAPE(testInfo.project.name)) test.fail(true, `blocked-by TUX-007/008 (shell): ${String(err.message).slice(0, 80)}`);
      throw err;
    }
  };

  test('a cancelled object move returns the object and leaves no stuck state', async ({ page }, testInfo) => {
    const { id, pt } = await fixture(page, testInfo, { tool: 'select' });
    const before = await probe(page, id);
    await touch.touchPhase(page, 'start', [{ ...pt, id: 0 }]);
    // Held well under the 500 ms canvas long-press (TUX-034), so the touch stays a move.
    await sleep(250);
    for (let i = 1; i <= 10; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: pt.x + 5 * i, y: pt.y + 2 * i, id: 0 }]);
      await sleep(15);
    }
    const live = await probe(page, id);
    expect(live.isLayerDrag, 'move in flight').toBe(true);
    expect(live.temp && Math.abs(live.temp.dx) > 1, 'temp offset present').toBeTruthy();
    await touch.touchPhase(page, 'cancel', [{ x: pt.x + 50, y: pt.y + 20, id: 0 }]);
    await sleep(80);
    const after = await probe(page, id);
    expect(Math.abs(after.posX - before.posX)).toBeLessThan(0.01);
    expect(Math.abs(after.posY - before.posY)).toBeLessThan(0.01);
    expect(after.hist).toBe(before.hist);
    expect(after.isLayerDrag).toBe(false);
    expect(after.temp).toBeNull();
    expect(after.activePointerId).toBeNull();
    if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/${testInfo.project.name}.png` });
    // A fresh tap on empty canvas moves and draws nothing: no stuck state.
    const empty = { x: pt.x + 70, y: pt.y + 30 };
    await page.evaluate(() => window.app.renderer.setSelection([], null));
    await touch.tap(page, empty);
    await sleep(60);
    const tapped = await probe(page, id);
    expect(tapped.posX).toBe(before.posX);
    expect(tapped.hist).toBe(before.hist);
    expect(tapped.layers).toBe(before.layers);
  });

  test('a cancelled pen handle drag adds no anchor', async ({ page }, testInfo) => {
    const { id, pt } = await fixture(page, testInfo, { tool: 'pen', penDraft: true });
    const before = await probe(page, id);
    expect(before.pen).toBe(2);
    await touch.touchPhase(page, 'start', [{ ...pt, id: 0 }]);
    for (let i = 1; i <= 6; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: pt.x + 6 * i, y: pt.y + 4 * i, id: 0 }]);
      await sleep(15);
    }
    const live = await probe(page, id);
    expect(live.isPenDragging, 'pen drag in flight').toBe(true);
    expect(live.pen).toBe(3);
    await touch.touchPhase(page, 'cancel', [{ x: pt.x + 36, y: pt.y + 24, id: 0 }]);
    await sleep(80);
    const after = await probe(page, id);
    expect(after.pen).toBe(2);
    expect(after.isPenDragging).toBe(false);
    expect(after.hist).toBe(before.hist);
  });
});

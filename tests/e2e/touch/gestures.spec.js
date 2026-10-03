const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-017 — two fingers always pan and zoom, with every tool.
// Finger-only input through the touch helpers (CDP in Chromium, synthetic events in WebKit).
// Runs in the 8 primary projects. In iPhone landscape the canvas is only 44 px high until the
// shell lane (TUX-007/008) lands, so the precondition fails there and the test is marked
// expected-to-fail at runtime; it flips to a hard pass by itself once the layout is fixed.

const PRIMARY = [
  'touch-ipad-portrait', 'webkit-ipad-portrait', 'touch-ipad-landscape', 'webkit-ipad-landscape',
  'touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-landscape', 'webkit-iphone-landscape',
];
const IS_IPHONE_LANDSCAPE = (name) => /iphone-landscape$/.test(name);
const PINCH = { startDist: 100, endDist: 260, steps: 10 };
const RUNS = 8;
const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── in-page fixtures ──────────────────────────────────────────────────────
// All fixtures go through engine.addShapeLayer / addLayer + renderer selection.
// The app loads with 0 layers; nothing relies on preset state.
const installFixture = (page, { tool, scene, selectObject, penDraft }) => page.evaluate(({ tool, scene, selectObject, penDraft }) => {
  const app = window.app;
  const r = app.renderer;
  const eng = app.engine;
  const rect = (x0, y0, x1, y1) => [[
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
  ]];
  let selectedId = null;
  if (scene) {
    selectedId = eng.addLayer('scene3d');
    // Select each child once: the first selection of a scene object lets the panel add default
    // fields (e.g. params.id). Doing it here keeps the "before" state free of that benign write.
    eng.layers.filter((l) => l.parentId === selectedId).forEach((c) => r.setSelection([c.id], c.id));
    r.setSelection([selectedId], selectedId);
  } else {
    // 70 x 70 mm object in the upper middle of the A4-ish paper.
    selectedId = eng.addShapeLayer('TUX-017 A', rect(73, 40, 143, 110));
    if (selectObject) r.setSelection([selectedId], selectedId);
    else r.setSelection([], null);
  }
  // Smart-guide snapping would add a few px to a committed drag; it is orthogonal to arbitration.
  window.Vectura.SETTINGS.snapGuides = false;
  window.Vectura.SETTINGS.showGuides = false;
  app.ui.setActiveTool(tool);
  if (penDraft) r.penDraft = { anchors: [r.createAnchor({ x: 90, y: 200 }), r.createAnchor({ x: 120, y: 200 })], closed: false };
  app.history = [];
  app.pushHistory();
  r.draw();
  return { id: selectedId, view: { scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY } };
}, { tool, scene, selectObject, penDraft });

// View reset + client-space target points. Recomputed before EVERY gesture.
// The canvas can be partly covered by panes (shell lane): the object and the empty-canvas
// target are placed inside the longest run of canvas that is actually hit-testable.
const prepare = (page, view) => page.evaluate((view) => {
  const app = window.app;
  const r = app.renderer;
  r.scale = view.scale;
  r.offsetX = view.offsetX;
  r.offsetY = view.offsetY;
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  const longestRun = (lo, hi, probe) => {
    let best = { a: lo, b: lo };
    let start = null;
    for (let v = lo; v <= hi; v += 4) {
      const ok = probe(v);
      if (ok && start === null) start = v;
      if ((!ok || v + 4 > hi) && start !== null) {
        const end = ok ? v : v - 4;
        if (end - start > best.b - best.a) best = { a: start, b: end };
        start = null;
      }
    }
    return best;
  };
  const hit = (x, y) => document.elementFromPoint(x, y) === cv;
  const vis = (y) => Math.min(innerHeight - 1, Math.max(0, y));
  // Vertical run along the canvas' middle column, then a horizontal run per target row.
  const probeCx = Math.max(0, box.left) + (Math.min(innerWidth, box.right) - Math.max(0, box.left)) / 2;
  const runY = longestRun(Math.max(0, box.top), Math.min(innerHeight - 1, box.bottom), (y) => hit(probeCx, y));
  const H = runY.b - runY.a;
  const objY = vis(runY.a + 0.3 * H);
  const emptyY = vis(runY.a + 0.8 * H);
  const rowCenter = (y) => {
    const run = longestRun(Math.max(0, box.left), Math.min(innerWidth - 1, box.right), (x) => hit(x, y));
    return (run.a + run.b) / 2;
  };
  const emptyX = rowCenter(emptyY);
  // The pinch centre sits 50 px right of the object centre, so the object goes 50 px left of the run centre.
  const objX = rowCenter(objY) - 50;
  const objWorld = { x: 108, y: 75 };
  const scene = app.engine.layers.find((l) => l.type === 'scene3d' || l.isGroup);
  if (scene) {
    const paths = app.engine.layers
      .flatMap((l) => (r.getInteractionPaths ? r.getInteractionPaths(l) : []) || [])
      .filter((p) => p && p.meta && p.meta.sceneTarget && Array.isArray(p) && p.length);
    if (paths.length) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      paths.forEach((p) => p.forEach((pt) => { x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y); }));
      objWorld.x = (x0 + x1) / 2;
      objWorld.y = (y0 + y1) / 2;
    }
  }
  r.offsetX = (objX - box.left) - objWorld.x * r.scale;
  r.offsetY = (objY - box.top) - objWorld.y * r.scale;
  r.draw();
  return {
    canvasH: box.height,
    canvasW: box.width,
    scale: r.scale,
    obj: { x: objX, y: objY },
    empty: { x: emptyX, y: emptyY },
  };
}, view);

const precondition = async (page, centers, dist, projectName) => {
  const info = await page.evaluate(({ pts }) => ({
    hits: pts.map((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      return el && el.id ? el.id : (el ? el.tagName : 'none');
    }),
  }), { pts: [{ x: centers.x - dist / 2, y: centers.y }, { x: centers.x + dist / 2, y: centers.y }] });
  const meta = await page.evaluate(() => ({ h: document.querySelector('#main-canvas').getBoundingClientRect().height, s: window.app.renderer.scale }));
  const ok = info.hits.every((id) => id === 'main-canvas') && meta.h >= 200 && meta.s > 0;
  if (!ok) {
    const measured = `hits=${info.hits.join(',')} canvasH=${Math.round(meta.h)} scale=${meta.s.toFixed(3)}`;
    if (IS_IPHONE_LANDSCAPE(projectName)) {
      test.fail(true, `blocked-by TUX-007/008 (shell): ${measured}`);
    }
    throw new Error(`precondition failed: ${measured}`);
  }
};

// installFixture can throw in iPhone landscape (negative zoom on a 44 px canvas); that is the
// same shell-lane blocker as the precondition, so it is marked expected-to-fail there.
const fixture = async (page, testInfo, opts) => {
  try {
    return await installFixture(page, opts);
  } catch (err) {
    if (IS_IPHONE_LANDSCAPE(testInfo.project.name)) {
      test.fail(true, `blocked-by TUX-007/008 (shell): fixture threw ${String(err.message).slice(0, 80)}`);
    }
    throw err;
  }
};

const observe = (page) => page.evaluate(() => {
  const app = window.app;
  const r = app.renderer;
  const flags = ['isSelecting', 'isLassoSelecting', 'isDirectMarquee', 'isLayerDrag', 'isPan', 'isScissor',
    'isPenDragging', '_sceneDrag', '_sceneObjectGizmoDrag', '_areaCreate', 'shapeDraft', 'algoDraft']
    .filter((f) => r[f]);
  return {
    scale: r.scale,
    offsetX: r.offsetX,
    offsetY: r.offsetY,
    state: JSON.stringify(app.captureState()),
    hist: app.history.length,
    sel: [...r.selectedLayerIds].sort(),
    active: app.engine.activeLayerId,
    scene: JSON.stringify(r.getSceneSelection ? r.getSceneSelection() : null),
    penAnchors: r.penDraft && r.penDraft.anchors ? r.penDraft.anchors.length : 0,
    flags,
    layers: app.engine.layers.length,
  };
});

const firstDiff = (a, b) => {
  if (a === b) return 'identical';
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  return `differs at ${i}: before=...${a.slice(Math.max(0, i - 80), i + 100)} | after=...${b.slice(Math.max(0, i - 80), i + 100)}`;
};

const assertUntouched = (before, after, label) => {
  expect(after.sel, `${label}: selection ids`).toEqual(before.sel);
  expect(after.active, `${label}: active layer`).toBe(before.active);
  expect(after.scene, `${label}: scene selection`).toBe(before.scene);
  expect(after.hist, `${label}: history length`).toBe(before.hist);
  expect(firstDiff(before.state, after.state), `${label}: document state`).toBe('identical');
  expect(after.penAnchors, `${label}: pen draft anchors`).toBe(before.penAnchors);
  expect(after.flags, `${label}: stuck interaction flags`).toEqual([]);
};

test.describe('TUX-017 gesture arbiter', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!PRIMARY.includes(testInfo.project.name), 'primary projects only');
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  });

  const cases = [
    { name: 'Select on empty canvas, layer pre-selected', tool: 'select', selectObject: true, at: 'empty', shot: true },
    { name: 'Direct on empty canvas', tool: 'direct', selectObject: true, at: 'empty' },
    { name: 'Pen on empty canvas', tool: 'pen', selectObject: false, at: 'empty' },
    { name: 'Scene 3D selected, pinch on the object', tool: 'select', scene: true, selectObject: true, at: 'obj' },
    { name: 'Select on the selected object (VERIFY-FIRST: zooms today, regression coverage)', tool: 'select', selectObject: true, at: 'obj' },
  ];

  const runPinches = async (page, testInfo, c, staggerMs) => {
    const { view } = await fixture(page, testInfo, c);
    const project = testInfo.project.name;
    for (let i = 0; i < RUNS; i += 1) {
      const pts = await prepare(page, view);
      const target = c.at === 'obj' ? { x: pts.obj.x + PINCH.startDist / 2, y: pts.obj.y } : pts.empty;
      await precondition(page, target, PINCH.startDist, project);
      const before = await observe(page);
      await touch.pinch(page, target, { ...PINCH, staggerMs });
      await sleep(40);
      const after = await observe(page);
      const label = `${c.name} #${i + 1}`;
      expect(after.scale / before.scale, `${label}: renderer.scale ratio`).toBeGreaterThanOrEqual(1.5);
      assertUntouched(before, after, label);
      if (c.shot && EVIDENCE_DIR && i === RUNS - 1) {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, `${project}.png`) });
      }
    }
  };

  test.describe('pinch anywhere', () => {
    cases.forEach((c) => {
      test(`${c.name}: ${RUNS} staggered pinches`, async ({ page }, testInfo) => {
        await runPinches(page, testInfo, c, 60);
      });
    });
  });

  test.describe('simultaneous pinch', () => {
    cases.filter((c) => c.tool === 'select' && !c.scene || c.tool === 'pen').forEach((c) => {
      test(`${c.name}: ${RUNS} simultaneous pinches`, async ({ page }, testInfo) => {
        await runPinches(page, testInfo, c, 0);
      });
    });
  });

  test('two-finger pan on empty canvas with Select', async ({ page }, testInfo) => {
    const { view } = await fixture(page, testInfo, { tool: 'select', selectObject: true });
    const pts = await prepare(page, view);
    await precondition(page, { x: pts.empty.x, y: pts.empty.y }, 100, testInfo.project.name);
    const before = await observe(page);
    await touch.twoFingerPan(page, pts.empty, { dx: 80, dy: 40, gap: 100 });
    await sleep(40);
    const after = await observe(page);
    expect(Math.abs(after.offsetX - before.offsetX - 80), 'offsetX delta').toBeLessThanOrEqual(4);
    expect(Math.abs(after.offsetY - before.offsetY - 40), 'offsetY delta').toBeLessThanOrEqual(4);
    expect(Math.abs(after.scale / before.scale - 1), 'scale drift').toBeLessThanOrEqual(0.01);
    assertUntouched(before, after, 'two-finger pan');
  });

  test('no one-finger action after the pinch (Requirement 5)', async ({ page }, testInfo) => {
    const { view } = await fixture(page, testInfo, { tool: 'select', selectObject: true });
    const pts = await prepare(page, view);
    const c = pts.empty;
    await precondition(page, c, 100, testInfo.project.name);
    const before = await observe(page);
    const f0 = { x: c.x - 50, y: c.y, id: 0 };
    const f1 = { x: c.x + 50, y: c.y, id: 1 };
    await touch.touchPhase(page, 'start', [f0]);
    await sleep(60);
    await touch.touchPhase(page, 'start', [f0, f1]);
    for (let i = 1; i <= 6; i += 1) {
      await touch.touchPhase(page, 'move', [{ ...f0, x: f0.x - 8 * i }, { ...f1, x: f1.x + 8 * i }]);
    }
    const f0Now = { ...f0, x: f0.x - 48 };
    const f1Now = { ...f1, x: f1.x + 48 };
    await touch.touchPhase(page, 'end', [f1Now]);
    await sleep(40);
    const mid = await observe(page);
    expect(mid.scale / before.scale, 'pinch zoomed').toBeGreaterThan(1.2);
    for (let i = 1; i <= 5; i += 1) {
      await touch.touchPhase(page, 'move', [{ ...f0Now, y: f0Now.y + 12 * i }]);
    }
    const during = await observe(page);
    expect(during.flags, 'flags while the lone finger moves').toEqual([]);
    await touch.touchPhase(page, 'end', [{ ...f0Now, y: f0Now.y + 60 }]);
    await sleep(40);
    const after = await observe(page);
    expect(after.offsetX, 'offsetX after the lift').toBeCloseTo(mid.offsetX, 3);
    expect(after.offsetY, 'offsetY after the lift').toBeCloseTo(mid.offsetY, 3);
    expect(after.scale, 'scale after the lift').toBeCloseTo(mid.scale, 6);
    assertUntouched(before, after, 'after-pinch one-finger');
  });

  test('late second finger commits the first action as one undo step', async ({ page }, testInfo) => {
    const { view } = await fixture(page, testInfo, { tool: 'select', selectObject: true });
    const pts = await prepare(page, view);
    const startAt = { x: pts.obj.x, y: pts.obj.y };
    await precondition(page, { x: startAt.x + 30, y: startAt.y }, 60, testInfo.project.name);
    const before = await page.evaluate(() => {
      const r = window.app.renderer;
      const l = r.getSelectedLayers()[0];
      const b = r.getSelectionBounds([l]);
      return { cx: b.center.x, cy: b.center.y, scale: r.scale, hist: window.app.history.length };
    });
    const f0 = { x: startAt.x, y: startAt.y, id: 0 };
    await touch.touchPhase(page, 'start', [f0]);
    await sleep(400);
    for (let i = 1; i <= 8; i += 1) {
      await touch.touchPhase(page, 'move', [{ ...f0, x: f0.x + 5 * i }]);
      await sleep(25);
    }
    const f0Now = { ...f0, x: f0.x + 40 };
    const f1 = { x: f0Now.x + 60, y: f0Now.y, id: 1 };
    await touch.touchPhase(page, 'start', [f0Now, f1]);
    for (let i = 1; i <= 10; i += 1) {
      await touch.touchPhase(page, 'move', [{ ...f0Now, x: f0Now.x - 4.5 * i }, { ...f1, x: f1.x + 4.5 * i }]);
    }
    await touch.touchPhase(page, 'end', [{ ...f0Now, x: f0Now.x - 45 }, { ...f1, x: f1.x + 45 }]);
    await sleep(60);
    const after = await page.evaluate(() => {
      const r = window.app.renderer;
      const l = r.getSelectedLayers()[0];
      const b = r.getSelectionBounds([l]);
      return { cx: b.center.x, cy: b.center.y, scale: r.scale, hist: window.app.history.length, flags: r.isLayerDrag };
    });
    expect(after.hist - before.hist, 'exactly one history entry').toBe(1);
    expect((after.cx - before.cx) * before.scale, 'object moved 40 px (screen)').toBeGreaterThan(38);
    expect((after.cx - before.cx) * before.scale, 'object moved 40 px (screen)').toBeLessThan(42);
    expect(Math.abs((after.cy - before.cy) * before.scale), 'no vertical drift').toBeLessThanOrEqual(2);
    expect(after.scale / before.scale, 'pinch started').toBeGreaterThanOrEqual(1.5);
    expect(after.flags).toBeFalsy();
  });
});

// ── TUX-019: one-finger drag moves objects at once ────────────────────────────
// Finger-only. No hold, no pan: a drag that starts on an object moves it after a 6 px slop.
// iPhone landscape cells fail at runtime (blocked-by TUX-007/009, shell) through the shared
// fixture()/precondition() helpers; test.fail reports an unexpected pass once the shell lands.
const DRAG = { dx: 60, dy: 30 };
const SLOP_TOL_PX = 2;

const probe = (page, ids) => page.evaluate((ids) => {
  const app = window.app;
  const r = app.renderer;
  const layers = (ids || [...r.selectedLayerIds]).map((id) => app.engine.layers.find((l) => l.id === id)).filter(Boolean);
  const b = layers.length ? r.getSelectionBounds(layers) : null;
  return {
    cx: b ? b.center.x : null,
    cy: b ? b.center.y : null,
    scale: r.scale,
    offsetX: r.offsetX,
    offsetY: r.offsetY,
    hist: app.history.length,
    sel: [...r.selectedLayerIds].sort(),
    key: r.keyObjectId,
    isLayerDrag: !!r.isLayerDrag,
    isPan: !!r.isPan,
    slop: !!r.touchSlopCrossed,
  };
}, ids || null);

const screenDelta = (before, after) => ({
  dx: (after.cx - before.cx) * before.scale,
  dy: (after.cy - before.cy) * before.scale,
});

test.describe('TUX-019 direct drag', () => {
  let savedSettings = null;
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!PRIMARY.includes(testInfo.project.name), 'primary projects only');
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
    savedSettings = await page.evaluate(() => {
      const s = window.Vectura.SETTINGS;
      return { snapGuides: s.snapGuides, showGuides: s.showGuides, snapGrid: s.snapGrid, snapToGrid: s.snapToGrid };
    });
  });
  test.afterEach(async ({ page }) => {
    if (!savedSettings) return;
    try {
      await page.evaluate((s) => Object.assign(window.Vectura.SETTINGS, s), savedSettings);
    } catch (_err) { /* page may be closed */ }
  });

  const setup = async (page, testInfo, opts) => {
    const { id, view } = await fixture(page, testInfo, opts);
    const pts = await prepare(page, view);
    await precondition(page, { x: pts.obj.x + DRAG.dx / 2, y: pts.obj.y + DRAG.dy / 2 }, DRAG.dx, testInfo.project.name);
    return { id, view, pts };
  };
  const to = (p) => ({ x: p.x + DRAG.dx, y: p.y + DRAG.dy });
  // A press on an UNSELECTED object must land on its outline (interior is not a hit target).
  const topEdge = async (page, pts, testInfo) => {
    // Top outline, 20 mm RIGHT of centre (the object sits left of the canvas run centre, so the
    // right side is clear of side panes in iPad portrait), 4 px inside (bounds test is strict).
    const p = { x: pts.obj.x + 20 * pts.scale, y: pts.obj.y - 35 * pts.scale + 4 };
    await precondition(page, { x: p.x + DRAG.dx / 2, y: p.y + DRAG.dy / 2 }, DRAG.dx, testInfo.project.name);
    return p;
  };

  test('(a) selected object moves with a quick drag', async ({ page }, testInfo) => {
    const { id, pts } = await setup(page, testInfo, { tool: 'select', selectObject: true });
    const before = await probe(page);
    await touch.drag(page, pts.obj, to(pts.obj), { steps: 10, stepDelayMs: 15, holdMs: 0 });
    await sleep(60);
    const after = await probe(page, [id]);
    const d = screenDelta(before, after);
    expect(d.dx, 'screen dx of the bounds centre').toBeGreaterThanOrEqual(DRAG.dx - SLOP_TOL_PX);
    expect(d.dx, 'screen dx of the bounds centre').toBeLessThanOrEqual(DRAG.dx + SLOP_TOL_PX);
    expect(d.dy, 'screen dy of the bounds centre').toBeGreaterThanOrEqual(DRAG.dy - SLOP_TOL_PX);
    expect(d.dy, 'screen dy of the bounds centre').toBeLessThanOrEqual(DRAG.dy + SLOP_TOL_PX);
    expect(after.offsetX, 'offsetX (no pan)').toBeCloseTo(before.offsetX, 0);
    expect(after.offsetY, 'offsetY (no pan)').toBeCloseTo(before.offsetY, 0);
    expect(after.hist - before.hist, 'history entries').toBe(1);
  });

  test('(a2) mid-drag shows the mouse drag state and never pans', async ({ page }, testInfo) => {
    const { pts } = await setup(page, testInfo, { tool: 'select', selectObject: true });
    const before = await probe(page);
    const f = { x: pts.obj.x, y: pts.obj.y, id: 0 };
    const evidenceDir = process.env.TUX_EVIDENCE_DIR_019 || '';
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-before.png`) });
    }
    await touch.touchPhase(page, 'start', [f]);
    await sleep(30);
    // 3 px: still under the 6 px slop, nothing may have started yet.
    await touch.touchPhase(page, 'move', [{ ...f, x: f.x + 3 }]);
    const under = await probe(page);
    expect(under.isLayerDrag, 'no move under the slop').toBe(false);
    expect(under.isPan, 'never pans').toBe(false);
    for (let i = 1; i <= 8; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: f.x + 3 + 7 * i, y: f.y + 3 * i, id: 0 }]);
      await sleep(15);
    }
    const mid = await probe(page);
    expect(mid.isLayerDrag, 'drag state active').toBe(true);
    expect(mid.isPan, 'never pans').toBe(false);
    expect(mid.slop, 'touchSlopCrossed flag').toBe(true);
    expect(mid.offsetX).toBeCloseTo(before.offsetX, 0);
    if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-mid.png`) });
    await touch.touchPhase(page, 'end', [{ x: f.x + 59, y: f.y + 24, id: 0 }]);
    await sleep(40);
    const end = await probe(page);
    expect(end.slop, 'touchSlopCrossed resets on lift').toBe(false);
    expect(end.isLayerDrag).toBe(false);
  });

  test('(b) unselected object is selected and moved', async ({ page }, testInfo) => {
    const { id, pts } = await setup(page, testInfo, { tool: 'select', selectObject: false });
    const before = await probe(page, [id]);
    expect(before.sel).toEqual([]);
    const edge = await topEdge(page, pts, testInfo);
    await touch.drag(page, edge, to(edge), { steps: 10, stepDelayMs: 15, holdMs: 0 });
    await sleep(60);
    const after = await probe(page, [id]);
    expect(after.sel, 'selected').toEqual([id]);
    const d = screenDelta(before, after);
    expect(Math.abs(d.dx - DRAG.dx), 'dx error px').toBeLessThanOrEqual(SLOP_TOL_PX);
    expect(Math.abs(d.dy - DRAG.dy), 'dy error px').toBeLessThanOrEqual(SLOP_TOL_PX);
    expect(after.offsetX, 'offsetX (no pan)').toBeCloseTo(before.offsetX, 0);
    expect(after.offsetY, 'offsetY (no pan)').toBeCloseTo(before.offsetY, 0);
    expect(after.hist - before.hist, 'history entries').toBe(1);
  });

  test('(c) empty-canvas drag draws a marquee, no pan (regression guard)', async ({ page }, testInfo) => {
    const { id, pts } = await setup(page, testInfo, { tool: 'select', selectObject: false });
    const before = await probe(page, [id]);
    // Start on empty canvas just outside the lower-right corner and sweep back over the object.
    const out = 35 * before.scale + 14;
    const a = { x: pts.obj.x + out, y: pts.obj.y + out };
    const b = { x: pts.obj.x, y: pts.obj.y };
    await precondition(page, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.abs(a.x - b.x), testInfo.project.name);
    await touch.drag(page, a, b, { steps: 12, stepDelayMs: 10 });
    await sleep(60);
    const after = await probe(page, [id]);
    expect(after.sel, 'marquee selected the layer').toEqual([id]);
    expect(after.offsetX).toBeCloseTo(before.offsetX, 0);
    expect(after.offsetY).toBeCloseTo(before.offsetY, 0);
  });

  test('(d) tap with 3 px drift is a select, not a move', async ({ page }, testInfo) => {
    const { id, pts } = await setup(page, testInfo, { tool: 'select', selectObject: false });
    const before = await probe(page, [id]);
    const edge = await topEdge(page, pts, testInfo);
    await touch.drag(page, edge, { x: edge.x + 2, y: edge.y + 2 }, { steps: 3, stepDelayMs: 15 });
    await sleep(60);
    const after = await probe(page, [id]);
    expect(after.sel).toEqual([id]);
    expect(Math.hypot(after.cx - before.cx, after.cy - before.cy) * before.scale, 'moved px').toBeLessThan(0.5);
    expect(after.hist - before.hist, 'history entries').toBe(0);
  });

  test('(e) multi-select tap = mouse parity (Key Object)', async ({ page }, testInfo) => {
    const { id, view } = await fixture(page, testInfo, { tool: 'select', selectObject: true });
    const second = await page.evaluate(() => {
      const app = window.app;
      const rect = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]];
      const b = app.engine.addShapeLayer('TUX-019 B', rect(150, 40, 200, 110));
      const a = [...app.renderer.selectedLayerIds][0];
      app.renderer.setSelection([a, b], b);
      app.history = [];
      app.pushHistory();
      return b;
    });
    const pts = await prepare(page, view);
    const edge = await topEdge(page, pts, testInfo);
    const before = await probe(page, [id]);
    expect(before.sel.length).toBe(2);
    await touch.drag(page, edge, { x: edge.x + 2, y: edge.y + 1 }, { steps: 3, stepDelayMs: 15 });
    await sleep(60);
    const after = await probe(page, [id]);
    expect(after.key, 'key object is the tapped member').toBe(id);
    expect(after.sel.length, 'selection stays at 2 ids').toBe(2);
    expect(after.sel).toContain(second);
    expect(Math.hypot(after.cx - before.cx, after.cy - before.cy) * before.scale, 'moved px').toBeLessThan(0.5);
    expect(after.hist - before.hist, 'history entries').toBe(0);
  });

  test('(pointercancel) a cancelled touch move restores the object and adds no history', async ({ page }, testInfo) => {
    const { id, pts } = await setup(page, testInfo, { tool: 'select', selectObject: true });
    const before = await probe(page, [id]);
    const f = { x: pts.obj.x, y: pts.obj.y, id: 0 };
    await touch.touchPhase(page, 'start', [f]);
    for (let i = 1; i <= 8; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: f.x + 6 * i, y: f.y + 3 * i, id: 0 }]);
      await sleep(15);
    }
    expect((await probe(page, [id])).isLayerDrag, 'move in flight').toBe(true);
    if (touch.engineSupports(page, 'cdp')) {
      // CDP touchCancel takes an empty touchPoints list (the shared helper sends the point).
      const cdp = page.__touchCdp;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    } else {
      await touch.touchPhase(page, 'cancel', [{ x: f.x + 48, y: f.y + 24, id: 0 }]);
    }
    await sleep(60);
    const after = await probe(page, [id]);
    expect(Math.hypot(after.cx - before.cx, after.cy - before.cy) * before.scale, 'moved px').toBeLessThan(0.5);
    expect(after.hist - before.hist, 'history entries').toBe(0);
    expect(after.isLayerDrag).toBe(false);
  });

  // Direct Selection: anchor drag waits for the slop and never pans.
  const directSetup = async (page, testInfo) => {
    const { id, view } = await fixture(page, testInfo, { tool: 'direct', selectObject: true });
    await page.evaluate((id) => {
      const app = window.app;
      const layer = app.engine.layers.find((l) => l.id === id);
      app.renderer.setSelection([id], id);
      app.renderer.setDirectSelection(layer, 0);
      app.history = [];
      app.pushHistory();
    }, id);
    const pts = await prepare(page, view);
    // Top-right corner (143,40): 35 mm right of and 35 mm above the object centre.
    const s = pts.scale;
    const anchorAt = { x: pts.obj.x + 35 * s, y: pts.obj.y - 35 * s };
    const index = await page.evaluate((id) => {
      const r = window.app.renderer;
      const layer = window.app.engine.layers.find((l) => l.id === id);
      let best = 0; let bestV = -Infinity;
      r.directSelection.anchors.forEach((a, i) => { const w = r.sourceToWorldPoint(layer, a); const v = w.x - w.y; if (v > bestV) { bestV = v; best = i; } });
      return best;
    }, id);
    await precondition(page, { x: anchorAt.x + DRAG.dx / 2, y: anchorAt.y + DRAG.dy / 2 }, DRAG.dx, testInfo.project.name);
    return { id, anchorAt, index };
  };
  const anchorProbe = (page, id, index) => page.evaluate(({ id, index }) => {
    const app = window.app;
    const r = app.renderer;
    const layer = app.engine.layers.find((l) => l.id === id);
    const ds = r.directSelection;
    const a = ds && ds.anchors[index];
    const w = a ? r.sourceToWorldPoint(layer, a) : null;
    return { x: a ? a.x : null, y: a ? a.y : null, wx: w ? w.x : null, wy: w ? w.y : null, scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY, hist: app.history.length };
  }, { id, index });

  test('(f1) Direct: 3 px drift tap on an anchor does not move it', async ({ page }, testInfo) => {
    const { id, anchorAt, index } = await directSetup(page, testInfo);
    const before = await anchorProbe(page, id, index);
    expect(before.x, 'anchor exists').not.toBeNull();
    await touch.drag(page, anchorAt, { x: anchorAt.x + 3, y: anchorAt.y }, { steps: 3, stepDelayMs: 15 });
    await sleep(60);
    const after = await anchorProbe(page, id, index);
    expect(Math.hypot(after.wx - before.wx, after.wy - before.wy) * before.scale, 'anchor moved px').toBeLessThan(0.5);
    expect(after.hist - before.hist, 'history entries').toBe(0);
    expect(after.offsetX).toBeCloseTo(before.offsetX, 0);
  });

  test('(f2) Direct: 60,30 drag on an anchor moves it and never pans (VERIFY-FIRST)', async ({ page }, testInfo) => {
    const { id, anchorAt, index } = await directSetup(page, testInfo);
    const before = await anchorProbe(page, id, index);
    expect(before.x, 'anchor exists').not.toBeNull();
    await touch.drag(page, anchorAt, to(anchorAt), { steps: 10, stepDelayMs: 15 });
    await sleep(60);
    const after = await anchorProbe(page, id, index);
    expect(Math.abs((after.wx - before.wx) * before.scale - DRAG.dx), 'dx error px').toBeLessThanOrEqual(SLOP_TOL_PX);
    expect(Math.abs((after.wy - before.wy) * before.scale - DRAG.dy), 'dy error px').toBeLessThanOrEqual(SLOP_TOL_PX);
    expect(after.offsetX).toBeCloseTo(before.offsetX, 0);
    expect(after.offsetY).toBeCloseTo(before.offsetY, 0);
    expect(after.hist - before.hist, 'history entries').toBe(1);
  });
});

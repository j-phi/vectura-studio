const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-026: the Petal Designer works by finger.
//   window fit        the pop-out window lies fully inside the viewport (every touch project)
//   phone sheet       on phones the pop-out is a full-screen sheet that cannot be dragged
//   target size       tool / pop-out / pop-in / close / copy buttons are >= 44x44
//   anchor grab       a finger 15 px from an anchor grabs it (22 px touch radius)
//   delete            the delete tool removes the anchor a finger taps 15 px away
//   handle priority   a handle under the finger wins over its anchor
//   re-clamp          the window stays inside the viewport after a resize and a header drag
//   pinch             two fingers zoom the inline canvas (regression conversion, green before and after)
// Finger input only (tests/e2e/helpers/touch.js). The window is opened by tapping the inline pop-out
// button. If the inline pop-out is not hittable (not expected once TUX-010 is merged), the window is opened
// with ui.openPetalDesigner() as an annotated 'shim'. deviceIsReady() asserts the inline canvas has a size
// on every device, so the finger tests can never pass silently.

const spec = (testInfo) => PROJECTS[testInfo.project.name];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WINDOW_FIT = ['iPadP', 'iPadL', 'iPhP', 'iPhL', 'iPhP-c', 'iPhL-c', 'coarseWide'];
const PHONE_SHEET = ['iPhP', 'iPhL', 'iPhP-c', 'iPhL-c'];
const TARGET_SIZE = ['iPadL', 'coarseWide', 'iPhP'];
const ANCHOR_GRAB = ['iPadP', 'iPadL', 'iPhL', 'iPhP'];
const PINCH = ['iPadL', 'iPhL'];
const BTN_SEL = '.petal-tool-btn, .petal-popout, .petal-popin, .petal-close, .petal-copy-btn';

test.beforeEach(async ({ page }) => {
  // Benign WebKit noise ("ResizeObserver loop completed with undelivered notifications"). The designer
  // now defers its ResizeObserver redraw to a frame, so this should never fire; the filter stays as a guard.
  page.__errors = [];
  page.on('pageerror', (e) => {
    const msg = String((e && e.message) || e);
    if (!/ResizeObserver loop/i.test(msg)) page.__errors.push(msg);
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const { engine, ui } = window.app;
    engine.addLayer('petalisDesigner');
    ui.renderLayers();
    ui.buildControls();
  });
  // SETUP: make the left pane (it hosts the inline designer) visible.
  await page.evaluate(() => {
    const pane = document.getElementById('left-pane');
    const r = pane.getBoundingClientRect();
    if (r.width > 100 && r.right > 0 && r.left < innerWidth) return;
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await page.waitForTimeout(400);
  await page.waitForSelector('.petal-designer-inline', { state: 'attached' });
});

const inlineHittable = (page) => page.evaluate(() => {
  const b = document.querySelector('.petal-designer-inline .petal-popout');
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!el && (el === b || b.contains(el));
});

async function openWindow(page, testInfo) {
  if (await inlineHittable(page)) {
    await touch.tap(page, page.locator('.petal-designer-inline .petal-popout'));
  } else {
    // SETUP shim (TUX-010 not on this branch): the inline designer cannot be reached by finger on phones.
    testInfo.annotations.push({ type: 'shim', description: 'openPetalDesigner() used: inline pop-out not reachable (TUX-010)' });
    await page.evaluate(() => {
      const layer = window.app.engine.getActiveLayer?.() || window.app.engine.layers.find((l) => l.type === 'petalisDesigner');
      window.app.ui.openPetalDesigner({ layer, fromInline: true });
    });
  }
  await page.waitForSelector('#petal-designer-window');
  await sleep(350);
}

const winRect = (page) => page.evaluate(() => {
  const r = document.getElementById('petal-designer-window').getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});

const expectFits = (rect, vp) => {
  expect(rect.left, `left ${rect.left}`).toBeGreaterThanOrEqual(-0.5);
  expect(rect.top, `top ${rect.top}`).toBeGreaterThanOrEqual(-0.5);
  expect(rect.right, `right ${rect.right} > ${vp.width}`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(rect.bottom, `bottom ${rect.bottom} > ${vp.height}`).toBeLessThanOrEqual(vp.height + 0.5);
};

// ---- window fit (clause 4) --------------------------------------------------------------------
test('pop-out window lies fully inside the viewport', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!WINDOW_FIT.includes(s.device), 'not a touch window-fit project');
  await openWindow(page, testInfo);
  expectFits(await winRect(page), page.viewportSize());
});

// ---- phone sheet (clause 5) -------------------------------------------------------------------
test('phone: pop-out is a full-screen sheet, close is tappable, header cannot drag it', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!PHONE_SHEET.includes(s.device), 'phone projects only');
  await openWindow(page, testInfo);
  const vp = page.viewportSize();
  const r = await winRect(page);
  expect(Math.abs(r.left), 'left').toBeLessThanOrEqual(1);
  expect(Math.abs(r.top), 'top').toBeLessThanOrEqual(1);
  expect(Math.abs(r.right - vp.width), 'right').toBeLessThanOrEqual(1);
  expect(Math.abs(r.bottom - vp.height), 'bottom').toBeLessThanOrEqual(1);
  const top = await page.evaluate(() => {
    const b = document.querySelector('#petal-designer-window .petal-close').getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return el ? { ok: !!el.closest('.petal-close'), cls: el.className, id: el.id } : null;
  });
  expect(top && top.ok, `elementFromPoint(close) = ${JSON.stringify(top)}`).toBe(true);
  const title = await page.locator('#petal-designer-window .petal-designer-title').boundingBox();
  const from = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
  await touch.drag(page, from, { x: from.x + 200, y: from.y + 200 });
  await sleep(150);
  const after = await winRect(page);
  expect(after.left).toBeCloseTo(r.left, 0);
  expect(after.top).toBeCloseTo(r.top, 0);
});

// ---- target size (clause 3) -------------------------------------------------------------------
test('designer buttons are at least 44x44 (inline and pop-out)', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!TARGET_SIZE.includes(s.device), 'target-size projects only');
  const small = [];
  const audit = async (root) => {
    const count = await page.locator(`${root} :is(${BTN_SEL})`).count();
    for (let i = 0; i < count; i += 1) {
      const el = page.locator(`${root} :is(${BTN_SEL})`).nth(i);
      const box = await el.boundingBox();
      if (!box || box.width < 1 || box.height < 1) continue;
      await el.scrollIntoViewIfNeeded();
      const a = await touch.hitArea(page, el);
      // hitArea scans a 2 px grid from the centre, so a 44 px box at a fractional x (WebKit centres the tool
      // row at x.5) reads 43. The box itself must still measure 44.
      if (box.width < 43.99 || box.height < 43.99 || a.w < 43 || a.h < 43) small.push(`${root} ${await el.evaluate((n) => n.className)} ${Math.round(a.w)}x${Math.round(a.h)}`);
    }
  };
  await audit('.petal-designer-inline');
  await openWindow(page, testInfo);
  await audit('#petal-designer-window');
  expect(small, `controls under 44 px:\n${small.join('\n')}`).toEqual([]);
});

// ---- geometry helpers (setup reads) -----------------------------------------------------------
// Everything below reads state through the page only to PLAN where the finger goes and to ASSERT the
// result; the gestures themselves are real touches.
const planGrab = (page, which, kind) => page.evaluate(({ which, kind }) => {
  const ui = window.app.ui;
  const pd = which === 'window' ? ui.petalDesigner : ui.inlinePetalDesigner;
  const canvas = [...pd.root.querySelectorAll('canvas[data-petal-canvas]')].find((c) => c.getBoundingClientRect().width > 0);
  canvas.scrollIntoView({ block: 'center', inline: 'center' });
  const side = ui.getPetalDesignerTarget(pd.state);
  const shape = pd.state[side];
  const view = ui.getPetalDesignerView(pd.state, side);
  const sym = ui.getPetalDesignerSymmetryForSide(pd.state, side);
  const rect = canvas.getBoundingClientRect();
  const controls = ui.sampleDesignerControls(shape, canvas, view, sym);
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const inside = (p) => p.x > 8 && p.y > 8 && p.x < rect.width - 8 && p.y < rect.height - 8;
  const toClient = (p) => ({ x: rect.left + p.x, y: rect.top + p.y });
  const top = (p) => {
    const c = toClient(p);
    const el = document.elementFromPoint(c.x, c.y);
    return !!el && (el === canvas);
  };
  const snapshot = () => JSON.parse(JSON.stringify(shape.anchors));
  const n = shape.anchors.length;
  for (let i = 1; i < n - 1; i += 1) {
    const A = controls.find((c) => c.kind === 'anchor' && c.index === i && !c.mirror);
    if (!A) continue;
    const others = controls.filter((c) => !(c.kind === 'anchor' && c.index === i && !c.mirror));
    if (kind === 'handle') {
      // finger lands exactly on a handle that is >= 16 px from every other control
      for (const H of controls.filter((c) => c.kind === 'handle' && c.index === i && !c.mirror)) {
        const rest = controls.filter((c) => c !== H);
        if (rest.every((c) => d(c.point, H.point) >= 16) && inside(H.point) && top(H.point)) {
          return { i, which: H.which, start: toClient(H.point), before: snapshot(), side, count: n };
        }
      }
      continue;
    }
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180;
      const p = { x: A.point.x + Math.cos(a) * 15, y: A.point.y + Math.sin(a) * 15 };
      if (!inside(p) || !top(p)) continue;
      if (!others.every((c) => d(c.point, p) >= 16)) continue;
      if (!ui.hitDesignerShapeBody(shape, canvas, p, view, sym)) continue;
      return { i, start: toClient(p), before: snapshot(), side, count: n };
    }
  }
  return null;
}, { which, kind });

const readShape = (page, which, side) => page.evaluate(({ which, side }) => {
  const ui = window.app.ui;
  const pd = which === 'window' ? ui.petalDesigner : ui.inlinePetalDesigner;
  return { anchors: JSON.parse(JSON.stringify(pd.state[side].anchors)), target: pd.state.target };
}, { which, side });

const anchorMoved = (a, b) => Math.abs(a.t - b.t) > 1e-6 || Math.abs(a.w - b.w) > 1e-6;

const deviceIsReady = async (page, testInfo, which) => {
  const s = spec(testInfo);
  const w = await page.evaluate((which) => {
    const pd = which === 'window' ? window.app.ui.petalDesigner : window.app.ui.inlinePetalDesigner;
    const c = pd && [...pd.root.querySelectorAll('canvas[data-petal-canvas]')].find((x) => x.getBoundingClientRect().width > 0);
    return !!c;
  }, which);
  expect(w, `${which} designer canvas has no size on ${s.device}`).toBe(true);
  return w;
};

// ---- anchor grab (clause 1) -------------------------------------------------------------------
test('a finger 15 px from an anchor grabs it and drags it', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!ANCHOR_GRAB.includes(s.device), 'anchor-grab projects only');
  if (!(await deviceIsReady(page, testInfo, 'inline'))) return;
  const plan = await planGrab(page, 'inline', 'anchor');
  expect(plan, 'no tap point 15 px from an anchor and 16 px from every other control').not.toBeNull();
  await touch.drag(page, plan.start, { x: plan.start.x + 20, y: plan.start.y });
  const after = await readShape(page, 'inline', plan.side);
  expect(after.anchors.length).toBe(plan.count);
  expect(anchorMoved(plan.before[plan.i], after.anchors[plan.i]), 'anchor under the finger moved').toBe(true);
  plan.before.forEach((a, idx) => {
    if (idx !== plan.i) expect(after.anchors[idx], `anchor ${idx} unchanged`).toEqual(a);
  });
  expect(after.target).toBe(plan.side);
});

// ---- delete (clause 1) ------------------------------------------------------------------------
test('delete tool removes the anchor a finger taps 15 px away', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!ANCHOR_GRAB.includes(s.device), 'anchor-grab projects only');
  if (!(await deviceIsReady(page, testInfo, 'inline'))) return;
  // the shape needs > 3 anchors for a delete; the default has 4
  await page.locator('.petal-designer-inline [data-petal-tool="delete"]').scrollIntoViewIfNeeded();
  await touch.tap(page, page.locator('.petal-designer-inline [data-petal-tool="delete"]'));
  const plan = await planGrab(page, 'inline', 'anchor');
  expect(plan).not.toBeNull();
  await touch.tap(page, plan.start);
  const after = await readShape(page, 'inline', plan.side);
  expect(after.anchors.length).toBe(plan.count - 1);
  // the removed anchor is i: its old t/w no longer exists, the others are all still present
  const gone = plan.before[plan.i];
  expect(after.anchors.some((a) => !anchorMoved(a, gone))).toBe(false);
  plan.before.forEach((a, idx) => {
    if (idx !== plan.i) expect(after.anchors.some((x) => !anchorMoved(x, a))).toBe(true);
  });
});

// ---- handle priority (clause 1) ---------------------------------------------------------------
test('a finger on a handle drags the handle, not its anchor', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!ANCHOR_GRAB.includes(s.device), 'anchor-grab projects only');
  if (!(await deviceIsReady(page, testInfo, 'inline'))) return;
  const plan = await planGrab(page, 'inline', 'handle');
  expect(plan, 'no isolated handle').not.toBeNull();
  await touch.drag(page, plan.start, { x: plan.start.x + 14, y: plan.start.y + 6 });
  const after = await readShape(page, 'inline', plan.side);
  const b = plan.before[plan.i];
  const a = after.anchors[plan.i];
  expect(anchorMoved(a, b), 'anchor stayed').toBe(false);
  expect(anchorMoved(a[plan.which], b[plan.which]), `handle ${plan.which} moved`).toBe(true);
});

test('15 px from an anchor toward a close handle picks the handle (nearest, handle priority)', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!ANCHOR_GRAB.includes(s.device), 'anchor-grab projects only');
  if (!(await deviceIsReady(page, testInfo, 'inline'))) return;
  // SETUP: pull the interior anchor-1 `out` handle to 9 px from its anchor (inside the 5.7-12 px band),
  // along +t. The finger lands 15 px from the anchor straight toward the handle, i.e. 6 px from the handle
  // and 15 px from the anchor: the touch rule must pick the handle (dH <= 12 and dH < dA).
  const plan = await page.evaluate(() => {
    const ui = window.app.ui;
    const pd = ui.inlinePetalDesigner;
    const canvas = [...pd.root.querySelectorAll('canvas[data-petal-canvas]')].find((c) => c.getBoundingClientRect().width > 0);
    canvas.scrollIntoView({ block: 'center', inline: 'center' });
    const side = ui.getPetalDesignerTarget(pd.state);
    const shape = pd.state[side];
    const view = ui.getPetalDesignerView(pd.state, side);
    const sym = ui.getPetalDesignerSymmetryForSide(pd.state, side);
    const i = 1;
    const anchor = shape.anchors[i];
    const A0 = ui.designerToCanvas(canvas, anchor, view);
    const A1 = ui.designerToCanvas(canvas, { t: anchor.t + 0.01, w: anchor.w }, view);
    const pxPerT = Math.hypot(A1.x - A0.x, A1.y - A0.y) / 0.01;
    anchor.in = null;
    anchor.out = { t: anchor.t + 9 / pxPerT, w: anchor.w };
    ui.renderPetalDesigner(pd);
    const controls = ui.sampleDesignerControls(shape, canvas, view, sym);
    const H = controls.find((c) => c.kind === 'handle' && c.index === i && !c.mirror);
    const dx = (H.point.x - A0.x) / 9;
    const dy = (H.point.y - A0.y) / 9;
    const p = { x: A0.x + dx * 15, y: A0.y + dy * 15 };
    const rect = canvas.getBoundingClientRect();
    return {
      i, side, start: { x: rect.left + p.x, y: rect.top + p.y },
      before: JSON.parse(JSON.stringify(shape.anchors)), handleDist: Math.hypot(H.point.x - A0.x, H.point.y - A0.y),
    };
  });
  expect(plan.handleDist).toBeGreaterThan(5.7);
  expect(plan.handleDist).toBeLessThan(12.5);
  await touch.drag(page, plan.start, { x: plan.start.x + 12, y: plan.start.y });
  const after = await readShape(page, 'inline', plan.side);
  const b = plan.before[plan.i];
  const a = after.anchors[plan.i];
  expect(anchorMoved(a, b), 'anchor stayed').toBe(false);
  expect(anchorMoved(a.out, b.out), 'handle moved').toBe(true);
});

// ---- window re-clamp --------------------------------------------------------------------------
test('window stays inside the viewport after a resize and an off-screen header drag', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(s.device !== 'iPadP', 'iPadP only');
  await openWindow(page, testInfo);
  await page.setViewportSize({ width: 1210, height: 834 });
  await sleep(400);
  expectFits(await winRect(page), page.viewportSize());
  const title = await page.locator('#petal-designer-window .petal-designer-title').boundingBox();
  const from = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
  await touch.drag(page, from, { x: from.x + 2000, y: from.y + 2000 });
  await sleep(200);
  const vp = page.viewportSize();
  expectFits(await winRect(page), vp);
  const close = await page.locator('#petal-designer-window .petal-close').boundingBox();
  expect(close.x + close.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(close.y + close.height).toBeLessThanOrEqual(vp.height + 0.5);
  const header = await page.locator('#petal-designer-window .petal-designer-header').boundingBox();
  expect(header.y + header.height).toBeLessThanOrEqual(vp.height + 0.5);
});

// ---- pinch (clause 2: already satisfied; regression conversion, green before and after) --------
test('two-finger pinch zooms the inline designer canvas', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  test.skip(!PINCH.includes(s.device), 'pinch projects only');
  const info = await page.evaluate(() => {
    const ui = window.app.ui;
    const pd = ui.inlinePetalDesigner;
    const canvas = [...pd.root.querySelectorAll('canvas[data-petal-canvas]')].find((c) => c.getBoundingClientRect().width > 0);
    canvas.scrollIntoView({ block: 'center', inline: 'center' });
    const side = ui.getPetalDesignerTarget(pd.state);
    const r = canvas.getBoundingClientRect();
    return {
      side, center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      zoom: ui.getPetalDesignerView(pd.state, side).zoom,
      anchors: JSON.parse(JSON.stringify(pd.state[side].anchors)),
    };
  });
  await touch.pinch(page, info.center, { startDist: 40, endDist: 120 });
  const after = await page.evaluate((side) => {
    const ui = window.app.ui;
    const pd = ui.inlinePetalDesigner;
    return {
      zoom: ui.getPetalDesignerView(pd.state, side).zoom,
      anchors: JSON.parse(JSON.stringify(pd.state[side].anchors)),
      scale: window.visualViewport ? window.visualViewport.scale : 1,
    };
  }, info.side);
  expect(after.zoom).toBeGreaterThan(info.zoom);
  expect(after.anchors).toEqual(info.anchors);
  if (touch.engineSupports(page, 'trustedMultiTouch')) expect(after.scale).toBe(1);
});

// ---- Undo while the pop-out window is open (TUX-020 follow-up, batch R2) -----------------------
// The window covers the canvas HUD and the phone header, so it carries its own Undo / Redo. The edit is
// set up through the history API (the window itself does not push history); the Undo is a real finger.
const UNDO_IN_WINDOW = ['iPadP', 'iPadL', 'iPhP', 'iPhL'];
test('Undo and Redo in the pop-out window header revert and restore an edit by finger', async ({ page }, testInfo) => {
  test.skip(!UNDO_IN_WINDOW.includes(spec(testInfo).device), 'iPad and iPhone projects only');
  await openWindow(page, testInfo);
  const profile = () => page.evaluate(() => window.app.engine.layers.find((l) => l.type === 'petalisDesigner').params.petalProfile);
  const before = await profile();
  await page.evaluate(() => {
    const { app } = window;
    app.pushHistory();
    app.engine.layers.find((l) => l.type === 'petalisDesigner').params.petalProfile = 'edited-by-test';
  });
  await page.waitForTimeout(150);
  expect(await profile()).toBe('edited-by-test');
  const undo = page.locator('#petal-designer-window .petal-undo');
  const redo = page.locator('#petal-designer-window .petal-redo');
  await expect(undo).toBeEnabled();
  const box = await undo.boundingBox();
  expect(box.width, 'undo width').toBeGreaterThanOrEqual(43.99);
  expect(box.height, 'undo height').toBeGreaterThanOrEqual(43.99);
  const top = await undo.evaluate((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && (el === b || b.contains(el)); });
  expect(top, 'Undo is the top element at its centre').toBe(true);
  await touch.tap(page, undo);
  await sleep(250);
  expect(await profile()).toBe(before);
  await expect(redo).toBeEnabled();
  await touch.tap(page, redo);
  await sleep(250);
  expect(await profile()).toBe('edited-by-test');
});

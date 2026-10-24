const { evidenceDir, shoot } = require('../helpers/evidence');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const clock = require('../helpers/app-clock');
const core = require('../helpers/target-audit-core');

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
const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || evidenceDir('TUX-023');

// Batch R3: the painted rotate disc is set by a frame, so wait for that frame instead of a fixed time.
const waitAffordanceDrawn = (page) => page.waitForFunction(() => !!window.app.renderer._rotAffDrawn, null, { timeout: 6000, polling: 50 });

// Batch R3: select the first layer by a finger tap. Geometry is settled before the target is read and the target is
// re-read on every attempt, so a late layout shift cannot leave the tap on empty canvas (up to 3 attempts).
const selectByFinger = async (page) => {
  const picked = () => page.waitForFunction(() => (window.app.renderer.selectedLayerIds || new Set()).size === 1, null, { timeout: 2000 }).then(() => true, () => false);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await core.waitGeometryStable(page);
    const at = await page.evaluate(() => {
      const r = window.app.renderer;
      const b = r.getSelectionBounds([window.app.engine.layers[0]]);
      const c = r.worldToScreen(b.center.x, b.center.y);
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      return { x: c.x + box.left, y: c.y + box.top };
    });
    await touch.tap(page, at);
    if (await picked()) return;
  }
  expect(false, 'the finger tap selected the layer').toBe(true);
};

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
    const probes = [[0, 0], [60, 60], [10, 10], [17, 17], [26, 26], [-17, 17], [-26, 26], [-px / 2, -py / 2], [40, -py - 40]];
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
    // Quick drags run on a frozen page clock (clock.frozenDrag): a slow runner cannot stretch them past the 500 ms hold.
    await clock.install(page);
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
    await clock.frozenDrag(page, start, { x: start.x + 40, y: start.y + 40 }, { steps: 10 });
    const after = await state(page, s.id);
    expect(Math.abs(after.rotation - before.rotation)).toBeLessThan(1e-3);
    const grew = after.widthPx - before.widthPx;
    expect(grew).toBeGreaterThanOrEqual(28);
    expect(grew).toBeLessThanOrEqual(52);
  });

  // C1 (nightly): a corner drag starts at 0 px. A slow finger (3 px, then a rest past the 500 ms hold delay)
  // must keep the resize: the canvas long-press yields to the started drag and opens no menu.
  test('slow corner drag past the hold delay still resizes and opens no menu', async ({ page }) => {
    const s = await setup(page, 140);
    const start = { x: s.se.x + 10, y: s.se.y + 10 };
    const before = await state(page, s.id);
    await touch.touchPhase(page, 'start', [{ ...start, id: 0 }]);
    await touch.touchPhase(page, 'move', [{ x: start.x + 3, y: start.y + 3, id: 0 }]);
    await page.waitForTimeout(700);
    for (let i = 1; i <= 8; i += 1) await touch.touchPhase(page, 'move', [{ x: start.x + 3 + i * 4.625, y: start.y + 3 + i * 4.625, id: 0 }]);
    await touch.touchPhase(page, 'end', [{ x: start.x + 40, y: start.y + 40, id: 0 }]);
    await page.waitForTimeout(200);
    expect(await page.locator('.canvas-ctx-menu').count(), 'no long-press menu during a started resize').toBe(0);
    const after = await state(page, s.id);
    const grew = after.widthPx - before.widthPx;
    expect(grew).toBeGreaterThanOrEqual(28);
    expect(grew).toBeLessThanOrEqual(52);
  });

  test('small object moves from its centre', async ({ page }) => {
    const s = await setup(page, 32);
    const before = await state(page, s.id);
    expect(before.widthPx).toBeGreaterThanOrEqual(20);
    expect(before.widthPx).toBeLessThanOrEqual(44);
    await clock.frozenDrag(page, before.center, { x: before.center.x + 30, y: before.center.y }, { steps: 10 });
    const after = await state(page, s.id);
    expect(Math.abs(after.widthPx - before.widthPx)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.rotation - before.rotation)).toBeLessThan(1e-3);
    expect(Math.hypot(after.center.x - before.center.x, after.center.y - before.center.y)).toBeGreaterThanOrEqual(15);
  });

  test('tiny (about 10 px) object moves from its centre, never resizes', async ({ page }) => {
    const s = await setup(page, 10);
    const before = await state(page, s.id);
    expect(before.widthPx).toBeLessThanOrEqual(14);
    await clock.frozenDrag(page, before.center, { x: before.center.x + 30, y: before.center.y + 20 }, { steps: 10 });
    const after = await state(page, s.id);
    expect(Math.abs(after.widthPx - before.widthPx)).toBeLessThanOrEqual(1);
    expect(after.center.x - before.center.x).toBeGreaterThan(24);
    expect(after.center.x - before.center.x).toBeLessThan(36);
    expect(after.center.y - before.center.y).toBeGreaterThan(14);
    expect(after.center.y - before.center.y).toBeLessThan(26);
  });

  test('flat (about 140x30) selection moves from its centre and keeps its height', async ({ page }) => {
    const s = await setup(page, 140);
    // Flatten through the layer's own Y scale (a real regenerate, so the move commit keeps it flat):
    // about 30 px tall on screen, so the n/s edge zones would cover the centre unless nudged outward.
    await page.evaluate((lid) => {
      const app = window.app;
      const r = app.renderer;
      const layer = app.engine.layers.find((l) => l.id === lid);
      const b = r.getSelectionBounds([layer]);
      const hPx = Math.hypot(b.corners.sw.x - b.corners.nw.x, b.corners.sw.y - b.corners.nw.y) * r.scale;
      layer.params.scaleY = (layer.params.scaleY || 1) * (30 / hPx);
      app.engine.generate(lid);
      app.computeDisplayGeometry?.();
      r.lastPointerType = 'touch';
      r.draw();
    }, s.id);
    const measure = () => page.evaluate((lid) => {
      const r = window.app.renderer;
      const layer = window.app.engine.layers.find((l) => l.id === lid);
      const b = r.getSelectionBounds([layer]);
      const c = r.worldToScreen(b.center.x, b.center.y);
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      return {
        wPx: Math.hypot(b.corners.ne.x - b.corners.nw.x, b.corners.ne.y - b.corners.nw.y) * r.scale,
        hPx: Math.hypot(b.corners.sw.x - b.corners.nw.x, b.corners.sw.y - b.corners.nw.y) * r.scale,
        center: { x: c.x + box.left, y: c.y + box.top },
      };
    }, s.id);
    const before = await measure();
    expect(before.hPx).toBeGreaterThan(24);
    expect(before.hPx).toBeLessThan(36);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).id, before.center)).toBe('main-canvas');
    await clock.frozenDrag(page, before.center, { x: before.center.x + 30, y: before.center.y + 20 }, { steps: 10 });
    const after = await measure();
    expect(Math.abs(after.hPx - before.hPx)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.wPx - before.wPx)).toBeLessThanOrEqual(1);
    expect(after.center.x - before.center.x).toBeGreaterThan(24);
    expect(after.center.y - before.center.y).toBeGreaterThan(14);
    require('fs').mkdirSync(EVIDENCE_DIR, { recursive: true });
    await shoot(page, { path: `${EVIDENCE_DIR}/flat-centre-drag-${NAMED[test.info().project.name]}.png` });
  });

  test('nudged corner resize is relative to the grab point (no jump)', async ({ page }) => {
    const s = await setup(page, 32);
    const hit = await page.evaluate((lid) => {
      const r = window.app.renderer;
      const layer = window.app.engine.layers.find((l) => l.id === lid);
      const se = r.getHandleHitPoints(r.getSelectionBounds([layer]), 'touch').find((h) => h.key === 'se');
      const p = r.worldToScreen(se.x, se.y);
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      return { x: p.x + box.left, y: p.y + box.top };
    }, s.id);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).id, hit)).toBe('main-canvas');
    const before = await state(page, s.id);
    expect(before.widthPx).toBeLessThanOrEqual(44);
    await clock.frozenDrag(page, hit, { x: hit.x + 8, y: hit.y + 8 }, { steps: 8 });
    const after = await state(page, s.id);
    const grew = after.widthPx - before.widthPx;
    expect(grew).toBeGreaterThanOrEqual(6);
    expect(grew).toBeLessThanOrEqual(10);
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
    await shoot(page, { path: `${EVIDENCE_DIR}/${NAMED[testInfo.project.name]}.png` });
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
    await clock.frozenDrag(page, aff, end, { steps: 12 });
    const after = await state(page, s.id);
    expect(Math.abs(after.rotation - before.rotation)).toBeGreaterThan(5);
    expect(Math.abs(after.widthPx - before.widthPx) / before.widthPx).toBeLessThanOrEqual(0.02);
  });
});

// Rotate affordance must not sit under docked chrome (ctxbar, rails, panes). Default layout, finger tap select.
const IPHL = ['touch-iphone-landscape', 'webkit-iphone-landscape'];
test.describe('TUX-023 rotate affordance clear of chrome (iPhone landscape)', () => {
  test('affordance centre is the canvas after a finger tap select', async ({ page }, testInfo) => {
    test.skip(!IPHL.includes(testInfo.project.name), 'TUX-023 chrome-overlap check runs on iPhone landscape');
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
    await page.waitForTimeout(800);
    // Default layout: add a rings layer, leave the view as the app fits it, select by finger tap.
    await page.evaluate(() => {
      const e = window.app.engine;
      const id = e.addLayer('rings');
      e.generate?.(id);
      window.app.computeDisplayGeometry?.();
      window.app.renderer.setTool('select');
      window.app.renderer.draw();
    });
    await page.waitForTimeout(600);
    await selectByFinger(page);
    await core.waitGeometryStable(page);
    await waitAffordanceDrawn(page);
    const res = await page.evaluate(() => {
      const r = window.app.renderer;
      const ids = Array.from(r.selectedLayerIds || []);
      const layer = window.app.engine.layers.find((l) => l.id === ids[0]);
      if (!layer) return { selected: ids.length };
      const a = r.getRotateAffordance(r.getSelectionBounds([layer]));
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      const x = a.x + box.left;
      const y = a.y + box.top;
      const el = document.elementFromPoint(x, y);
      return { selected: ids.length, id: el && el.id, cls: el && el.className, x, y, r: a.r };
    });
    expect(res.selected).toBe(1);
    expect(res.id).toBe('main-canvas');
    // The affordance that was actually PAINTED (not a fresh compute) must also be clear of chrome.
    await waitAffordanceDrawn(page);
    const drawn = await page.evaluate(() => {
      const a = window.app.renderer._rotAffDrawn;
      if (!a) return null;
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      const el = document.elementFromPoint(a.x + box.left, a.y + box.top);
      return { id: el && (el.id || el.className), x: a.x, y: a.y };
    });
    expect(drawn, 'a rotate affordance was drawn').not.toBeNull();
    expect(drawn.id, `drawn affordance at (${Math.round(drawn.x)},${Math.round(drawn.y)})`).toBe('main-canvas');
    require('fs').mkdirSync(EVIDENCE_DIR, { recursive: true });
    await shoot(page, { path: `${EVIDENCE_DIR}/iPhL-tap-select-${testInfo.project.name}.png` });
    // Deterministic overlap: the ctxbar docks at different spots per layout pass, so also cover the
    // current affordance spot with a stand-in chrome element. The affordance must move off it.
    const moved = await page.evaluate(({ x, y }) => {
      const r = window.app.renderer;
      const layer = window.app.engine.layers[0];
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      const cover = document.createElement('div');
      cover.id = 'zz-chrome-cover';
      cover.style.cssText = `position:fixed;left:${x - 40}px;top:${y - 40}px;width:80px;height:80px;z-index:99999;background:rgba(255,0,0,.3)`;
      document.body.appendChild(cover);
      r._rotAffCache = null; // the affordance is cached ~120 ms per geometry; chrome moves invalidate it by age
      const a = r.getRotateAffordance(r.getSelectionBounds([layer]));
      const cx = a.x + box.left;
      const cy = a.y + box.top;
      const probes = [[0, 0], [a.r, 0], [-a.r, 0], [0, a.r], [0, -a.r]];
      return {
        dist: Math.hypot(cx - x, cy - y),
        topIds: probes.map(([dx, dy]) => (document.elementFromPoint(cx + dx, cy + dy) || {}).id),
      };
    }, { x: res.x, y: res.y });
    expect(moved.dist).toBeGreaterThan(20);
    moved.topIds.forEach((id) => expect(id).toBe('main-canvas'));
    expect(errors).toEqual([]);
  });
});

// Bottom corner touch zones must not sit under the docked ctxbar. DEFAULT layout: no view sliding.
test.describe('TUX-023 bottom-corner zones clear of the ctxbar (default layout)', () => {
  for (const wantPx of [0, 20]) {
    test(`canvas is topmost at the bottom corner zones (${wantPx ? 'nudged 20 px selection' : 'normal selection'})`, async ({ page }, testInfo) => {
      test.skip(!['touch-ipad-landscape', 'webkit-ipad-landscape'].includes(testInfo.project.name), 'TUX-023 ctxbar-dock check runs on iPad landscape');
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
      await page.waitForTimeout(800);
      await page.evaluate((want) => {
        const e = window.app.engine;
        const id = e.addLayer('rings');
        e.generate?.(id);
        window.app.computeDisplayGeometry?.();
        const r = window.app.renderer;
        r.setTool('select');
        if (want) {
          const b = r.getSelectionBounds([e.layers.find((l) => l.id === id)]);
          const w = Math.hypot(b.corners.ne.x - b.corners.nw.x, b.corners.ne.y - b.corners.nw.y);
          r.userHasManipulated = true;
          r.scale = want / w;
          r.offsetX = r.canvas.clientWidth / 2 - b.center.x * r.scale;
          r.offsetY = r.canvas.clientHeight / 2 - b.center.y * r.scale;
        }
        r.draw();
      }, wantPx);
      await page.waitForTimeout(600);
      const c = await page.evaluate(() => {
        const r = window.app.renderer;
        const layer = window.app.engine.layers[0];
        // Tap ON a stroke (a ring centre can be empty canvas): the middle point of the first path.
        const path = layer.paths.find((q) => Array.isArray(q) && q.length > 2);
        const pt = path[Math.floor(path.length / 2)];
        const p = r.worldToScreen(pt.x, pt.y);
        const box = document.querySelector('#main-canvas').getBoundingClientRect();
        return { x: p.x + box.left, y: p.y + box.top };
      });
      // A finger tap selects; retry once or twice if the first tap only settled the layout.
      for (let i = 0; i < 3; i += 1) {
        await touch.tap(page, c);
        await page.waitForTimeout(700);
        if (await page.evaluate(() => window.app.renderer.selectedLayerIds.size === 1)) break;
      }
      const res = await page.evaluate(() => {
        const r = window.app.renderer;
        const layer = window.app.engine.layers[0];
        const b = r.getSelectionBounds([layer]);
        const box = document.querySelector('#main-canvas').getBoundingClientRect();
        const top = (x, y) => { const el = document.elementFromPoint(box.left + x, box.top + y); return el ? (el.id || el.className) : null; };
        const pts = [];
        const sw = r.worldToScreen(b.corners.sw.x, b.corners.sw.y);
        const se = r.worldToScreen(b.corners.se.x, b.corners.se.y);
        pts.push(['SE+14', se.x + 14, se.y + 14], ['SW-14', sw.x - 14, sw.y + 14]);
        r.lastPointerType = 'touch';
        for (const h of r.getHandleHitPoints(b, 'touch')) {
          if (h.key !== 'se' && h.key !== 'sw') continue;
          const p = r.worldToScreen(h.x, h.y);
          pts.push([`hit-${h.key}`, p.x, p.y], [`hit-${h.key}+r`, p.x, p.y + 21]);
        }
        return { selected: r.selectedLayerIds ? r.selectedLayerIds.size : 0, rows: pts.map(([k, x, y]) => ({ k, id: top(x, y), x, y })), ch: box.height };
      });
      expect(res.selected).toBe(1);
      for (const row of res.rows) {
        if (row.y > res.ch) continue; // off the canvas bottom: nothing to hit
        expect(row.id, `${row.k} at (${Math.round(row.x)},${Math.round(row.y)})`).toBe('main-canvas');
      }
      expect(errors).toEqual([]);
    });
  }
});

// Req. 4 after an ordinary corner resize: the PAINTED rotate disc must still be on clear canvas
// (iPhone landscape, default layout, no view slide), and must still be hit-testable as rotate.
test.describe('TUX-023 rotate affordance clear of chrome after a corner resize (iPhone landscape)', () => {
  test('drawn disc stays on the canvas and hitHandle returns rotate', async ({ page }, testInfo) => {
    test.skip(!IPHL.includes(testInfo.project.name), 'TUX-023 resize-then-rotate check runs on iPhone landscape');
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const e = window.app.engine;
      e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
      const id = e.addLayer('rings');
      e.generate?.(id);
      window.app.computeDisplayGeometry?.();
      window.app.renderer.setTool('select');
      window.app.renderer.draw();
    });
    await page.waitForTimeout(600);
    await selectByFinger(page);
    await core.waitGeometryStable(page);
    await waitAffordanceDrawn(page);
    const se = await page.evaluate(() => {
      const r = window.app.renderer;
      const b = r.getSelectionBounds([window.app.engine.layers[0]]);
      const p = r.worldToScreen(b.corners.se.x, b.corners.se.y);
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      return { x: p.x + box.left + 10, y: p.y + box.top + 10 };
    });
    await touch.drag(page, se, { x: se.x + 30, y: se.y + 30 });
    await core.waitGeometryStable(page);
    await waitAffordanceDrawn(page);
    const res = await page.evaluate(() => {
      const r = window.app.renderer;
      const a = r._rotAffDrawn;
      if (!a) return null;
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      const probes = [[0, 0], [a.r, 0], [-a.r, 0], [0, a.r], [0, -a.r]];
      const tops = probes.map(([dx, dy]) => {
        const el = document.elementFromPoint(a.x + box.left + dx, a.y + box.top + dy);
        return el && (el.id || el.className);
      });
      const b = r.getSelectionBounds([window.app.engine.layers[0]]);
      const hit = r.hitHandle(a.x, a.y, b, { pointerType: 'touch' });
      return { x: a.x, y: a.y, tops, hit: hit && (hit.key || hit.type || hit) };
    });
    expect(res, 'a rotate affordance was drawn').not.toBeNull();
    res.tops.forEach((id) => expect(id, `drawn disc at (${Math.round(res.x)},${Math.round(res.y)})`).toBe('main-canvas'));
    expect(String(res.hit)).toMatch(/rotate/);
    require('fs').mkdirSync(EVIDENCE_DIR, { recursive: true });
    await shoot(page, { path: `${EVIDENCE_DIR}/iPhL-resized-${testInfo.project.name}.png` });
    expect(errors).toEqual([]);
  });
});

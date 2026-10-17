const { evidenceDir, shoot } = require('../helpers/evidence');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-025: the 3D rotation gizmo by finger. Markers are separated, a 22 px finger grab arms the
// right one, and yaw / pitch / roll drags do not jump. Finger-only (touchPhase / tap / drag).

const NAMED = {
  'touch-ipad-portrait': 'iPadP',
  'touch-ipad-landscape': 'iPadL',
  'touch-iphone-portrait': 'iPhP',
  'touch-iphone-landscape': 'iPhL',
  'webkit-ipad-portrait': 'iPadP-webkit',
  'webkit-ipad-landscape': 'iPadL-webkit',
  'webkit-iphone-portrait': 'iPhP-webkit',
  'webkit-iphone-landscape': 'iPhL-webkit',
};
const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || evidenceDir('TUX-025');

// Add a 3D scene through the engine path the Add Layer command uses, select it, fit the view.
const setup = async (page, { nearEdge = false } = {}) => {
  await page.evaluate(() => {
    const app = window.app;
    const e = app.engine;
    e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
    const gid = e.addSceneTree();
    e.computeAllDisplayGeometry?.();
    const r = app.renderer;
    r.setTool?.('select');
    r.setSelection([gid], gid);
    r.setSceneSelection(null);
    window.__gid = gid;
  });
  await page.waitForTimeout(500);
  await page.evaluate((nearEdge2) => {
    const r = window.app.renderer;
    r.userHasManipulated = true;
    r.fitToView?.();
    if (nearEdge2) {
      const layer = window.app.engine.getLayerById(window.__gid);
      const c = r.get3DRotationControl(layer, null);
      const s = r.worldToScreen(c.center.x, c.center.y);
      const box = r.canvas.getBoundingClientRect();
      r.offsetX += box.width - 6 - s.x;
      r.offsetY += 4 - s.y;
    }
    r.draw();
  }, nearEdge);
  await page.waitForTimeout(150);
};

// Non-scene pseudo-3D fixture: a polyhedron selected by a REAL finger tap, so the floating layer
// context bar is on screen. Shares the rotation control with the scene.
const setupPoly = async (page, { nearEdge = false } = {}) => {
  await page.evaluate(() => {
    const app = window.app;
    const e = app.engine;
    e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
    const id = e.addLayer('polyhedron');
    e.computeAllDisplayGeometry?.();
    const r = app.renderer;
    r.setTool?.('select');
    r.setSelection([], null);
    window.__gid = id;
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const r = window.app.renderer; r.userHasManipulated = true; r.fitToView?.(); r.draw(); });
  await page.waitForTimeout(150);
  const centre = await page.evaluate(() => {
    const r = window.app.renderer;
    const layer = window.app.engine.getLayerById(window.__gid);
    const b = r.getSelectionBounds([layer]);
    const c = b.center || r.getBoundsCenter(b);
    const s = r.worldToScreen(c.x, c.y);
    const box = r.canvas.getBoundingClientRect();
    return { x: s.x + box.left, y: s.y + box.top };
  });
  await touch.tap(page, centre);
  await page.waitForFunction(() => window.app.renderer.getSelectedLayers().some((l) => l.id === window.__gid), null, { timeout: 4000 });
  await page.waitForTimeout(400);
  if (nearEdge) {
    await page.evaluate(() => {
      const r = window.app.renderer;
      const layer = window.app.engine.getLayerById(window.__gid);
      const c = r.get3DRotationControl(layer, r.getSelectionBounds([layer]));
      const s = r.worldToScreen(c.center.x, c.center.y);
      const box = r.canvas.getBoundingClientRect();
      r.offsetX += box.width - 6 - s.x;
      r.offsetY += 4 - s.y;
      r.draw();
    });
    await page.waitForTimeout(150);
  }
};

// Client-space marker positions plus the drag-relevant constants.
const geometry = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  const layer = window.app.engine.getLayerById(window.__gid);
  const c = r.get3DRotationControl(layer, layer.type === 'scene3d' ? null : r.getSelectionBounds([layer]));
  const box = r.canvas.getBoundingClientRect();
  const toClient = (p) => { const s = r.worldToScreen(p.x, p.y); return { x: s.x + box.left, y: s.y + box.top }; };
  const spec = r.get3DRotationSpec(layer);
  return {
    C: toClient(c.center), Y: toClient(c.yawMarker), P: toClient(c.pitchMarker),
    R: c.rollHandle ? toClient(c.rollHandle) : null,
    yawRx: c.yawRadiusX * r.scale, yawRy: c.yawRadiusY * r.scale,
    trackPx: c.pitchTrackHeight * r.scale,
    span: spec.pitchMax - spec.pitchMin,
    pitchMid: (spec.pitchMin + spec.pitchMax) / 2,
    touchLayout: !!c.touch,
    vw: innerWidth, vh: innerHeight,
    topIsCanvas: [c.center, c.yawMarker, c.pitchMarker, c.rollHandle].filter(Boolean).map((p) => {
      const q = toClient(p);
      return document.elementFromPoint(q.x, q.y) === r.canvas;
    }),
    ctxbar: (() => { const b = document.querySelector('.ctxbar'); const q = b && b.getBoundingClientRect(); return q && q.width > 0 ? [q.left, q.top, q.right, q.bottom].map(Math.round) : null; })(),
    topEls: [c.center, c.yawMarker, c.pitchMarker, c.rollHandle].filter(Boolean).map((p) => {
      const q = toClient(p);
      const el = document.elementFromPoint(q.x, q.y);
      return `${Math.round(q.x)},${Math.round(q.y)}:${el && (el.id || el.className || el.tagName)}`;
    }),
    canvasBox: [box.left, box.top, box.width, box.height].map(Math.round),
  };
});

const rotation = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  const layer = window.app.engine.getLayerById(window.__gid);
  const rot = r._read3DRotation(layer, r.get3DRotationSpec(layer));
  return { yaw: rot.yaw, pitch: rot.pitch, roll: rot.roll };
});

const setRot = (page, patch) => page.evaluate((p) => {
  const r = window.app.renderer;
  const layer = window.app.engine.getLayerById(window.__gid);
  r._write3DRotation(layer, r.get3DRotationSpec(layer), p);
  window.app.engine.computeAllDisplayGeometry?.();
  r.draw();
}, patch);

const wrap = (d) => (((d % 360) + 540) % 360) - 180;
const away = (from, ref, d) => {
  const dx = from.x - ref.x; const dy = from.y - ref.y; const l = Math.hypot(dx, dy) || 1;
  return { x: from.x + (d * dx) / l, y: from.y + (d * dy) / l };
};

// Finger path with a probe after the first step: touch.drag only reports the end.
const fingerPath = async (page, points, probeAfter = 1) => {
  await touch.touchPhase(page, 'start', [{ ...points[0], id: 0 }]);
  let probe = null;
  for (let i = 1; i < points.length; i += 1) {
    await touch.touchPhase(page, 'move', [{ ...points[i], id: 0 }]);
    if (i === probeAfter) probe = await rotation(page);
  }
  await touch.touchPhase(page, 'end', [{ ...points[points.length - 1], id: 0 }]);
  return probe;
};

test.describe('TUX-025 3D rotation gizmo by finger', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!NAMED[testInfo.project.name], 'TUX-025 runs on the named iPad/iPhone viewports');
  });

  let errors;
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine && window.app.engine.addSceneTree));
  });
  test.afterEach(() => { if (errors) expect(errors).toEqual([]); });

  for (const kind of ['scene', 'polyhedron']) {
    for (const nearEdge of [false, true]) {
      test(`${kind}: markers are reachable and on the canvas${nearEdge ? ' (object near the top-right edge)' : ''}`, async ({ page }, testInfo) => {
        if (kind === 'scene') {
          await setup(page, { nearEdge });
          await setRot(page, { yaw: 270, pitch: undefined });
        } else {
          await setupPoly(page, { nearEdge });
        }
        // Every yaw: the roll handle (or yaw marker) walks round the ring.
        for (const yaw of kind === 'scene' ? [270] : [0, 90, 180, 270]) {
          if (kind !== 'scene') await setRot(page, { yaw });
          const g = await geometry(page);
          expect(g.touchLayout).toBe(true);
          const inside = (p, m) => p.x - m >= 0 && p.x + m <= g.vw && p.y - m >= 0 && p.y + m <= g.vh;
          for (const k of ['C', 'Y', 'P', 'R']) {
            if (!g[k]) continue;
            expect(inside(g[k], 22), `${k} +/- 22 px inside the viewport`).toBe(true);
          }
          expect(g.topIsCanvas.every(Boolean), `${kind} yaw=${yaw} markers sit on the main canvas: ${g.topEls.join(' | ')} canvas ${g.canvasBox} ctxbar ${g.ctxbar} vp ${g.vw}x${g.vh}`).toBe(true);
          // The skin hides the context bar on portrait phones (components.css), so only require it elsewhere.
          if (kind === 'polyhedron' && !/iphone-portrait/.test(testInfo.project.name)) expect(g.ctxbar, 'the layer context bar must be on screen for this fixture').not.toBeNull();
        }
        if (!nearEdge) await shoot(page, { path: `${EVIDENCE_DIR}/${NAMED[testInfo.project.name]}${kind === 'scene' ? '' : '-poly'}.png` });
      });
    }
  }

  test('yaw: an 18 px off-marker grab drags without a jump', async ({ page }) => {
    await setup(page);
    await setRot(page, { yaw: 270 });
    const g = await geometry(page);
    // 18 px TANGENTIAL to the ring at the marker (perpendicular to C->Y): an absolute mapping would
    // jump here, an offset-preserving drag does not. Take the side farther from the other targets.
    const rx = g.Y.x - g.C.x; const ry = g.Y.y - g.C.y; const rl = Math.hypot(rx, ry) || 1;
    const cands = [1, -1].map((sg) => ({ x: g.Y.x + sg * 18 * (-ry / rl), y: g.Y.y + sg * 18 * (rx / rl) }));
    const others = [g.P, g.R].filter(Boolean);
    const clear = (c) => Math.min(...others.map((o) => Math.hypot(c.x - o.x, c.y - o.y)));
    const start = clear(cands[0]) >= clear(cands[1]) ? cands[0] : cands[1];
    const before = await rotation(page);
    const ang0 = Math.atan2((start.x - g.C.x) / g.yawRx, (start.y - g.C.y) / g.yawRy);
    const pts = [start];
    const arc = (30 * Math.PI) / 180;
    const rho = Math.hypot(start.x - g.C.x, start.y - g.C.y);
    // Move the finger on a circle round C by 30 degrees (atan2(x, y) sense).
    const a0 = Math.atan2(start.x - g.C.x, start.y - g.C.y);
    for (let i = 1; i <= 10; i += 1) {
      const a = a0 + (arc * i) / 10;
      pts.push({ x: g.C.x + rho * Math.sin(a), y: g.C.y + rho * Math.cos(a) });
    }
    const end = pts[pts.length - 1];
    const ang1 = Math.atan2((end.x - g.C.x) / g.yawRx, (end.y - g.C.y) / g.yawRy);
    const expected = wrap(((ang1 - ang0) * 180) / Math.PI);
    const first = await fingerPath(page, pts, 1);
    const after = await rotation(page);
    expect(Math.abs(wrap(first.yaw - before.yaw)), 'first step jump').toBeLessThanOrEqual(Math.abs(expected) / 10 * 1.5 + 3);
    expect(Math.abs(wrap(after.yaw - before.yaw) - expected), 'end delta vs finger arc').toBeLessThanOrEqual(6);
    expect(Math.abs(after.pitch - before.pitch)).toBeLessThan(0.01);
  });

  test('pitch: an 18 px off-marker grab drags without a jump', async ({ page }) => {
    await setup(page);
    const g0 = await geometry(page);
    await setRot(page, { yaw: 0, pitch: g0.pitchMid });
    const g = await geometry(page);
    // 18 px VERTICALLY off the marker (along the track): an absolute mapping would jump by 18/track*span.
    const dirY = g.P.y - 18 - 22 >= 0 ? -1 : 1;
    const start = { x: g.P.x, y: g.P.y + dirY * 18 };
    const before = await rotation(page);
    const pts = [];
    for (let i = 0; i <= 10; i += 1) pts.push({ x: start.x, y: start.y - (20 * i) / 10 });
    const first = await fingerPath(page, pts, 1);
    const after = await rotation(page);
    const expected = (20 / g.trackPx) * g.span;
    // One of ten equal steps may move one tenth of the total (plus slack). A jump would be far more.
    expect(Math.abs(first.pitch - before.pitch), 'first step jump').toBeLessThanOrEqual(expected / 10 * 1.5 + 3);
    expect(after.pitch - before.pitch).toBeGreaterThan(0);
    expect(Math.abs((after.pitch - before.pitch) - expected)).toBeLessThanOrEqual(expected * 0.15);
    expect(Math.abs(wrap(after.yaw - before.yaw))).toBeLessThan(0.01);
  });

  test('roll: an 18 px off-handle grab drags a 30 degree arc without a jump', async ({ page }) => {
    await setup(page);
    await setRot(page, { yaw: 270 });
    const g = await geometry(page);
    const start = away(g.R, g.C, 18);
    const before = await rotation(page);
    const rho = Math.hypot(start.x - g.C.x, start.y - g.C.y);
    const a0 = Math.atan2(start.y - g.C.y, start.x - g.C.x);
    const pts = [start];
    for (let i = 1; i <= 10; i += 1) {
      const a = a0 + (((30 * Math.PI) / 180) * i) / 10;
      pts.push({ x: g.C.x + rho * Math.cos(a), y: g.C.y + rho * Math.sin(a) });
    }
    const first = await fingerPath(page, pts, 1);
    const after = await rotation(page);
    expect(Math.abs(wrap(first.roll - before.roll)), 'first step jump').toBeLessThanOrEqual(6);
    expect(Math.abs(wrap(after.roll - before.roll) - 30)).toBeLessThanOrEqual(6);
  });

  test('orbit: a drag from 8 px off the centre orbits and keeps the selection', async ({ page }) => {
    await setup(page);
    const g = await geometry(page);
    const before = await rotation(page);
    const start = { x: g.C.x + 8, y: g.C.y };
    await fingerPath(page, [start, { x: start.x + 20, y: start.y + 6 }, { x: start.x + 40, y: start.y + 12 }]);
    const after = await rotation(page);
    expect(Math.abs(wrap(after.yaw - before.yaw)) + Math.abs(after.pitch - before.pitch)).toBeGreaterThan(1);
    const sel = await page.evaluate(() => window.app.renderer.getSelectedLayers().map((l) => l.id));
    expect(sel).toEqual([await page.evaluate(() => window.__gid)]);
  });

  test('polyhedron: a finger drag from the NE corner resizes the bounds and leaves yaw, pitch and roll unchanged', async ({ page }, testInfo) => {
    test.skip(!/ipad/.test(testInfo.project.name), 'NE-corner arbitration is exercised on the iPad viewports');
    await setupPoly(page);
    const info = await page.evaluate(() => {
      const r = window.app.renderer;
      const layer = window.app.engine.getLayerById(window.__gid);
      const b = r.getSelectionBounds([layer]);
      const s = r.worldToScreen(b.corners.ne.x, b.corners.ne.y);
      const box = r.canvas.getBoundingClientRect();
      return { ne: { x: s.x + box.left, y: s.y + box.top }, w: b.maxX - b.minX, h: b.maxY - b.minY, onCanvas: s.x > 0 && s.y > 0 && s.x < box.width && s.y < box.height };
    });
    test.skip(!info.onCanvas, 'NE corner not on the canvas at this viewport');
    const before = await rotation(page);
    await fingerPath(page, [info.ne, { x: info.ne.x - 10, y: info.ne.y + 14 }, { x: info.ne.x - 22, y: info.ne.y + 30 }], 1);
    const after = await rotation(page);
    const size = await page.evaluate(() => {
      const r = window.app.renderer;
      const b = r.getSelectionBounds([window.app.engine.getLayerById(window.__gid)]);
      return { w: b.maxX - b.minX, h: b.maxY - b.minY };
    });
    expect(after).toEqual(before);
    expect(Math.abs(size.w - info.w) + Math.abs(size.h - info.h), 'the bounds must resize').toBeGreaterThan(1);
  });
});

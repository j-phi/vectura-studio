const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-022: Paint bucket by touch. A press previews the region (and shows the loupe); the lift
// pours into the LAST previewed region. A cancel, a 2-finger gesture or a drag off the paper
// pours nothing. The Scope up/down chips (context bar, coarse pointers) step the preview scope.
// Finger-only. Runs in every touch project (8 primary + the browser-chrome variants + coarseWide).
// Mouse parity: tests/integration/paint-bucket-pointer-parity.test.js + tests/e2e/paint-bucket-mouse.spec.js.

const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-022';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCH_GAP = 48; // keep in step with the renderer's touch loupe gap
const DISC = 44;

// Rings fixture. Picks the screen point P where (1) the canvas is the top element around the
// finger, (2) the stack holds >= 3 entries, (3) a 6 px step to the right crosses a ring boundary.
const setup = (page) => page.evaluate(() => {
  const app = window.app;
  const r = app.renderer;
  const e = app.engine;
  e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
  const id = e.addLayer('rings');
  e.generate?.(id);
  app.computeDisplayGeometry?.();
  r.setTool('fill');
  r.draw();
  return { id };
});

const pickPoint = (page) => page.evaluate(() => {
  const app = window.app;
  const r = app.renderer;
  const e = app.engine;
  const PBO = window.Vectura.PaintBucketOps;
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  const prof = e.currentProfile;
  const stackAt = (sx, sy) => {
    const w = r.screenToWorld(sx - box.left, sy - box.top);
    return PBO.findFillTargetStack(e, w.x, w.y, { scope: 'all-objects', sensitivity: 5 }).stack;
  };
  const hit = (x, y) => document.elementFromPoint(x, y) === cv;
  const clear = (x, y) => [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [70, 0]].every(([dx, dy]) => hit(x + dx, y + dy));
  const cx = box.left + r.offsetX + (prof.width / 2 + 12) * r.scale;
  const cy = box.top + r.offsetY + (prof.height / 2) * r.scale;
  const cands = [];
  for (let y = box.top + 20; y < Math.min(innerHeight, box.bottom) - 20; y += 6) {
    for (let x = box.left + 20; x < Math.min(innerWidth, box.right) - 90; x += 6) cands.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    if (!clear(c.x, c.y)) continue;
    const w = r.screenToWorld(c.x - box.left, c.y - box.top);
    if (!r._isWorldInsidePaper(w)) continue;
    const s0 = stackAt(c.x, c.y);
    const real = s0.filter((s) => !s.isDocBounds);
    if (real.length < 3) continue;
    const s1 = stackAt(c.x + 6, c.y);
    if (!s1.length || s1[0].loopId === s0[0].loopId) continue;
    const m = (x, y) => !r._isWorldInsidePaper(r.screenToWorld(x - box.left, y - box.top));
    return { x: c.x, y: c.y, loopId: s0[0].loopId, boxLeft: box.left, margin: m(c.x + 6, c.y) };
  }
  throw new Error('no usable fill point');
});

const snap = (page) => page.evaluate(() => {
  const app = window.app;
  const r = app.renderer;
  const fills = app.engine.layers.reduce((n, l) => n + ((l.fills && l.fills.length) || 0), 0);
  const last = [];
  app.engine.layers.forEach((l) => (l.fills || []).forEach((f) => last.push({ id: f.id, loopId: f.loopId, polygon: f.polygon || null, rec: f })));
  return {
    fills,
    hist: app.history.length,
    stackLen: Array.isArray(r.paintBucketStack) ? r.paintBucketStack.length : null,
    preview: !!r.patternFillPreviewPolygon,
    loupe: r.fillLoupeEl ? r.fillLoupeEl.style.display : 'none',
    scopeIndex: r.paintBucketScopeIndex,
    loopIds: last.map((f) => f.loopId),
    scale: r.scale,
  };
});

// The previewed entry (what a lift will pour).
const previewed = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  const s = r.paintBucketStack;
  if (!s) return null;
  const e = s[r.paintBucketScopeIndex];
  return e ? { loopId: e.loopId, area: Math.abs((e.polygon || []).reduce((a, p, i, arr) => { const q = arr[(i + 1) % arr.length]; return a + (p.x * q.y - q.x * p.y); }, 0) / 2), idx: r.paintBucketScopeIndex } : null;
});

const lastFill = (page) => page.evaluate(() => {
  let best = null;
  window.app.engine.layers.forEach((l) => (l.fills || []).forEach((f) => { best = f; }));
  return best ? { loopId: best.loopId, area: Math.abs((best.polygon || best.region || []).reduce((a, p, i, arr) => { const q = arr[(i + 1) % arr.length]; return a + (p.x * q.y - q.x * p.y); }, 0) / 2) } : null;
});

const finger = (p, dx = 0, dy = 0) => ({ x: p.x + dx, y: p.y + dy, id: 0 });

test.describe('TUX-022 paint bucket by touch', () => {
  let P;
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
    await setup(page);
    await sleep(400); // let the fill context bar mount before the point is chosen
    P = await pickPoint(page);
  });

  test('(a) hold previews and shows the loupe, lift pours into the previewed region', async ({ page }) => {
    const before = await snap(page);
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(300);
    const held = await snap(page);
    const pv = await previewed(page);
    expect(held.stackLen, 'RED(a): stack set during hold').toBeGreaterThan(0);
    expect(held.preview, 'preview polygon during hold').toBe(true);
    expect(held.loupe, 'loupe visible during hold').toBe('block');
    expect(held.fills, 'RED(a): no pour during hold').toBe(before.fills);
    expect(held.hist).toBe(before.hist);
    await touch.touchPhase(page, 'end', [finger(P)]);
    await sleep(150);
    const after = await snap(page);
    expect(after.fills).toBe(before.fills + 1);
    expect(after.hist).toBe(before.hist + 1);
    expect((await lastFill(page)).loopId).toBe(pv.loopId);
    expect(after.preview, 'preview cleared after lift').toBe(false);
    expect(after.stackLen, 'stack cleared after lift').toBe(null);
    expect(after.loupe, 'loupe hidden after lift').not.toBe('block');
  });

  test('(b) a quick tap pours on lift', async ({ page }) => {
    const before = await snap(page);
    await touch.tap(page, P);
    await sleep(200);
    const after = await snap(page);
    expect(after.fills).toBe(before.fills + 1);
    expect(after.hist).toBe(before.hist + 1);
  });

  test('(c) lift drift pours the LAST in-paper previewed region', async ({ page }) => {
    const before = await snap(page);
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(100);
    const first = await previewed(page);
    await touch.touchPhase(page, 'move', [finger(P, 6, 0)]);
    await sleep(100);
    const last = await previewed(page);
    expect(last.loopId, 'the 6 px step crosses a ring boundary').not.toBe(first.loopId);
    // Lift at the same spot as the last move: the record follows the last previewed position.
    await touch.touchPhase(page, 'end', [finger(P, 6, 0)]);
    await sleep(150);
    const after = await snap(page);
    expect(after.fills).toBe(before.fills + 1);
    expect((await lastFill(page)).loopId).toBe(last.loopId);
  });

  test('(d) a cancel pours nothing', async ({ page }) => {
    const before = await snap(page);
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(200);
    await page.evaluate(() => {
      const r = window.app.renderer;
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: r.activePointerId, pointerType: 'touch', bubbles: true }));
    });
    await sleep(150);
    const after = await snap(page);
    expect(after.fills, 'RED(d): cancel pours nothing').toBe(before.fills);
    expect(after.hist).toBe(before.hist);
    expect(after.preview).toBe(false);
    expect(after.loupe).not.toBe('block');
    // The finger is still down for the helper; release the synthetic state.
    await touch.touchPhase(page, 'end', [finger(P)]).catch(() => {});
    expect((await snap(page)).fills).toBe(before.fills);
  });

  test('(e) drag off the paper pours nothing, drag back pours', async ({ page }) => {
    const before = await snap(page);
    // A point on the canvas but outside the paper: left of the paper, or the far margin.
    const off = await page.evaluate(() => {
      const r = window.app.renderer;
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      const cands = [];
      for (let y = box.top + 10; y < Math.min(innerHeight, box.bottom) - 10; y += 10) {
        for (let x = box.left + 6; x < Math.min(innerWidth, box.right) - 6; x += 10) {
          if (document.elementFromPoint(x, y) === document.querySelector('#main-canvas') && !r._isWorldInsidePaper(r.screenToWorld(x - box.left, y - box.top))) cands.push({ x, y });
        }
      }
      return cands[0] || null;
    });
    test.skip(!off, 'no canvas margin outside the paper at this viewport');
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(80);
    await touch.touchPhase(page, 'move', [{ x: off.x, y: off.y, id: 0 }]);
    await sleep(80);
    const away = await snap(page);
    expect(away.preview, 'preview cleared off paper').toBe(false);
    await touch.touchPhase(page, 'end', [{ x: off.x, y: off.y, id: 0 }]);
    await sleep(150);
    expect((await snap(page)).fills, 'RED(e): lift off the paper pours nothing').toBe(before.fills);
    // Off then back inside, lift pours once.
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(80);
    await touch.touchPhase(page, 'move', [{ x: off.x, y: off.y, id: 0 }]);
    await sleep(80);
    await touch.touchPhase(page, 'move', [finger(P)]);
    await sleep(80);
    await touch.touchPhase(page, 'end', [finger(P)]);
    await sleep(150);
    expect((await snap(page)).fills).toBe(before.fills + 1);
  });

  test('(f) a pinch with the Fill tool never pours', async ({ page }) => {
    const before = await snap(page);
    await touch.pinch(page, P, { startDist: 100, endDist: 260, staggerMs: 60 });
    await sleep(200);
    const after = await snap(page);
    expect(after.fills, 'RED(f): pinch pours nothing').toBe(before.fills);
    expect(after.hist).toBe(before.hist);
    expect(after.scale).toBeGreaterThanOrEqual(before.scale * 1.5);
    expect(after.preview).toBe(false);
  });

  test('(g) Scope chips widen / narrow the previewed region', async ({ page }) => {
    const up = page.locator('[data-fill-scope="up"]');
    const down = page.locator('[data-fill-scope="down"]');
    await expect(up, 'RED(g): Scope up chip exists').toHaveCount(1);
    await expect(up).toBeVisible();
    const area = await touch.hitArea(page, up);
    expect(area.w).toBeGreaterThanOrEqual(44);
    expect(area.h).toBeGreaterThanOrEqual(44);
    const inVp = await up.evaluate((el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; });
    expect(inVp).toBe(true);
    await touch.tap(page, up);
    await sleep(100);
    expect(await page.evaluate(() => window.app.renderer.paintBucketScopeOffset)).toBe(1);
    const before = await snap(page);
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(120);
    const stack = await page.evaluate(() => window.app.renderer.paintBucketStack.map((s) => ({ loopId: s.loopId })));
    const narrow = await previewed(page);
    expect((await snap(page)).scopeIndex).toBe(1);
    await touch.touchPhase(page, 'end', [finger(P)]);
    await sleep(150);
    const f1 = await lastFill(page);
    expect(f1.loopId).toBe(stack[1].loopId);
    expect(f1.area).toBeGreaterThan(0);
    expect((await snap(page)).fills).toBe(before.fills + 1);
    // area of widened > area of stack[0]: compare to the preview of index 1 recorded vs a fresh stack[0]
    expect(narrow.idx).toBe(1);
    await touch.tap(page, down);
    await touch.tap(page, down);
    await sleep(100);
    expect(await page.evaluate(() => window.app.renderer.paintBucketScopeOffset)).toBe(0);
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(120);
    const base = await previewed(page);
    expect(base.idx).toBe(0);
    expect(narrow.area).toBeGreaterThan(base.area);
    await touch.touchPhase(page, 'end', [finger(P)]);
    await sleep(150);
    expect((await lastFill(page)).loopId).toBe(stack[0].loopId);
  });

  test('(g2) a second finger taps the Scope chip during a live hold: the preview steps, the lift pours there', async ({ page }) => {
    const up = page.locator('[data-fill-scope="up"]');
    await expect(up).toBeVisible();
    const c = await up.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    const before = await snap(page);
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(150);
    expect((await previewed(page)).idx).toBe(0);
    // Second finger (id 1) taps the chip while finger 0 keeps holding.
    await touch.touchPhase(page, 'start', [{ x: c.x, y: c.y, id: 1 }]);
    await sleep(60);
    await touch.touchPhase(page, 'end', [{ x: c.x, y: c.y, id: 1 }]);
    await sleep(150);
    const stack = await page.evaluate(() => window.app.renderer.paintBucketStack.map((s) => ({ loopId: s.loopId })));
    const live = await previewed(page);
    expect(live.idx, 'RED(g2): the live preview scope stepped to 1').toBe(1);
    expect(await page.evaluate(() => window.app.renderer.paintBucketScopeOffset)).toBe(1);
    expect((await snap(page)).fills, 'the chip tap never pours').toBe(before.fills);
    await touch.touchPhase(page, 'end', [finger(P)]);
    await sleep(150);
    const after = await snap(page);
    expect(after.fills).toBe(before.fills + 1);
    expect((await lastFill(page)).loopId, 'RED(g2): the lift pours at the new scope index').toBe(stack[1].loopId);
  });

  test('(k) the held pointer runs the hover feedback; nothing lingers after lift or cancel', async ({ page }) => {
    await page.evaluate(() => {
      const r = window.app.renderer;
      window.__hov = { fb: 0, scene: 0 };
      const f = r._updateHoverFeedback.bind(r);
      const s = r._updateSceneHoverHint.bind(r);
      r._updateHoverFeedback = (e) => { window.__hov.fb += 1; return f(e); };
      r._updateSceneHoverHint = (e) => { window.__hov.scene += 1; return s(e); };
    });
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(100);
    await touch.touchPhase(page, 'move', [finger(P, 2, 0)]);
    await sleep(100);
    const held = await page.evaluate(() => ({ ...window.__hov }));
    expect(held.fb, 'RED(k): hover feedback ran for the held pointer').toBeGreaterThan(0);
    expect(held.scene, 'RED(k): scene hover hint ran for the held pointer').toBeGreaterThan(0);
    await touch.touchPhase(page, 'end', [finger(P, 2, 0)]);
    await sleep(150);
    const gone = await page.evaluate(() => {
      const r = window.app.renderer;
      return { hl: r.hoverHighlight || null, ro: r.hoverReadout || null, chip: !!r._hoverChipActive, scene: r.sceneHoverPick || null };
    });
    expect(gone).toEqual({ hl: null, ro: null, chip: false, scene: null });
    // Cancel path.
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(100);
    await page.evaluate(() => {
      const r = window.app.renderer;
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: r.activePointerId, pointerType: 'touch', bubbles: true }));
    });
    await sleep(100);
    const gone2 = await page.evaluate(() => {
      const r = window.app.renderer;
      return { hl: r.hoverHighlight || null, ro: r.hoverReadout || null, chip: !!r._hoverChipActive };
    });
    expect(gone2).toEqual({ hl: null, ro: null, chip: false });
    await touch.touchPhase(page, 'end', [finger(P)]).catch(() => {});
  });

  test('(l) a touch hold with shiftKey across regions pours each region at most once, on lift', async ({ page }) => {
    const before = await snap(page);
    const out = await page.evaluate(async ({ P }) => {
      const r = window.app.renderer;
      const cv = document.querySelector('#main-canvas');
      const mk = (type, x, y) => new PointerEvent(type, {
        pointerId: 77, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, composed: true,
        clientX: x, clientY: y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, shiftKey: true,
      });
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      cv.dispatchEvent(mk('pointerdown', P.x, P.y));
      await wait(60);
      const ids = [r.paintBucketStack && r.paintBucketStack[0].loopId];
      window.dispatchEvent(mk('pointermove', P.x + 6, P.y));
      await wait(60);
      ids.push(r.paintBucketStack && r.paintBucketStack[0].loopId);
      const mid = window.app.engine.layers.reduce((n, l) => n + ((l.fills && l.fills.length) || 0), 0);
      window.dispatchEvent(mk('pointerup', P.x + 6, P.y));
      await wait(100);
      const all = [];
      window.app.engine.layers.forEach((l) => (l.fills || []).forEach((f) => all.push(f.loopId)));
      return { ids, mid, all };
    }, { P });
    expect(out.ids[0]).not.toBe(out.ids[1]);
    expect(out.mid, 'RED(l): no pour while the touch is held').toBe(before.fills);
    expect(out.all.length, 'RED(l): exactly one fill after the lift').toBe(before.fills + 1);
    expect(new Set(out.all).size, 'no loop filled twice').toBe(out.all.length);
  });

  test('(h) a fill hold is not a context menu', async ({ page }) => {
    await touch.longPress(page, P, 600);
    await sleep(100);
    const found = await page.evaluate(() => ({
      progress: !!document.querySelector('[data-touch-hold-progress]'),
      menu: [...document.querySelectorAll('[role=menu]')].some((m) => m.offsetParent !== null && getComputedStyle(m).visibility !== 'hidden' && m.getBoundingClientRect().width > 0 && !m.closest('.top-menubar, .menubar')),
      ctx: !!document.querySelector('.canvas-ctx-menu'),
    }));
    expect(found.progress).toBe(false);
    expect(found.ctx).toBe(false);
    expect(found.menu, 'no visible [role=menu] during a fill hold').toBe(false);
  });

  test('(i) the loupe clears the finger', async ({ page }) => {
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(250);
    const m = await page.evaluate(() => {
      const r = window.app.renderer;
      const mag = r.fillLoupeEl.querySelector('.fill-loupe-magnifier');
      const b = mag.getBoundingClientRect();
      const cv = r.canvas.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, cvTop: cv.top, disp: r.fillLoupeEl.style.display };
    });
    expect(m.disp).toBe('block');
    const nx = Math.max(m.l, Math.min(P.x, m.r));
    const ny = Math.max(m.t, Math.min(P.y, m.b));
    const dist = Math.hypot(P.x - nx, P.y - ny);
    expect(dist, 'RED(i): the magnifier clears a 44 px disc around the finger').toBeGreaterThanOrEqual(DISC);
    if (P.y - m.cvTop >= m.h + TOUCH_GAP) expect(m.b, 'above the finger when there is room').toBeLessThanOrEqual(P.y);
    await touch.touchPhase(page, 'end', [finger(P)]);
  });

  test('(j) a pen press previews, the lift pours once', async ({ page }) => {
    const before = await snap(page);
    const fire = (type, target) => page.evaluate(({ type, target, P }) => {
      const cv = document.querySelector('#main-canvas');
      const ev = new PointerEvent(type, {
        pointerId: 41, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, composed: true,
        clientX: P.x, clientY: P.y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5,
      });
      (target === 'window' ? window : cv).dispatchEvent(ev);
    }, { type, target, P });
    await fire('pointerdown', 'canvas');
    await sleep(150);
    const held = await snap(page);
    expect(held.fills, 'RED(j): pen pours nothing while down').toBe(before.fills);
    expect(held.preview).toBe(true);
    await fire('pointerup', 'window');
    await sleep(150);
    const after = await snap(page);
    expect(after.fills).toBe(before.fills + 1);
    expect(after.hist).toBe(before.hist + 1);
  });

  test('evidence: mid-hold preview, loupe and chips', async ({ page }, testInfo) => {
    test.skip(!process.env.TUX_EVIDENCE, 'evidence run only');
    await touch.touchPhase(page, 'start', [finger(P)]);
    await sleep(300);
    const dir = EVIDENCE_DIR;
    require('fs').mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${testInfo.project.name}.png` });
    await touch.touchPhase(page, 'end', [finger(P)]);
  });
});

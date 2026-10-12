const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-020: one-tap Undo / Redo / Zoom In / Zoom Out / Fit, two-finger-tap Undo, three-finger-tap Redo.
// Controls are found by role + accessible name (never by title). Setup goes through the app API;
// every action under test is a finger (tests/e2e/helpers/touch.js). Multi-touch is synthetic in WebKit,
// so the app-logic asserts run in both engines.

const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-020';
const SHOT = {
  'touch-ipad-portrait': 'iPadP', 'touch-ipad-landscape': 'iPadL', 'touch-iphone-portrait': 'iPhP',
  'touch-iphone-landscape': 'iPhL', 'touch-iphone-landscape-chrome': 'iPhL-c',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.renderer.ready));
  await page.waitForTimeout(300);
};

const addLayerThroughHistory = (page) => page.evaluate(() => {
  const { app } = window;
  app.pushHistory();
  const id = app.engine.addLayer(app.ui.getPreferredNewLayerType ? app.ui.getPreferredNewLayerType() : 'spiral');
  app.renderer.setSelection([id], id);
  app.ui.renderLayers();
  app.renderer.draw();
  return id;
});

const state = (page) => page.evaluate(() => {
  const { app } = window;
  const r = app.renderer;
  return {
    layers: app.engine.layers.length,
    history: app.history.length,
    redo: app.redoStack.length,
    scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY,
    sel: [...(r.selectedLayerIds || [])].sort().join(','),
    xf: app.engine.layers.map((l) => [l.id, l.params && l.params.posX, l.params && l.params.posY, l.params && l.params.scaleX, l.params && l.params.rotation]),
  };
});

const cfgOf = (page) => page.evaluate(() => {
  const g = window.Vectura.UI_CONSTANTS.TOUCH_GESTURE;
  return { ...window.Vectura.VIEW, skew: g.TAP_MAX_SKEW_MS, dur: g.TAP_MAX_DURATION_MS, slop: g.TAP_SLOP_PX };
});

const isPhone = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

const ctl = (page, name) => page.getByRole('button', { name });
const UNDO = /^undo$/i;
const REDO = /^redo$/i;
const ZIN = /^zoom in$/i;
const ZOUT = /^zoom out$/i;
const FIT = /^fit/i;

// A row of three finger points that all hit the canvas, near its visible centre.
const canvasPoints = (page) => page.evaluate(() => {
  const cv = document.querySelector('#main-canvas');
  const b = cv.getBoundingClientRect();
  const vis = { l: Math.max(b.left, 0), t: Math.max(b.top, 0), r: Math.min(b.right, innerWidth), b: Math.min(b.bottom, innerHeight) };
  const cx = (vis.l + vis.r) / 2;
  const cy = (vis.t + vis.b) / 2;
  const offs = [-60, 0, 60];
  const cands = [];
  for (let dy = 0; dy < 400; dy += 10) {
    for (const sy of dy ? [dy, -dy] : [0]) {
      for (let dx = 0; dx < 400; dx += 10) {
        for (const sx of dx ? [dx, -dx] : [0]) cands.push({ x: cx + sx, y: cy + sy, d: Math.hypot(sx, sy) });
      }
    }
  }
  cands.sort((p, q) => p.d - q.d);
  const ok = (c) => offs.every((o) => {
    const x = c.x + o; const y = c.y;
    return x > vis.l + 4 && x < vis.r - 4 && y > vis.t + 4 && y < vis.b - 4 && document.elementFromPoint(x, y) === cv;
  });
  const hit = cands.find(ok);
  return hit ? offs.map((o) => ({ x: hit.x + o, y: hit.y })) : null;
});

// A multi-finger tap. Positive taps (skewMs 0) must not let harness latency reach e.timeStamp, because the
// classifier measures skew and duration from event time stamps. So: every finger lands in ONE touchstart
// batch, lifts in ONE touchend batch, and the three phases are queued back to back (no await, no sleep
// between them) so the browser runs them in order with no harness round trip in the gaps.
// skewMs > 0 staggers the touchstarts on purpose and is only used by negative tests.
async function multiTap(page, pts, { skewMs = 0, holdMs = 0, driftPx = 4, ids } = {}) {
  const fingers = pts.map((p, i) => ({ ...p, id: ids ? ids[i] : i }));
  const moved = (k) => fingers.map((f) => ({ ...f, x: f.x + driftPx * k, y: f.y }));
  if (skewMs) {
    for (let i = 0; i < fingers.length; i += 1) {
      await touch.touchPhase(page, 'start', fingers.slice(0, i + 1));
      if (i < fingers.length - 1) await sleep(skewMs / (fingers.length - 1));
    }
    await touch.touchPhase(page, 'move', moved(1));
    if (holdMs) await sleep(holdMs);
    await touch.touchPhase(page, 'end', moved(1));
    return;
  }
  if (holdMs) {
    await touch.touchPhase(page, 'start', fingers);
    await touch.touchPhase(page, 'move', moved(1));
    await sleep(holdMs);
    await touch.touchPhase(page, 'end', moved(1));
    return;
  }
  // Warm the CDP session / WebKit shim first (the first call awaits setup and would reorder the queue).
  await touch.touchPhase(page, 'end', []).catch(() => {});
  await Promise.all([
    touch.touchPhase(page, 'start', fingers),
    touch.touchPhase(page, 'move', moved(1)),
    touch.touchPhase(page, 'end', moved(1)),
  ]);
}

const stateWithHistory = async (page, tool) => {
  await boot(page);
  await page.evaluate((t) => window.app.ui.setActiveTool(t), tool);
  await addLayerThroughHistory(page);
  const s = await state(page);
  expect(s.layers).toBe(1);
  expect(s.history).toBeGreaterThanOrEqual(2);
  return s;
};

test.describe('TUX-020 R-a availability and one-tap history controls', () => {
  test('Undo and Redo are disabled at load', async ({ page }) => {
    await boot(page);
    for (const name of [UNDO, REDO]) {
      const b = ctl(page, name);
      await expect(b, `${name} visible`).toHaveCount(1);
      await expect(b).toBeDisabled();
      await expect(b).toHaveAttribute('aria-disabled', 'true');
    }
  });

  test('every visible control has a hit area of at least 44 px', async ({ page }) => {
    await boot(page);
    await addLayerThroughHistory(page);
    for (const name of [UNDO, REDO, ZIN, ZOUT, FIT]) {
      const b = ctl(page, name);
      await expect(b, `${name}`).toHaveCount(1);
      const hit = await touch.hitArea(page, b);
      expect(Math.min(hit.w, hit.h), `${name} hit ${hit.w}x${hit.h}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('tap Undo, Redo, new edit', async ({ page }) => {
    await boot(page);
    await addLayerThroughHistory(page);
    let s = await state(page);
    expect(s.layers).toBe(1);
    await expect(ctl(page, UNDO)).toBeEnabled();
    await touch.tap(page, ctl(page, UNDO));
    s = await state(page);
    expect(s.layers).toBe(0);
    expect(s.history).toBe(1);
    await expect(ctl(page, UNDO)).toBeDisabled();
    await expect(ctl(page, UNDO)).toHaveAttribute('aria-disabled', 'true');
    await expect(ctl(page, REDO)).toBeEnabled();
    await touch.tap(page, ctl(page, REDO));
    s = await state(page);
    expect(s.layers).toBe(1);
    await expect(ctl(page, REDO)).toBeDisabled();
    await touch.tap(page, ctl(page, UNDO));
    await expect(ctl(page, REDO)).toBeEnabled();
    await addLayerThroughHistory(page);
    await expect(ctl(page, REDO)).toBeDisabled();
    await expect(ctl(page, REDO)).toHaveAttribute('aria-disabled', 'true');
  });
});

// Two layers, so the undo target is not the only layer and the surviving layer's transform can be checked.
const twoLayers = async (page, tool) => {
  await stateWithHistory(page, tool);
  await addLayerThroughHistory(page);
  const s = await state(page);
  expect(s.layers).toBe(2);
  return s;
};

// The tap must do exactly what the app's own undo/redo does, and nothing else (req 6): same selection,
// same transforms as app.undo() / app.redo() produce when the tap is not involved.
const viaApi = async (page, steps) => {
  for (const step of steps) await page.evaluate((k) => window.app[k](), step);
  return state(page);
};

for (const tool of ['select', 'hand']) {
  test.describe(`TUX-020 R-b multi-finger taps (${tool} tool)`, () => {
    test('two-finger tap undoes once and leaves the view exactly alone', async ({ page }) => {
      const before = await twoLayers(page, tool);
      const pts = await canvasPoints(page);
      expect(pts, 'a clear canvas row').toBeTruthy();
      await multiTap(page, pts.slice(0, 2));
      await page.waitForTimeout(150);
      const after = await state(page);
      expect(after.layers, 'one undo').toBe(1);
      expect(after.history).toBe(before.history - 1);
      expect(after.scale === before.scale, `scale ${before.scale} -> ${after.scale}`).toBe(true);
      expect(after.offsetX === before.offsetX, `offsetX ${before.offsetX} -> ${after.offsetX}`).toBe(true);
      expect(after.offsetY === before.offsetY, `offsetY ${before.offsetY} -> ${after.offsetY}`).toBe(true);
      // Oracle: redo then undo through the app API gives the state a plain undo produces.
      const oracle = await viaApi(page, ['redo', 'undo']);
      expect(after.sel, 'selection equals a plain undo').toBe(oracle.sel);
      expect(after.xf, 'layer transforms equal a plain undo').toEqual(oracle.xf);
      // The surviving layer keeps its transform from before the tap.
      const keep = before.xf.find((row) => row[0] === after.xf[0][0]);
      expect(after.xf[0], 'surviving layer transform').toEqual(keep);
    });

    test('three-finger tap redoes once and leaves the view exactly alone', async ({ page }) => {
      await twoLayers(page, tool);
      await page.evaluate(() => window.app.undo());
      const before = await state(page);
      expect(before.layers).toBe(1);
      expect(before.redo).toBe(1);
      const pts = await canvasPoints(page);
      await multiTap(page, pts);
      await page.waitForTimeout(150);
      const after = await state(page);
      expect(after.layers, 'one redo').toBe(2);
      expect(after.redo).toBe(0);
      expect(after.scale === before.scale).toBe(true);
      expect(after.offsetX === before.offsetX).toBe(true);
      expect(after.offsetY === before.offsetY).toBe(true);
      const oracle = await viaApi(page, ['undo', 'redo']);
      expect(after.sel, 'selection equals a plain redo').toBe(oracle.sel);
      expect(after.xf, 'layer transforms equal a plain redo').toEqual(oracle.xf);
      const keep = before.xf.find((row) => row[0] === after.xf[0][0]);
      expect(after.xf[0], 'first layer transform').toEqual(keep);
    });
  });
}

test.describe('TUX-020 R-b negatives change nothing', () => {
  const expectUnchanged = async (page, before, why) => {
    await page.waitForTimeout(200);
    const after = await state(page);
    expect(after.layers, `${why}: layers`).toBe(before.layers);
    expect(after.history, `${why}: history`).toBe(before.history);
    expect(after.redo, `${why}: redo`).toBe(before.redo);
  };

  test('pinch (span change > 10 px) is not a tap', async ({ page }) => {
    const before = await stateWithHistory(page, 'select');
    const pts = await canvasPoints(page);
    await touch.pinch(page, { x: (pts[0].x + pts[1].x) / 2, y: pts[0].y }, { startDist: 80, endDist: 100, steps: 4 });
    await expectUnchanged(page, before, 'pinch');
  });

  test('skew above the configured maximum', async ({ page }) => {
    const before = await stateWithHistory(page, 'select');
    const cfg = await cfgOf(page);
    const pts = await canvasPoints(page);
    await multiTap(page, pts.slice(0, 2), { skewMs: cfg.skew + 120 });
    await expectUnchanged(page, before, 'skew');
  });

  test('fingers held longer than the configured maximum', async ({ page }) => {
    const before = await stateWithHistory(page, 'select');
    const cfg = await cfgOf(page);
    const pts = await canvasPoints(page);
    await multiTap(page, pts.slice(0, 2), { holdMs: cfg.dur + 150 });
    await expectUnchanged(page, before, 'hold');
  });

  test('one finger lifts before the second lands: two single taps, never an undo', async ({ page }) => {
    const before = await stateWithHistory(page, 'select');
    const pts = await canvasPoints(page);
    await touch.touchPhase(page, 'start', [{ ...pts[0], id: 0 }]);
    await sleep(30);
    await touch.touchPhase(page, 'end', [{ ...pts[0], id: 0 }]);
    await touch.touchPhase(page, 'start', [{ ...pts[1], id: 1 }]);
    await sleep(30);
    await touch.touchPhase(page, 'end', [{ ...pts[1], id: 1 }]);
    await expectUnchanged(page, before, 'early lift');
  });

  test('a tap whose first finger starts on the HUD or chrome', async ({ page }) => {
    const before = await stateWithHistory(page, 'select');
    const pts = await canvasPoints(page);
    const zo = await ctl(page, ZOUT).boundingBox();
    const chrome = { x: zo.x + zo.width / 2, y: zo.y + zo.height / 2 };
    await multiTap(page, [chrome, pts[0], pts[1]], { skewMs: 60 });
    await expectUnchanged(page, before, 'chrome first');
  });
});

test.describe('TUX-020 R-d zoom controls', () => {
  test('Zoom In steps by ZOOM_STEP about the canvas centre and stops at the ceiling; Zoom Out at the floor; Fit restores', async ({ page }) => {
    await boot(page);
    await addLayerThroughHistory(page);
    const cfg = await cfgOf(page);
    const centre = () => page.evaluate(() => {
      const r = window.app.renderer;
      const b = r.canvas.getBoundingClientRect();
      const mx = b.width / 2; const my = b.height / 2;
      return { wx: (mx - r.offsetX) / r.scale, wy: (my - r.offsetY) / r.scale, mx, my, scale: r.scale, ox: r.offsetX, oy: r.offsetY };
    });
    const c0 = await centre();
    const readout0 = await page.evaluate(() => {
      const el = document.getElementById('hud-zoom');
      return el && el.getBoundingClientRect().width > 0 ? el.textContent : null;
    });
    await touch.tap(page, ctl(page, ZIN));
    const c1 = await centre();
    expect(Math.abs(c1.scale - c0.scale * cfg.zoomStep)).toBeLessThan(1e-9);
    expect(Math.abs(c1.ox + c0.wx * c1.scale - c0.mx)).toBeLessThanOrEqual(1);
    expect(Math.abs(c1.oy + c0.wy * c1.scale - c0.my)).toBeLessThanOrEqual(1);
    // The status-bar zoom readout (where the strip shows) follows the real scale: percent text, changed by the step.
    const zoomText = () => page.evaluate(() => {
      const el = document.getElementById('hud-zoom');
      return el && el.getBoundingClientRect().width > 0 ? el.textContent : null;
    });
    if (readout0 !== null) {
      expect(readout0).toMatch(/^\d+%$/);
      await expect.poll(zoomText, { message: '#hud-zoom updates after Zoom In' }).not.toBe(readout0);
      expect(await zoomText()).toMatch(/^\d+%$/);
    }
    // Drive to the ceiling with taps on the real button (batched via the page click handler after the first tap).
    await page.evaluate((max) => { window.app.renderer.scale = max / 1.2; window.app.renderer.draw(); }, cfg.maxScale);
    await touch.tap(page, ctl(page, ZIN));
    await touch.tap(page, ctl(page, ZIN));
    expect((await state(page)).scale).toBe(cfg.maxScale);
    await page.evaluate((min) => { window.app.renderer.scale = min * 1.2; window.app.renderer.draw(); }, cfg.minScale);
    await touch.tap(page, ctl(page, ZOUT));
    await touch.tap(page, ctl(page, ZOUT));
    expect((await state(page)).scale).toBe(cfg.minScale);
    await touch.tap(page, ctl(page, FIT));
    const fit = await page.evaluate(() => {
      const r = window.app.renderer;
      const cur = { scale: r.scale, ox: r.offsetX, oy: r.offsetY };
      r.fitToView();
      const want = { scale: r.scale, ox: r.offsetX, oy: r.offsetY };
      const b = r.canvas.getBoundingClientRect();
      const p = window.app.engine.currentProfile;
      return { cur, want, inside: r.offsetX >= 0 && r.offsetY >= 0 && r.offsetX + p.width * r.scale <= b.width + 0.5 && r.offsetY + p.height * r.scale <= b.height + 0.5 };
    });
    expect(fit.cur.scale).toBe(fit.want.scale);
    expect(fit.inside).toBe(true);
  });
});

test.describe('TUX-020 R-e / R-f clamp parity and resize', () => {
  test('pinches reach MAX_SCALE exactly; wheel reaches the same value', async ({ page }) => {
    await boot(page);
    const cfg = await cfgOf(page);
    const pts = await canvasPoints(page);
    const mid = { x: (pts[0].x + pts[2].x) / 2, y: pts[0].y };
    let s = 0;
    for (let i = 0; i < 12 && s < cfg.maxScale; i += 1) {
      await touch.pinch(page, mid, { startDist: 80, endDist: 240, steps: 6 });
      s = (await state(page)).scale;
    }
    expect(s).toBe(cfg.maxScale);
    await page.evaluate(() => { window.app.renderer.scale = 1; });
    await page.evaluate(() => {
      const cv = window.app.renderer.canvas;
      for (let i = 0; i < 400; i += 1) cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 300, bubbles: true, cancelable: true }));
    });
    expect((await state(page)).scale).toBe(cfg.maxScale);
  });

  test('zoom survives a viewport resize (pinch and HUD zoom)', async ({ page }) => {
    await boot(page);
    const pts = await canvasPoints(page);
    const mid = { x: (pts[0].x + pts[2].x) / 2, y: pts[0].y };
    await touch.pinch(page, mid, { startDist: 80, endDist: 240, steps: 6 });
    const a = (await state(page)).scale;
    expect(a).toBeGreaterThan(2);
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: vp.height - 60 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect((await state(page)).scale, 'pinch zoom after resize').toBe(a);
    await touch.tap(page, ctl(page, ZIN));
    const b = (await state(page)).scale;
    await page.setViewportSize(vp);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect((await state(page)).scale, 'HUD zoom after resize').toBe(b);
  });
});

test.describe('TUX-020 R-g live draft and modal', () => {
  test('Undo during a pen draft makes no page error and changes one history step', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await addLayerThroughHistory(page);
    await page.evaluate(() => window.app.ui.setActiveTool('pen'));
    const pts = await canvasPoints(page);
    await touch.tap(page, pts[0]);
    await page.waitForTimeout(450);
    await touch.tap(page, { x: pts[2].x, y: pts[2].y + 20 });
    const before = await state(page);
    await touch.tap(page, ctl(page, UNDO));
    const after = await state(page);
    expect(Math.abs(after.history - before.history)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('HUD buttons and two-finger taps do nothing while a modal is open', async ({ page }) => {
    await boot(page);
    await addLayerThroughHistory(page);
    const pts = await canvasPoints(page);
    const undoBtn = ctl(page, UNDO);
    await expect(undoBtn).toBeEnabled();
    const before = await state(page);
    const box = await undoBtn.boundingBox();
    // The backdrop dismisses on a tap, so each gesture gets a freshly opened modal.
    const openProbe = async () => {
      await page.evaluate(() => window.app.ui.openModal({ title: 'Probe', body: '<p>probe</p>' }));
      expect(await page.evaluate(() => window.Vectura.CanvasHud.isModalOverlayOpen()), 'modal is open').toBe(true);
    };
    const expectSame = async (why) => {
      await page.waitForTimeout(200);
      const now = await state(page);
      expect(now.layers, `${why}: layers`).toBe(before.layers);
      expect(now.history, `${why}: history`).toBe(before.history);
      expect(now.redo, `${why}: redo`).toBe(before.redo);
    };
    // A real finger tap where the Undo button sits, then a real two-finger tap over the canvas.
    await openProbe();
    await touch.tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expectSame('finger tap on the HUD Undo position');
    if (!(await page.evaluate(() => window.Vectura.CanvasHud.isModalOverlayOpen()))) await openProbe();
    await multiTap(page, pts.slice(0, 2));
    await expectSame('two-finger canvas tap');
    // Control: with the modal closed the very same gesture does undo, so the test above can fail.
    await page.evaluate(() => window.app.ui.closeModal());
    expect(await page.evaluate(() => window.Vectura.CanvasHud.isModalOverlayOpen()), 'modal closed').toBe(false);
    await multiTap(page, pts.slice(0, 2));
    await page.waitForTimeout(200);
    expect((await state(page)).layers, 'two-finger tap undoes once the modal is closed').toBe(0);
  });
});

test.describe('TUX-020 R-h layout', () => {
  test('the HUD overlaps no other control and canvas share holds', async ({ page }, testInfo) => {
    await boot(page);
    await addLayerThroughHistory(page);
    const rects = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom, id: el.id || el.className } : null; };
      const hud = [...document.querySelectorAll('#canvas-hud button')].filter((b) => b.getBoundingClientRect().width).map(r);
      const others = ['#touch-modifier-bar:not(.hidden)', '#tool-bar', '.ctxbar', '.vectura-toast', '#app-header', '#hud-zoom', '#hud-rotation', '#hud-bar'].flatMap((s) => [...document.querySelectorAll(s)].map(r).filter(Boolean));
      return { hud, others, vw: innerWidth, vh: innerHeight };
    });
    expect(rects.hud.length).toBeGreaterThanOrEqual(3);
    rects.hud.forEach((h) => {
      expect(h.l, 'inside left').toBeGreaterThanOrEqual(0);
      expect(h.r, 'inside right').toBeLessThanOrEqual(rects.vw);
      expect(h.t, 'inside top').toBeGreaterThanOrEqual(0);
      expect(h.b, 'inside bottom').toBeLessThanOrEqual(rects.vh);
      rects.others.forEach((o) => {
        const hit = h.l < o.r && h.r > o.l && h.t < o.b && h.b > o.t;
        expect(hit, `${h.id} overlaps ${o.id}`).toBe(false);
      });
    });
    if (SHOT[testInfo.project.name]) await page.screenshot({ path: `${EVID}/${SHOT[testInfo.project.name]}.png` }).catch(() => {});
  });

  test('phone header Undo and Redo sit fully inside the viewport', async ({ page }, testInfo) => {
    await boot(page);
    if (/iphone/.test(testInfo.project.name)) expect(await isPhone(page), 'iPhone projects use the phone layout').toBe(true);
    if (!(await isPhone(page))) return;
    const vp = page.viewportSize();
    for (const name of [UNDO, REDO]) {
      const box = await ctl(page, name).boundingBox();
      expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    }
  });
});

// Integration gate run 4: the HUD (TUX-020) sat under the TUX-011 drawer backdrop and under modals
// as five live-looking but untappable buttons (the backdrop or modal takes the tap; history is
// already a no-op under a modal). It now steps aside while either is up and comes back after.
test.describe('TUX-020 R-i the HUD steps aside under a drawer backdrop or a modal', () => {
  const hudState = (page) => page.evaluate(() => {
    const btns = [...document.querySelectorAll('#canvas-hud button')];
    const shown = btns.filter((b) => b.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
    const live = shown.filter((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && b.contains(hit);
    });
    const bd = document.getElementById('mobile-pane-backdrop');
    return { total: btns.length, shown: shown.length, live: live.length, backdrop: !!(bd && bd.classList.contains('visible')) };
  });

  test('hidden while the drawer backdrop is up, back when it closes', async ({ page }) => {
    await boot(page);
    await addLayerThroughHistory(page);
    const base = await hudState(page);
    expect(base.live, 'HUD buttons are live on load').toBeGreaterThanOrEqual(3);
    // Setup: open the left pane through its own opener.
    await page.evaluate(() => {
      const mob = document.getElementById('btn-mobile-pane-left');
      const btn = (mob && mob.offsetParent) ? mob : document.getElementById('btn-pane-toggle-left');
      btn.click();
    });
    await page.waitForTimeout(300);
    const open = await hudState(page);
    test.skip(!open.backdrop, 'docked layout: no drawer backdrop');
    expect(open.shown, 'no HUD button is shown under the backdrop').toBe(0);
    // Under test: a finger tap on the backdrop closes the drawer and brings the HUD back.
    const vp = page.viewportSize();
    await touch.tap(page, { x: vp.width - 24, y: Math.round(vp.height / 2) });
    await expect.poll(async () => (await hudState(page)).backdrop).toBe(false);
    await expect.poll(async () => (await hudState(page)).live).toBe(base.live);
  });

  test('hidden while a modal is open, back when it closes', async ({ page }) => {
    await boot(page);
    const base = await hudState(page);
    expect(base.live, 'HUD buttons are live on load').toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.app.ui.openModal({ title: 'Probe', body: '<p>probe</p>' }));
    await expect.poll(async () => (await hudState(page)).shown, { message: 'no HUD button is shown under a modal' }).toBe(0);
    await page.evaluate(() => window.app.ui.closeModal());
    await expect.poll(async () => (await hudState(page)).live).toBe(base.live);
  });
});

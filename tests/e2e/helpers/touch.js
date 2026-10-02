// Finger-only touch helpers (TUX-057). Never emits mouse events.
// Chromium: CDP Input.dispatchTouchEvent (trusted). WebKit: synthetic in-page
// Touch/Pointer events (proves app logic only; see engineSupports()).
const CAPS = {
  chromium: { trustedMultiTouch: true, cdp: true, maxTouchPoints: true },
  webkit: { trustedMultiTouch: false, cdp: false, maxTouchPoints: false },
};

const engineOf = (page) => {
  const name = page.context().browser()?.browserType().name();
  return name === 'webkit' ? 'webkit' : 'chromium';
};

// engineSupports(page, 'trustedMultiTouch') -> boolean. Wrap browser-default-action
// assertions (page zoom, native scroll) in this; never use test.skip for WebKit.
const engineSupports = (page, capability) => !!CAPS[engineOf(page)][capability];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const centerOf = async (target) => {
  const box = await target.boundingBox();
  if (!box) throw new Error('touch helper: target has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const toPoint = async (t) => (t && typeof t.x === 'number' ? t : centerOf(t));

const cdpSession = async (page) => {
  if (!page.__touchCdp) page.__touchCdp = await page.context().newCDPSession(page);
  return page.__touchCdp;
};

// Low-level: dispatch one touch phase for a set of points [{x,y,id}].
// phase: 'start' | 'move' | 'end' | 'cancel'
const touchPhase = async (page, phase, points) => {
  if (engineSupports(page, 'cdp')) {
    const cdp = await cdpSession(page);
    const type = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' }[phase];
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: phase === 'end' || phase === 'cancel' ? [] : points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
    return;
  }
  await page.evaluate(({ phase, points }) => {
    const names = { start: ['pointerdown', 'touchstart'], move: ['pointermove', 'touchmove'], end: ['pointerup', 'touchend'], cancel: ['pointercancel', 'touchcancel'] }[phase];
    const state = (window.__touchHelper = window.__touchHelper || { down: new Map() });
    points.forEach((p) => {
      const el = document.elementFromPoint(p.x, p.y) || document.body;
      const target = phase === 'start' ? el : (state.down.get(p.id) || el);
      if (phase === 'start') state.down.set(p.id, target);
      const base = { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y };
      target.dispatchEvent(new PointerEvent(names[0], {
        ...base, pointerId: 100 + p.id, pointerType: 'touch', isPrimary: p.id === 0, width: 1, height: 1,
        pressure: phase === 'end' || phase === 'cancel' ? 0 : 0.5, button: phase === 'move' ? -1 : 0, buttons: phase === 'end' || phase === 'cancel' ? 0 : 1,
      }));
      let touchOk = typeof Touch === 'function' && typeof TouchEvent === 'function';
      if (touchOk) { try { new Touch({ identifier: 0, target: document.body }); } catch (_) { touchOk = false; } }
      if (touchOk) {
        const mk = (q) => new Touch({ identifier: q.id, target: state.down.get(q.id) || target, clientX: q.x, clientY: q.y, screenX: q.x, screenY: q.y, pageX: q.x + scrollX, pageY: q.y + scrollY });
        const live = phase === 'end' || phase === 'cancel' ? [] : points.map(mk);
        const changed = [mk(p)];
        target.dispatchEvent(new TouchEvent(names[1], { ...base, touches: live, targetTouches: live, changedTouches: changed }));
      }
      if (phase === 'end' || phase === 'cancel') state.down.delete(p.id);
    });
  }, { phase, points });
};

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// tap: real finger tap (page.touchscreen works in both engines).
async function tap(page, target) {
  const p = await toPoint(target);
  await page.touchscreen.tap(p.x, p.y);
}

// longPress: hold a finger down for ms (default 600), then lift.
async function longPress(page, target, ms = 600) {
  const p = await toPoint(target);
  await touchPhase(page, 'start', [{ ...p, id: 0 }]);
  await sleep(ms);
  await touchPhase(page, 'end', [{ ...p, id: 0 }]);
}

// drag: optional holdMs before moving (long-press-drag), `steps` intermediate moves.
async function drag(page, from, to, { holdMs = 0, steps = 10, stepDelayMs = 0 } = {}) {
  const a = await toPoint(from);
  const b = await toPoint(to);
  await touchPhase(page, 'start', [{ ...a, id: 0 }]);
  if (holdMs) await sleep(holdMs);
  for (let i = 1; i <= steps; i += 1) {
    await touchPhase(page, 'move', [{ ...lerp(a, b, i / steps), id: 0 }]);
    if (stepDelayMs) await sleep(stepDelayMs);
  }
  await touchPhase(page, 'end', [{ ...b, id: 0 }]);
}

// pinch: two fingers around `center` moving from startDist to endDist apart (horizontal axis).
// staggerMs delays the second finger's touchstart (real fingers never land together).
async function pinch(page, center, { startDist = 80, endDist = 240, steps = 10, staggerMs = 0 } = {}) {
  const c = await toPoint(center);
  const at = (d) => [
    { x: c.x - d / 2, y: c.y, id: 0 },
    { x: c.x + d / 2, y: c.y, id: 1 },
  ];
  if (staggerMs) {
    await touchPhase(page, 'start', [at(startDist)[0]]);
    await sleep(staggerMs);
    await touchPhase(page, 'start', at(startDist));
  } else {
    await touchPhase(page, 'start', at(startDist));
  }
  for (let i = 1; i <= steps; i += 1) {
    await touchPhase(page, 'move', at(startDist + (endDist - startDist) * (i / steps)));
  }
  await touchPhase(page, 'end', at(endDist));
}

// twoFingerPan: two fingers keep a fixed gap and translate by (dx, dy).
async function twoFingerPan(page, center, { dx = 0, dy = 0, gap = 100, steps = 10 } = {}) {
  const c = await toPoint(center);
  const at = (t) => [
    { x: c.x - gap / 2 + dx * t, y: c.y + dy * t, id: 0 },
    { x: c.x + gap / 2 + dx * t, y: c.y + dy * t, id: 1 },
  ];
  await touchPhase(page, 'start', at(0));
  for (let i = 1; i <= steps; i += 1) await touchPhase(page, 'move', at(i / steps));
  await touchPhase(page, 'end', at(1));
}

// canvasShare: percent of a 48x48 CSS px grid over the viewport whose top element
// is the canvas (or inside the canvas container). selector defaults to the main canvas.
async function canvasShare(page, selector = '#main-canvas') {
  return page.evaluate(({ selector, cell }) => {
    const w = innerWidth;
    const h = innerHeight;
    const canvas = document.querySelector(selector);
    if (!canvas) return 0;
    let hit = 0;
    let total = 0;
    for (let y = cell / 2; y < h; y += cell) {
      for (let x = cell / 2; x < w; x += cell) {
        total += 1;
        const el = document.elementFromPoint(x, y);
        if (el && (el === canvas || canvas.contains(el))) hit += 1;
      }
    }
    return total ? (hit / total) * 100 : 0;
  }, { selector, cell: 48 });
}

// hitArea: size of the region around the target centre where elementFromPoint
// resolves to the target or a descendant (counts ::before extensions).
// Probes a grid at `probe` CSS px pitch out to `radius` px. Returns { w, h }.
async function hitArea(page, target, { probe = 2, radius = 48 } = {}) {
  const handle = typeof target === 'string' ? await page.locator(target).first().elementHandle() : await target.elementHandle();
  return page.evaluate(({ el, probe, radius }) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const owns = (x, y) => {
      const t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t));
    };
    const extent = (dx, dy) => {
      let d = 0;
      while (d < radius && owns(cx + dx * (d + probe), cy + dy * (d + probe))) d += probe;
      return d;
    };
    if (!owns(cx, cy)) return { w: 0, h: 0 };
    return { w: extent(-1, 0) + extent(1, 0) + probe, h: extent(0, -1) + extent(0, 1) + probe };
  }, { el: handle, probe, radius });
}

module.exports = { tap, longPress, drag, pinch, twoFingerPan, canvasShare, hitArea, engineSupports, engineOf, touchPhase };

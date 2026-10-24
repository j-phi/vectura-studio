// Finger-only touch helpers (TUX-057). Never emits mouse events.
// Chromium: CDP Input.dispatchTouchEvent (trusted). WebKit: synthetic in-page
// Touch/Pointer events (proves app logic only; see engineSupports()).
//
// Capabilities (engineSupports(page, name)):
//   trustedMultiTouch     true in Chromium (CDP, isTrusted events); false in WebKit.
//                         Guard page-zoom / native pinch assertions with it.
//   cdp                   Chromium only. Helper internal.
//   maxTouchPoints        true in Chromium; WebKit desktop reports navigator.maxTouchPoints 0.
//   nativeDefaultActions  true in Chromium; false in WebKit. Untrusted synthetic one-finger
//                         gestures do not move a range input, scroll a container, or
//                         synthesize a click in WebKit. Guard slider/scroll/click-from-drag
//                         REDs with it; never add test.skip for WebKit.
// WebKit synthetic pointers use ids 100+finger. setPointerCapture on those ids is shimmed
// (real WebKit throws NotFoundError) and later events for the id route to the capture target.
const core = require('./target-audit-core');

const CAPS = {
  chromium: { trustedMultiTouch: true, cdp: true, maxTouchPoints: true, nativeDefaultActions: true },
  webkit: { trustedMultiTouch: false, cdp: false, maxTouchPoints: false, nativeDefaultActions: false },
};

const engineOf = (page) => {
  const name = page.context().browser()?.browserType().name();
  return name === 'webkit' ? 'webkit' : 'chromium';
};

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

// Installed in the page (WebKit): synthetic pointer-capture shim. Idempotent.
const installCaptureShim = () => {
  if (window.__touchCaptureShim) return;
  const caps = new Map();
  window.__touchCaptureShim = { caps };
  const proto = Element.prototype;
  const orig = {
    set: proto.setPointerCapture,
    release: proto.releasePointerCapture,
    has: proto.hasPointerCapture,
  };
  const synthetic = (id) => id >= 100 && id < 200;
  const fire = (el, type, id) => queueMicrotask(() => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch' })));
  proto.setPointerCapture = function setPointerCapture(id) {
    if (!synthetic(id)) return orig.set.call(this, id);
    if (!caps.has(id)) throw new DOMException('No active pointer with the given id is found.', 'NotFoundError');
    caps.set(id, this);
    fire(this, 'gotpointercapture', id);
    return undefined;
  };
  proto.releasePointerCapture = function releasePointerCapture(id) {
    if (!synthetic(id)) return orig.release.call(this, id);
    if (caps.get(id) === this) { caps.set(id, null); fire(this, 'lostpointercapture', id); }
    return undefined;
  };
  proto.hasPointerCapture = function hasPointerCapture(id) {
    if (!synthetic(id)) return orig.has.call(this, id);
    return caps.get(id) === this;
  };
};

const ensureWebkitShim = async (page) => {
  if (!page.__touchShim) {
    page.__touchShim = true;
    await page.addInitScript(installCaptureShim);
  }
  await page.evaluate(installCaptureShim);
};

// Low-level: dispatch one touch phase for a set of points [{x,y,id}].
// phase: 'start' | 'move' | 'end' | 'cancel'. 'end' lifts ONLY the listed fingers; Chromium 'cancel' cancels ALL fingers;
// the others stay down (Chromium: touchPoints = fingers still down).
// opts.timestamp (Chromium only): the hardware time of the touch, in seconds since the epoch. A real device stamps a
// touch when the finger lands, not when a busy main thread gets to it; CDP otherwise stamps it at dispatch.
const touchPhase = async (page, phase, points, opts = {}) => {
  if (engineSupports(page, 'cdp')) {
    const cdp = await cdpSession(page);
    const type = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' }[phase];
    const ts = opts.timestamp ? { timestamp: opts.timestamp } : {};
    const down = (page.__touchDown = page.__touchDown || new Map());
    // Measured in Chromium: touchEnd/touchCancel `touchPoints` are the fingers being LIFTED
    // (listing the survivors lifts them and re-creates the lifted one). touchStart/touchMove
    // carry every finger that is down.
    // TUX-018: Chromium rejects a touchCancel that lists points ("TouchCancel must not have any
    // touch points"). A touch cancel cancels ALL fingers, so the list is empty and every
    // tracked finger is cleared, whatever `points` names (the WebKit path stays per-finger).
    if (phase === 'cancel') {
      down.clear();
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [] });
      return;
    }
    if (phase === 'end') {
      points.forEach((p) => down.delete(p.id));
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })), ...ts });
      return;
    }
    points.forEach((p) => down.set(p.id, { x: p.x, y: p.y, id: p.id }));
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...down.values()], ...ts });
    return;
  }
  await ensureWebkitShim(page);
  await page.evaluate(({ phase, points }) => {
    const names = { start: ['pointerdown', 'touchstart'], move: ['pointermove', 'touchmove'], end: ['pointerup', 'touchend'], cancel: ['pointercancel', 'touchcancel'] }[phase];
    const state = (window.__touchHelper = window.__touchHelper || { down: new Map() });
    const caps = window.__touchCaptureShim.caps;
    const lifting = phase === 'end' || phase === 'cancel';
    points.forEach((p) => {
      const pid = 100 + p.id;
      // A 'start' for a finger that is already down (pinch staggerMs calls start([f0]) then
      // start([f0, f1])) must not re-dispatch pointerdown/touchstart for it (TUX-057 fix).
      if (phase === 'start' && state.down.has(p.id)) {
        const held = state.down.get(p.id);
        held.x = p.x; held.y = p.y;
        return;
      }
      const el = document.elementFromPoint(p.x, p.y) || document.body;
      const startTarget = phase === 'start' ? el : (state.down.get(p.id)?.target || el);
      if (phase === 'start') { state.down.set(p.id, { target: el, x: p.x, y: p.y }); caps.set(pid, null); }
      else if (state.down.has(p.id)) { const d = state.down.get(p.id); d.x = p.x; d.y = p.y; }
      const pointerTarget = caps.get(pid) || startTarget;
      const base = { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y };
      pointerTarget.dispatchEvent(new PointerEvent(names[0], {
        ...base, pointerId: pid, pointerType: 'touch', isPrimary: p.id === 0, width: 1, height: 1,
        pressure: lifting ? 0 : 0.5, button: phase === 'move' ? -1 : 0, buttons: lifting ? 0 : 1,
      }));
      // TouchEvent: WebKit has no `new Touch()` (Illegal constructor); use createTouch/createTouchList.
      const mk = (id, d) => {
        if (document.createTouch) return document.createTouch(window, d.target, id, d.x + scrollX, d.y + scrollY, d.x, d.y);
        return new Touch({ identifier: id, target: d.target, clientX: d.x, clientY: d.y, screenX: d.x, screenY: d.y, pageX: d.x + scrollX, pageY: d.y + scrollY });
      };
      const list = (arr) => (document.createTouchList ? document.createTouchList(...arr) : arr);
      const self = { target: startTarget, x: p.x, y: p.y };
      const live = [...state.down.entries()].filter(([id]) => !(lifting && id === p.id)).map(([id, d]) => mk(id, d));
      const changed = [mk(p.id, self)];
      const ev = new TouchEvent(names[1], { bubbles: true, cancelable: true });
      const own = list(live);
      Object.defineProperty(ev, 'touches', { value: own });
      Object.defineProperty(ev, 'targetTouches', { value: list(live.filter((t) => t.target === startTarget)) });
      Object.defineProperty(ev, 'changedTouches', { value: list(changed) });
      startTarget.dispatchEvent(ev);
      if (lifting) {
        const held = caps.get(pid);
        state.down.delete(p.id);
        caps.delete(pid);
        if (held) held.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: pid, pointerType: 'touch' }));
      }
    });
  }, { phase, points });
};

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// tap: real finger tap (page.touchscreen works in both engines).
async function tap(page, target) {
  const p = await toPoint(target);
  await page.touchscreen.tap(p.x, p.y);
}

// doubleTap: two taps `gapMs` apart on one point. Chromium: each touch carries its hardware time (the second lands
// gapMs after the first, as a real finger does), so a main thread busy with the first tap cannot stretch the
// interval the page reads from event.timeStamp (TUX-038 req 5). WebKit cannot stamp a trusted touch: two
// plain taps, the second gapMs after the first lands (or at once when the round trip already took longer).
async function doubleTap(page, target, { gapMs = 110, holdMs = 40 } = {}) {
  const p = await toPoint(target);
  if (!engineSupports(page, 'cdp')) {
    // The gap counts from the first finger-down, as on a device: the tap round trip is part of it.
    const t = Date.now();
    await page.touchscreen.tap(p.x, p.y);
    const wait = t + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    await page.touchscreen.tap(p.x, p.y);
    return;
  }
  const t0 = Date.now() / 1000;
  const pt = [{ ...p, id: 0 }];
  const at = async (sec) => { const wait = sec * 1000 - Date.now(); if (wait > 0) await sleep(wait); };
  await touchPhase(page, 'start', pt, { timestamp: t0 });
  await at(t0 + holdMs / 1000);
  await touchPhase(page, 'end', pt, { timestamp: t0 + holdMs / 1000 });
  await at(t0 + gapMs / 1000);
  await touchPhase(page, 'start', pt, { timestamp: t0 + gapMs / 1000 });
  await at(t0 + (gapMs + holdMs) / 1000);
  await touchPhase(page, 'end', pt, { timestamp: t0 + (gapMs + holdMs) / 1000 });
}

// longPress: hold a finger down for ms (default 600), then lift.
async function longPress(page, target, ms = 600) {
  const p = await toPoint(target);
  await touchPhase(page, 'start', [{ ...p, id: 0 }]);
  await sleep(ms);
  await touchPhase(page, 'end', [{ ...p, id: 0 }]);
}

// drag: optional holdMs before moving (long-press-drag), `steps` intermediate moves.
// endHoldMs: rest the finger at the end point (1 px tremor every 60 ms, as a real finger) before lifting, e.g. at a
// list edge so the list can auto-scroll under it (TUX-044 req 5).
// frozenClock: the caller froze the page clock (helpers/app-clock.js). holdMs, stepDelayMs (16 ms when 0) and
// endHoldMs then run on the page clock, so a slow runner cannot stretch a quick drag past the 500 ms canvas hold.
async function drag(page, from, to, { holdMs = 0, steps = 10, stepDelayMs = 0, endHoldMs = 0, frozenClock = false } = {}) {
  const a = await toPoint(from);
  const b = await toPoint(to);
  const wait = (ms) => (frozenClock ? page.clock.runFor(ms) : sleep(ms));
  const stepMs = frozenClock ? (stepDelayMs || 16) : stepDelayMs;
  await touchPhase(page, 'start', [{ ...a, id: 0 }]);
  if (holdMs) await wait(holdMs);
  for (let i = 1; i <= steps; i += 1) {
    await touchPhase(page, 'move', [{ ...lerp(a, b, i / steps), id: 0 }]);
    if (stepMs) await wait(stepMs);
  }
  for (let t = 0; t < endHoldMs; t += 60) {
    await touchPhase(page, 'move', [{ x: b.x, y: b.y + ((t / 60) % 2), id: 0 }]);
    await wait(60);
  }
  await touchPhase(page, 'end', [{ ...b, id: 0 }]);
}

// pinch: two fingers around `center` moving from startDist to endDist apart (horizontal axis).
// staggerMs delays the second finger's touchstart (real fingers never land together).
// frozenClock: the caller froze the page clock (helpers/app-clock.js). The stagger and a 16 ms frame per move step
// then run on the page clock, so a slow runner cannot stretch the stagger past an app gate (the 250 ms one-finger
// gate, the 500 ms hold) between the two touchstarts.
async function pinch(page, center, { startDist = 80, endDist = 240, steps = 10, staggerMs = 0, frozenClock = false } = {}) {
  const c = await toPoint(center);
  const at = (d) => [
    { x: c.x - d / 2, y: c.y, id: 0 },
    { x: c.x + d / 2, y: c.y, id: 1 },
  ];
  const wait = (ms) => (frozenClock ? page.clock.runFor(ms) : sleep(ms));
  if (staggerMs) {
    await touchPhase(page, 'start', [at(startDist)[0]]);
    await wait(staggerMs);
    await touchPhase(page, 'start', at(startDist));
  } else {
    await touchPhase(page, 'start', at(startDist));
  }
  for (let i = 1; i <= steps; i += 1) {
    await touchPhase(page, 'move', at(startDist + (endDist - startDist) * (i / steps)));
    if (frozenClock) await wait(16);
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

// canvasShare: EXACT percent of the spec viewport whose top element is the canvas, a descendant,
// or #viewport-container (TUX-058: no sample grid, so no aliasing). Delegates to the audit core so the helper and
// the audit share one definition. selector defaults to the main canvas.
async function canvasShare(page, selector = '#main-canvas') {
  const vp = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  return core.probeCanvasShare(page, { W: vp.width, H: vp.height, selector, cells: 48 });
}

// hitArea: size of the region around the target's clipped centre where elementFromPoint
// resolves to the target or a descendant (counts ::before extensions). Delegates to the audit
// core (2 px grid flood fill, owned = el, descendant, or its LABEL). Returns the bounding { w, h }.
async function hitArea(page, target, { probe = 2, radius = 48 } = {}) {
  const handle = typeof target === 'string' ? await page.locator(target).first().elementHandle() : await target.elementHandle();
  return core.probeHit(page, handle, { probe, radius });
}

module.exports = { tap, doubleTap, longPress, drag, pinch, twoFingerPan, canvasShare, hitArea, engineSupports, engineOf, touchPhase };

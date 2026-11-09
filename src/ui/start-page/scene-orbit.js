/* ===================== StartPageSceneOrbit: a 3D Scene piece that turns, drawn by the app's own renderer =====================
 * window.Vectura.StartPageSceneOrbit.attach(el, { payload, render?, label?, hint? }) -> handle | null
 *
 * `el` already shows the piece through StartPageInk.mount (the plate's or cover band's normal drawing path), so at rest the
 * piece is exactly the drawing the app made: fills, shadow shapes, line weights, framing and colors included. This module
 * only adds turning. Every other camera pose is a REAL render of the same .vectura document with the scene camera moved
 * (StartPageArtRenderer.renderDocument), shown through the Ink handle's showArt in the tile's own home window and line
 * look, so a turned pose is drawn exactly like the app draws that pose. Nothing is approximated, so poses arrive at render
 * speed (a few per second) rather than at the display rate:
 *   - idle: after IDLE ms the piece rocks gently (yaw ±SWAY[0]°, pitch ±SWAY[1]°, one back-and-forth per SWAY_P s), stepping
 *     through 2·LEVELS + 1 pre-rendered poses; the rock widens as its poses finish rendering, and parks at home after
 *     SWAY_MAX ms without interaction (pointer enter, focus or scrolling back into view resumes it);
 *   - drag / arrow keys: PRE-BAKED. A ring of poses around the piece's CURRENT yaw, re-centred as it is turned (yaw ±RING° in RING_STEP° steps at home's pitch, plus the rock's fine
 *     poses) is rendered ahead of time (in a worker when there is one), outward from home. A drag only ever shows the nearest pose already
 *     drawn: no render runs on the interaction path, the turn is limited to the baked arc (it widens as poses finish) and the pitch stays at
 *     home's (Up / Down arrow keys are a live render of the pitched pose). Releasing makes the shown pose the new home.
 * Cost budget (config START_PAGE.SCENE_ORBIT): every pose render is timed. A scene whose pose takes longer than heavyMs rocks through
 * at most heavyLevels poses each side and bakes a narrower ring (none past haltMs), and does not re-queue a rock after a turn. Rock poses never START within yieldMs of a scroll or a
 * pointer / wheel event, and stop being pre-rendered once the rock has parked (waking it resumes them). Poses are drawn through one
 * StartPageArtRenderer.sceneSession per piece (one engine, only the camera changes), else through renderDocument.
 * Still (StartPageInk.isStill) or prefers-reduced-motion: no rocking (dragging still turns the piece).
 * `payload` is the piece's .vectura document, or a function returning it (or a promise of it). A document with no 3D Scene
 * layer, or one that fails to render, leaves the drawing as it is (no overlay). Renders run one at a time, only while the
 * piece is on screen. */
(function (W, D) {
  'use strict';
  const Vectura = (W.Vectura = W.Vectura || {});
  if (Vectura.StartPageSceneOrbit) return;

  const SWAY = [5.7, 2.3]; // degrees of yaw / pitch at the widest point of the rock (orbit3d's 0.10 / 0.04 rad)
  const SWAY_P = 8.5; // seconds per back-and-forth
  const LEVELS = 6; // poses each side of home: the rock steps through 2·LEVELS + 1 real drawings
  const IDLE = 1800; const SWAY_MAX = 20000; const TICK = 1000 / 15;
  const RING = 30; const RING_STEP = 2.5; // degrees: the baked drag arc each side of home, and its pose spacing
const RING_HEAVY = 10; // the same arc for a scene whose pose takes longer than heavyMs
  const KEY_STEP = 5;
  const PITCH = [-89, 89];
  const MAX_POSES = 40; // drawn poses kept per piece (a long drag renders many; the oldest off-rock ones are dropped)
  const D2 = 180 / Math.PI;
  // Mirrors START_PAGE.SCENE_ORBIT (src/config/start-page.js) for a page without the config; the config wins when present.
  const CFG0 = { heavyMs: 1000, haltMs: 4000, heavyLevels: 1, yieldMs: 300, afterDragMs: 2500, altBitmapMB: 32, altBitmapMBMobile: 18 };
  const cfg = () => Object.assign({}, CFG0, (Vectura.START_PAGE && Vectura.START_PAGE.SCENE_ORBIT) || {});

  const reducedMQ = () => { try { return W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const isStill = () => { try { const I = Vectura.StartPageInk; if (I && typeof I.isStill === 'function') return !!I.isStill(); } catch (e) { /* fall through */ } return reducedMQ(); };
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  const snap = (v, s) => Math.round(v / s) * s;
  const keyOf = (p) => `${p.yaw.toFixed(1)},${p.pitch.toFixed(1)}`;

  /* ---------- the document's scene camera ---------- */
  const sceneLayers = (payload) => {
    const st = payload && (payload.state || payload); const eng = st && (st.engine || st);
    const layers = eng && Array.isArray(eng.layers) ? eng.layers : [];
    return layers.filter((l) => l && l.type === 'scene3d' && l.params && typeof l.params === 'object' && (!l.isGroup || l.containerRole === 'scene'));
  };
  const defaultCam = () => { try { const c = Vectura.ALGO_DEFAULTS && Vectura.ALGO_DEFAULTS.scene3d && Vectura.ALGO_DEFAULTS.scene3d.camera; if (c) return c; } catch (e) { /* none */ } return { yaw: -30, pitch: 20 }; };
  const cameraOf = (payload) => {
    const l = sceneLayers(payload)[0]; if (!l) return null;
    const c = (l.params.camera && typeof l.params.camera === 'object') ? l.params.camera : {}; const d = defaultCam();
    return { yaw: num(c.yaw, num(d.yaw, -30)), pitch: num(c.pitch, num(d.pitch, 20)) };
  };
  /* the same document with every scene camera turned to `pose` (nothing else changes) */
  const posed = (payload, pose) => {
    const copy = JSON.parse(JSON.stringify(payload));
    sceneLayers(copy).forEach((l) => { l.params.camera = Object.assign({}, l.params.camera || {}, { yaw: pose.yaw, pitch: pose.pitch }); });
    return copy;
  };

  /* ================= attach ================= */
  function attach(el, opts) {
    if (typeof el === 'string') el = D.querySelector(el);
    if (!el) return null;
    if (el._spScene) el._spScene.destroy();
    const ink = el._spInk;
    if (!ink || typeof ink.showArt !== 'function' || typeof ink.prepareArt !== 'function') return null;
    opts = Object.assign({ payload: null, render: null, label: '', hint: 'Drag to rotate' }, opts || {});
    let session = null; /* one engine for every pose of this piece (StartPageArtRenderer.sceneSession), created on the first render */
    /* A pose that lands while the piece is being dragged waits: its main-thread tail (installing the worker's ink, building the SVG,
     * rastering the bitmap) is 60-150 ms and must not fall inside a gesture. It resumes shortly after the pointer is released. */
    let quietWaiters = []; let quietTimer = 0;
    const whenQuiet = () => (drag ? new Promise((res) => quietWaiters.push(res)) : undefined);
    const flushQuiet = () => { if (quietTimer) clearTimeout(quietTimer); quietTimer = setTimeout(() => { quietTimer = 0; const w = quietWaiters; quietWaiters = []; w.forEach((f) => f()); }, 250); };
    const drawPose = (pose, label) => {
      if (typeof opts.render === 'function') return opts.render(posed(payload, pose), label);
      const R = Vectura.StartPageArtRenderer;
      if (!R || typeof R.renderDocument !== 'function') return Promise.reject(new Error('StartPageArtRenderer is not loaded'));
      if (session === null && typeof R.sceneSession === 'function') { try { session = R.sceneSession(payload); } catch (e) { session = false; } }
      if (session) return session.render({ yaw: pose.yaw, pitch: pose.pitch }, label, whenQuiet);
      return R.renderDocument(posed(payload, pose), label);
    };
    const own = ink.art || { id: 'scene' };
    const baseId = String(own.id || 'scene');

    let engaged = false; let home0 = null; let alive = true; let visible = !('IntersectionObserver' in W); let payload = null; let home = null; let homeKey0 = '';
    let target = null; let drag = null; let busy = false; let renders = 0; let failed = false; let lastError = ''; let stage = '';
    let lastAct = performance.now(); let swayT = 0; let tPrev = 0; let timer = 0; let shownKey = '';
    let lastMs = 0; let lastPageAct = -Infinity; let lastDragEnd = -Infinity; let pumpTimer = 0;
    const cache = new Map(); // pose key -> Promise<alt art | null (the tile's own art)>
    const ready = new Map(); // pose key -> alt art | null, once drawn

    /* overlay: the interactive surface (the drawing under it stays the tile's own) */
    const ov = D.createElement('div');
    ov.className = 'sp-scene-orbit'; ov.tabIndex = 0;
    ov.setAttribute('role', 'application'); ov.setAttribute('aria-roledescription', '3D viewer');
    ov.setAttribute('aria-label', `${opts.label ? `${opts.label}, ` : ''}a 3D scene drawn as the app draws it. Drag, or use the arrow keys, to rotate.`);
    let hintEl = null;
    if (opts.hint) { hintEl = D.createElement('span'); hintEl.className = 'sp-scene-hint'; hintEl.setAttribute('aria-hidden', 'true'); hintEl.textContent = String(opts.hint); ov.appendChild(hintEl); }
    el.insertBefore(ov, ink.box && ink.box.parentNode === el ? ink.box.nextSibling : null); el.classList.add('sp-scene-live');

    const fail = () => { failed = true; teardown(); };
    const loaded = Promise.resolve().then(() => (typeof opts.payload === 'function' ? opts.payload() : opts.payload)).then((pl) => {
      if (!alive) return null;
      const cam = pl ? cameraOf(pl) : null;
      if (!cam) { fail(); return null; }
      if (typeof ink.useRaster === 'function') ink.useRaster(); /* poses are drawn as cached bitmaps, not swapped inline SVG */
      payload = pl; home = { yaw: round1(cam.yaw), pitch: round1(cam.pitch) }; home0 = home; homeKey0 = keyOf(home);
      cache.set(homeKey0, Promise.resolve(null)); ready.set(homeKey0, null); shownKey = homeKey0;
      pump(); kick();
      return payload;
    }, () => { if (alive) fail(); return null; });

    /* ---------- poses ---------- */
    const poseAt = (lv) => ({ yaw: round1(home.yaw + SWAY[0] * lv / LEVELS), pitch: round1(clamp(home.pitch + SWAY[1] * lv / LEVELS, PITCH[0], PITCH[1])) });
    const renderPose = (pose) => {
      const k = keyOf(pose);
      if (cache.has(k)) return cache.get(k);
      stage = `render ${k}`;
      const t0 = performance.now();
      const p = Promise.resolve().then(() => drawPose(pose, `${baseId}@${k}`)).then((out) => {
        lastMs = out && Number.isFinite(out.ms) ? out.ms : performance.now() - t0; /* the render's own time, not the wait in the queue */
        if (!alive || !out || typeof out.svg !== 'string') return Promise.reject(new Error('no drawing'));
        renders++; stage = `prepare ${k}`;
        const alt = { id: `${baseId}@${k}`, svg: out.svg };
        return Promise.resolve(whenQuiet()).then(() => ink.prepareArt(alt)).then((ok) => { if (!ok) throw new Error('not drawable'); ready.set(k, alt); readyVer += 1; trim(); return alt; });
      });
      cache.set(k, p);
      p.catch((err) => { cache.delete(k); lastError = String(err && err.message || err); });
      return p;
    };
    /* keep at most MAX_POSES drawn poses: never home, the rock's poses around it, the shown one or the drag target */
    const trim = () => {
      if (ready.size <= MAX_POSES || !home) return;
      const keep = new Set([homeKey0, keyOf(home), shownKey, target ? keyOf(target) : '']);
      for (let i = -LEVELS; i <= LEVELS; i++) keep.add(keyOf(poseAt(i)));
      for (const k of Array.from(ready.keys())) { if (ready.size <= MAX_POSES) break; if (!keep.has(k)) { ready.delete(k); cache.delete(k); } }
    };
    const show = (k) => {
      if (!alive || !ready.has(k) || k === shownKey || el.classList.contains('sp-ink-drawing')) return; /* never mid draw-in */
      shownKey = k; ink.showArt(ready.get(k));
    };
    /* the drawn pose nearest `pose` (what shows while the exact one renders) */
    const nearest = (pose) => {
      let best = null; let bd = Infinity;
      ready.forEach((_, k) => { const [y, p] = k.split(',').map(Number); const d = Math.hypot(y - pose.yaw, p - pose.pitch); if (d < bd) { bd = d; best = k; } });
      return best;
    };
    /* The drag's lookup: the baked yaws at home's pitch, sorted once per change of the baked set (not per pointer move), then a binary
     * search. A pointer move costs O(log poses) and allocates nothing. `lookups` / `rebuilds` are the counters the budget tests read. */
    let ringIdx = null; let ringIdxFor = ''; let readyVer = 0; const lookupStats = { lookups: 0, rebuilds: 0 };
    const nearestYaw = (yaw, pitch) => {
      lookupStats.lookups += 1;
      const tag = `${readyVer}|${ready.size}|${pitch}`;
      if (!ringIdx || ringIdxFor !== tag) {
        lookupStats.rebuilds += 1; ringIdxFor = tag;
        const rows = [];
        ready.forEach((_, k) => { const i = k.indexOf(','); const y = +k.slice(0, i); const p = +k.slice(i + 1); if (Math.abs(p - pitch) < 0.05) rows.push({ y, k, p }); });
        rows.sort((a, b) => a.y - b.y); ringIdx = rows;
      }
      const rows = ringIdx; if (!rows.length) return nearest({ yaw, pitch });
      let lo = 0; let hi = rows.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].y < yaw) lo = mid + 1; else hi = mid; }
      const a = rows[lo]; const b = lo > 0 ? rows[lo - 1] : a;
      return Math.abs(a.y - yaw) <= Math.abs(b.y - yaw) ? a : b;
    };

    /* one render at a time: the drag target first, then the rock's poses (nearest home first) */
    const isHeavy = () => lastMs > cfg().heavyMs;
    /* poses each side of home the rock steps through: all of them, a few for a heavy scene, none past haltMs or once a heavy scene has been turned */
    const rockLevels = () => {
      const c = cfg();
      if (lastMs > c.haltMs) return 0;
      if (lastMs > c.heavyMs) return home && keyOf(home) !== homeKey0 ? 0 : Math.max(0, Math.min(LEVELS, c.heavyLevels));
      return LEVELS;
    };
    const parked = (now) => now - lastAct >= IDLE + SWAY_MAX;
    const swayOK = () => visible && !isStill() && !drag && !parked(performance.now());
    const ringPoses = () => {
      /* The ring is centred on where the piece IS (home snapped to the ring's own grid, so a turn re-uses the poses already drawn and only
       * the new edge is baked), at home's pitch: the arc follows the turn instead of ending ±RING° from where the page first showed it. */
      const out = []; const lim = lastMs > cfg().haltMs ? 0 : (lastMs > cfg().heavyMs ? RING_HEAVY : RING);
      const cy = home0.yaw + snap(home.yaw - home0.yaw, RING_STEP);
      for (let a = RING_STEP; a <= lim + 1e-6; a += RING_STEP) for (const sg of [1, -1]) out.push({ yaw: round1(cy + sg * a), pitch: home.pitch });
      return out;
    };
    function nextWanted() {
      if (typeof ink.altCapacity === 'function' && ready.size >= ink.altCapacity()) return null; /* the plate's bitmap budget is spent */
      if (drag || !visible || (isStill() && !engaged)) return null; /* Still: nothing bakes until the piece is engaged (pointer, focus, a drag) */
      /* nothing renders while the piece is dragged. The rock's poses stop once the piece has parked; the drag ring does not: it is a
       * bounded set, and a ring left half baked would cap the turn for the rest of the page's life. */
      const L = rockLevels();
      if (!parked(performance.now())) for (let i = 1; i <= L; i++) for (const s of [1, -1]) { const p = poseAt(s * i); if (!cache.has(keyOf(p))) return p; }
      if (L) for (const p of ringPoses()) if (!cache.has(keyOf(p))) return p;
      return null;
    }
    function pump() {
      if (!alive || busy || !payload || !visible) return;
      const want = nextWanted(); if (!want) return;
      { /* baked poses wait for a quiet page */
        const wait = Math.max(cfg().yieldMs - (performance.now() - lastPageAct), cfg().afterDragMs - (performance.now() - lastDragEnd));
        if (wait > 0) { if (!pumpTimer) pumpTimer = setTimeout(() => { pumpTimer = 0; pump(); }, wait + 1); return; }
      }
      busy = true;
      renderPose(want).then(() => {}, () => {}).then(() => { busy = false; if (alive) { pump(); kick(); } });
    }

    /* ---------- the rock (a stepped sway through the drawn poses) ---------- */
    function frame() {
      timer = 0; if (!alive || !payload) return;
      const now = performance.now(); const dt = Math.min(0.1, (now - (tPrev || now)) / 1000); tPrev = now;
      if (drag || target || !visible) { tPrev = 0; return; }
      if (isStill() || now - lastAct < IDLE) { swayT = 0; show(keyOf(home)); if (!isStill() && visible) schedule(IDLE - (now - lastAct)); else tPrev = 0; return; }
      const L = rockLevels();
      if (!L) { swayT = 0; tPrev = 0; show(keyOf(home)); return; } /* nothing to rock through: rest on home */
      swayT += dt;
      const r = Math.min(1, swayT / 2.5); const e = r * r * (3 - 2 * r);
      let lv = Math.round(Math.sin(2 * Math.PI * swayT / SWAY_P) * e * L);
      if (parked(now) && lv === 0) { swayT = 0; tPrev = 0; show(keyOf(home)); return; } /* parks once it is back at home */
      while (lv !== 0 && !ready.has(keyOf(poseAt(lv)))) lv -= Math.sign(lv); /* the rock widens as its poses are drawn */
      show(keyOf(poseAt(lv)));
      schedule(TICK);
    }
    function schedule(ms) { if (!timer && alive) timer = setTimeout(frame, Math.max(0, ms)); }
    function kick() { if (timer) { clearTimeout(timer); timer = 0; } schedule(0); }
    function wake() { engaged = true; if (parked(performance.now())) lastAct = performance.now() - IDLE; kick(); pump(); }

    /* ---------- input ---------- */
    const touch = () => { lastAct = performance.now(); swayT = 0; tPrev = 0; };
    /* The drag shows the nearest BAKED pose (yaw only: the pitch stays home's); nothing renders here. */
    const moveTo = (pose) => {
      const n = nearestYaw(round1(pose.yaw), home.pitch);
      if (!n) return;
      if (!target || target.yaw !== n.y || target.pitch !== n.p) target = { yaw: n.y, pitch: n.p };
      show(n.k);
    };
    const settle = () => {
      if (!target) return;
      home = target; target = null;
      show(keyOf(home));
      touch(); pump(); kick();
    };
    const onDown = (e) => {
      if (e.button > 0 || !payload) return;
      engaged = true; ov.dataset.pointer = '1'; /* focused by a pointer: no keyboard focus ring */
      try { ov.focus({ preventScroll: true }); } catch (_) { /* noop */ }
      try { ov.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      const base = target || home;
      const r0 = el.getBoundingClientRect(); /* measured once per gesture: a pointer move forces no layout */
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: base.yaw, pitch: base.pitch, k: 3.4 / Math.max(240, Math.min(r0.width || 0, r0.height || 0)) * D2 };
      ov.classList.add('is-drag'); touch();
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      moveTo({ yaw: drag.yaw - (e.clientX - drag.x) * drag.k, pitch: drag.pitch });
      touch();
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null; lastDragEnd = performance.now(); ov.classList.remove('is-drag'); settle(); flushQuiet();
    };
    const onKey = (e) => {
      const K = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      delete ov.dataset.pointer;
      if (!K || !payload) return; e.preventDefault();
      const s = KEY_STEP * (e.shiftKey ? 2.5 : 1); const base = target || home;
      touch();
      if (!K[0]) { /* pitch: only the yaw is baked, so an up / down key is a LIVE render of that pose (shown when it lands) */
        const pose = { yaw: base.yaw, pitch: round1(clamp(base.pitch + K[1] * s, PITCH[0], PITCH[1])) };
        if (keyOf(pose) === keyOf(base)) return;
        target = pose;
        renderPose(pose).then(() => { if (alive && target === pose) { show(keyOf(pose)); settle(); } }, () => { if (target === pose) target = null; });
        return;
      }
      moveTo({ yaw: base.yaw + K[0] * s, pitch: base.pitch }); settle();
    };
    ov.addEventListener('pointerenter', wake); ov.addEventListener('focus', wake);
    ov.addEventListener('pointerdown', onDown); ov.addEventListener('pointermove', onMove);
    ov.addEventListener('pointerup', onUp); ov.addEventListener('pointercancel', onUp); ov.addEventListener('lostpointercapture', onUp);
    ov.addEventListener('keydown', onKey);

    /* a quiet page: scrolling (the scroller that holds this piece, or the page) and pointer / wheel input hold the rock's renders back */
    const bump = () => { lastPageAct = performance.now(); };
    const onScroll = (e) => { const t = e.target; if (!t || t === D || t === W || (t.nodeType === 1 && t.contains(el))) bump(); };
    const ACT = ['pointermove', 'pointerdown', 'wheel', 'touchmove'];
    D.addEventListener('scroll', onScroll, { capture: true, passive: true });
    ACT.forEach((n) => W.addEventListener(n, bump, { capture: true, passive: true }));

    const io = 'IntersectionObserver' in W ? new IntersectionObserver((es) => es.forEach((e) => { visible = e.isIntersecting; if (visible) wake(); }), { threshold: [0, 0.3] }) : null;
    if (io) io.observe(el);
    const onMotion = () => { if (isStill()) { swayT = 0; show(home ? keyOf(home) : shownKey); } kick(); pump(); };
    W.addEventListener('vectura:start-page-motion', onMotion);
    let mq = null; try { mq = W.matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) mq.addEventListener('change', onMotion); } catch (e) { mq = null; }

    function teardown() {
      if (!alive) return;
      alive = false; if (timer) { clearTimeout(timer); timer = 0; }
      if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = 0; }
      D.removeEventListener('scroll', onScroll, { capture: true }); ACT.forEach((n) => W.removeEventListener(n, bump, { capture: true }));
      if (session) { try { session.dispose(); } catch (e) { /* gone */ } session = false; }
      if (io) io.disconnect();
      W.removeEventListener('vectura:start-page-motion', onMotion); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
      ov.remove(); el.classList.remove('sp-scene-live');
      if (el._spInk === ink) ink.showArt(null);
      if (el._spScene === handle) delete el._spScene;
    }
    const handle = {
      el, loaded,
      get pose() { return target || home; },
      get home() { return home; },
      get shown() { return shownKey; },
      get failed() { return failed; },
      get lookup() { return lookupStats; },
      get stats() { return { renders, drawn: ready.size, busy, swaying: !!timer && swayT > 0, stage, lastError, lastMs, heavy: isHeavy() }; },
      poseKey: keyOf,
      destroy: teardown,
    };
    el._spScene = handle;
    return handle;
  }

  Vectura.StartPageSceneOrbit = { attach, cameraOf, posed, SWAY, LEVELS, isScene: (id) => /^scene:/.test(String(id || '')) };
})(window, document);

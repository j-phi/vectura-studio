const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-057 / TUX-061 smoke: proves each touch project is a real finger-only
// device and that the helpers work on both engines.
test.describe('touch harness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  });

  test('project is a coarse, hover-less touch device at the §1.2 viewport', async ({ page }, testInfo) => {
    const spec = PROJECTS[testInfo.project.name];
    expect(spec, `unknown project ${testInfo.project.name}`).toBeTruthy();
    const info = await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      noHover: matchMedia('(hover: none)').matches,
      points: navigator.maxTouchPoints,
      w: innerWidth,
      h: innerHeight,
      dpr: devicePixelRatio,
      ua: navigator.userAgent,
    }));
    expect(info.coarse).toBe(true);
    expect(info.noHover).toBe(true);
    // WebKit on desktop macOS reports maxTouchPoints 0 even with hasTouch.
    if (touch.engineSupports(page, 'maxTouchPoints')) expect(info.points).toBeGreaterThan(0);
    expect(page.viewportSize()).toEqual({ width: spec.width, height: spec.height });
    // The app itself can widen the layout viewport on mobile (horizontal overflow is
    // counted by TUX-058), so prove the emulated viewport on a neutral page.
    const probe = await page.context().newPage();
    await probe.goto('data:text/html,<meta name="viewport" content="width=device-width,initial-scale=1"><body>x');
    expect(await probe.evaluate(() => [innerWidth, innerHeight])).toEqual([spec.width, spec.height]);
    await probe.close();
    expect(info.dpr).toBe(spec.dpr);
    expect(info.ua).toMatch(/iPhone|iPad/);
    expect(touch.engineOf(page)).toBe(spec.engine);
  });

  test('tap() fires touch pointerdown and no mousedown before pointerup', async ({ page }) => {
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'tux-probe';
      b.textContent = 'probe';
      b.style.cssText = 'position:fixed;left:20px;top:20px;width:80px;height:60px;z-index:99999';
      document.body.appendChild(b);
      window.__log = [];
      ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach((t) => {
        b.addEventListener(t, (e) => window.__log.push(`${t}:${e.pointerType || ''}`));
      });
    });
    await touch.tap(page, page.locator('#tux-probe'));
    const log = await page.evaluate(() => window.__log);
    expect(log[0]).toBe('pointerdown:touch');
    expect(log.indexOf('pointerup:touch')).toBeGreaterThan(-1);
    const up = log.indexOf('pointerup:touch');
    expect(log.slice(0, up).some((e) => e.startsWith('mousedown'))).toBe(false);
  });

  test('drag, longPress, pinch, twoFingerPan emit touch pointer events and no mouse events', async ({ page }) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'tux-pad';
      d.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:300px;z-index:99999;touch-action:none;background:#ccc';
      document.body.appendChild(d);
      window.__ev = [];
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mousemove', 'mouseup'].forEach((t) => {
        d.addEventListener(t, (e) => window.__ev.push({ t, type: e.pointerType || '', id: e.pointerId }));
      });
    });
    const pad = page.locator('#tux-pad');
    const reset = () => page.evaluate(() => { window.__ev = []; });
    const read = () => page.evaluate(() => window.__ev);

    await touch.drag(page, { x: 40, y: 40 }, { x: 200, y: 200 }, { steps: 5 });
    let ev = await read();
    expect(ev.some((e) => e.t === 'pointermove' && e.type === 'touch')).toBe(true);
    expect(ev.some((e) => e.t.startsWith('mouse'))).toBe(false);
    await reset();

    const t0 = Date.now();
    await touch.longPress(page, pad, 700);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(700);
    ev = await read();
    expect(ev.some((e) => e.t === 'pointerdown' && e.type === 'touch')).toBe(true);
    // Browsers may synthesize compat mouse events after lift-off; none may precede pointerup.
    const upAt = ev.findIndex((e) => e.t === 'pointerup');
    expect(upAt).toBeGreaterThan(-1);
    expect(ev.slice(0, upAt).some((e) => e.t.startsWith('mouse'))).toBe(false);
    await reset();

    await touch.pinch(page, pad, { steps: 4, staggerMs: 20 });
    ev = await read();
    expect(new Set(ev.filter((e) => e.t === 'pointerdown').map((e) => e.id)).size).toBe(2);
    expect(ev.some((e) => e.t.startsWith('mouse'))).toBe(false);
    await reset();

    await touch.twoFingerPan(page, pad, { dx: 40, dy: 20, gap: 60, steps: 4 });
    ev = await read();
    expect(new Set(ev.filter((e) => e.t === 'pointerdown').map((e) => e.id)).size).toBe(2);
  });

  test('staggered pinch fires exactly 2 pointerdowns', async ({ page }) => {
    await page.evaluate(() => {
      window.__downs = [];
      // Capture at window level: in iPhone landscape the canvas can be covered (shell lane), but
      // every touch pointerdown still passes through the window capture phase.
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') window.__downs.push(e.pointerId);
      }, true);
    });
    const box = await page.locator('#main-canvas').boundingBox();
    await touch.pinch(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { startDist: 100, endDist: 200, staggerMs: 60 });
    expect(await page.evaluate(() => window.__downs.length)).toBe(2);
  });

  test('canvasShare and hitArea measure the live layout', async ({ page }) => {
    const share = await touch.canvasShare(page);
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(100);
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'tux-hit';
      b.style.cssText = 'position:fixed;left:100px;top:100px;width:40px;height:30px;z-index:99999';
      document.body.appendChild(b);
    });
    const area = await touch.hitArea(page, page.locator('#tux-hit'));
    expect(area.w).toBeGreaterThanOrEqual(38);
    expect(area.w).toBeLessThanOrEqual(44);
    expect(area.h).toBeGreaterThanOrEqual(28);
    expect(area.h).toBeLessThanOrEqual(34);
  });

  test('hitArea measures an asymmetric ::before extension', async ({ page }) => {
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '#tux-ext{position:fixed;left:100px;top:100px;width:40px;height:30px;z-index:99999}'
        + '#tux-ext::before{content:"";position:absolute;left:100%;top:0;width:20px;height:100%}';
      document.head.appendChild(st);
      const b = document.createElement('button');
      b.id = 'tux-ext';
      document.body.appendChild(b);
    });
    const area = await touch.hitArea(page, page.locator('#tux-ext'));
    expect(area.w).toBeGreaterThanOrEqual(58);
    expect(area.w).toBeLessThanOrEqual(62);
    expect(area.h).toBeGreaterThanOrEqual(28);
    expect(area.h).toBeLessThanOrEqual(32);
  });

  test('drag() delivers touchstart/touchmove/touchend with the drag coordinates', async ({ page }) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'tux-te';
      d.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:300px;z-index:99999;touch-action:none;background:#ccc';
      document.body.appendChild(d);
      window.__te = [];
      ['touchstart', 'touchmove', 'touchend'].forEach((t) => {
        d.addEventListener(t, (e) => window.__te.push({ t, x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, n: e.changedTouches.length }), { passive: true });
      });
    });
    await touch.drag(page, { x: 40, y: 50 }, { x: 200, y: 210 }, { steps: 4 });
    const ev = await page.evaluate(() => window.__te);
    expect(ev[0]).toMatchObject({ t: 'touchstart', x: 40, y: 50, n: 1 });
    const moves = ev.filter((e) => e.t === 'touchmove');
    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves[moves.length - 1]).toMatchObject({ x: 200, y: 210 });
    expect(ev[ev.length - 1]).toMatchObject({ t: 'touchend', x: 200, y: 210 });
  });

  test('setPointerCapture inside pointerdown does not throw after helper gestures', async ({ page }) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'tux-cap';
      d.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:300px;z-index:99999;touch-action:none;background:#ccc';
      document.body.appendChild(d);
      window.__cap = { ok: 0, err: [], moves: 0, has: [] };
      d.addEventListener('pointerdown', (e) => {
        try { d.setPointerCapture(e.pointerId); window.__cap.ok += 1; window.__cap.has.push(d.hasPointerCapture(e.pointerId)); } catch (err) { window.__cap.err.push(err.name); }
      });
      d.addEventListener('pointermove', () => { window.__cap.moves += 1; });
    });
    const pad = page.locator('#tux-cap');
    await touch.drag(page, { x: 40, y: 40 }, { x: 120, y: 120 }, { steps: 3 });
    await touch.longPress(page, pad, 50);
    await touch.pinch(page, pad, { steps: 2 });
    const cap = await page.evaluate(() => window.__cap);
    expect(cap.err).toEqual([]);
    expect(cap.ok).toBe(4);
    expect(cap.has.every(Boolean)).toBe(true);
    expect(cap.moves).toBeGreaterThan(0);
  });

  test('captured synthetic pointer routes later moves to the capture target', async ({ page }) => {
    await page.evaluate(() => {
      const a = document.createElement('div');
      a.id = 'tux-a';
      a.style.cssText = 'position:fixed;left:10px;top:10px;width:100px;height:100px;z-index:99999;touch-action:none;background:#caa';
      const b = document.createElement('div');
      b.id = 'tux-b';
      b.style.cssText = 'position:fixed;left:200px;top:10px;width:100px;height:100px;z-index:99999;touch-action:none;background:#aac';
      document.body.append(a, b);
      window.__route = [];
      a.addEventListener('pointerdown', (e) => a.setPointerCapture(e.pointerId));
      a.addEventListener('pointermove', () => window.__route.push('a'));
      b.addEventListener('pointermove', () => window.__route.push('b'));
    });
    await touch.drag(page, { x: 50, y: 50 }, { x: 250, y: 50 }, { steps: 4 });
    const route = await page.evaluate(() => window.__route);
    expect(route.length).toBeGreaterThan(0);
    expect(route.every((r) => r === 'a')).toBe(true);
  });

  test('touchPhase end lifts only the listed finger; the other keeps its pointerId', async ({ page }) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'tux-pl';
      d.style.cssText = 'position:fixed;left:10px;top:10px;width:380px;height:300px;z-index:99999;touch-action:none;background:#ccc';
      document.body.appendChild(d);
      window.__pl = [];
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((t) => {
        d.addEventListener(t, (e) => window.__pl.push({ t, id: e.pointerId }));
      });
    });
    const f = (id, x) => ({ x, y: 150, id });
    await touch.touchPhase(page, 'start', [f(0, 100), f(1, 200)]);
    const id0 = await page.evaluate(() => window.__pl.find((e) => e.t === 'pointerdown').id);
    await touch.touchPhase(page, 'end', [f(1, 200)]);
    await page.evaluate(() => { window.__pl = []; });
    await touch.touchPhase(page, 'move', [f(0, 140)]);
    await touch.touchPhase(page, 'move', [f(0, 160)]);
    const ev = await page.evaluate(() => window.__pl);
    const moves = ev.filter((e) => e.t === 'pointermove');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((e) => e.id === id0)).toBe(true);
    expect(ev.some((e) => e.t === 'pointerdown' || e.t === 'pointercancel')).toBe(false);
    await touch.touchPhase(page, 'end', [f(0, 160)]);
    const after = await page.evaluate(() => window.__pl);
    expect(after.filter((e) => e.t === 'pointerup').map((e) => e.id)).toContain(id0);
  });

  test('nativeDefaultActions capability matches the engine', async ({ page }, testInfo) => {
    expect(touch.engineSupports(page, 'nativeDefaultActions')).toBe(!testInfo.project.name.startsWith('webkit-'));
  });

  test('engineSupports guards trusted multi-touch per engine', async ({ page }, testInfo) => {
    const isWebkit = testInfo.project.name.startsWith('webkit-');
    expect(touch.engineSupports(page, 'trustedMultiTouch')).toBe(!isWebkit);
  });
});

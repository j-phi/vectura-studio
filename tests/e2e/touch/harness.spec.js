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

  test('engineSupports guards trusted multi-touch per engine', async ({ page }, testInfo) => {
    const isWebkit = testInfo.project.name.startsWith('webkit-');
    expect(touch.engineSupports(page, 'trustedMultiTouch')).toBe(!isWebkit);
  });
});

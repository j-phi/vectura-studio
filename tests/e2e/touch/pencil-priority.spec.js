const { test, expect } = require('@playwright/test');

// TUX-021: an Apple Pencil pointer (pointerType 'pen') takes priority over a resting palm
// (pointerType 'touch'). Pure app logic: synthetic PointerEvents in the page, so it runs
// identically in Chromium and WebKit (no engineSupports skip).
// Palm ids 100-199 (capture shim range in tests/e2e/helpers/touch.js); the pen id is outside it.

const PROJECTS = ['touch-ipad-portrait', 'touch-ipad-landscape', 'webkit-ipad-portrait', 'webkit-ipad-landscape'];
const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.describe('TUX-021 Apple Pencil priority over a resting palm', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!PROJECTS.includes(testInfo.project.name), 'iPad projects only');
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
    await page.evaluate(() => {
      const Vectura = window.Vectura;
      Vectura.SETTINGS.snapGuides = false;
      Vectura.SETTINGS.showGuides = false;
      const cv = document.querySelector('#main-canvas');
      window.__ptr = (type, id, kind, x, y, extra = {}) => {
        const o = {
          bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: kind,
          button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: kind === 'pen' ? 0.5 : 0, isPrimary: true, ...extra,
        };
        const ev = new PointerEvent(type, o);
        (type === 'pointerdown' ? cv : window).dispatchEvent(ev);
      };
      // Find a spot with clear canvas to the right and below.
      const box = cv.getBoundingClientRect();
      const x0 = Math.max(0, box.left) + 120;
      const y0 = Math.max(0, box.top) + 120;
      window.__p = { x0, y0 };
    });
  });

  const state = (page) => page.evaluate(() => {
    const r = window.app.renderer;
    const box = document.querySelector('#main-canvas').getBoundingClientRect();
    return {
      activePointerId: r.activePointerId,
      touchGesture: !!r.touchGesture,
      scale: r.scale, ox: r.offsetX, oy: r.offsetY,
      hist: window.app.history.length,
      anchors: r.penDraft && r.penDraft.anchors ? r.penDraft.anchors.map((a) => ({ x: a.x * r.scale + r.offsetX + box.left, y: a.y * r.scale + r.offsetY + box.top })) : [],
      selStart: r.selectionStart ? { x: r.selectionStart.x * r.scale + r.offsetX + box.left, y: r.selectionStart.y * r.scale + r.offsetY + box.top } : null,
      rect: r.selectionRect ? JSON.stringify(r.selectionRect) : null,
    };
  });
  const send = (page, type, id, kind, x, y, extra) => page.evaluate(([t, i, k, px, py, ex]) => window.__ptr(t, i, k, px, py, ex), [type, id, kind, x, y, extra]);

  test('1. select tool: pen takes over a palm marquee', async ({ page }, testInfo) => {
    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    const { x0, y0 } = await page.evaluate(() => window.__p);
    const h0 = (await state(page)).hist;
    await send(page, 'pointerdown', 100, 'touch', x0, y0);
    await send(page, 'pointermove', 100, 'touch', x0 + 30, y0 + 30);
    expect((await state(page)).activePointerId).toBe(100);
    await send(page, 'pointerdown', 201, 'pen', x0 + 150, y0 + 20);
    const s = await state(page);
    expect(s.activePointerId).toBe(201);
    expect(Math.abs(s.selStart.x - (x0 + 150))).toBeLessThan(1);
    expect(Math.abs(s.selStart.y - (y0 + 20))).toBeLessThan(1);
    await send(page, 'pointermove', 201, 'pen', x0 + 190, y0 + 60);
    await send(page, 'pointerup', 201, 'pen', x0 + 190, y0 + 60);
    await send(page, 'pointerup', 100, 'touch', x0 + 30, y0 + 30);
    expect((await state(page)).hist).toBe(h0);
    if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/${testInfo.project.name}-1.png` });
  });

  test('2. Pen tool: the pen anchor lands, not the palm anchor', async ({ page }, testInfo) => {
    await page.evaluate(() => window.app.ui.setActiveTool('pen'));
    const { x0, y0 } = await page.evaluate(() => window.__p);
    const h0 = (await state(page)).hist;
    await send(page, 'pointerdown', 101, 'touch', x0, y0);
    await send(page, 'pointerdown', 201, 'pen', x0 + 160, y0 + 40);
    const s = await state(page);
    expect(s.anchors.length).toBe(1);
    expect(Math.abs(s.anchors[0].x - (x0 + 160))).toBeLessThan(1);
    expect(Math.abs(s.anchors[0].y - (y0 + 40))).toBeLessThan(1);
    expect(s.hist).toBe(h0);
    await send(page, 'pointerup', 201, 'pen', x0 + 160, y0 + 40);
    await send(page, 'pointerup', 101, 'touch', x0, y0);
    if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/${testInfo.project.name}-2.png` });
  });

  test('2b. Pen tool: a second palm contact while the first palm rests and the pen is lifted adds no anchor', async ({ page }) => {
    await page.evaluate(() => window.app.ui.setActiveTool('pen'));
    const { x0, y0 } = await page.evaluate(() => window.__p);
    await send(page, 'pointerdown', 101, 'touch', x0, y0 + 20);
    await send(page, 'pointerdown', 201, 'pen', x0 + 160, y0 + 40);
    await send(page, 'pointerup', 201, 'pen', x0 + 160, y0 + 40);
    await send(page, 'pointerdown', 102, 'touch', x0 + 240, y0 + 60);
    await send(page, 'pointerup', 102, 'touch', x0 + 240, y0 + 60);
    const s = await state(page);
    expect(s.anchors.length).toBe(1);
    expect(Math.abs(s.anchors[0].x - (x0 + 160))).toBeLessThan(1);
    await send(page, 'pointerup', 101, 'touch', x0, y0 + 20);
  });

  test('4. two palm contacts pinch, then the pen: view restored, pen starts', async ({ page }) => {
    await page.evaluate(() => window.app.ui.setActiveTool('pen'));
    const { x0, y0 } = await page.evaluate(() => window.__p);
    const before = await state(page);
    await send(page, 'pointerdown', 102, 'touch', x0, y0);
    await send(page, 'pointerdown', 103, 'touch', x0 + 40, y0);
    await send(page, 'pointermove', 102, 'touch', x0 - 30, y0);
    await send(page, 'pointermove', 103, 'touch', x0 + 110, y0);
    const mid = await state(page);
    expect(mid.touchGesture).toBe(true);
    expect(mid.scale).not.toBeCloseTo(before.scale, 3);
    await send(page, 'pointerdown', 201, 'pen', x0 + 160, y0 + 60);
    const s = await state(page);
    expect(s.touchGesture).toBe(false);
    expect(s.activePointerId).toBe(201);
    expect(Math.abs(s.scale - before.scale)).toBeLessThan(1e-6);
    expect(Math.abs(s.ox - before.ox)).toBeLessThan(1e-6);
    expect(Math.abs(s.oy - before.oy)).toBeLessThan(1e-6);
    expect(s.anchors.length).toBe(1);
    await send(page, 'pointerup', 201, 'pen', x0 + 160, y0 + 60);
    await send(page, 'pointerup', 102, 'touch', x0 - 30, y0);
    await send(page, 'pointerup', 103, 'touch', x0 + 110, y0);
  });

  test('5. palm lands mid-stroke: the pen stroke is intact, no pinch', async ({ page }) => {
    await page.evaluate(() => window.app.ui.setActiveTool('pen'));
    const { x0, y0 } = await page.evaluate(() => window.__p);
    const before = await state(page);
    await send(page, 'pointerdown', 201, 'pen', x0 + 160, y0 + 60);
    await send(page, 'pointermove', 201, 'pen', x0 + 165, y0 + 62);
    await send(page, 'pointerdown', 104, 'touch', x0, y0);
    await send(page, 'pointerdown', 105, 'touch', x0 + 40, y0);
    await send(page, 'pointermove', 104, 'touch', x0 - 30, y0);
    await send(page, 'pointermove', 105, 'touch', x0 + 110, y0);
    await sleep(30);
    const mid = await state(page);
    expect(mid.touchGesture).toBe(false);
    expect(mid.activePointerId).toBe(201);
    await send(page, 'pointermove', 201, 'pen', x0 + 170, y0 + 64);
    await send(page, 'pointerup', 201, 'pen', x0 + 170, y0 + 64);
    await send(page, 'pointerup', 104, 'touch', x0 - 30, y0);
    await send(page, 'pointerup', 105, 'touch', x0 + 110, y0);
    const s = await state(page);
    expect(s.anchors.length).toBe(1);
    expect(s.scale).toBe(before.scale);
    expect(s.ox).toBe(before.ox);
    expect(s.oy).toBe(before.oy);
  });
});

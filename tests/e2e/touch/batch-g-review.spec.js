const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { setupDirectPick, picked, boot } = require('../helpers/direct-pick');

// Independent review of batch G: shape bar grip scope (TUX-031), pointercancel abort on shape sliders,
// locked-over-unlocked Direct pick (TUX-024), second finger during a canvas hold and its pop (TUX-034),
// algorithm-draw menu outside dismissal (TUX-040b), and the pinned Document Setup row on phones (Q23).

const phoneLayout = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

const drawPolygon = async (page) => {
  await page.evaluate(() => { window.app.ui.setActiveTool('shape-polygon'); });
  const r = await page.evaluate(() => { const b = document.querySelector('#main-canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const from = { x: r.x + r.w * 0.45, y: r.y + r.h * 0.35 };
  await touch.drag(page, from, { x: from.x + 90, y: from.y + 90 });
  await expect.poll(() => page.evaluate(() => { const s = window.app.renderer.getShapePropsState && window.app.renderer.getShapePropsState(); return s && s.type; })).toBe('polygon');
};

test.describe('batch G review', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', (e) => errors.push(String(e))); await boot(page); });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('TUX-031: the shape bar keeps its grip above 640 px and drops it on phone widths only', async ({ page }) => {
    await drawPolygon(page);
    const bar = page.locator('.ctxbar.ctxbar--shape');
    await expect(bar).toBeVisible();
    const handleDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.ctxbar.ctxbar--shape .ctxbar-handle')).display);
    const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
    if (narrow) expect(handleDisplay, 'phone width: no grip').toBe('none');
    else expect(handleDisplay, 'wider than 640 px: grip kept').not.toBe('none');
  });

  test('pointercancel on the polygon sides slider restores the sides and pushes no history', async ({ page }) => {
    await drawPolygon(page);
    const btn = page.locator('.ctxbar.is-visible .ctxbar-btn').filter({ has: page.locator('svg') }).locator('xpath=self::*[contains(@title,"hape") or contains(@aria-label,"hape")]').first();
    await expect(btn).toBeVisible();
    await touch.tap(page, btn);
    await expect(page.locator('.shape-props-popover .shape-props-sides-slider')).toBeVisible();
    const before = await page.evaluate(() => ({ sides: window.app.renderer.getShapePropsState().sides, hist: window.app.history.length }));
    const after = await page.evaluate(() => {
      const s = document.querySelector('.shape-props-popover .shape-props-sides-slider');
      s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, pointerType: 'touch' }));
      s.value = String(Math.min(20, Number(s.value) + 3));
      s.dispatchEvent(new Event('input', { bubbles: true }));
      const mid = window.app.renderer.getShapePropsState().sides;
      s.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 5, pointerType: 'touch' }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return { mid, sides: window.app.renderer.getShapePropsState().sides, hist: window.app.history.length };
    });
    expect(after.mid, 'the drag changed the sides').not.toBe(before.sides);
    expect(after.sides, 'cancel restores the pre-drag sides').toBe(before.sides);
    expect(after.hist, 'cancel keeps no history entry').toBe(before.hist);
  });

  test('TUX-024: a finger tap on locked geometry over an unlocked layer selects nothing', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setupDirectPick(page);
    const topId = await page.evaluate((baseId) => {
      const e = window.app.engine;
      const id = e.addLayer('rings');
      // Same params and seed as the unlocked layer: the locked stroke lies exactly on top of it.
      const base = e.layers.find((l) => l.id === baseId);
      const top = e.layers.find((l) => l.id === id);
      top.params = JSON.parse(JSON.stringify(base.params));
      if (base.paramStates !== undefined) top.paramStates = JSON.parse(JSON.stringify(base.paramStates));
      e.generate?.(id);
      window.app.computeDisplayGeometry?.();
      window.app.ui.layerLockedIds.add(id);
      window.app.renderer.setSelection([], null);
      window.app.renderer.setTool('direct');
      window.app.renderer.draw();
      return id;
    }, s.id);
    expect(topId).not.toBe(s.id);
    await touch.tap(page, { x: s.x, y: s.y });
    await page.waitForTimeout(250);
    expect(await picked(page), 'the locked top layer swallows the tap; nothing below is picked').toBe(null);
  });

  test('TUX-034: a second finger during the hold cancels it and the pinch zooms', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setupDirectPick(page);
    await page.evaluate(() => { window.app.renderer.setTool('select'); window.__holdEv = []; ['touchhold:cancel', 'touchhold:fire'].forEach((t) => document.addEventListener(t, (e) => window.__holdEv.push([t, e.detail && e.detail.reason]))); });
    const z0 = await page.evaluate(() => window.app.renderer.scale);
    const a = { x: s.x, y: s.y, id: 0 };
    const b = { x: s.x + 40, y: s.y + 10, id: 1 };
    await touch.touchPhase(page, 'start', [a]);
    await page.waitForTimeout(120);
    await touch.touchPhase(page, 'start', [a, b]);
    for (let i = 1; i <= 8; i += 1) await touch.touchPhase(page, 'move', [a, { ...b, x: b.x + i * 12 }]);
    await touch.touchPhase(page, 'end', [a, { ...b, x: b.x + 96 }]);
    await page.waitForTimeout(700);
    const ev = await page.evaluate(() => window.__holdEv);
    expect(ev.some(([t, r]) => t === 'touchhold:cancel' && r === 'second-pointer'), JSON.stringify(ev)).toBe(true);
    expect(ev.some(([t]) => t === 'touchhold:fire')).toBe(false);
    expect(await page.locator('.canvas-ctx-menu').count(), 'no menu opened').toBe(0);
    expect(await page.evaluate(() => window.app.renderer.scale), 'the pinch zoomed').not.toBe(z0);
  });

  test('TUX-034: the canvas hold pops the ring when it fires', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setupDirectPick(page);
    await page.evaluate(() => {
      window.app.renderer.setTool('select');
      window.__pop = null;
      document.addEventListener('touchhold:fire', () => { window.__pop = !!document.querySelector('.touch-hold-ring.touch-hold-pop'); });
    });
    await touch.touchPhase(page, 'start', [{ x: s.x, y: s.y, id: 0 }]);
    await expect.poll(() => page.evaluate(() => window.__pop), { timeout: 2500 }).toBe(true);
    await touch.touchPhase(page, 'end', [{ x: s.x, y: s.y, id: 0 }]);
  });

  test('TUX-040b: the algorithm-draw menu closes on an outside pointerdown', async ({ page }) => {
    await page.evaluate(() => { const b = document.querySelector('.tool-btn[data-tool="algo-draw"]'); window.app.ui._openAlgoPicker(b, { touch: true }); });
    const picker = page.locator('#algo-draw-picker');
    await expect(picker).toBeVisible();
    const p = await page.evaluate(() => {
      const cv = document.getElementById('main-canvas'); const b = cv.getBoundingClientRect();
      const m = document.getElementById('algo-draw-picker').getBoundingClientRect();
      for (let y = Math.max(b.top, 0) + 30; y < Math.min(b.bottom, innerHeight) - 60; y += 12) {
        for (let x = Math.max(b.left, 0) + 30; x < Math.min(b.right, innerWidth) - 90; x += 12) {
          if (x > m.left - 10 && x < m.right + 10 && y > m.top - 10 && y < m.bottom + 10) continue;
          if (document.elementFromPoint(x, y) === cv) return { x, y };
        }
      }
      return null;
    });
    expect(p, 'a clear canvas point').not.toBeNull();
    await touch.drag(page, p, { x: p.x + 30, y: p.y + 20 }, { steps: 6 });
    await expect(picker).toBeHidden();
  });

  test('Q23: Document Setup opens in 2 taps from the phone hamburger sheet', async ({ page }) => {
    test.skip(!(await phoneLayout(page)), 'phone layout only');
    test.skip(await page.evaluate(() => document.body.classList.contains('phone-short')), 'short phone landscape keeps Document Setup under File');
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    const row = page.locator('#top-menubar .top-menu-docsetup-row');
    await expect(row).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('#top-menubar').firstElementChild.firstElementChild.classList.contains('top-menu-docsetup-row')), 'pinned at the top').toBe(true);
    await touch.tap(page, row);
    await page.waitForSelector('#settings-panel.open', { timeout: 5000 });
    // The File menu keeps its own entry.
    expect(await page.locator('#btn-settings').count()).toBe(1);
  });
});

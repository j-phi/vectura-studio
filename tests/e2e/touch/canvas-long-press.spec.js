const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { setupDirectPick, boot } = require('../helpers/direct-pick');
const clock = require('../helpers/app-clock');

// TUX-034 clauses 10 and 11 on the canvas: a 500 ms hold with Select, Direct Selection or Hand selects the object
// under the finger and opens the canvas menu while the finger is still down. The lift and any later finger movement
// run nothing. A move of 10 px before 500 ms cancels. Drawing tools keep their own hold meaning (no ring, no menu).
// Timer-dependent steps run on a frozen page clock (helpers/app-clock.js): the hold delay and the gaps between
// touches are app time the test names, so a slow runner cannot let the 500 ms hold fire between two steps (nightly B1).

const MENU = '.canvas-ctx-menu';
const holdEvents = (page) => page.evaluate(() => window.__holdEv.map(([t]) => t.replace('touchhold:', '')));
const pos = (page, id) => page.evaluate((lid) => { const l = window.app.engine.layers.find((x) => x.id === lid); return [l.params.posX || 0, l.params.posY || 0]; }, id);
const emptyPoint = (page) => page.evaluate(() => {
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  const r = window.app.renderer;
  const layer = window.app.engine.layers[0];
  const b = r.getSelectionBounds([layer]);
  const xs = [b.corners.nw, b.corners.ne, b.corners.sw, b.corners.se].map((c) => r.worldToScreen(c.x, c.y));
  const L = Math.min(...xs.map((p) => p.x)) + box.left; const R = Math.max(...xs.map((p) => p.x)) + box.left;
  const T = Math.min(...xs.map((p) => p.y)) + box.top; const B = Math.max(...xs.map((p) => p.y)) + box.top;
  for (let y = box.top + 20; y < Math.min(box.bottom, innerHeight) - 20; y += 10) {
    for (let x = box.left + 20; x < Math.min(box.right, innerWidth) - 20; x += 10) {
      if (x > L - 60 && x < R + 60 && y > T - 60 && y < B + 60) continue;
      if (document.elementFromPoint(x, y) === cv) return { x, y };
    }
  }
  return null;
});

test.describe('TUX-034 canvas long-press', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await clock.install(page);
    await boot(page);
    await page.evaluate(() => {
      window.__holdEv = [];
      ['touchhold:progress', 'touchhold:cancel', 'touchhold:fire'].forEach((t) => document.addEventListener(t, (e) => window.__holdEv.push([t, e.detail && e.detail.reason])));
    });
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  for (const tool of ['select', 'direct']) {
    test(`hold on an object (${tool}): ring, menu at 500 ms, object selected and unmoved, lift keeps the menu`, async ({ page }) => {
      const s = await setupDirectPick(page);
      await page.evaluate((t) => window.app.renderer.setTool(t), tool);
      const p0 = await pos(page, s.id);
      const at = { x: s.x, y: s.y };
      await clock.freeze(page);
      await touch.touchPhase(page, 'start', [{ ...at, id: 0 }]);
      // The ring lives from 150 ms to the 500 ms fire.
      await clock.advance(page, 300);
      expect(await page.locator('[data-touch-hold-progress]').count(), 'ring at 300 ms').toBeGreaterThan(0);
      expect(await page.locator(MENU).count(), 'no menu before 500 ms').toBe(0);
      expect(await holdEvents(page)).toEqual(['progress']);
      await clock.advance(page, 220);
      expect(await holdEvents(page)).toEqual(['progress', 'fire']);
      await expect(page.locator(MENU)).toBeVisible({ timeout: 2000 });
      await expect(page.locator(`${MENU} [data-ctx-id="duplicate"]`)).toBeVisible();
      expect(await page.evaluate(() => [...window.app.renderer.selectedLayerIds])).toEqual([s.id]);
      // The finger is still down: moving it must not move, pan or select anything.
      const scale0 = await page.evaluate(() => [window.app.renderer.offsetX, window.app.renderer.offsetY]);
      await touch.touchPhase(page, 'move', [{ x: at.x + 40, y: at.y + 60, id: 0 }]);
      await touch.touchPhase(page, 'end', [{ x: at.x + 40, y: at.y + 60, id: 0 }]);
      await clock.advance(page, 400);
      await clock.thaw(page);
      await expect(page.locator(MENU)).toBeVisible();
      expect(await pos(page, s.id)).toEqual(p0);
      expect(await page.evaluate(() => [window.app.renderer.offsetX, window.app.renderer.offsetY])).toEqual(scale0);
      const r = await page.locator(MENU).boundingBox();
      const vp = page.viewportSize();
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(vp.height + 0.5);
    });
  }

  test('a hold on empty canvas opens a canvas menu with Select All, and Select All selects the layer', async ({ page }) => {
    const s = await setupDirectPick(page);
    await page.evaluate(() => { window.app.renderer.setTool('select'); window.app.renderer.setSelection([], null); });
    const e = await emptyPoint(page);
    expect(e, 'an empty canvas point exists').not.toBeNull();
    await touch.touchPhase(page, 'start', [{ ...e, id: 0 }]);
    await expect(page.locator(MENU)).toBeVisible({ timeout: 2000 });
    await touch.touchPhase(page, 'end', [{ ...e, id: 0 }]);
    await page.waitForTimeout(300);
    const item = page.locator(`${MENU} [data-ctx-id="select-all"]`);
    await expect(item).toBeVisible();
    await touch.tap(page, item);
    await expect.poll(() => page.evaluate(() => [...window.app.renderer.selectedLayerIds])).toEqual([s.id]);
  });

  test('moving 15 px before 500 ms cancels the hold', async ({ page }) => {
    const s = await setupDirectPick(page);
    await page.evaluate(() => window.app.renderer.setTool('select'));
    await clock.freeze(page);
    await touch.touchPhase(page, 'start', [{ x: s.x, y: s.y, id: 0 }]);
    await clock.advance(page, 100);
    await touch.touchPhase(page, 'move', [{ x: s.x + 15, y: s.y, id: 0 }]);
    await clock.advance(page, 600);
    await touch.touchPhase(page, 'end', [{ x: s.x + 15, y: s.y, id: 0 }]);
    await clock.advance(page, 200);
    await clock.thaw(page);
    const ev = await page.evaluate(() => window.__holdEv);
    expect(ev.some(([t, r]) => t === 'touchhold:cancel' && (r === 'moved' || r === 'interaction')), JSON.stringify(ev)).toBe(true);
    expect(ev.some(([t]) => t === 'touchhold:fire'), JSON.stringify(ev)).toBe(false);
    expect(await page.locator(MENU).count()).toBe(0);
  });

  // C1 (nightly): a slow, precise finger drag must not be taken back by the hold. The first step crosses the 6 px
  // move slop but stays under the 10 px hold slop, then the finger rests past the 500 ms hold delay (a slow runner
  // or a careful user) before it continues. The move has started, so the hold must yield: no menu, the object moves.
  test('a slow drag of an unselected object past the hold delay moves it and opens no menu', async ({ page }) => {
    const s = await setupDirectPick(page);
    await page.evaluate(() => { window.app.renderer.setTool('select'); window.app.renderer.setSelection([], null); });
    const p0 = await pos(page, s.id);
    // Frozen clock: the start and the first step are adjacent in app time (a WebKit round trip can exceed 500 ms).
    await clock.freeze(page);
    await touch.touchPhase(page, 'start', [{ x: s.x, y: s.y, id: 0 }]);
    await clock.advance(page, 16);
    await touch.touchPhase(page, 'move', [{ x: s.x + 8, y: s.y, id: 0 }]);
    await clock.advance(page, 700);
    for (let i = 1; i <= 8; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: s.x + 8 + i * 4, y: s.y, id: 0 }]);
      await clock.advance(page, 16);
    }
    await touch.touchPhase(page, 'end', [{ x: s.x + 40, y: s.y, id: 0 }]);
    await clock.advance(page, 200);
    await clock.thaw(page);
    await page.waitForTimeout(100);
    expect(await page.locator(MENU).count(), 'no long-press menu during a started move').toBe(0);
    const p1 = await pos(page, s.id);
    expect(p1[0] - p0[0], 'the object moved right').toBeGreaterThan(0);
  });

  test('a drawing tool keeps its own hold: no ring, no menu', async ({ page }) => {
    const s = await setupDirectPick(page);
    await page.evaluate(() => window.app.ui.setActiveTool('pen'));
    const e = await emptyPoint(page);
    await touch.touchPhase(page, 'start', [{ ...e, id: 0 }]);
    await page.waitForTimeout(700);
    expect(await page.locator('[data-touch-hold-progress]').count()).toBe(0);
    expect(await page.locator(MENU).count()).toBe(0);
    await touch.touchPhase(page, 'end', [{ ...e, id: 0 }]);
  });

  test('a second finger during the hold cancels it and the pinch zooms', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setupDirectPick(page);
    await page.evaluate(() => window.app.renderer.setTool('select'));
    const z0 = await page.evaluate(() => window.app.renderer.scale);
    const a = { x: s.x, y: s.y, id: 0 };
    const b = { x: s.x + 40, y: s.y + 10, id: 1 };
    await clock.freeze(page);
    await touch.touchPhase(page, 'start', [a]);
    await clock.advance(page, 120);
    await touch.touchPhase(page, 'start', [a, b]);
    for (let i = 1; i <= 8; i += 1) {
      await touch.touchPhase(page, 'move', [a, { ...b, x: b.x + i * 12 }]);
      await clock.advance(page, 16);
    }
    await touch.touchPhase(page, 'end', [a, { ...b, x: b.x + 96 }]);
    await clock.advance(page, 700);
    await clock.thaw(page);
    const ev = await page.evaluate(() => window.__holdEv);
    expect(ev.some(([t, r]) => t === 'touchhold:cancel' && r === 'second-pointer'), JSON.stringify(ev)).toBe(true);
    expect(ev.some(([t]) => t === 'touchhold:fire')).toBe(false);
    expect(await page.locator('.canvas-ctx-menu').count(), 'no menu opened').toBe(0);
    expect(await page.evaluate(() => window.app.renderer.scale), 'the pinch zoomed').not.toBe(z0);
  });

  test('the canvas hold pops the ring when it fires', async ({ page }, testInfo) => {
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
});

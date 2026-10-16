const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { setupDirectPick, boot } = require('../helpers/direct-pick');

// TUX-034 clauses 10 and 11 on the canvas: a 500 ms hold with Select, Direct Selection or Hand selects the object
// under the finger and opens the canvas menu while the finger is still down. The lift and any later finger movement
// run nothing. A move of 10 px before 500 ms cancels. Drawing tools keep their own hold meaning (no ring, no menu).

const MENU = '.canvas-ctx-menu';
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
    await boot(page);
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  for (const tool of ['select', 'direct']) {
    test(`hold on an object (${tool}): ring, menu at 500 ms, object selected and unmoved, lift keeps the menu`, async ({ page }) => {
      const s = await setupDirectPick(page);
      await page.evaluate((t) => window.app.renderer.setTool(t), tool);
      const p0 = await pos(page, s.id);
      const at = { x: s.x, y: s.y };
      await touch.touchPhase(page, 'start', [{ ...at, id: 0 }]);
      await page.waitForTimeout(300);
      expect(await page.locator('[data-touch-hold-progress]').count(), 'progress ring at 300 ms').toBeGreaterThan(0);
      await expect(page.locator(MENU)).toBeVisible({ timeout: 2000 });
      await expect(page.locator(`${MENU} [data-ctx-id="duplicate"]`)).toBeVisible();
      expect(await page.evaluate(() => [...window.app.renderer.selectedLayerIds])).toEqual([s.id]);
      // The finger is still down: moving it must not move, pan or select anything.
      const scale0 = await page.evaluate(() => [window.app.renderer.offsetX, window.app.renderer.offsetY]);
      await touch.touchPhase(page, 'move', [{ x: at.x + 40, y: at.y + 60, id: 0 }]);
      await touch.touchPhase(page, 'end', [{ x: at.x + 40, y: at.y + 60, id: 0 }]);
      await page.waitForTimeout(400);
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
    await touch.touchPhase(page, 'start', [{ x: s.x, y: s.y, id: 0 }]);
    await page.waitForTimeout(100);
    await touch.touchPhase(page, 'move', [{ x: s.x + 15, y: s.y, id: 0 }]);
    await page.waitForTimeout(600);
    await touch.touchPhase(page, 'end', [{ x: s.x + 15, y: s.y, id: 0 }]);
    await page.waitForTimeout(200);
    expect(await page.locator(MENU).count()).toBe(0);
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
});

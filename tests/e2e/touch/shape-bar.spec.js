const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const clock = require('../helpers/app-clock');
const { boot } = require('../helpers/direct-pick');

// The shape context bar on touch: its grip shows only above 640 px, and a pointercancel during a shape-props slider
// drag restores the value and pushes no history.

const drawPolygon = async (page) => {
  await page.evaluate(() => { window.app.ui.setActiveTool('shape-polygon'); });
  const r = await page.evaluate(() => { const b = document.querySelector('#main-canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const from = { x: r.x + r.w * 0.45, y: r.y + r.h * 0.35 };
  // App time: a slow runner cannot stretch the draw past the 500 ms canvas hold (clock.install in beforeEach).
  await clock.frozenDrag(page, from, { x: from.x + 90, y: from.y + 90 });
  await expect.poll(() => page.evaluate(() => { const s = window.app.renderer.getShapePropsState && window.app.renderer.getShapePropsState(); return s && s.type; })).toBe('polygon');
};

test.describe('shape context bar on touch', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', (e) => errors.push(String(e))); await clock.install(page); await boot(page); });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('the shape bar keeps its grip above 640 px and drops it on phone widths only', async ({ page }) => {
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
});

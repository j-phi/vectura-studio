const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-040b: the pen menu, palette menu, layer add menu and layer-bar palette menu closed on a click only.
// A finger drag or scroll outside makes no click, so they stayed open. They now close on pointerdown (utils.onOutsidePointer).
// The menus are put in their open state through the page; the DISMISSAL is a real finger drag on the canvas.

const canvasPoint = (page) => page.evaluate(() => {
  const cv = document.getElementById('main-canvas');
  const b = cv.getBoundingClientRect();
  for (let y = Math.max(b.top, 0) + 30; y < Math.min(b.bottom, innerHeight) - 60; y += 12) {
    for (let x = Math.max(b.left, 0) + 30; x < Math.min(b.right, innerWidth) - 90; x += 12) {
      if (document.elementFromPoint(x, y) === cv) return { x, y };
    }
  }
  return null;
});

const dragOutside = async (page) => {
  const p = await canvasPoint(page);
  expect(p, 'a clear canvas point').not.toBeNull();
  await touch.drag(page, p, { x: p.x + 30, y: p.y + 20 }, { steps: 6 });
  await page.waitForTimeout(150);
};

test.describe('TUX-040b click-dismissed menus close on a finger drag outside', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.renderer));
    await page.waitForTimeout(400);
  });

  test('pen menu and palette menu', async ({ page }) => {
    await page.evaluate(() => {
      const ui = window.app.ui;
      const pen = document.createElement('div'); pen.className = 'pen-menu'; pen.id = 'zz-pen-menu'; pen.style.cssText = 'position:fixed;left:2px;top:2px;width:4px;height:4px';
      const pal = document.createElement('div'); pal.className = 'palette-menu'; pal.id = 'zz-pal-menu'; pal.style.cssText = 'position:fixed;left:2px;top:12px;width:4px;height:4px';
      document.body.append(pen, pal);
      ui.openPenMenu = pen; ui.openPaletteMenu = pal;
    });
    await dragOutside(page);
    expect(await page.evaluate(() => ({ pen: document.getElementById('zz-pen-menu').classList.contains('hidden'), pal: document.getElementById('zz-pal-menu').classList.contains('hidden'), a: window.app.ui.openPenMenu, b: window.app.ui.openPaletteMenu }))).toEqual({ pen: true, pal: true, a: null, b: null });
  });

  test('layer add menu', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const ui = window.app.ui; const m = document.getElementById('layer-add-menu');
      if (!m) return false;
      ui.layerAddOpen = true; m.classList.remove('hidden');
      return true;
    });
    expect(ok).toBe(true);
    await dragOutside(page);
    expect(await page.evaluate(() => window.app.ui.layerAddOpen)).toBe(false);
  });

  test('layer-bar palette menu', async ({ page }) => {
    const ok = await page.evaluate(() => { const m = document.getElementById('layer-bar-palette-menu'); if (!m) return false; m.classList.remove('hidden'); return true; });
    test.skip(!ok, 'no layer-bar palette menu in this layout');
    await dragOutside(page);
    expect(await page.evaluate(() => document.getElementById('layer-bar-palette-menu').classList.contains('hidden'))).toBe(true);
  });
});

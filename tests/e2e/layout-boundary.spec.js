const { test, expect } = require('@playwright/test');

// TUX-006 (ADJ-4): CSS and JS must agree at the 900 px boundary; desktop parity guard.
test.describe('layout boundary (desktop fine pointer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  });

  test('desktop guard: no touch-ui, desktop layout, 34x34 tool buttons', async ({ page }) => {
    const s = await page.evaluate(() => {
      const b = document.querySelector('#tool-bar .tool-btn:not(.hidden)');
      const r = b.getBoundingClientRect();
      return {
        touchUi: document.body.classList.contains('touch-ui'),
        mobile: document.body.classList.contains('mobile-layout'),
        layout: document.body.dataset.layout,
        w: r.width,
        h: r.height,
      };
    });
    expect(s).toEqual({ touchUi: false, mobile: false, layout: 'desktop', w: 34, h: 34 });
  });

  for (const w of [899, 900, 901]) {
    test(`${w}px: JS mobile-layout agrees with CSS --pane-collapsed-width`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 700 });
      await page.waitForTimeout(100);
      const s = await page.evaluate(() => ({
        mobile: document.body.classList.contains('mobile-layout'),
        css: getComputedStyle(document.documentElement).getPropertyValue('--pane-collapsed-width').trim(),
      }));
      expect(s.mobile, `css=${s.css}`).toBe(s.css === '40px');
    });
  }

  test('539/540 fine-pointer phone-layout toggles', async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 800 });
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout'))).toBe(false);
    await page.setViewportSize({ width: 539, height: 800 });
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout'))).toBe(true);
  });
});

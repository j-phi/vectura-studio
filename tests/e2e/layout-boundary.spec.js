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

  // TUX-007: a short desktop window with a FINE pointer keeps today's mobile-layout and gets no
  // phone-short class; only the renderer scale clamp applies there.
  test('874x402 fine pointer: no phone-short, mobile-layout kept, scale > 0', async ({ page }) => {
    await page.setViewportSize({ width: 874, height: 402 });
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({
      short: document.body.classList.contains('phone-short'),
      mobile: document.body.classList.contains('mobile-layout'),
      touchUi: document.body.classList.contains('touch-ui'),
      scale: window.app.renderer.scale,
    }));
    expect(s.short).toBe(false);
    expect(s.mobile).toBe(true);
    expect(s.touchUi).toBe(false);
    expect(Number.isFinite(s.scale) && s.scale > 0).toBe(true);
  });

  // Requirement 10: absolute expectations on each side of 900 px. Waits on data-layout, not a timer.
  const setLayout = async (page, w, h, layout) => {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction((l) => document.body.dataset.layout === l, layout);
  };
  const boundaryState = (page) => page.evaluate(() => ({
    layout: document.body.dataset.layout,
    mobile: document.body.classList.contains('mobile-layout'),
    collapsed: getComputedStyle(document.documentElement).getPropertyValue('--pane-collapsed-width').trim(),
    leftPos: getComputedStyle(document.getElementById('left-pane')).position,
  }));

  test('899px is tablet: mobile-layout, 40px collapsed width, drawer panes', async ({ page }) => {
    await setLayout(page, 899, 700, 'tablet');
    const s = await boundaryState(page);
    expect(s.mobile).toBe(true);
    expect(s.collapsed).toBe('40px');
    expect(s.leftPos).not.toBe('relative');
  });

  for (const w of [900, 901]) {
    test(`${w}px is desktop: no mobile-layout, desktop collapsed width, docked panes`, async ({ page }) => {
      await setLayout(page, w, 700, 'desktop');
      const s = await boundaryState(page);
      expect(s.mobile).toBe(false);
      expect(s.collapsed).not.toBe('40px');
      expect(s.leftPos).toBe('relative');
    });
  }

  test('wideMinWidth is the single 900 switch (guard fails if it moves)', async ({ page }) => {
    const t = await page.evaluate(() => window.Vectura.TOUCH_LAYOUT.wideMinWidth);
    expect(t).toBe(900);
  });

  test('539/540 fine-pointer phone-layout toggles', async ({ page }) => {
    await setLayout(page, 540, 800, 'tablet');
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout'))).toBe(false);
    await setLayout(page, 539, 800, 'phone');
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout'))).toBe(true);
  });

  // Reset View on a fine pointer forces desktop through the classifier so current() and the
  // event stay coherent.
  test('expandPanes routes the desktop reset through the classifier', async ({ page }) => {
    await setLayout(page, 800, 900, 'tablet');
    await page.evaluate(() => {
      window.__lcEvents = [];
      window.addEventListener('vectura:layoutchange', (e) => window.__lcEvents.push(e.detail));
    });
    await page.evaluate(() => window.app.ui.expandPanes());
    const s = await page.evaluate(() => ({
      cur: window.Vectura.LayoutClassifier.current(),
      attr: document.body.dataset.layout,
      events: window.__lcEvents,
    }));
    expect(s.cur).toBe('desktop');
    expect(s.attr).toBe('desktop');
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ from: 'tablet', to: 'desktop' });
  });
});

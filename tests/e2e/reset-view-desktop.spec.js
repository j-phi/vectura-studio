const { test, expect } = require('@playwright/test');

// TUX-009 D6: desktop Reset View keeps its contract (expand panes to 335 px, open the bottom pane).
const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await page.evaluate(() => {
    window.app.engine.addLayer('wavetable');
    window.app.render();
  });
};
const zoomIn = async (page) => {
  await page.evaluate(() => {
    const r = window.app.renderer;
    r.scale *= 5; r.offsetX -= 140; r.offsetY -= 90; r.userHasManipulated = true;
    window.app.render();
  });
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
};
const fitState = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  const c = r.canvas.getBoundingClientRect();
  const p = window.app.engine.currentProfile;
  const view = window.Vectura.VIEW || {};
  const mp = Number.isFinite(view.fitMargin) ? view.fitMargin : 60;
  const frac = Number.isFinite(view.fitMarginMaxFraction) ? view.fitMarginMaxFraction : 0.1;
  const expected = Math.min((c.width - Math.min(mp, frac * c.width)) / p.width, (c.height - Math.min(mp, frac * c.height)) / p.height);
  return { cw: c.width, ch: c.height, scale: r.scale, expected, manip: r.userHasManipulated, body: [...document.body.classList].sort() };
});
const resetByMouse = async (page) => {
  await page.locator('#btn-menu-view').click();
  await page.locator('#btn-reset-view').click();
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  await page.waitForTimeout(150);
};

test.describe('TUX-009 desktop Reset View', () => {
  test('1600x1000 expands panes and fits the settled canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await boot(page);
    await page.locator('#btn-pane-toggle-left').click();
    await page.locator('#btn-pane-toggle-bottom').click().catch(() => {});
    await zoomIn(page);
    await resetByMouse(page);
    const s = await page.evaluate(() => ({
      l: /collapsed/.test(document.getElementById('left-pane').className),
      r: /collapsed/.test(document.getElementById('right-pane').className),
      b: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'),
      vl: document.documentElement.style.getPropertyValue('--pane-left-width'),
      vr: document.documentElement.style.getPropertyValue('--pane-right-width'),
    }));
    expect(s.l, 'left expanded').toBe(false);
    expect(s.r, 'right expanded').toBe(false);
    expect(s.b, 'bottom pane open').toBe(false);
    expect(s.vl).toBe('335px');
    expect(s.vr).toBe('335px');
    const f = await fitState(page);
    expect(Math.abs(f.scale - f.expected) / f.expected, `scale ${f.scale} vs ${f.expected}`).toBeLessThanOrEqual(0.01);
    expect(f.manip).toBe(false);
  });

  test('800x700 fine pointer keeps the pre-TUX-009 overlay Reset View', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await boot(page);
    await zoomIn(page);
    const before = await fitState(page);
    expect(before.body).toContain('mobile-layout');
    // A fine pointer is not a touch UI: expandPanes still runs (returns true) and sets the 335 px vars.
    const ran = await page.evaluate(() => window.app.ui.expandPanes());
    expect(ran, 'expandPanes runs for a fine pointer at 800 px').toBe(true);
    const vars = await page.evaluate(() => ({
      l: document.documentElement.style.getPropertyValue('--pane-left-width'),
      r: document.documentElement.style.getPropertyValue('--pane-right-width'),
    }));
    expect(vars).toEqual({ l: '335px', r: '335px' });
    await resetByMouse(page);
    const f = await fitState(page);
    expect(f.body, 'layout classes stripped as before TUX-009').not.toContain('mobile-layout');
    expect(f.cw).toBeGreaterThan(0);
    expect(f.ch).toBeGreaterThan(0);
    expect(f.scale).toBeGreaterThan(0);
    expect(Math.abs(f.scale - f.expected) / f.expected, `scale ${f.scale} vs ${f.expected}`).toBeLessThanOrEqual(0.01);
  });
});

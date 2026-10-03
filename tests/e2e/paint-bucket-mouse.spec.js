const { test, expect } = require('@playwright/test');

// TUX-022 D6: desktop (mouse) paint bucket is unchanged. The pour happens on mousedown, before
// mouseup. No Scope chips, and the context bar does not change for a fine pointer.
test('mouse: Fill pours on down and shows no touch chips', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
  const pt = await page.evaluate(() => {
    const app = window.app;
    const e = app.engine;
    e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
    const id = e.addLayer('rings');
    e.generate?.(id);
    app.computeDisplayGeometry?.();
    app.renderer.setTool('fill');
    app.renderer.draw();
    const r = app.renderer;
    const box = document.querySelector('#main-canvas').getBoundingClientRect();
    const prof = e.currentProfile;
    return { x: box.left + r.offsetX + (prof.width / 2 + 12) * r.scale, y: box.top + r.offsetY + (prof.height / 2) * r.scale };
  });
  const fills = () => page.evaluate(() => window.app.engine.layers.reduce((n, l) => n + ((l.fills && l.fills.length) || 0), 0));
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(150);
  expect(await page.locator('[data-fill-scope]').count()).toBe(0);
  expect(await page.evaluate(() => !!document.querySelector('.ctxbar.ctxbar--fill'))).toBe(false);
  await page.screenshot({ path: '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-022/desktop-fill-hover.png' });
  const before = await fills();
  await page.mouse.down();
  expect(await fills()).toBe(before + 1);
  await page.mouse.up();
  expect(await fills()).toBe(before + 1);
  expect(await page.evaluate(() => window.app.renderer.paintBucketScopeOffset)).toBe(0);
});

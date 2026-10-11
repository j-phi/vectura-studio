const { test, expect } = require('@playwright/test');

test('core browser journey generates geometry, draws canvas, updates control and stats', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#main-canvas')).toBeVisible();
  await page.click('#btn-add-layer');
  await page.click('.lvl-add-item[data-add="algo-parent"]');
  await expect.poll(async () => Number((await page.locator('#stat-lines').innerText()).replace(/[^0-9.-]/g, ''))).toBeGreaterThan(0);

  const initial = await page.evaluate(() => ({
    type: window.app?.engine?.getActiveLayer?.()?.type,
    paths: window.app?.engine?.getActiveLayer?.()?.paths?.length || 0,
  }));
  expect(initial.type).toBeTruthy();
  expect(initial.paths).toBeGreaterThan(0);

  const changedPixelsWithGeometry = await page.evaluate(() => {
    const app = window.app;
    const layer = app?.engine?.getActiveLayer?.();
    const renderer = app?.renderer;
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas?.getContext('2d');
    if (!layer || !renderer || !ctx || !canvas.width || !canvas.height) return 0;

    const readPixels = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    renderer.draw();
    const withGeometry = readPixels();
    const originalPaths = layer.paths;
    const originalEffectivePaths = layer.effectivePaths;
    try {
      // Negative control: keep the real canvas/background draw, but suppress the
      // active layer geometry. A background-only render must differ from the
      // generated render, so an opaque page fill cannot satisfy this assertion.
      layer.paths = [];
      layer.effectivePaths = [];
      renderer.draw();
      const withoutGeometry = readPixels();
      let changed = 0;
      for (let i = 0; i < withGeometry.length; i += 4) {
        if (withGeometry[i] !== withoutGeometry[i] ||
            withGeometry[i + 1] !== withoutGeometry[i + 1] ||
            withGeometry[i + 2] !== withoutGeometry[i + 2]) changed += 1;
      }
      return changed;
    } finally {
      layer.paths = originalPaths;
      layer.effectivePaths = originalEffectivePaths;
      renderer.draw();
    }
  });
  expect(changedPixelsWithGeometry).toBeGreaterThan(0);

  const control = page.locator('#generator-module');
  const options = await control.locator('option').evaluateAll((els) => els.map((el) => el.value));
  const nextType = options.find((type) => type && type !== initial.type);
  expect(nextType).toBeTruthy();
  await page.evaluate(() => {
    window.__feedbackStatsUpdates = 0;
    window.__feedbackStatsObserver = new MutationObserver(() => { window.__feedbackStatsUpdates += 1; });
    window.__feedbackStatsObserver.observe(document.getElementById('stat-lines'), { childList: true, characterData: true, subtree: true });
  });
  await control.selectOption(nextType);
  await expect.poll(() => page.evaluate(() => window.app?.engine?.getActiveLayer?.()?.type)).toBe(nextType);
  await expect.poll(() => page.evaluate(() => window.__feedbackStatsUpdates)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__feedbackStatsObserver.disconnect(); delete window.__feedbackStatsObserver; delete window.__feedbackStatsUpdates; });
  await expect.poll(async () => Number((await page.locator('#stat-lines').innerText()).replace(/[^0-9.-]/g, ''))).toBeGreaterThan(0);
});

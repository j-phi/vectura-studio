const { test, expect } = require('@playwright/test');

// Regression: selecting "Image" as a wavetable noise type threw
// "ReferenceError: IMAGE_NOISE_DEFAULT_AMPLITUDE is not defined" (noise-rack-panel.js).
test('wavetable noise type can be switched to Image without a page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.app || window.Vectura?.app));
  await page.evaluate(() => {
    const app = window.app || window.Vectura.app;
    app.engine.activeLayerId = app.engine.addLayer('wavetable');
    app.ui?.renderLayers?.();
    app.ui?.buildControls?.();
  });
  const select = page.locator('select:has(option[value="image"])').first();
  await select.selectOption('image');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  const type = await page.evaluate(() => {
    const app = window.app || window.Vectura.app;
    return app.engine.getActiveLayer?.()?.params.noises?.[0]?.type;
  });
  expect(type).toBe('image');
});

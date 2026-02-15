const { test, expect } = require('@playwright/test');

test.describe('Visual snapshots', () => {
  test.skip(!process.env.ENABLE_SCREENSHOT_VISUALS, 'Set ENABLE_SCREENSHOT_VISUALS=1 to run screenshot snapshots.');

  test('main viewport shell snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toHaveScreenshot('main-shell.png', {
      maxDiffPixelRatio: 0.03,
    });
  });
});

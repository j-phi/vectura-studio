const { test, expect } = require('@playwright/test');
const { setupDirectPick, picked, boot } = require('./helpers/direct-pick');

// TUX-024 mouse parity: the Direct pick keeps its 2.5 px mouse reach, and locked geometry selects nothing.
test.describe('TUX-024 Direct pick by mouse', () => {
  test('a click 10 px off a stroke selects nothing; on it selects; locked selects nothing', async ({ page }) => {
    await boot(page);
    const s = await setupDirectPick(page);
    await page.mouse.click(s.x, s.y - 10);
    await page.waitForTimeout(250);
    expect(await picked(page)).toBe(null);
    await page.mouse.click(s.x, s.y);
    await expect.poll(() => picked(page)).toBe(s.id);
    await page.evaluate((id) => {
      const r = window.app.renderer;
      r.directSelection = null; r.selectedLayerIds = new Set(); r.selectedLayerId = null;
      window.app.ui.layerLockedIds.add(id);
    }, s.id);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(250);
    expect(await picked(page)).toBe(null);
  });
});

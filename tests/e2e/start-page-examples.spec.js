const { test, expect } = require('@playwright/test');
const { resetStorage } = require('./helpers/start-page');

// First run: five example plates fill the Plates section until the user has a work of their own.
const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};

test.describe('Start Page example plates', () => {
  test('first run shows five marked examples; Open makes a new document in the shown colors; a saved work replaces them', async ({ page }) => {
    await resetStorage(page);
    await boot(page);
    await page.evaluate(() => window.app.startPage.show());
    const plates = page.locator('#sp-plates .sp-pl[data-example]');
    await expect(plates).toHaveCount(5);
    await expect(page.locator('#sp-plates .sp-pl-empty')).toBeHidden();
    await expect(page.locator('#sp-plates .sp-pl-explain')).toContainText('These five are examples');
    await expect(page.locator('#sp-plates [data-act="edit"]')).toHaveCount(0);
    await expect(page.locator('#sp-pl-arrange')).toBeHidden();

    // the "drag it" copy is only where a live 3D model (.vorbit) is mounted
    for (let i = 0; i < 5; i++) {
      const pl = plates.nth(i);
      await pl.scrollIntoViewIfNeeded();
      await expect(pl.locator('.spl').first()).toBeVisible({ timeout: 20000 });
      const live3d = i >= 3; // Coiled Sphere and High Sierra
      await expect(pl.locator('.vorbit')).toHaveCount(live3d ? 1 : 0, { timeout: 20000 });
      await expect(pl.locator('.spl-note, .spl-wrap-txt').filter({ hasText: 'drag it to turn it' })).toHaveCount(live3d ? 1 : 0);
    }

    await expect(page.locator('#sp-plates .sp-pl-example')).toHaveCount(5); // plates mount lazily; all are built after the walk above
    const first = plates.first();
    await first.scrollIntoViewIfNeeded();
    await expect(first.locator('.spl').first()).toBeVisible({ timeout: 20000 });
    const paper = await first.evaluate((e) => e.dataset.spPaper);
    await first.getByRole('button', { name: 'Open Old Growth Oak', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.app.documentName)).toBe('Old Growth Oak (colorway)');
    const doc = await page.evaluate(() => ({ paper: window.Vectura.SETTINGS.paper.color, recent: window.app.currentRecentId, layers: window.app.engine.layers.length }));
    expect(doc.paper.toLowerCase()).toBe(paper.toLowerCase());
    expect(doc.recent).toBeNull();
    expect(doc.layers).toBeGreaterThan(0);

    // saving a work replaces the examples with the user's own plate
    await page.evaluate(async () => { await window.app.recents.record({ name: 'mine.vectura', source: 'save' }); window.app.startPage.show(); });
    await expect(page.locator('#sp-plates .sp-pl[data-example]')).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('#sp-plates .sp-pl')).toHaveCount(1);
    await expect(page.locator('#sp-plates [data-act="edit"]').first()).toBeAttached({ timeout: 15000 });
  });
});

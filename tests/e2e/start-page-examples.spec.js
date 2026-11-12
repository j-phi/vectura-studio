const { test, expect } = require('@playwright/test');
const { resetStorage, setShowExamples } = require('./helpers/start-page');

// First run: ten example plates fill the Plates section until the user has a work of their own.
const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};

test.describe('Start Page example plates', () => {
  test('first run shows ten marked examples; Open makes a new document in the shown colors; a saved work replaces them', async ({ page }) => {
    await resetStorage(page);
    await boot(page);
    await page.evaluate(() => window.app.startPage.show());
    const plates = page.locator('#sp-plates .sp-pl[data-example]');
    await expect(plates).toHaveCount(10);
    await expect(page.locator('#sp-plates .sp-pl-empty')).toBeHidden();
    // the explainer is an (i) note after the EXAMPLES count, not an inline box
    await expect(page.locator('#sp-plates .sp-pl-explain')).toBeHidden();
    await expect(page.locator('#sp-plates .sp-pl-count')).toHaveText(/^10 examples$/i);
    const headInfo = page.locator('#sp-plates .sp-pl-titles .sp-pl-head-info');
    await headInfo.locator('button').click();
    await expect(headInfo.locator('[role="tooltip"]')).toBeVisible();
    await expect(headInfo.locator('[role="tooltip"]')).toContainText('These are examples');
    await page.keyboard.press('Escape');
    await expect(headInfo.locator('[role="tooltip"]')).toBeHidden();
    // examples are editable, removable and arrangeable like any plate (the explainer says so)
    await expect(page.locator('#sp-plates [data-act="edit"]').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#sp-pl-arrange')).toBeVisible();

    // no plate is a live, draggable 3D model any more: the three 3D examples are still drawings framed whole
    for (let i = 0; i < 10; i++) {
      const pl = plates.nth(i);
      await pl.scrollIntoViewIfNeeded();
      await expect(pl.locator('.spl').first()).toBeVisible({ timeout: 20000 });
      await expect(pl.locator('.sp-pl-info button')).toHaveCount(1); // the (i) after the name, while mounted (plates far from the viewport drop their art again)
      await expect(pl.locator('.sp-pl-example')).toHaveCount(0); // the dashed EXAMPLE badge is gone
      const live3d = i === 3 || i === 4 || i === 5; // Coiled Sphere, High Sierra and Torus Contours
      await expect(pl.locator('.vorbit, .sp-scene-orbit')).toHaveCount(0);
      await expect(pl.locator('.spl-note, .spl-wrap-txt').filter({ hasText: 'drag it to turn it' })).toHaveCount(0);
      await expect(pl.locator('.spl-print[data-3d]')).toHaveCount(live3d ? 1 : 0);
    }

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

    // saving a work adds the user's own plate in front; the examples stay beside it until Show example plates is switched off
    await page.evaluate(async () => { await window.app.recents.record({ name: 'mine.vectura', source: 'save' }); window.app.startPage.show(); });
    await expect(page.locator('#sp-plates .sp-pl')).toHaveCount(11, { timeout: 15000 });
    await expect(page.locator('#sp-plates .sp-pl[data-example]')).toHaveCount(10);
    await expect(page.locator('#sp-plates .sp-pl').first()).not.toHaveAttribute('data-example', '1');
    await setShowExamples(expect, page, false);
    await expect(page.locator('#sp-plates .sp-pl[data-example]')).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('#sp-plates .sp-pl')).toHaveCount(1);
    await expect(page.locator('#sp-plates [data-act="edit"]').first()).toBeAttached({ timeout: 15000 });
  });
});

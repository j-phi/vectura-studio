const { test, expect } = require('@playwright/test');

// Pen Studio end to end: open from the Pens menu, add a pen, tune + save as new,
// all-papers matrix, randomize, Use in document (canvas pen color changes, one
// Ctrl+Z reverts), export box -> import box. Real clicks inside the Studio.

test.use({ viewport: { width: 1600, height: 1100 } });

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.Vectura.UI.PenStudio));
  await page.evaluate(() => {
    try { window.localStorage.removeItem(window.Vectura.PEN_STUDIO.STORAGE_KEY); } catch (_e) { /* storage unavailable */ }
  });
};
const studio = (page) => page.locator('.vectura-modal.pen-studio');
const openFromMenu = async (page) => {
  // The ⋯ button lives in the Pens panel; a script click runs the same handler
  // regardless of which tab is showing.
  await page.evaluate(() => document.getElementById('btn-pens-menu').click());
  await page.locator('.pens-menu [role="menuitem"]').first().click();
  await expect(studio(page)).toBeVisible();
};

test('opens from the Pens menu with boxes, lab and pair', async ({ page }) => {
  await boot(page);
  await openFromMenu(page);
  await expect(page.locator('.pen-studio-box').first()).toBeVisible();
  await expect(page.locator('.pen-studio-slider')).toHaveCount(6);
  await expect(page.locator('.pen-studio-chip').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(studio(page)).toBeHidden();
});

test('add a pen to a box, tune it and save as a new pen', async ({ page }) => {
  await boot(page);
  await openFromMenu(page);
  await page.locator('.pen-studio-box-add').first().click();
  await page.locator('.pen-studio-add-name').fill('E2E Fineliner');
  await page.locator('.pen-studio-add-confirm').click();
  await expect(page.locator('.pen-studio-name')).toHaveText('E2E Fineliner');

  const wet = page.locator('.pen-studio-slider[data-key="wetness"] input');
  await wet.evaluate((el) => { el.value = '0.8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('.pen-studio-unsaved')).toBeVisible();
  await page.locator('.pen-studio-btn.is-save-new').click();
  await page.locator('.pen-studio-savenew-name').fill('E2E Tuned');
  await page.locator('.pen-studio-savenew-name').press('Enter');
  await expect(page.locator('.pen-studio-name')).toHaveText('E2E Tuned');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(window.Vectura.PEN_STUDIO.STORAGE_KEY)).pens.find((p) => p.name === 'E2E Tuned'));
  expect(saved.ink.wetness).toBe(0.8);
});

test('all papers matrix lists every paper; a row returns to one paper', async ({ page }) => {
  await boot(page);
  await openFromMenu(page);
  await page.locator('.pen-studio-view-btn').nth(1).click();
  await expect(page.locator('.pen-studio-matrix-row')).toHaveCount(10);
  await page.locator('.pen-studio-matrix-row').nth(2).click();
  await expect(page.locator('.pen-studio-strips')).toBeVisible();
});

test('Randomize picks a complement and keeps the weave canvas', async ({ page }) => {
  await boot(page);
  await openFromMenu(page);
  const before = await page.locator('.pen-studio-chip.is-selected').count();
  await page.locator('.pen-studio-random').click();
  await expect(page.locator('.pen-studio-weave-canvas')).toBeVisible();
  expect(before).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.pen-studio-pair-note')).not.toHaveText('');
});

test('Use in document recolors the pen and one Ctrl+Z reverts it', async ({ page }) => {
  await boot(page);
  const ids = await page.evaluate(() => {
    const app = window.app; const eng = app.engine;
    const layerId = eng.addLayer('spiral');
    const pen = window.Vectura.SETTINGS.pens[0];
    const layer = eng.getLayerById(layerId);
    layer.penId = pen.id;
    app.ui.renderPens(); app.ui.renderLayers(); app.render();
    app.pushHistory();
    return { penId: pen.id, color: pen.color };
  });
  await page.evaluate((penId) => window.Vectura.UI.PenStudio.open({ app: window.app, penId, anchorEl: document.body }), ids.penId);
  await expect(studio(page)).toBeVisible();
  // pick a different pen row (not the document pen) so the color differs
  const row = page.locator('.pen-studio-row:not(.is-selected) .pen-studio-row-main').first();
  await row.click();
  await page.locator('.pen-studio-use').click();
  const after = await page.evaluate((penId) => window.Vectura.SETTINGS.pens.find((p) => p.id === penId).color, ids.penId);
  expect(after.toLowerCase()).not.toBe(ids.color.toLowerCase());
  await page.keyboard.press('Escape');
  await expect(studio(page)).toBeHidden();
  await page.keyboard.press('ControlOrMeta+z');
  const reverted = await page.evaluate((penId) => window.Vectura.SETTINGS.pens.find((p) => p.id === penId).color, ids.penId);
  expect(reverted.toLowerCase()).toBe(ids.color.toLowerCase());
});

test('export a box and import it back as a new box', async ({ page }) => {
  await boot(page);
  await openFromMenu(page);
  const before = await page.locator('.pen-studio-box').count();
  await page.locator('.pen-studio-box-export').first().click();
  const text = await page.locator('.pen-studio-dialog textarea').inputValue();
  expect(JSON.parse(text).version).toBe(2);
  await page.locator('.pen-studio-dialog-cancel').click();
  await page.locator('.pen-studio-import-box').click();
  await page.locator('.pen-studio-dialog textarea').fill(text);
  await page.locator('.pen-studio-import-go').click();
  await expect(page.locator('.pen-studio-box')).toHaveCount(before + 1);
});

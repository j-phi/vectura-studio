const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-038 req 3 (regression, VERIFY-FIRST): a finger can rename without a double-click.
//   1  a Scene 3D object: tap its row, tap the Name field (.vs3-name-input), type, Enter.
//   2  a layer: long-press the row (TUX-034), tap Rename in the menu, type, Enter.
// Setup (layers, pane open) goes through page.evaluate; every tested action is a finger.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};
const openPane = async (page, side) => {
  await page.evaluate((s) => window.Vectura.UI.Workspace.paneState.open(s), side);
  await page.waitForFunction((s) => document.getElementById(`${s}-pane`).getBoundingClientRect().width > 100, side);
  await sleep(500);
};
const nameOf = (page, id) => page.evaluate((i) => window.app.engine.getLayerById(i).name, id);

test('1: a Scene 3D object renames through its Name field', async ({ page }) => {
  await boot(page);
  const { childId } = await page.evaluate(() => {
    const eng = window.app.engine;
    const sceneId = eng.addLayer('scene3d');
    const child = eng.layers.find((l) => l.parentId === sceneId);
    // Select each child once so the panel adds its default fields (see gestures.spec.js).
    eng.layers.filter((l) => l.parentId === sceneId).forEach((c) => window.app.renderer.setSelection([c.id], c.id));
    window.app.renderer.setSelection([sceneId], sceneId);
    eng.activeLayerId = sceneId;
    window.app.ui.renderLayers();
    return { childId: child.id };
  });
  await openPane(page, 'right');
  const row = page.locator(`#layer-list [data-lvl-id="${childId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await touch.tap(page, row.locator('.lvl-name, .lvl-grp-name').first());
  await openPane(page, 'left'); // setup: the object page lives in the Generator pane
  const input = page.locator('#left-panel-content .vs3-name-input').first();
  await input.scrollIntoViewIfNeeded();
  await touch.tap(page, input);
  await input.fill('Finger Renamed');
  await page.keyboard.press('Enter');
  await expect.poll(() => nameOf(page, childId)).toBe('Finger Renamed');
});

test('2: a layer renames through the long-press menu', async ({ page }) => {
  await boot(page);
  const id = await page.evaluate(() => {
    const eng = window.app.engine;
    const lid = eng.addLayer('rings');
    eng.activeLayerId = lid;
    window.app.renderer.setSelection([lid], lid);
    window.app.ui.renderLayers();
    return lid;
  });
  await openPane(page, 'right');
  const row = page.locator(`#layer-list [data-lvl-id="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await touch.longPress(page, row.locator('.lvl-name'), 700);
  const item = page.locator('.menu-dropdown.is-context-menu.open .menu-entry[data-key="rename"]');
  await expect(item).toBeVisible();
  await touch.tap(page, item);
  const input = page.locator('#layer-list .lvl-ren-inp');
  await expect(input).toBeVisible();
  await input.fill('Held Renamed');
  await page.keyboard.press('Enter');
  await expect.poll(() => nameOf(page, id)).toBe('Held Renamed');
});

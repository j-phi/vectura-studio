const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-038 req 4: the pendula Motion Rack drawn-curve editor adds and removes points by finger.
// Tap within 20 px of a point (22 px hit radius on a touch screen), then use the 44 px
// "Remove point" / "Add point" buttons. No dblclick, no right-click, no native contextmenu
// (WebKit does not fire one on touch). Setup (layer, pane) goes through page.evaluate.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POINTS = [{ x: 0, y: -1 }, { x: 0.25, y: 0 }, { x: 0.5, y: 1 }, { x: 0.75, y: 0 }, { x: 1, y: -1 }];

const count = (page, id) => page.evaluate((i) => window.app.engine.getLayerById(i).params.motion.sources[0].points.length, id);

test('tap a point, then Remove point and Add point change the point count', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  const id = await page.evaluate((points) => {
    const eng = window.app.engine;
    const lid = eng.addLayer('pendula');
    const layer = eng.getLayerById(lid);
    layer.params.motion = { sources: [{ id: 'lfo-t', enabled: true, shape: 'drawn', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi', points }], edges: [] };
    eng.activeLayerId = lid;
    window.app.renderer.setSelection([lid], lid);
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    return lid;
  }, POINTS);
  await page.evaluate(() => window.Vectura.UI.Workspace.paneState.open('left'));
  await page.waitForFunction(() => document.getElementById('left-pane').getBoundingClientRect().width > 100);
  await sleep(500);

  const canvas = page.locator('.motion-drawn-canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const actions = page.locator('.motion-point-actions');
  await expect(actions, 'buttons hidden until a point is selected').toBeHidden();

  // Tap 15 px beside the point at x 0.25 (canvas px 57, 32 on the 220 x 64 grid).
  const tapNear = async (px, py) => {
    const b = await canvas.boundingBox();
    await touch.tap(page, { x: b.x + (px / 220) * b.width, y: b.y + (py / 64) * b.height });
  };
  expect(await count(page, id)).toBe(5);
  await tapNear(57 + 15, 32);
  const remove = page.locator('.motion-point-remove');
  const add = page.locator('.motion-point-add');
  await expect(remove).toBeVisible();
  await expect(add).toBeVisible();
  for (const btn of [remove, add]) {
    const b = await btn.boundingBox();
    expect(b.width, 'button width').toBeGreaterThanOrEqual(44);
    expect(b.height, 'button height').toBeGreaterThanOrEqual(44);
  }
  await touch.tap(page, remove);
  await expect.poll(() => count(page, id)).toBe(4);
  // The selection moved to the previous point (an endpoint): Add stays, Remove is disabled.
  await expect(add).toBeVisible();
  await expect(page.locator('.motion-point-remove')).toBeDisabled();
  await touch.tap(page, add);
  await expect.poll(() => count(page, id)).toBe(5);
  // A tap on empty space clears the selection.
  await tapNear(110, 60);
  await expect(page.locator('.motion-point-actions')).toBeHidden();
});

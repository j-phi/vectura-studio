const { test, expect } = require('@playwright/test');

/*
 * e2e — Ground → Size controls (Width (X) / Depth (Z), proportion lock, Reset,
 * Fill frame), driven through the real Layers-panel selection and panel DOM.
 */

const groundParams = (page) => page.evaluate(() => {
  const l = window.app.engine.layers.find((x) => x.type === 'sceneGround3d');
  return { x: l.params.scaleX, z: l.params.scaleZ, lock: l.params.scaleLock };
});

const openGroundPanel = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine);
  await page.evaluate(() => {
    window.app.engine.addSceneTree();
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    window.app.regen();
  });
  await page.locator('#layer-list >> text=Ground').first().click();
  await expect(page.locator('.vs3-linked')).toBeVisible();
};

test.describe('Ground size controls', () => {
  test('locked drag scales width and depth together', async ({ page }) => {
    await openGroundPanel(page);
    await expect(page.locator('.vs3-link-btn')).toHaveAttribute('aria-pressed', 'true');
    const box = await page.locator('.vs3-linked input[type=range]').nth(0).boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const g = await groundParams(page);
    expect(g.x).toBeGreaterThan(1.5);
    expect(g.z).toBeCloseTo(g.x, 6);
    const chips = await page.locator('.vs3-linked .slider-val').evaluateAll((n) => n.map((c) => c.value));
    expect(chips[0]).toBe(chips[1]);
  });

  test('unlocked: typing a depth leaves width alone and lands exactly', async ({ page }) => {
    await openGroundPanel(page);
    await page.locator('.vs3-link-btn').click();
    await expect(page.locator('.vs3-link-btn')).toHaveAttribute('aria-pressed', 'false');
    const chip = page.locator('.vs3-linked .slider-val').nth(1);
    await chip.fill('3');
    await chip.press('Enter');
    const g = await groundParams(page);
    expect(g.lock).toBe(false);
    expect(g.x).toBe(1);
    expect(g.z).toBeCloseTo(3, 3);
  });

  test('Fill frame grows the floor past the artboard; Reset and undo restore it', async ({ page }) => {
    await openGroundPanel(page);
    await page.locator('.vs3-size-action', { hasText: 'Fill frame' }).click();
    const filled = await groundParams(page);
    expect(filled.x).toBeGreaterThan(1);
    expect(filled.z).toBeCloseTo(filled.x, 6);
    await page.evaluate(() => window.app.undo());
    const undone = await groundParams(page);
    expect(undone.x).toBe(1);
    await page.evaluate(() => window.app.redo());
    await page.locator('.vs3-size-action', { hasText: 'Reset' }).click();
    const reset = await groundParams(page);
    expect(reset.x).toBe(1);
    expect(reset.z).toBe(1);
  });
});

const { test, expect } = require('@playwright/test');

/*
 * e2e — H3: the Light inspector's front/behind readout follows the light angle live, and the Shading slider's mid-tones
 * note is a subtle .is-info line (not the red caveat).
 */
const open = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  const gid = await page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const id = eng.addSceneTree();
    app.regen();
    window.__gid = id;
    app.renderer.selectedLayerIds = new Set([id]); app.renderer.selectedLayerId = id;
    app.ui.renderLayers();
    return id;
  });
  await page.locator(`#layer-list [data-layer-id="${gid}"]`).first().click({ force: true });
  const sceneTab = page.locator('.tab-btn[data-value="scene"]').first();
  if (await sceneTab.count()) await sceneTab.click();
};

const selectSun = async (page) => {
  const id = await page.evaluate(() => {
    const app = window.app; const l = app.engine.layers.find((x) => x.type === 'sceneLight3d');
    window.__sun = l.id;
    app.renderer.selectedLayerIds = new Set([l.id]); app.renderer.selectedLayerId = l.id;
    app.ui.renderLayers();
    return l.id;
  });
  await page.locator(`#layer-list [data-layer-id="${id}"]`).first().click({ force: true });
};

test('Light inspector: key-light front/behind readout updates live with azimuth', async ({ page }) => {
  await open(page);
  await selectSun(page);
  const out = page.locator('[data-control="lightFacing"]').first();
  await expect(out).toBeVisible();
  await expect(out).toHaveAttribute('data-facing', 'front');
  await expect(out).toHaveAttribute('aria-label', /in front/i);
  const az = page.locator('input.ctrl-slider[aria-label="Light azimuth (degrees)"]').first();
  await az.fill('150');
  await az.dispatchEvent('change');
  await expect(out).toHaveAttribute('data-facing', 'behind');
  await expect(out).toContainText(/behind/i);
});

test('Shading mid-tones note is an info line, not a caveat', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const o = window.app.engine.layers.find((x) => x.type === 'object3d');
    o.params.style.params.toneLaw = 'mkDotScreen';
    window.app.regen();
    window.app.ui.renderLayers();
  });
  await page.locator(`#layer-list [data-layer-id="${await page.evaluate(() => window.__gid)}"]`).first().click({ force: true });
  const note = page.locator('[data-control="toneDarknessMidtones"]').first();
  await expect(note).toHaveClass(/is-info/);
  await expect(note).not.toHaveClass(/is-caveat/);
});

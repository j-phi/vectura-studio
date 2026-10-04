const { test, expect } = require('@playwright/test');

// TUX-034a D6: fine-pointer (mouse) behaviour is unchanged. Desktop Chromium, 1600x1000.
const setup = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const { engine, ui } = window.app;
    engine.addLayer('spiral');
    engine.addLayer('flowfield');
    window.__polyId = engine.addLayer('polyhedron');
    ui.renderLayers();
    window.__th = [];
    ['touchhold:progress', 'touchhold:fire', 'touchhold:cancel'].forEach((t) => document.addEventListener(t, () => window.__th.push(t)));
  });
};
const card = (page) => page.locator('#layer-list [data-layer-id]').first();

test.describe('context menus: mouse parity (TUX-034a)', () => {
  test('right-click on a layer card opens the layer menu', async ({ page }) => {
    await setup(page);
    await card(page).locator('.lvl-name').click({ button: 'right' });
    await expect(page.locator('.menu-dropdown.open')).toBeVisible();
    await expect(page.locator('.menu-dropdown.open .menu-entry[data-key="duplicate"]')).toBeVisible();
  });

  test('right-click on the canvas opens the canvas menu', async ({ page }) => {
    await setup(page);
    await page.locator('#main-canvas').click({ button: 'right', position: { x: 300, y: 300 } });
    await expect(page.locator('.canvas-ctx-menu')).toBeVisible();
  });

  test('a 600 ms mouse press-hold opens no menu and shows no ring; HTML5 dragstart still fires', async ({ page }) => {
    await setup(page);
    const box = await card(page).locator('.lvl-name').boundingBox();
    await page.evaluate(() => {
      window.__drag = 0;
      document.getElementById('layer-list').addEventListener('dragstart', () => { window.__drag += 1; }, true);
    });
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    expect(await page.locator('[data-touch-hold-progress]').count()).toBe(0);
    expect(await page.locator('.menu-dropdown.open').count()).toBe(0);
    expect(await page.evaluate(() => window.__th)).toEqual([]);
    await page.mouse.up();
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.__drag)).toBeGreaterThan(0);
  });

  test('the card ⋯ button is not rendered under a fine pointer', async ({ page }) => {
    await setup(page);
    // Desktop rows keep the inline action strip; the touch-only grip and ⋯ are absent.
    expect(await page.locator('#layer-list .lvl-more').count()).toBe(0);
    expect(await page.locator('#layer-list .lvl-grip').count()).toBe(0);
    const dir = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-034';
    require('fs').mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/desktop-1600.png` });
  });
});

// TUX-040: desktop parity for outside-dismiss of the layer filter menu.
test.describe('layer filter menu outside dismiss: mouse parity (TUX-040)', () => {
  const open = async (page) => {
    await setup(page);
    await page.locator('#layer-filter-btn').click();
    await expect(page.locator('.menu-dropdown.open')).toBeVisible();
  };
  test('a mouse click on the canvas closes the menu', async ({ page }) => {
    await open(page);
    await page.mouse.click(900, 600);
    await expect(page.locator('.menu-dropdown.open')).toHaveCount(0);
  });
  test('a mouse drag on the canvas closes the menu', async ({ page }) => {
    await open(page);
    await page.mouse.move(900, 600);
    await page.mouse.down();
    await page.mouse.move(960, 640, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.menu-dropdown.open')).toHaveCount(0);
  });
  test('mouse down on a menu entry does not close it before selection', async ({ page }) => {
    await open(page);
    const box = await page.locator('.menu-dropdown.open .menu-entry[data-key="spiral"]').boundingBox();
    await page.mouse.move(box.x + 10, box.y + 5);
    await page.mouse.down();
    await expect(page.locator('.menu-dropdown.open')).toBeVisible();
    await page.mouse.up();
    expect(await page.evaluate(() => window.app.ui.layerFilterType)).toBe('spiral');
  });
});

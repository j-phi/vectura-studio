const { test, expect } = require('@playwright/test');

// TUX-014 D6: the mouse path of the rail sub-menus is unchanged (desktop-chromium, fine pointer).
test.describe('TUX-014 desktop mouse sub-menus', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => app.ui.setActiveTool('select'));
  });
  const open = (page) => page.evaluate(() => document.querySelector('.tool-submenu[data-menu="shape"]').classList.contains('open'));

  test('click activates the tool and leaves no menu stuck open; rows stay icon-only', async ({ page }) => {
    await page.locator('.tool-btn[data-tool="shape"]').click();
    expect(await page.evaluate(() => String(app.ui.activeTool).startsWith('shape'))).toBe(true);
    expect(await open(page)).toBe(false);
    const label = await page.evaluate(() => getComputedStyle(document.querySelector('.tool-sub-btn[data-shape="line"] .tool-sub-label')).display);
    expect(label).toBe('none');
    const minH = await page.evaluate(() => getComputedStyle(document.querySelector('.tool-sub-btn[data-shape="line"]')).minHeight);
    expect(minH).not.toBe('44px');
  });

  test('hold opens the menu and release in place closes it with the tool unchanged', async ({ page }) => {
    const b = await page.locator('.tool-btn[data-tool="shape"]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    expect(await open(page)).toBe(true);
    await page.mouse.up();
    expect(await open(page)).toBe(false);
    expect(await page.evaluate(() => app.ui.activeTool)).toBe('select');
  });

  test('press, drag onto a row and release selects it', async ({ page }) => {
    const b = await page.locator('.tool-btn[data-tool="shape"]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    const r = await page.locator('.tool-sub-btn[data-shape="line"]').boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 });
    await page.mouse.up();
    expect(await page.evaluate(() => app.ui.activeTool)).toBe('shape-line');
    expect(await open(page)).toBe(false);
  });
});

const { test, expect } = require('@playwright/test');

// TUX-016 D6 desktop parity: a fine pointer keeps the toolbar footer and drag handles unchanged.
test.describe('TUX-016 desktop parity (mouse)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.waitForSelector('#tool-bar .toolbar-drag-handle');
  });
  const box = async (page, sel) => (await page.locator(sel).first().boundingBox());
  const mid = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

  test('footer shows pin, home, rotate; pin locks and collapses the handle', async ({ page }) => {
    for (const s of ['.toolbar-pin-btn', '.toolbar-home-btn', '.toolbar-rotate-btn']) await expect(page.locator(`#tool-bar ${s}`)).toBeVisible();
    await page.locator('#tool-bar .toolbar-pin-btn').click();
    await expect(page.locator('#tool-bar')).toHaveClass(/toolbar-locked/);
    await page.waitForTimeout(500);
    expect((await page.locator('#tool-bar .toolbar-drag-handle').evaluate((el) => el.getBoundingClientRect().height))).toBeLessThan(2);
    await page.locator('#tool-bar .toolbar-pin-btn').click();
    await expect(page.locator('#tool-bar')).not.toHaveClass(/toolbar-locked/);
  });

  test('mouse drag moves the toolbar; the left edge docks it; popout undocks', async ({ page }) => {
    const before = await box(page, '#tool-bar');
    const h = mid(await box(page, '#tool-bar .toolbar-drag-handle'));
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 200, h.y + 60, { steps: 8 });
    await page.mouse.up();
    const moved = await box(page, '#tool-bar');
    expect(Math.abs(moved.x - before.x - 200)).toBeLessThanOrEqual(4);
    expect(Math.abs(moved.y - before.y - 60)).toBeLessThanOrEqual(4);
    const h2 = mid(await box(page, '#tool-bar .toolbar-drag-handle'));
    const vp = await box(page, '#viewport-container');
    await page.mouse.move(h2.x, h2.y);
    await page.mouse.down();
    await page.mouse.move(vp.x + 20, h2.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#tool-bar')).toHaveClass(/toolbar-docked-left/);
    await expect(page.locator('#tool-bar .toolbar-popout-btn')).toBeVisible();
    await page.locator('#tool-bar .toolbar-popout-btn').click();
    await expect(page.locator('#tool-bar')).not.toHaveClass(/toolbar-docked/);
  });

  test('mouse drag of the ctxbar handle moves the bar', async ({ page }) => {
    await expect(page.locator('.ctxbar.is-visible')).toBeVisible();
    const before = await box(page, '.ctxbar');
    const h = mid(await box(page, '.ctxbar .ctxbar-handle'));
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 80, h.y + 40, { steps: 8 });
    await page.mouse.up();
    const after = await box(page, '.ctxbar');
    expect(Math.abs(after.x - before.x - 80)).toBeLessThanOrEqual(4);
    expect(Math.abs(after.y - before.y - 40)).toBeLessThanOrEqual(4);
  });

  test('a narrow mouse window (mobile-layout, fine pointer) renders no inert handle or footer', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.waitForFunction(() => document.body.classList.contains('mobile-layout'));
    await expect(page.locator('#tool-bar .toolbar-drag-handle')).toBeHidden();
    await expect(page.locator('#tool-bar .toolbar-footer')).toBeHidden();
  });
});

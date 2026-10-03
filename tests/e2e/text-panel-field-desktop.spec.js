const { test, expect } = require('@playwright/test');

// TUX-029 D6 desktop parity: the same live-canvas-session flow with a MOUSE click.
const FIELD = 'textarea[data-text-content]';

test('desktop: first click on the Text field keeps it focused during a live Type session', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  await page.locator('.tool-btn[data-tool="type"]').click();
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.app.textEdit.isActive());
  await page.evaluate(() => window.app.textEdit.insertText('Abc'));   // NO textEdit.end()
  const field = page.locator(FIELD);
  await field.scrollIntoViewIfNeeded();
  const h0 = await page.evaluate(() => window.app.history.length);
  const handle = await field.elementHandle();
  await field.click();
  const info = await page.evaluate((el) => ({
    same: document.activeElement === el,
    connected: el.isConnected,
    text: window.app.engine.getActiveLayer().params.text,
  }), handle);
  expect(info.connected, 'field detached by a panel rebuild in its own focus event').toBe(true);
  expect(info.same, 'field not focused after the first click').toBe(true);
  expect(info.text).toBe('Abc');
  await page.keyboard.insertText(' xyz');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.app.engine.getActiveLayer().params.text)).toBe('Abc xyz');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.app.history.length)) - h0).toBe(1);
});

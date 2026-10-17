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

test('desktop: field click in a blank session-created layer keeps the layer and takes the text', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  await page.locator('.tool-btn[data-tool="type"]').click();
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.app.textEdit.isActive());   // NO insertText
  const field = page.locator(FIELD);
  await field.scrollIntoViewIfNeeded();
  const handle = await field.elementHandle();
  await field.click();
  await page.keyboard.insertText('Hi');
  await page.waitForTimeout(300);
  const info = await page.evaluate((el) => ({
    layers: window.app.engine.layers.length,
    connected: el.isConnected,
    active: document.activeElement === el,
    text: window.app.engine.getActiveLayer() && window.app.engine.getActiveLayer().params.text,
  }), handle);
  expect(info.layers, 'blank session layer was discarded by the field tap').toBe(1);
  expect(info.connected).toBe(true);
  expect(info.active).toBe(true);
  expect(info.text).toBe('Hi');
});

test('desktop: field click then blur without typing discards the blank layer and unwinds history', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  const before = await page.evaluate(() => ({ l: window.app.engine.layers.length, h: window.app.history.length }));
  await page.locator('.tool-btn[data-tool="type"]').click();
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.app.textEdit.isActive());
  const field = page.locator(FIELD);
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ l: window.app.engine.layers.length, h: window.app.history.length }));
  expect(after).toEqual(before);
});

test('desktop: typed field session undoes in two steps (text, then layer)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  const l0 = await page.evaluate(() => window.app.engine.layers.length);
  await page.locator('.tool-btn[data-tool="type"]').click();
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.app.textEdit.isActive());
  const field = page.locator(FIELD);
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await page.keyboard.insertText('Hi');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.app.undo());
  await page.waitForTimeout(150);
  expect(await page.evaluate((n) => { const l = window.app.engine.layers; return l.length === n + 1 && l[l.length - 1].params.text; }, l0)).toBe('');
  await page.evaluate(() => window.app.undo());
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.app.engine.layers.length)).toBe(l0);
});

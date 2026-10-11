const { test, expect } = require('@playwright/test');

// TUX-051 D6 guard: a mouse press on the bottom resizer still expands the pane; a drag still resizes.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prep = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await sleep(500);
  await page.evaluate(() => document.getElementById('bottom-pane').classList.add('bottom-pane-collapsed'));
};
const info = (page) => page.evaluate(() => ({
  collapsed: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'),
  h: document.getElementById('bottom-pane').getBoundingClientRect().height,
}));

test('mouse click on the bottom resizer expands the collapsed pane', async ({ page }) => {
  await prep(page);
  const b = await page.locator('#bottom-resizer').boundingBox();
  await page.mouse.move(b.x + 40, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(200);
  expect((await info(page)).collapsed).toBe(false);
});

test('mouse drag of 40 px up resizes the pane', async ({ page }) => {
  await prep(page);
  const before = await info(page);
  const b = await page.locator('#bottom-resizer').boundingBox();
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, y - 40, { steps: 8 });
  await page.mouse.up();
  await sleep(200);
  const after = await info(page);
  expect(after.collapsed).toBe(false);
  expect(after.h).toBeGreaterThan(before.h);
});

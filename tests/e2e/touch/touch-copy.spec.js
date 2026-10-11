const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-052: after a touch tap the status hint uses touch words, and Help opens on the Touch page.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-052';
const BANNED = /Click|Shift\+|Option\+|Cmd\+|Ctrl\+|Alt\+|double-click|right-click/i;

const phoneLayout = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

test('touch tap switches hints to touch words and Help opens on the Touch page', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    window.app.engine.addLayer('spiral');
    if (window.app.ui.renderLayers) window.app.ui.renderLayers();
  });

  await touch.tap(page, page.locator('#main-canvas'));
  await page.waitForTimeout(250);
  await expect(page.locator('body')).toHaveAttribute('data-last-input', 'touch');
  const hint = await page.locator('#status-bar').textContent();
  expect(hint, 'status hint after a touch tap').not.toMatch(BANNED);

  if (await phoneLayout(page)) {
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await page.waitForTimeout(150);
  }
  const trigger = page.locator('#btn-menu-help');
  await trigger.scrollIntoViewIfNeeded();
  await touch.tap(page, trigger);
  await page.waitForTimeout(200);
  const item = page.locator('#btn-help');
  await item.scrollIntoViewIfNeeded();
  await touch.tap(page, item);
  await page.waitForSelector('#modal-overlay.open', { timeout: 8000 });
  await page.waitForTimeout(400);

  await expect(page.locator('.help-platform-btn[data-platform="touch"]')).toHaveClass(/active/);
  const panel = page.locator('.help-panel[data-panel="touch"]');
  await expect(panel).toBeVisible();
  const inView = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight;
  });
  expect(inView).toBe(true);

  if (process.env.TUX_EVIDENCE === '1') {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE}/${testInfo.project.name}.png` });
  }
});

const { test, expect } = require('@playwright/test');

// TUX-056 desktop parity (D6): fine pointers are never capped.
const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.engine && window.app.renderer));
  await page.waitForTimeout(600);
};
const measure = (page) => page.evaluate(() => {
  const rn = window.app.renderer;
  rn.resize();
  const pr = rn.canvas.parentElement.getBoundingClientRect();
  return { w: rn.canvas.width, pw: pr.width, a: rn.ctx.getTransform().a, dpr: rn.getBackingDpr() };
});

test('desktop backing equals the device pixel ratio', async ({ page }) => {
  await gotoApp(page);
  const m = await measure(page);
  expect(m.a).toBe(m.dpr);
  expect(m.w).toBe(Math.round(m.pw * m.dpr));
});

test('fine pointer at DPR 3 keeps 3x backing', async ({ browser }) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 3, hasTouch: false, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${process.env.PW_PORT || 4173}/`);
  await page.waitForFunction(() => !!(window.app && window.app.renderer));
  await page.waitForTimeout(600);
  const m = await measure(page);
  expect(m.dpr).toBe(3);
  expect(m.a).toBe(3);
  expect(m.w).toBe(Math.round(m.pw * 3));
  await ctx.close();
});

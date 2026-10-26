const { test, expect } = require('@playwright/test');

// Paper selector on touch: the Pen / Paper tab of the right pane (a drawer on
// phones) exposes the Paper swatches with ≥44 px targets, and a finger tap
// picks a paper. Pane toggles are DOM clicks (TUX-010 owns finger taps on
// them), as in sliders.spec.js.

const isOpen = (page, id) => page.evaluate((i) => {
  const r = document.getElementById(i).getBoundingClientRect();
  return r.width > 60 && r.right > 60 && r.left < innerWidth - 60;
}, id);

const showPenPaper = async (page) => {
  const click = async (id) => { await page.evaluate((i) => document.getElementById(i).click(), id); await page.waitForTimeout(700); };
  if (await isOpen(page, 'left-pane') && await page.evaluate(() => innerWidth < 700)) await click('btn-pane-toggle-left');
  if (!(await isOpen(page, 'right-pane'))) await click('btn-pane-toggle-right');
  await page.evaluate(() => document.querySelector('#right-pane .right-pane-tab[data-tab="pens"]').click());
  await page.waitForTimeout(400);
};

test('touch: Pen / Paper tab picks a paper with a tap', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await showPenPaper(page);
  await expect(page.locator('.right-pane-tab[data-tab="pens"]')).toHaveText('Pen / Paper');
  const swatch = page.locator('.paper-swatch[data-paper-type="newsprint"]');
  await swatch.scrollIntoViewIfNeeded();
  const box = await swatch.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await swatch.tap();
  await expect(swatch).toHaveAttribute('aria-checked', 'true');
  // The colour chip fits its hex label with room to spare (not a 45 px sliver).
  const pill = await page.locator('#paper-color-pill').boundingBox();
  expect(pill.width).toBeGreaterThanOrEqual(84);
  expect(pill.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper.type)).toBe('newsprint');
});

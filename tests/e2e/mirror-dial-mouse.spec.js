const { test, expect } = require('@playwright/test');

// TUX-027 D6 mouse parity: the mirror angle dial keeps its absolute click / drag / Shift-snap
// behaviour for mouse input. Only touch pointers get the relative fine drag.

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const eng = window.app.engine;
    eng.activeLayerId = eng.addLayer('wavetable');
    eng.activeLayerId = eng.addModifierLayer('mirror');
    window.app.ui.renderLayers();
    if (window.app.ui.buildControls) window.app.ui.buildControls();
  });
  await page.waitForSelector('.mp-root .mp-dial[data-dial-param="angle"]');
};
const angle = (page) => page.evaluate(() => window.app.engine.getActiveLayer().modifier.mirrors[0].angle);

test('mirror dial: mouse click is absolute, Shift-drag snaps to 15 deg', async ({ page }) => {
  await boot(page);
  const dial = page.locator('.mp-root .mp-dial[data-dial-param="angle"]').first();
  await dial.scrollIntoViewIfNeeded();
  const b = await dial.boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.click(cx + 20, cy); // 3 o'clock
  expect(await angle(page)).toBe(90);
  await page.mouse.click(cx, cy + 20); // 6 o'clock
  expect(await angle(page)).toBe(180);
  await page.keyboard.down('Shift');
  await page.mouse.move(cx, cy - 20);
  await page.mouse.down();
  // about 20 deg clockwise of 12 o'clock: snaps to 15 or 30
  await page.mouse.move(cx + 20 * Math.sin((17 * Math.PI) / 180), cy - 20 * Math.cos((17 * Math.PI) / 180), { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const a = await angle(page);
  expect(a % 15).toBe(0);
  expect(a).toBe(15);
});

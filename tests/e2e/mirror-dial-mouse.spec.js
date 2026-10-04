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

test('mirror Angle-row slider: mouse keeps native absolute behaviour (not the touch fine gain)', async ({ page }) => {
  await boot(page);
  const slider = page.locator('.mp-root .mp-dial-row input.ctrl-slider[data-param="angle"]').first();
  await slider.scrollIntoViewIfNeeded();
  const b = await slider.boundingBox();
  const y = b.y + b.height / 2;
  // Click near 75% of the track: the native range jumps to about 270 (absolute).
  await page.mouse.click(b.x + b.width * 0.75, y);
  const a1 = await angle(page);
  expect(a1).toBeGreaterThan(240);
  expect(a1).toBeLessThan(300);
  // A 40 px mouse drag keeps the coarse native gain (a 120 px range spans 360 deg), far above the
  // touch rule of 20 deg per 40 px.
  const x = b.x + b.width * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const mid = await angle(page);
  await page.mouse.move(x + 40, y, { steps: 6 });
  await page.mouse.up();
  expect(Math.abs((await angle(page)) - mid)).toBeGreaterThan(60);
});

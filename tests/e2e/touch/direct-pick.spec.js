const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-024: a real Direct-tool tap goes through findPathHitAtPoint. A finger reaches 22 px,
// locked geometry under the finger selects nothing, and a mouse keeps its 2.5 px reach.
// Real taps only (touch.tap / page.mouse.click), never a call into the renderer hit test.

const { setupDirectPick: setup, picked, boot } = require('../helpers/direct-pick');

test.describe('TUX-024 Direct pick by finger', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', (e) => errors.push(String(e))); await boot(page); });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('a finger tap 17 px off a stroke selects it', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setup(page);
    await touch.tap(page, { x: s.x, y: s.y - 17 });
    await expect.poll(() => picked(page)).toBe(s.id);
  });

  test('a finger tap on locked geometry selects nothing', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setup(page);
    await page.evaluate((id) => { window.app.ui.layerLockedIds.add(id); }, s.id);
    await touch.tap(page, { x: s.x, y: s.y });
    await page.waitForTimeout(250);
    expect(await picked(page)).toBe(null);
    await touch.tap(page, { x: s.x, y: s.y - 17 });
    await page.waitForTimeout(250);
    expect(await picked(page)).toBe(null);
  });

  test('a finger tap on locked geometry over an unlocked layer selects nothing', async ({ page }, testInfo) => {
    test.skip(!/touch|webkit/.test(testInfo.project.name), 'touch projects only');
    const s = await setup(page);
    const topId = await page.evaluate((baseId) => {
      const e = window.app.engine;
      const id = e.addLayer('rings');
      // Same params and seed as the unlocked layer: the locked stroke lies exactly on top of it.
      const base = e.layers.find((l) => l.id === baseId);
      const top = e.layers.find((l) => l.id === id);
      top.params = JSON.parse(JSON.stringify(base.params));
      if (base.paramStates !== undefined) top.paramStates = JSON.parse(JSON.stringify(base.paramStates));
      e.generate?.(id);
      window.app.computeDisplayGeometry?.();
      window.app.ui.layerLockedIds.add(id);
      window.app.renderer.setSelection([], null);
      window.app.renderer.setTool('direct');
      window.app.renderer.draw();
      return id;
    }, s.id);
    expect(topId).not.toBe(s.id);
    await touch.tap(page, { x: s.x, y: s.y });
    await page.waitForTimeout(250);
    expect(await picked(page), 'the locked top layer swallows the tap; nothing below is picked').toBe(null);
  });

});

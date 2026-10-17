const { test, expect } = require('@playwright/test');

// TUX-038 D6 desktop parity (desktop-chromium, mouse). The touch paths added by TUX-038 must not change
// what a mouse does: dblclick resets a slider, a dial and the rangeDual track; the rangeDual chip edits
// (now also on a single click); a double-click on a layer name renames; a mouse hold opens NO menu;
// the harmonograph curve keeps dblclick-add and right-click-remove.
const boot = async (page, type, params) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  return page.evaluate(({ type, params }) => {
    const eng = window.app.engine;
    const probeId = eng.addLayer(type);
    const defaults = JSON.parse(JSON.stringify(eng.getLayerById(probeId).params));
    eng.removeLayer(probeId);
    const id = eng.addLayer(type);
    Object.assign(eng.getLayerById(id).params, params);
    eng.activeLayerId = id;
    window.app.renderer.setSelection([id], id);
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    return { id, defaults };
  }, { type, params });
};
const param = (page, id, key) => page.evaluate(({ id, key }) => window.app.engine.getLayerById(id).params[key], { id, key });
const label = (page, text) => page.locator('#left-panel-content .control-label').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }).first();
const rowOf = (lbl) => lbl.locator('xpath=ancestor::div[contains(@class,"mb-4")][1]');

test('dblclick resets a UI.Slider to the default', async ({ page }) => {
  // The value sits at the track midpoint and the double-click lands on the thumb centre, so the two clicks
  // change nothing: no change event, no panel rebuild between the clicks (a click that moves the value
  // rebuilds the controls and the second click then lands on another element, with or without TUX-038).
  const { id, defaults } = await boot(page, 'rings', { rayCount: 60 });
  expect(defaults.rayCount).not.toBe(60);
  const slider = rowOf(label(page, 'Ray Count')).locator('input.ctrl-slider');
  await slider.scrollIntoViewIfNeeded();
  const b = await slider.boundingBox();
  await slider.dblclick({ position: { x: b.width / 2, y: b.height / 2 } });
  await expect.poll(() => param(page, id, 'rayCount')).toBe(defaults.rayCount);
});

test('dblclick resets an angle dial', async ({ page }) => {
  const { id, defaults } = await boot(page, 'flowfield', { angleOffset: 120 });
  const dial = rowOf(label(page, 'Angle Offset')).locator('.angle-dial').first();
  await dial.scrollIntoViewIfNeeded();
  await dial.dblclick();
  await expect.poll(() => param(page, id, 'angleOffset')).toBe(defaults.angleOffset);
});

test('dblclick resets the rangeDual track', async ({ page }) => {
  const { id, defaults } = await boot(page, 'rings', { rayCount: 12, rayMinLength: 3, rayMaxLength: 7 });
  const track = rowOf(label(page, 'Ray Length')).locator('.dual-range input[data-handle="max"]');
  await track.scrollIntoViewIfNeeded();
  const b = await track.boundingBox();
  await track.dblclick({ position: { x: b.width * 0.9, y: b.height / 2 } });
  await expect.poll(() => param(page, id, 'rayMaxLength')).toBe(defaults.rayMaxLength);
  expect(await param(page, id, 'rayMinLength')).toBe(defaults.rayMinLength);
});

test('dblclick on the rangeDual chip opens the editor and Enter commits', async ({ page }) => {
  const { id } = await boot(page, 'rings', { rayCount: 12 });
  const lbl = label(page, 'Ray Length');
  await lbl.scrollIntoViewIfNeeded();
  await rowOf(lbl).locator('button.value-chip').dblclick();
  const inputs = page.locator('.dual-value-editor input');
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill('2');
  await page.keyboard.press('Enter'); // min -> max
  await inputs.nth(1).fill('6');
  await page.keyboard.press('Enter'); // commit
  await expect.poll(() => param(page, id, 'rayMinLength')).toBeCloseTo(2, 5);
  expect(await param(page, id, 'rayMaxLength')).toBeCloseTo(6, 5);
});

test('a mouse double-click on a layer name renames it', async ({ page }) => {
  const { id } = await boot(page, 'rings', {});
  const name = page.locator(`#layer-list [data-lvl-id="${id}"] .lvl-name`).first();
  await name.dblclick();
  const input = page.locator('#layer-list .lvl-ren-inp');
  await expect(input).toBeVisible();
  await input.fill('Mouse Renamed');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate((i) => window.app.engine.getLayerById(i).name, id)).toBe('Mouse Renamed');
});

test('a mouse press-and-hold on a label opens no menu', async ({ page }) => {
  const { id } = await boot(page, 'rings', { rayCount: 12, offsetX: 40 });
  const lbl = label(page, 'Center Offset X');
  await lbl.scrollIntoViewIfNeeded();
  const b = await lbl.boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.reset-hold-menu.open')).toHaveCount(0);
  expect(await param(page, id, 'offsetX')).toBe(40);
});

test('pendula curve: dblclick adds a point, right-click removes one', async ({ page }) => {
  const points = [{ x: 0, y: -1 }, { x: 0.25, y: 0 }, { x: 0.5, y: 1 }, { x: 0.75, y: 0 }, { x: 1, y: -1 }];
  const { id } = await boot(page, 'pendula', {});
  await page.evaluate(({ id, points }) => {
    const layer = window.app.engine.getLayerById(id);
    layer.params.motion = { sources: [{ id: 'lfo-d', enabled: true, shape: 'drawn', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi', points }], edges: [] };
    window.app.ui.buildControls();
  }, { id, points });
  const count = () => page.evaluate((i) => window.app.engine.getLayerById(i).params.motion.sources[0].points.length, id);
  const canvas = page.locator('.motion-drawn-canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  await expect(page.locator('.motion-point-actions')).toBeHidden(); // no touch buttons for a mouse
  const at = (px, py) => ({ x: (px / 220) * 220, y: (py / 64) * 64 });
  await canvas.dblclick({ position: at(80, 50) }); // empty space: adds
  await expect.poll(count).toBe(6);
  await canvas.click({ button: 'right', position: at(57, 32) }); // the point at x 0.25: removes
  await expect.poll(count).toBe(5);
});

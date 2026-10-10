const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-038: value entry and reset without a mouse. Finger-only (touch.tap / touch.longPress / touchPhase).
//   a  the legacy rangeDual chip opens on ONE tap into two inputs (min, max), inputmode decimal
//   b  a single chip whose control min < 0 uses inputmode text (a minus key); min >= 0 keeps decimal
//   c  a long-press on the control LABEL opens a "Reset to default" menu. It never resets by itself.
//      The reset target is the default a fresh engine.addLayer gives (factory preset, not a literal).
//   d  the menu and the editors sit inside the viewport and are not covered
//   e  a hold that moves 10 px or more opens nothing
// Setup (adding a layer, a non-default value, opening the pane) goes through page.evaluate: it is the
// precondition, not the value under test. TUX-010 owns the pane buttons.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boot = async (page, type, params) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  const info = await page.evaluate(({ type, params }) => {
    const eng = window.app.engine;
    // The default a NEW layer gets (ALGO_DEFAULTS + factory preset), read from a throw-away layer.
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
  await page.evaluate(() => window.Vectura.UI.Workspace.paneState.open('left'));
  await page.waitForFunction(() => document.getElementById('left-pane').getBoundingClientRect().width > 100);
  await sleep(500);
  return info;
};

const param = (page, id, key) => page.evaluate(({ id, key }) => window.app.engine.getLayerById(id).params[key], { id, key });
const label = (page, text) => page.locator('#left-panel-content .control-label').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }).first();
const rowOf = (lbl) => lbl.locator('xpath=ancestor::div[contains(@class,"mb-4")][1]');

const inViewport = async (page, locator) => {
  const vp = page.viewportSize();
  const b = await locator.boundingBox();
  expect(b, 'has a box').toBeTruthy();
  expect(b.x, 'left edge').toBeGreaterThanOrEqual(-0.5);
  expect(b.y, 'top edge').toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width, 'right edge').toBeLessThanOrEqual(vp.width + 0.5);
  expect(b.y + b.height, 'bottom edge').toBeLessThanOrEqual(vp.height + 0.5);
  const top = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!t && (t === el || el.contains(t) || t.contains(el));
  });
  expect(top, 'not covered at the centre').toBe(true);
};

const holdMenu = (page) => page.locator('.reset-hold-menu.open');

test.describe('TUX-038 value entry', () => {
  test('a: one tap on the rangeDual chip opens min and max inputs (decimal) and commits both', async ({ page }) => {
    const { id } = await boot(page, 'rings', { rayCount: 12 });
    const lbl = label(page, 'Ray Length');
    await lbl.scrollIntoViewIfNeeded();
    const chip = rowOf(lbl).locator('button.value-chip');
    await touch.tap(page, chip);
    const inputs = page.locator('.dual-value-editor input');
    await expect(inputs).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      await expect(inputs.nth(i), `input ${i} inputmode`).toHaveAttribute('inputmode', 'decimal');
      await inViewport(page, inputs.nth(i));
    }
    expect(await page.evaluate(() => document.activeElement && document.activeElement.dataset.handle), 'min input has focus').toBe('min');
    await inputs.nth(0).fill('2');
    await inputs.nth(1).fill('6');
    await touch.tap(page, lbl); // focus leaves both inputs: the editor commits
    await expect(page.locator('.dual-value-editor')).toHaveCount(0);
    expect(await param(page, id, 'rayMinLength')).toBeCloseTo(2, 5);
    expect(await param(page, id, 'rayMaxLength')).toBeCloseTo(6, 5);
    await expect(chip).toContainText('2');
    await expect(chip).toContainText('6');
  });

  test('b: a chip with min < 0 uses inputmode text; min >= 0 keeps decimal; -2 commits', async ({ page }) => {
    const { id } = await boot(page, 'rings', { rayCount: 12, offsetX: 10 });
    const neg = label(page, 'Center Offset X');
    await neg.scrollIntoViewIfNeeded();
    const chip = rowOf(neg).locator('input.slider-val');
    await expect(chip).toHaveAttribute('inputmode', 'text');
    await expect(chip).toHaveAttribute('enterkeyhint', 'done');
    await touch.tap(page, chip);
    await chip.fill('-2');
    await page.keyboard.press('Enter');
    await expect.poll(() => param(page, id, 'offsetX')).toBe(-2);
    const pos = label(page, 'Ray Count');
    await pos.scrollIntoViewIfNeeded();
    await expect(rowOf(pos).locator('input.slider-val')).toHaveAttribute('inputmode', 'decimal');
  });

  for (const spec of [
    { name: 'single slider', type: 'rings', params: { rayCount: 12, offsetX: 40 }, label: 'Center Offset X', keys: ['offsetX'] },
    { name: 'rangeDual', type: 'rings', params: { rayCount: 12, rayMinLength: 3, rayMaxLength: 7 }, label: 'Ray Length', keys: ['rayMinLength', 'rayMaxLength'] },
    { name: 'angle dial', type: 'flowfield', params: { angleOffset: 120 }, label: 'Angle Offset', keys: ['angleOffset'] },
  ]) {
    test(`c/d: long-press the label opens "Reset to default" (${spec.name}); choosing it resets`, async ({ page }) => {
      const { id, defaults } = await boot(page, spec.type, spec.params);
      const lbl = label(page, spec.label);
      await lbl.scrollIntoViewIfNeeded();
      const before = {};
      for (const k of spec.keys) {
        before[k] = await param(page, id, k);
        expect(before[k], `${k} starts off the default`).not.toBe(defaults[k]);
      }
      await touch.longPress(page, lbl, 700);
      const menu = holdMenu(page);
      await expect(menu).toBeVisible();
      for (const k of spec.keys) expect(await param(page, id, k), `${k} unchanged by the hold`).toBe(before[k]);
      const item = menu.locator('.menu-entry').filter({ hasText: 'Reset to default' });
      await expect(item).toBeVisible();
      await inViewport(page, menu);
      await inViewport(page, item);
      await touch.tap(page, item);
      await expect(menu).toBeHidden();
      for (const k of spec.keys) expect(await param(page, id, k), `${k} reset`).toBe(defaults[k]);
    });
  }

  test('e: a hold that moves 10 px or more opens no menu and changes nothing', async ({ page }) => {
    const { id } = await boot(page, 'rings', { rayCount: 12, offsetX: 40 });
    const lbl = label(page, 'Center Offset X');
    await lbl.scrollIntoViewIfNeeded();
    const b = await lbl.boundingBox();
    const p = { x: b.x + Math.min(b.width / 2, 20), y: b.y + b.height / 2, id: 0 };
    await touch.touchPhase(page, 'start', [p]);
    await touch.touchPhase(page, 'move', [{ ...p, x: p.x + 14 }]);
    await sleep(750);
    await touch.touchPhase(page, 'end', [{ ...p, x: p.x + 14 }]);
    await expect(holdMenu(page)).toBeHidden();
    expect(await param(page, id, 'offsetX')).toBe(40);
  });

  test('a short tap on the label opens no menu', async ({ page }) => {
    const { id } = await boot(page, 'rings', { rayCount: 12, offsetX: 40 });
    const lbl = label(page, 'Center Offset X');
    await lbl.scrollIntoViewIfNeeded();
    await touch.tap(page, lbl);
    await sleep(700);
    await expect(holdMenu(page)).toBeHidden();
    expect(await param(page, id, 'offsetX')).toBe(40);
  });
});

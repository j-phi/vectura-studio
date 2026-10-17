const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-027: the mirror Angle dial has fine touch control (relative drag, 0.5 deg/px, tap = no change)
// and the row actions are finger-sized. Pointer input comes from helpers/touch.js only.
// Finger reachability of the left pane belongs to TUX-008/010 and the journey ledger: the pane is
// opened with a DOM click here (same as sliders.spec.js). iPhone projects are pending
// TUX-001/010 until the dial is reachable there; see the lane report.

const HIT_MIN = 44;
const NAME_MIN = 96;

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const eng = window.app.engine;
    const algo = eng.addLayer('wavetable');
    eng.activeLayerId = algo;
    const id = eng.addModifierLayer('mirror');
    eng.activeLayerId = id;
    window.app.ui.renderLayers();
    if (window.app.ui.buildControls) window.app.ui.buildControls();
  });
  await page.evaluate(() => {
    const pane = document.getElementById('left-pane');
    const r = pane.getBoundingClientRect();
    if (r.width > 60 && r.right > 60 && r.left < innerWidth - 60) return;
    (document.getElementById('btn-pane-toggle-left') || document.getElementById('btn-mobile-pane-left')).click();
  });
  await page.waitForTimeout(800);
  await page.waitForSelector('.mp-root .mp-dial');
};

const getAngle = (page, key = 'angle') => page.evaluate((k) => {
  const l = window.app.engine.getActiveLayer();
  return l.modifier.mirrors[0][k];
}, key);
const setMirror = async (page, patch) => {
  await page.evaluate((p) => {
    const l = window.app.engine.getActiveLayer();
    Object.assign(l.modifier.mirrors[0], p);
    window.app.engine.computeAllDisplayGeometry();
    window.app.ui.buildControls();
  }, patch);
  await page.waitForSelector('.mp-root .mp-dial');
};
const histLen = (page) => page.evaluate(() => window.app.history.length);
const dialSel = (param) => `.mp-root .mp-dial[data-dial-param="${param}"]`;
const dialRect = async (page, param = 'angle') => {
  const loc = page.locator(dialSel(param)).first();
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const b = await loc.boundingBox();
  return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
};

test.describe('TUX-027 mirror dial and row actions', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('T1 dial tap does not change angle', async ({ page }) => {
    await setMirror(page, { angle: 90 });
    const h0 = await histLen(page);
    const r = await dialRect(page);
    expect(r.w).toBeGreaterThan(20);
    await touch.tap(page, { x: r.cx, y: r.y + 4 });
    await page.waitForTimeout(200);
    expect(await getAngle(page)).toBe(90);
    expect(await histLen(page)).toBe(h0);
  });

  test('T2 dial fine drag', async ({ page }) => {
    await setMirror(page, { angle: 90 });
    let r = await dialRect(page);
    const h0 = await histLen(page);
    await touch.drag(page, { x: r.cx, y: r.cy }, { x: r.cx + 40, y: r.cy }, { steps: 10 });
    await page.waitForTimeout(200);
    const a1 = await getAngle(page);
    const delta = a1 - 90;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeGreaterThanOrEqual(15);
    expect(delta).toBeLessThanOrEqual(21);
    expect(await histLen(page)).toBe(h0 + 1);
    r = await dialRect(page);
    await touch.drag(page, { x: r.cx, y: r.cy }, { x: r.cx - 40, y: r.cy }, { steps: 10 });
    await page.waitForTimeout(200);
    expect(Math.abs((await getAngle(page)) - 90)).toBeLessThanOrEqual(1);
    expect(await histLen(page)).toBe(h0 + 2);
  });

  test('T3 range-gauge dial (tileAngle) fine drag and clamp', async ({ page }) => {
    await page.evaluate(() => {
      const l = window.app.engine.getActiveLayer();
      window.Vectura.SETTINGS.wallpaperPanelMode = 'build';
      l.modifier.mirrors[0] = window.Vectura.Modifiers.createWallpaperMirror(0, { group: 'p1', symmetry: { ...window.Vectura.WallpaperGroups.FEATURES.p1 }, tileAngle: 90 });
      window.app.engine.computeAllDisplayGeometry();
      window.app.ui.buildControls();
    });
    await page.waitForSelector(dialSel('tileAngle'));
    const dial = page.locator(dialSel('tileAngle')).first();
    expect(await dial.getAttribute('aria-disabled')).toBeNull();
    let r = await dialRect(page, 'tileAngle');
    await touch.drag(page, { x: r.cx, y: r.cy }, { x: r.cx + 40, y: r.cy }, { steps: 10 });
    await page.waitForTimeout(200);
    const delta = (await getAngle(page, 'tileAngle')) - 90;
    expect(delta).toBeGreaterThanOrEqual(15);
    expect(delta).toBeLessThanOrEqual(21);
    await page.evaluate(() => { window.app.engine.getActiveLayer().modifier.mirrors[0].tileAngle = 90; window.app.ui.buildControls(); });
    r = await dialRect(page, 'tileAngle');
    // Keep the finger on the page: the dial is captured, so clientX may leave the dial.
    const vw = page.viewportSize().width;
    const far = Math.min(400, vw - 2 - r.cx);
    expect(far).toBeGreaterThanOrEqual(100); // 90 px of travel is enough to reach 135 at 0.5 deg/px
    await touch.drag(page, { x: r.cx, y: r.cy }, { x: r.cx + far, y: r.cy }, { steps: 10 });
    await page.waitForTimeout(200);
    expect(await getAngle(page, 'tileAngle')).toBe(135);
  });

  test('T4 compass wrap', async ({ page }) => {
    await setMirror(page, { angle: 350 });
    const r = await dialRect(page);
    await touch.drag(page, { x: r.cx, y: r.cy }, { x: r.cx + 40, y: r.cy }, { steps: 10 });
    await page.waitForTimeout(200);
    const a = await getAngle(page);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
    expect(a).toBeGreaterThanOrEqual(5);
    expect(a).toBeLessThanOrEqual(11);
  });

  test('T5 chip exact entry', async ({ page }) => {
    await setMirror(page, { angle: 90 });
    const chip = page.locator('.mp-root .mp-dial-row .slider-val').first();
    await chip.scrollIntoViewIfNeeded();
    await touch.tap(page, chip);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => {
      const a = document.activeElement;
      return { cls: a.className, mode: a.inputMode };
    })).toMatchObject({ mode: 'decimal' });
    expect(await chip.evaluate((el) => el === document.activeElement)).toBe(true);
    await chip.fill('37');
    // Blur through a tap elsewhere in the panel (no Enter: iOS decimal keypads have no Return key).
    const lbl = page.locator('.mp-root .mp-dial-row .mp-ctrl-lbl').first();
    await touch.tap(page, lbl);
    await page.waitForTimeout(250);
    expect(await getAngle(page)).toBe(37);
    const pin = await page.locator(`${dialSel('angle')} .mp-dial-pin`).first().evaluate((el) => el.style.getPropertyValue('--angle'));
    expect(parseFloat(pin)).toBe(37);
  });

  test('T6 row actions are finger-sized', async ({ page }) => {
    await page.evaluate(() => document.querySelector('.mp-root .mp-row-actions').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
    const btns = page.locator('.mp-root .mp-row-actions .mp-icon-btn');
    const n = await btns.count();
    expect(n).toBeGreaterThanOrEqual(3);
    const rects = [];
    for (let i = 0; i < n; i += 1) {
      const hit = await touch.hitArea(page, btns.nth(i));
      expect(hit.w, `button ${i} hit width`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(hit.h, `button ${i} hit height`).toBeGreaterThanOrEqual(HIT_MIN);
      rects.push(await btns.nth(i).boundingBox());
    }
    for (let i = 0; i < rects.length - 1; i += 1) {
      const a = rects[i]; const b = rects[i + 1];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `buttons ${i} and ${i + 1} overlap`).toBe(false);
    }
    const nameW = await page.locator('.mp-root .mp-row-name-text').first().evaluate((el) => el.clientWidth);
    expect(nameW).toBeGreaterThanOrEqual(NAME_MIN);
  });

  // Fix round: JRN-013 measured the Angle ROW's range slider (not the dial) at a coarse gain.
  const sliderThumb = async (page, param = 'angle') => {
    const loc = page.locator(`.mp-root .mp-dial-row input.ctrl-slider[data-param="${param}"]`).first();
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const b = await loc.boundingBox();
    const v = await loc.evaluate((el) => ({ v: +el.value, min: +el.min, max: +el.max }));
    const thumb = 28;
    const frac = (v.v - v.min) / (v.max - v.min);
    return { x: b.x + thumb / 2 + frac * (b.width - thumb), y: b.y + b.height / 2 };
  };

  test('T7 Angle-row range slider: finger drag is fine (<= 20 deg per 40 px)', async ({ page }) => {
    await setMirror(page, { angle: 90 });
    const h0 = await histLen(page);
    const t = await sliderThumb(page);
    await touch.drag(page, t, { x: t.x + 40, y: t.y }, { steps: 10 });
    await page.waitForTimeout(250);
    const delta = (await getAngle(page)) - 90;
    expect(Math.abs(delta), `slider delta ${delta}`).toBeLessThanOrEqual(20);
    expect(delta).toBeGreaterThan(0);
    expect(await histLen(page)).toBe(h0 + 1);
    if (process.env.TUX_EVIDENCE_DIR) {
      await page.screenshot({ path: `${process.env.TUX_EVIDENCE_DIR}/${test.info().project.name}.png` });
    }
  });

  test('T8 Angle-row range slider: a mostly vertical gesture changes nothing', async ({ page }) => {
    await setMirror(page, { angle: 90 });
    const h0 = await histLen(page);
    const t = await sliderThumb(page);
    await touch.drag(page, t, { x: t.x + 6, y: t.y + 60 }, { steps: 10 });
    await page.waitForTimeout(250);
    expect(await getAngle(page)).toBe(90);
    expect(await histLen(page)).toBe(h0);
  });
});

const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const h = require('../helpers/text-panel-setup');
const { PROJECTS } = require('./viewports');

// TUX-049: the Save Preset sheet is finger-sized, keeps Save below the name field, and rides above
// the on-screen keyboard. The keyboard is a fake window.visualViewport (helpers/text-panel-setup).
// Finger-only (no mouse). Opens through the real gallery pip so the real preset store is exercised.
const EVIDENCE = evidenceDir('TUX-049');
const SEED_ID = 'user-lissajous-tux049';
const STORE_KEY = 'vectura.user_presets.lissajous';
// Desktop (fine pointer, 1600x1000) footer sizes measured on the base before TUX-049.
const BASE = { save: [38.7, 24], cancel: [54.7, 26] };
const NAME_SEL = '#preset-save-name';
const SAVE_SEL = '.preset-save-confirm';
const CANCEL_SEL = '.preset-save-footer button:not(.preset-save-confirm)';

// Keyboard heights from the TUX-049 brief (CSS px).
const KB = { iPadP: 400, iPadL: 400, iPhP: 330, iPhL: 200 };
// The browser-chrome and coarse-wide variants are not TUX-049 viewports (§1.2 primary 8 only).
const primary = (testInfo) => !!KB[PROJECTS[testInfo.project.name].device];
const kbFor = (testInfo) => KB[PROJECTS[testInfo.project.name].device];
const isPhone = (testInfo) => /^iPh/.test(PROJECTS[testInfo.project.name].device);

const rect = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
}, sel);

const openSheet = async (page, testInfo) => {
  // A user-origin preset in the real store, so the Save-as-new / Update segment renders.
  await page.evaluate(({ id, key }) => {
    const id0 = window.app.engine.addLayer('lissajous');
    window.app.engine.activeLayerId = id0;
    const layer = window.app.engine.getActiveLayer();
    const base = JSON.parse(JSON.stringify(layer.params));
    localStorage.setItem(key, JSON.stringify([{ id, name: 'Seed 049', preset_system: 'lissajous', group: 'User', params: base, savedAt: 1 }]));
    layer.params.preset = id;
    layer.params.freqX = (layer.params.freqX || 1) + 5; // diverge: the save pip appears
    window.app.regen();
    window.app.ui.renderLayers && window.app.ui.renderLayers();
    window.app.ui.buildControls();
  }, { id: SEED_ID, key: STORE_KEY });
  await h.openLeftPane(page, touch);
  await page.waitForSelector('.hg-preset-save-pip:not([hidden])', { state: 'attached' });
  if (isPhone(testInfo)) {
    // TODO TUX-010: tap the pip once iPhone panes are reachable.
    // Programmatic click on the REAL pip: the real handler, modal and preset store run.
    await page.evaluate(() => document.querySelector('.hg-preset-save-pip').click());
  } else {
    await page.locator('.hg-preset-save-pip').scrollIntoViewIfNeeded();
    await touch.tap(page, page.locator('.hg-preset-save-pip'));
  }
  await page.waitForSelector('.vectura-modal-backdrop[style*="display: flex"] ' + NAME_SEL, { timeout: 5000 });
  await page.waitForTimeout(450);
};

const vvBox = (page) => page.evaluate(() => ({ top: window.visualViewport.offsetTop, height: window.visualViewport.height, ih: innerHeight }));

test.describe('TUX-049 Save Preset sheet', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!primary(testInfo), 'TUX-049 covers the 8 primary projects');
    await page.addInitScript(h.installKeyboardStub);
    await h.waitApp(page);
  });

  test('A: Save/Cancel/mode/name are touch-sized and the footer sits below the name field', async ({ page }, testInfo) => {
    await openSheet(page, testInfo);
    // A finger scrolls the sheet body to the mode buttons first; the pinned footer must not cover them.
    await page.locator('.preset-save-seg').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const save = await touch.hitArea(page, SAVE_SEL);
    const cancel = await touch.hitArea(page, CANCEL_SEL);
    const mode = await touch.hitArea(page, '.preset-save-seg .seg-opt');
    const name = await touch.hitArea(page, NAME_SEL);
    expect(save.w, `Save hit ${JSON.stringify(save)}`).toBeGreaterThanOrEqual(44);
    expect(save.h, `Save hit ${JSON.stringify(save)}`).toBeGreaterThanOrEqual(44);
    expect(cancel.w, `Cancel hit ${JSON.stringify(cancel)}`).toBeGreaterThanOrEqual(44);
    expect(cancel.h, `Cancel hit ${JSON.stringify(cancel)}`).toBeGreaterThanOrEqual(44);
    expect(mode.h, `mode button hit ${JSON.stringify(mode)}`).toBeGreaterThanOrEqual(44);
    expect(name.h, `name field hit ${JSON.stringify(name)}`).toBeGreaterThanOrEqual(44);
    const r = {
      save: await rect(page, SAVE_SEL), cancel: await rect(page, CANCEL_SEL),
      name: await rect(page, NAME_SEL), sheet: await rect(page, '.vectura-modal'),
    };
    const msg = JSON.stringify(r);
    expect(r.save.top, `Save below the name field ${msg}`).toBeGreaterThanOrEqual(r.name.bottom);
    for (const k of ['save', 'cancel']) {
      expect(r[k].left >= r.sheet.left - 1 && r[k].right <= r.sheet.right + 1 && r[k].top >= r.sheet.top - 1 && r[k].bottom <= r.sheet.bottom + 1, `${k} inside the sheet ${msg}`).toBe(true);
    }
    const hitSave = await page.evaluate((s) => {
      const e = document.querySelector(s); const b = e.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!top && e.contains(top);
    }, SAVE_SEL);
    expect(hitSave, `elementFromPoint at Save centre is Save ${msg}`).toBe(true);
  });

  test('B: keyboard open: name field and Save stay in the visual viewport; Save persists', async ({ page }, testInfo) => {
    await openSheet(page, testInfo);
    const K = kbFor(testInfo);
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(500);
    const vv = await vvBox(page);
    const lo = vv.top; const hi = vv.top + vv.height;
    const r = { sheet: await rect(page, '.vectura-modal'), name: await rect(page, NAME_SEL), save: await rect(page, SAVE_SEL), cancel: await rect(page, CANCEL_SEL) };
    const msg = `${JSON.stringify(r)} vv=${JSON.stringify(vv)}`;
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await shoot(page, { path: `${EVIDENCE}/${testInfo.project.name}.png` });
    expect(r.sheet.bottom, `sheet bottom inside the visual viewport ${msg}`).toBeLessThanOrEqual(hi + 1);
    for (const k of ['name', 'save']) {
      expect(r[k].top >= lo - 1 && r[k].bottom <= hi + 1, `${k} inside the visual viewport ${msg}`).toBe(true);
    }
    expect(r.cancel.top >= lo - 1 && r.cancel.bottom <= hi + 1, `Cancel inside the visual viewport ${msg}`).toBe(true);
    const hitSave = await page.evaluate((s) => {
      const e = document.querySelector(s); const b = e.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!top && e.contains(top);
    }, SAVE_SEL);
    expect(hitSave, `elementFromPoint at Save centre is Save ${msg}`).toBe(true);

    // Type a name, tap Save: the sheet closes and the preset exists in the real store.
    await page.locator(NAME_SEL).fill('Touch049 Saved');
    await touch.tap(page, page.locator(SAVE_SEL));
    await page.waitForFunction(() => !document.querySelector('.vectura-modal-backdrop'), null, { timeout: 4000 });
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').map((p) => p.name), STORE_KEY);
    expect(stored, 'the new preset is in the store the gallery reads').toContain('Touch049 Saved');
  });

  test('B2: the sheet returns to the bottom when the keyboard closes', async ({ page }, testInfo) => {
    await openSheet(page, testInfo);
    const K = kbFor(testInfo);
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__kbRaw({ height: innerHeight, offsetTop: 0, scale: 1 }));
    await page.waitForTimeout(500);
    const inset = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim());
    const sheet = await rect(page, '.vectura-modal');
    const ih = await page.evaluate(() => innerHeight);
    expect(inset, '--kb-inset back to 0').toMatch(/^0(px)?$/);
    expect(Math.abs(sheet.bottom - ih), `sheet bottom ${sheet.bottom} vs innerHeight ${ih}`).toBeLessThanOrEqual(1);
  });

  test('C: short visual viewport hides the preview; name field and Save stay visible', async ({ page }, testInfo) => {
    test.skip(PROJECTS[testInfo.project.name].device !== 'iPhL', 'short viewport applies to iPhone landscape');
    await openSheet(page, testInfo);
    await page.evaluate((k) => window.__kb(k), 200);
    await page.waitForTimeout(500);
    const vv = await vvBox(page);
    const preview = await page.evaluate(() => {
      const e = document.querySelector('.preset-save-preview');
      return e ? { display: getComputedStyle(e).display, h: e.getBoundingClientRect().height } : null;
    });
    expect(preview.display === 'none' || preview.h === 0, `preview hidden ${JSON.stringify(preview)}`).toBe(true);
    const name = await rect(page, NAME_SEL); const save = await rect(page, SAVE_SEL);
    const hi = vv.top + vv.height;
    const msg = `${JSON.stringify({ name, save })} vv=${JSON.stringify(vv)}`;
    expect(name.top >= vv.top - 1 && name.bottom <= hi + 1, `name visible ${msg}`).toBe(true);
    expect(save.top >= vv.top - 1 && save.bottom <= hi + 1, `Save visible ${msg}`).toBe(true);
    expect(save.top, `Save not covering the name field ${msg}`).toBeGreaterThanOrEqual(name.bottom - 1);
  });
});

// D: desktop parity. A fine-pointer 1600x1000 context keeps the old footer (Cancel, Save, right aligned).
test('D: desktop parity (fine pointer) keeps the pre-change footer', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'touch-ipad-portrait', 'one chromium project runs the desktop context');
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, hasTouch: false, isMobile: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui));
  await page.evaluate(() => {
    window.Vectura.UI.PresetSaveModal.open({ layerType: 'spiral', params: {}, suggestedName: 'Desk', origin: { kind: 'scratch', preset: null }, onConfirm: () => {} });
  });
  await page.waitForSelector('.vectura-modal-backdrop[style*="display: flex"]');
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const q = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    return { fine: matchMedia('(pointer: fine)').matches, save: q('.preset-save-confirm'), cancel: q('.preset-save-footer button:not(.preset-save-confirm)'), name: q('#preset-save-name'), sheet: q('.vectura-modal') };
  });
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await shoot(page, { path: `${EVIDENCE}/desktop-1600x1000-${process.env.TUX049_SHOT || 'run'}.png` });
  await ctx.close();
  const msg = JSON.stringify(m);
  expect(m.fine, msg).toBe(true);
  expect(m.cancel.l, `Cancel precedes Save ${msg}`).toBeLessThan(m.save.l);
  expect(m.save.t, `Save below the name field ${msg}`).toBeGreaterThan(m.name.t);
  // Baseline sizes recorded on the base before the change (see the commit body).
  expect([m.save.w, m.save.h], msg).toEqual(BASE.save);
  expect([m.cancel.w, m.cancel.h], msg).toEqual(BASE.cancel);
});

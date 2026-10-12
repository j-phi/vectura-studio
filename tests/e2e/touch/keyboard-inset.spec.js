const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const touch = require('../helpers/touch');
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch2/TUX-032';
const h = require('../helpers/text-panel-setup');

// TUX-032: fields and sheets stay above the on-screen keyboard; the font search does not
// open the keyboard on a finger tap. The keyboard is a fake window.visualViewport (see
// helpers/text-panel-setup.js) with a per-device height K. Finger-only (no mouse).
const SEARCH = '.vtp-fp-search input';
const bottomOf = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().bottom : null; }, sel);
const inset = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim());
const scrollXY = (page) => page.evaluate(() => [window.scrollX, window.scrollY]);

test.describe('TUX-032 keyboard inset', () => {
  let K;
  test.beforeEach(async ({ page }, testInfo) => {
    K = h.keyboardFor(testInfo);
    await page.addInitScript(h.installKeyboardStub);
    await h.waitApp(page);
  });

  test('(a) font picker: a finger tap does not focus the search; the list stays above the keyboard', async ({ page }, testInfo) => {
    // iPhL-chrome leaves 120 px above the keyboard: the search fits, the first row does not.
    test.fail(testInfo.project.name === 'touch-iphone-landscape-chrome', 'iPhL-chrome: 120 px visible, first font row below the keyboard line');
    await h.addDefaultTextLayer(page, touch);   // pane opened via app API where no finger path exists (TUX-010)
    const trigger = page.locator('.vtp-fontpick-trigger');
    await trigger.scrollIntoViewIfNeeded();
    await touch.tap(page, trigger);
    await page.waitForTimeout(150);
    const active = await page.evaluate((s) => ({ isSearch: document.activeElement === document.querySelector(s), tag: document.activeElement && document.activeElement.tagName }), SEARCH);
    expect(active.isSearch, `a finger tap on the font trigger focused the search input (activeElement ${active.tag})`).toBe(false);
    await touch.tap(page, page.locator(SEARCH));
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(250);
    const m = await page.evaluate((s) => {
      const sb = document.querySelector(s).getBoundingClientRect().bottom;
      const opt = document.querySelector('.vtp-fp-opt');
      return { searchBottom: sb, optTop: opt ? opt.getBoundingClientRect().top : null, ih: innerHeight };
    }, SEARCH);
    expect(m.searchBottom, `search bottom ${m.searchBottom} vs visible line ${m.ih - K}`).toBeLessThanOrEqual(m.ih - K);
    expect(m.optTop, `first row top ${m.optTop} vs visible line ${m.ih - K}`).toBeLessThan(m.ih - K);
  });

  // TUX-032 batch 2 (review finding): the font popover must stay fully on screen and its options must be
  // tappable on every touch viewport, with no keyboard open (iPhone landscape 874x402 was the failing one).
  test('(g) font popover stays on screen and its first option is tappable', async ({ page }, testInfo) => {
    await h.addDefaultTextLayer(page, touch);
    const trigger = page.locator('.vtp-fontpick-trigger');
    await trigger.scrollIntoViewIfNeeded();
    await touch.tap(page, trigger);
    await page.waitForSelector('.vtp-fp-pop.open .vtp-fp-opt', { state: 'attached' });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const pop = document.querySelector('.vtp-fp-pop');
      const r = pop.getBoundingClientRect();
      const list = pop.querySelector('.vtp-fp-list').getBoundingClientRect();
      const opts = [...pop.querySelectorAll('.vtp-fp-opt')];
      const vis = opts.filter((o) => { const b = o.getBoundingClientRect(); return b.bottom <= list.bottom + 1 && b.top >= list.top - 1 && b.height > 0; });
      const unsel = opts.find((o) => !o.classList.contains('sel') && vis.includes(o));
      let hit = null;
      if (unsel) { const b = unsel.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); hit = !!e && unsel.contains(e); }
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, listH: list.height, visibleOpts: vis.length, hit };
    });
    expect(m.l, `popover rect ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(0);
    expect(m.t, `popover top ${m.t}`).toBeGreaterThanOrEqual(0);
    expect(m.r, `popover right ${m.r} vs ${m.w}`).toBeLessThanOrEqual(m.w);
    expect(m.b, `popover bottom ${m.b} vs ${m.h}`).toBeLessThanOrEqual(m.h);
    expect(m.visibleOpts, `at least 2 option rows visible in the list (list height ${m.listH})`).toBeGreaterThanOrEqual(2);
    expect(m.hit, 'an unselected option is the hit target at its centre').toBe(true);
    await fs.promises.mkdir(EVID, { recursive: true }).catch(() => {});
    await page.screenshot({ path: path.join(EVID, `font-popover-${testInfo.project.name}.png`) }).catch(() => {});
  });

  test('(b) lower-pane numeric field rises above the keyboard', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    await h.tapIn(page, touch, page.locator('[data-ref="fitToggle"]'));
    await page.waitForSelector('.vtp-scrub[data-field="size"] input', { state: 'visible' });
    const sel = '.vtp-scrub[data-field="size"] input';
    await h.scrollToLow(page, sel);
    await touch.tap(page, page.locator(sel));
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(250);
    const bottom = await bottomOf(page, sel);
    const ih = await page.evaluate(() => innerHeight);
    expect(bottom, `Size input bottom ${bottom} vs visible line ${ih - K}`).toBeLessThanOrEqual(ih - K);
    expect(await inset(page)).toBe(`${K}px`);
    expect(await scrollXY(page)).toEqual([0, 0]);
  });

  test('(c) no false lift: toolbar collapse, zoom, and offsetTop', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.evaluate(() => window.__kb(70));
    await page.waitForTimeout(100);
    expect(await inset(page), 'no editable focused').toBe('0px');
    // focus a field, then pinch-zoomed (scale 2) must read 0
    await h.tapIn(page, touch, page.locator('textarea[data-text-content]'));
    await page.evaluate((k) => window.__kbRaw({ height: innerHeight / 2, offsetTop: 0, scale: 2 }), K);
    await page.waitForTimeout(100);
    expect(await inset(page), 'zoomed').toBe('0px');
    // offsetTop K/2 with height innerHeight-K: the page is scrolled inside the visual viewport
    await page.evaluate((k) => window.__kbRaw({ height: innerHeight - k, offsetTop: k / 2, scale: 1 }), K);
    await page.waitForTimeout(100);
    expect(await inset(page), 'no double lift').toBe(`${K / 2}px`);
  });

  test('(d) Save Preset sheet: name field and Save stay above the keyboard', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    await page.evaluate(() => window.Vectura.UI.PresetSaveModal.open({
      layerType: 'text', params: {}, suggestedName: 'My preset', origin: { kind: 'scratch', preset: null },
      devMode: false, drawThumb: null, onConfirm: () => {},
    }));
    await page.waitForSelector('.preset-save-body input[type="text"], .preset-save-body input:not([type])', { state: 'visible' });
    const nameSel = '.preset-save-body input';
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await touch.tap(page, page.locator(nameSel).first());
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(300);
    const m = await page.evaluate((s) => ({
      name: document.querySelector(s).getBoundingClientRect().bottom,
      save: document.querySelector('.preset-save-confirm').getBoundingClientRect().bottom,
      ih: innerHeight,
    }), nameSel);
    expect(m.name, `name input bottom ${m.name} vs ${m.ih - K}`).toBeLessThanOrEqual(m.ih - K);
    expect(m.save, `Save bottom ${m.save} vs ${m.ih - K}`).toBeLessThanOrEqual(m.ih - K);
  });

  test('(e) dismiss restores everything', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    await h.tapIn(page, touch, page.locator('textarea[data-text-content]'));
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(150);
    expect(await inset(page)).toBe(`${K}px`);
    await page.evaluate(() => { document.activeElement.blur(); window.__kb(0); });
    await page.waitForTimeout(250);
    expect(await inset(page)).toBe('0px');
    expect(await page.evaluate(() => document.documentElement.classList.contains('kb-open'))).toBe(false);
    expect(await scrollXY(page)).toEqual([0, 0]);
  });

  test('(f) TUX-029 Text field rises above the keyboard', async ({ page }) => {
    await h.addDefaultTextLayer(page, touch);
    const sel = 'textarea[data-text-content]';
    await h.scrollToLow(page, sel);
    await touch.tap(page, page.locator(sel));
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(250);
    const bottom = await bottomOf(page, sel);
    const ih = await page.evaluate(() => innerHeight);
    expect(bottom, `Text field bottom ${bottom} vs ${ih - K}`).toBeLessThanOrEqual(ih - K);
  });

  // Layer search (#layer-search-input) is a hidden bar until the layers search toggle is
  // finger-reachable; it is covered by the same delegated focus handling as (b).
  test.fixme('(g) layer search field rises above the keyboard', async () => {});
});

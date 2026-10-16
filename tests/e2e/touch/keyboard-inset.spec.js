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

  test('(a) font picker: a finger tap does not focus the search; the list stays above the keyboard', async ({ page }) => {
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

  // TUX-032 follow-up: with the keyboard open in landscape the pinned popover keeps >= 3 option rows in view
  // (a compact header: the category chips go away while the keyboard is up). Keyboard = the fake visualViewport.
  test('(h) font popover with the keyboard open still shows at least 3 option rows (landscape)', async ({ page }, testInfo) => {
    test.skip(!/iphone-landscape/.test(testInfo.project.name), 'iPhone landscape is the short viewport');
    await h.addDefaultTextLayer(page, touch);
    const trigger = page.locator('.vtp-fontpick-trigger');
    await trigger.scrollIntoViewIfNeeded();
    await touch.tap(page, trigger);
    await page.waitForSelector('.vtp-fp-pop.open .vtp-fp-opt', { state: 'attached' });
    await touch.tap(page, page.locator(SEARCH));
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(350);
    const m = await page.evaluate((k) => {
      const pop = document.querySelector('.vtp-fp-pop');
      const r = pop.getBoundingClientRect();
      const listEl = pop.querySelector('.vtp-fp-list');
      const firstOpt = listEl.querySelector('.vtp-fp-opt');
      if (firstOpt) listEl.scrollTop = firstOpt.offsetTop - listEl.offsetTop - 2; // capacity: the list sits on its first row
      const list = listEl.getBoundingClientRect();
      const line = innerHeight - k;
      const vis = [...pop.querySelectorAll('.vtp-fp-opt')].filter((o) => { const b = o.getBoundingClientRect(); return b.height > 0 && b.top >= list.top - 1 && b.bottom <= Math.min(list.bottom, line) + 1; });
      const si = pop.querySelector('.vtp-fp-search input').getBoundingClientRect();
      return { popT: r.top, popB: r.bottom, line, listH: list.height, rows: vis.length, rowH: vis[0] ? vis[0].getBoundingClientRect().height : 0, searchH: si.height };
    }, K);
    // §1.5 absolute floor: no target under 24 px, even in the typing-mode compact header (TUX-032 review).
    expect(m.rowH, `compact option row height (${JSON.stringify(m)})`).toBeGreaterThanOrEqual(24);
    expect(m.searchH, `compact search field height (${JSON.stringify(m)})`).toBeGreaterThanOrEqual(24);
    expect(m.popB, `popover bottom ${m.popB} above the keyboard line ${m.line}`).toBeLessThanOrEqual(m.line + 1);
    expect(m.rows, `option rows fully visible above the keyboard (list ${m.listH} px, row ${m.rowH} px, ${JSON.stringify(m)})`).toBeGreaterThanOrEqual(3);
    await fs.promises.mkdir(EVID, { recursive: true }).catch(() => {});
    await page.screenshot({ path: path.join('/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch3', `font-popover-keyboard-${testInfo.project.name}.png`) }).catch(() => {});
  });

  // TUX-032 review: with no keyboard the popover rows are finger targets (44 px on a coarse pointer).
  test('(h2) font popover rows are at least 44 px with no keyboard', async ({ page }, testInfo) => {
    await h.addDefaultTextLayer(page, touch);
    const trigger = page.locator('.vtp-fontpick-trigger');
    await trigger.scrollIntoViewIfNeeded();
    await touch.tap(page, trigger);
    await page.waitForSelector('.vtp-fp-pop.open .vtp-fp-opt', { state: 'attached' });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const pop = document.querySelector('.vtp-fp-pop');
      const hs = [...pop.querySelectorAll('.vtp-fp-opt')].slice(0, 12).map((o) => o.getBoundingClientRect().height);
      return { compact: pop.classList.contains('kb-compact'), min: Math.min(...hs), n: hs.length, search: pop.querySelector('.vtp-fp-search input').getBoundingClientRect().height };
    });
    expect(m.compact).toBe(false);
    expect(m.min, `smallest option row ${m.min} px (${JSON.stringify(m)})`).toBeGreaterThanOrEqual(43.5);
    expect(m.search, `search field ${m.search} px`).toBeGreaterThanOrEqual(43.5);
    await fs.promises.mkdir('/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch3b', { recursive: true }).catch(() => {});
    await page.screenshot({ path: path.join('/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch3b', `font-popover-rows-${testInfo.project.name}.png`) }).catch(() => {});
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

  test('(g2) layer search field rises above the keyboard', async ({ page }) => {
    await page.evaluate(() => { window.app.engine.addLayer('flowfield'); window.app.ui.renderLayers && window.app.ui.renderLayers(); });
    // Open the Layers pane by finger (toggle or phone drawer button).
    const open = async () => page.evaluate(() => { const e = document.getElementById('layer-search-input'); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.width > 0 && (t === e); });
    if (!(await open())) {
      for (const id of ['btn-header-pane-right', 'btn-pane-toggle-right', 'btn-mobile-pane-right']) {
        const btn = page.locator(`#${id}`);
        if (await btn.isVisible().catch(() => false)) { await touch.tap(page, btn); await page.waitForTimeout(400); if (await open()) break; }
      }
    }
    expect(await open(), 'layer search reachable by finger').toBe(true);
    await touch.tap(page, page.locator('#layer-search-input'));
    await page.evaluate((k) => window.__kb(k), K);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ b: document.getElementById('layer-search-input').getBoundingClientRect().bottom, ih: innerHeight, focus: document.activeElement && document.activeElement.id }));
    expect(m.focus).toBe('layer-search-input');
    expect(m.b, `search bottom ${m.b} vs ${m.ih - K}`).toBeLessThanOrEqual(m.ih - K);
  });
});

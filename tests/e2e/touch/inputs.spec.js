const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-042: text-entry controls compute >= 16px on coarse pointers (iOS Safari zooms the page
// on focus when a field is smaller). Lane-local spec; lane H adopts it into TUX-058.
// Real iOS zoom cannot be simulated: the computed font-size is the RED, the no-zoom check is a
// [DEVICE] row in docs/touch-audit/changelog-fragments/TUX-042.md.
const MIN_FONT = 16;
const TEXT_ENTRY = [
  'input:not([type])',
  'input[type=text]', 'input[type=number]', 'input[type=search]', 'input[type=email]',
  'input[type=url]', 'input[type=tel]', 'input[type=password]',
  'select', 'textarea',
  '[contenteditable]:not([contenteditable=false])',
].join(',');

// SETUP STEP (not a journey step): phone panes start closed and TUX-010 has not landed, so the
// spec opens them programmatically. Remove once TUX-010 lands.
const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    document.getElementById('left-pane').classList.add('pane-force-open');
    document.getElementById('right-pane').classList.add('pane-force-open');
    // TUX-008: a touch tablet shows one drawer at a time (the controller owns it). Every test here reads the right pane.
    const b = document.body;
    if (b.classList.contains('tablet-layout') && b.classList.contains('touch-ui')) window.Vectura.UI.Workspace.paneState.open('right');
  });
};

// SETUP: add layers through the engine API so the generator panel and (for 'text') the Text
// panel DOM is rendered.
const addLayerAndSelect = async (page, type) => {
  await page.evaluate((t) => {
    const id = window.app.engine.addLayer(t);
    window.app.engine.activeLayerId = id;
    window.app.ui.renderLayers();
    if (window.app.ui.buildControls) window.app.ui.buildControls();
  }, type);
  await page.waitForTimeout(600);
};

// Computed font sizes of EVERY text-entry element, visible or not (getComputedStyle works on
// hidden elements, so no drawer needs opening).
const smallFields = (page) => page.evaluate(({ sel, min }) => {
  const name = (el) => {
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls ? `.${cls}` : '') + (el.dataset && el.dataset.ref ? `[data-ref=${el.dataset.ref}]` : '');
  };
  const all = [...document.querySelectorAll(sel)];
  const small = all.map((el) => ({ selector: name(el), fontSize: parseFloat(getComputedStyle(el).fontSize) })).filter((o) => o.fontSize < min);
  return { total: all.length, small };
}, { sel: TEXT_ENTRY, min: MIN_FONT });

const summary = (r) => {
  const by = {};
  r.small.forEach((o) => { const k = `${o.selector}@${o.fontSize}`; by[k] = (by[k] || 0) + 1; });
  return `${r.small.length}/${r.total} <${MIN_FONT}px: ${JSON.stringify(by)}`;
};

test.describe('TUX-042 text-entry font size', () => {
  test('text-entry controls compute >= 16px (default state)', async ({ page }, testInfo) => {
    await boot(page);
    await addLayerAndSelect(page, 'flowfield');
    const r = await smallFields(page);
    testInfo.annotations.push({ type: 'measured', description: summary(r) });
    expect(r.small.length, summary(r)).toBe(0);
  });

  test('text-entry controls compute >= 16px (Text panel rendered)', async ({ page }, testInfo) => {
    await boot(page);
    await addLayerAndSelect(page, 'text');
    expect(await page.locator('.vtp-vselect[data-ref=otFigures]').count(), 'Text panel DOM must be rendered').toBeGreaterThan(0);
    const r = await smallFields(page);
    testInfo.annotations.push({ type: 'measured', description: summary(r) });
    expect(r.small.length, summary(r)).toBe(0);
    // The contenteditable specimen is 34px by design; TUX-042 must never shrink it.
    const spec = await page.evaluate(() => [...document.querySelectorAll('.vtp-spec-text')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
    spec.forEach((s) => expect(s).toBeGreaterThanOrEqual(MIN_FONT));
  });

  test('focused field does not shrink after focus', async ({ page }) => {
    await boot(page);
    await addLayerAndSelect(page, 'flowfield');
    const input = page.locator('#layer-search-input');
    await input.scrollIntoViewIfNeeded();
    await touch.tap(page, input);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('layer-search-input');
    expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(MIN_FONT);
    // Smoke only: simulation cannot zoom, so this can never fail. Real zoom is a [DEVICE] row.
    expect(await page.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1))).toBe(1);
  });

  // Guard: keeps 16px text from clipping inside its chip. Covers the left-pane/pens chips, every
  // select.ctrl-sel (longest option) and the Document Setup .slider-val-inp with the panel open.
  test('value chips do not clip', async ({ page }, testInfo) => {
    // KNOWN FAILURE on iPadL, narrowed in the TUX-008 fix round 3. The only remaining clip is the Pens
    // .pen-name-input (box 47 px, text 87 px, "Pen 12 Blue") in the 200 px capped pane; layer search now passes.
    // TUX-012 reflows the pen row. test.fail() flips red when it lands: remove the annotation then.
    test.fail(/ipad-landscape/.test(testInfo.project.name), 'blocked on TUX-012 (iPadL pane caps, TUX-008)');
    await boot(page);
    await addLayerAndSelect(page, 'flowfield');
    // SETUP STEP: open Document Setup programmatically and expand every section (phones have no
    // reachable menu path here until TUX-010/001 land).
    await page.evaluate(() => {
      const sp = document.getElementById('settings-panel');
      sp.classList.add('open');
      sp.querySelectorAll('[data-sect-body]').forEach((b) => { b.style.maxHeight = 'none'; b.style.overflow = 'visible'; b.style.visibility = ''; });
    });
    await page.evaluate(() => {
      document.querySelector('.right-pane-tab[data-tab=pens]')?.click();
    });
    await page.waitForTimeout(300);
    const clipped = await page.evaluate(() => {
      const out = [];
      const ctx = document.createElement('canvas').getContext('2d');
      const textW = (cs, val) => { ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return ctx.measureText(val).width; };
      document.querySelectorAll('.slider-val-inp, .slider-val, .pen-name-input, .pen-width-value, select.ctrl-sel').forEach((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (!r.width || cs.visibility === 'hidden' || el.closest('.hidden, [hidden]')) return;
        // Input scrollWidth is unreliable (editor padding quirks), so compare the measured
        // text width against the content box. Selects: the longest option text.
        let val = el.classList.contains('pen-name-input') ? 'Pen 12 Blue' : '0.125';
        if (el.tagName === 'SELECT') val = [...el.options].map((o) => o.text).sort((x, y) => y.length - x.length)[0] || '';
        const text = textW(cs, val);
        const box = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        // Native selects reserve the arrow inside the padding, so only compare against the box.
        if (text > box + 1) out.push({ id: el.id, cls: el.className, text: Math.round(text), box: Math.round(box), val });
      });
      return out;
    });
    expect(clipped).toEqual([]);
    // The settings panel must actually have been measured (selector must not silently match nothing).
    expect(await page.locator('.settings-panel select.ctrl-sel').count()).toBeGreaterThan(0);
    expect(await page.locator('.settings-panel .slider-val-inp').count()).toBeGreaterThan(0);
  });
});

// Fine-pointer parity: the !important rule must be media-scoped. Own desktop context.
test('desktop parity: fine pointer is unchanged', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, hasTouch: false, isMobile: false });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => { const id = window.app.engine.addLayer('flowfield'); window.app.engine.activeLayerId = id; window.app.ui.renderLayers(); window.app.ui.buildControls && window.app.ui.buildControls(); });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
    const size = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).fontSize : null; }, sel);
    expect(await size('#layer-search-input')).toBe('11px');
    expect(await size('select.ctrl-sel')).toBe('11px');
    expect(await size('.slider-val')).toBe('11px');
  } finally {
    await ctx.close();
  }
});

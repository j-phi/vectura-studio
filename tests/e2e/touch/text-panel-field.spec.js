const { evidenceDir, shoot } = require('../helpers/evidence');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-029: the Text panel's multi-line "Text" content field. Finger-only (no mouse).
// Setup goes through the real path: the layer is created the way the Type tool does
// (app._createPointTextLayerAt) and the 8 pt size is set through the panel's own size
// control. Factory defaults are NOT used (fitToFrame:true hides the font-size defect).
const FIELD = 'textarea[data-text-content]';

const state = (page) => page.evaluate(() => {
  const l = window.app.engine.getActiveLayer();
  return { text: l ? l.params.text : null, paths: l && l.paths ? l.paths.length : -1, hist: window.app.history.length };
});

// Fail fast (no 60 s locator wait) and name what a finger would find instead.
const requireField = async (page) => {
  const d = await page.evaluate((sel) => {
    const spec = document.querySelector('.vtp-spec-text');
    return {
      exists: !!document.querySelector(sel),
      specFont: spec ? parseFloat(getComputedStyle(spec).fontSize) : null,
      specEditable: spec ? spec.getAttribute('contenteditable') : null,
    };
  }, FIELD);
  expect(d.exists, `no ${FIELD} in the Text panel (specimen contenteditable=${d.specEditable}, font-size ${d.specFont}px)`).toBe(true);
};

const openLeftPane = async (page) => {
  const open = () => page.evaluate(() => {
    const p = document.getElementById('left-pane') || document.querySelector('.pane-left');
    if (!p) return false;
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return r.width > 100 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  if (await open()) return;
  for (const id of ['btn-pane-toggle-left', 'btn-mobile-pane-left']) {
    const btn = page.locator(`#${id}`);
    if (await btn.isVisible().catch(() => false)) {
      await touch.tap(page, btn);
      await page.waitForTimeout(350);
      if (await open()) return;
    }
  }
  await page.evaluate(() => {
    const pane = document.getElementById('left-pane') || document.querySelector('.pane-left');
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await page.waitForTimeout(350);
};

const setup = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  await page.evaluate(() => {
    const layer = window.app._createPointTextLayerAt(0, 0);
    layer.params.text = 'Hello';
    window.app.textEdit.end();
    window.app.ui.storeLayerParams(layer);
    window.app.regen();
    window.app.ui.buildControls();
  });
  await openLeftPane(page);
  // 8 pt through the panel's own size control.
  const size = page.locator('.vtp-scrub[data-field="size"] input');
  await size.scrollIntoViewIfNeeded();
  await size.fill('8');
  await size.press('Enter');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.app.engine.getActiveLayer().params.fontSize)).toBe(8);
  expect(await page.evaluate(() => !!window.app.engine.getActiveLayer().params.fitToFrame)).toBe(false);
};

const canvasPoint = (page) => page.evaluate(() => {
  const c = document.getElementById('main-canvas');
  const r = c.getBoundingClientRect();
  for (let j = 1; j <= 7; j += 1) {
    for (let i = 1; i <= 7; i += 1) {
      const x = r.left + (r.width * i) / 8;
      const y = r.top + (r.height * j) / 8;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      if (document.elementFromPoint(x, y) === c) return { x, y };
    }
  }
  return null;
});

// Fix round: a canvas Type session still live on the same layer must not eat the
// first tap. Focusing the field used to end() the session, whose refreshPanel rebuilt
// the panel synchronously inside the focus event and detached the field.
const liveSessionFlow = async (page, tapField) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  await page.evaluate(() => { document.querySelector('.tool-btn[data-tool="type"]').click(); });
  let pt = null;
  for (let i = 0; i < 20 && !pt; i += 1) { pt = await canvasPoint(page); if (!pt) await page.waitForTimeout(150); }
  expect(pt, 'no reachable canvas point').toBeTruthy();
  await tapField.canvas(pt);
  await page.waitForFunction(() => window.app.textEdit.isActive());
  await page.evaluate(() => window.app.textEdit.insertText('Abc'));   // NO textEdit.end()
  expect(await page.evaluate(() => window.app.textEdit.isActive())).toBe(true);
  await openLeftPane(page);
  const field = page.locator(FIELD);
  await field.scrollIntoViewIfNeeded();
  const h0 = (await state(page)).hist;
  const handle = await field.elementHandle();
  await tapField.field(field);
  const info = await page.evaluate((el) => ({
    same: document.activeElement === el,
    connected: el.isConnected,
    text: window.app.engine.getActiveLayer().params.text,
  }), handle);
  expect(info.connected, 'field detached by a panel rebuild in its own focus event').toBe(true);
  expect(info.same, 'field not focused after the first tap').toBe(true);
  expect(info.text).toBe('Abc');
  await page.keyboard.insertText(' xyz');
  await page.waitForTimeout(300);
  expect((await state(page)).text).toBe('Abc xyz');
  expect(await page.evaluate((el) => document.activeElement === el && el.isConnected, handle)).toBe(true);
  // Blur: the field session adds exactly one history entry.
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  expect((await state(page)).hist - h0).toBe(1);
};

// Blank session-created layer: a field tap used to run the M6 blank-layer discard.
// iPhone portrait: the pane is a drawer, and opening it (a toolbar tap) ends the Type
// session, so a blank session layer is discarded before the field is reachable. That
// is the correct M6 behaviour, not a field defect; the flow is unreachable there.
const blankFlowUnreachable = (testInfo) => /iphone-portrait/.test(testInfo.project.name);
const blankSessionFlow = async (page, tapField, opts = {}) => {
  const typed = opts.typed !== false;
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  await page.evaluate(() => { document.querySelector('.tool-btn[data-tool="type"]').click(); });
  let pt = null;
  for (let i = 0; i < 20 && !pt; i += 1) { pt = await canvasPoint(page); if (!pt) await page.waitForTimeout(150); }
  expect(pt, 'no reachable canvas point').toBeTruthy();
  const hist0 = (await state(page)).hist;
  const layers0 = await page.evaluate(() => window.app.engine.layers.length);
  await tapField.canvas(pt);
  await page.waitForFunction(() => window.app.textEdit.isActive());   // NO insertText
  await openLeftPane(page);
  const field = page.locator(FIELD);
  await field.scrollIntoViewIfNeeded();
  const handle = await field.elementHandle();
  await tapField.field(field);
  if (!typed) {
    // Blur without typing: the M6 blank-layer discard is restored for the handed-over layer.
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ layers: window.app.engine.layers.length }));
    expect(after.layers, 'blank handed-over layer survived the blur').toBe(layers0);
    expect((await state(page)).hist, 'creation history entry not unwound').toBe(hist0);
    return;
  }
  await page.keyboard.insertText('Hi');
  await page.waitForTimeout(300);
  const info = await page.evaluate((el) => ({
    layers: window.app.engine.layers.length,
    connected: el.isConnected,
    active: document.activeElement === el,
    text: window.app.engine.getActiveLayer() && window.app.engine.getActiveLayer().params.text,
  }), handle);
  expect(info.layers, 'blank session layer was discarded by the field tap').toBe(1);
  expect(info.connected, 'field detached').toBe(true);
  expect(info.active, 'field not focused').toBe(true);
  expect(info.text).toBe('Hi');
  // Two-step undo: typed text first, then the layer.
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.app.undo());
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => { const l = window.app.engine.layers; return l.length === 1 && l[0].params.text; }), 'first undo reverts text').toBe('');
  await page.evaluate(() => window.app.undo());
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.app.engine.layers.length), 'second undo removes the layer').toBe(layers0);
};

test.describe('TUX-029 live canvas Type session + Text field', () => {
  // TUX-007 landed: the iPhL-chrome expected-fail mark (covered canvas) is gone.
  test('first tap on the field keeps it focused and typing works', async ({ page }) => {
    await liveSessionFlow(page, {
      canvas: async (pt) => { await touch.tap(page, pt); },
      field: async (loc) => { await touch.tap(page, loc); },
    });
  });
  test('first tap on the field in a blank session layer keeps the layer and takes the text', async ({ page }, testInfo) => {
    test.skip(blankFlowUnreachable(testInfo), 'iPhP drawer open ends the Type session (M6 discards the blank layer first)');
    await blankSessionFlow(page, {
      canvas: async (pt) => { await touch.tap(page, pt); },
      field: async (loc) => { await touch.tap(page, loc); },
    });
  });
});

test.describe('TUX-029 blank handed-over layer', () => {
  test('field tap then blur without typing discards the blank layer and unwinds history', async ({ page }, testInfo) => {
    test.skip(blankFlowUnreachable(testInfo), 'iPhP drawer open ends the Type session (M6 discards the blank layer first)');
    await blankSessionFlow(page, {
      canvas: async (pt) => { await touch.tap(page, pt); },
      field: async (loc) => { await touch.tap(page, loc); },
    }, { typed: false });
  });
});

test.describe('TUX-029 Text panel content field', () => {
  // iPhone cells depend on Phase-1 work that has not merged yet:
  //   TUX-001 / TUX-010 (iPhP: 0x0 pane, innerWidth 544) - observed GREEN on the
  //     iPhP cells anyway, so they carry no mark and must stay green.
  //   TUX-007 (iPhL: IndexSizeError in drawTextModeWidget) landed; the iPhL expected-fail marks are gone.
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('tap focuses a >=16px, uncovered, multi-line field that edits live with one history entry', async ({ page }) => {
    const field = page.locator(FIELD);
    await requireField(page);
    await field.scrollIntoViewIfNeeded();
    const pre = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      const r = f ? f.getBoundingClientRect() : null;
      return { exists: !!f, w: r ? r.width : 0 };
    }, FIELD);
    expect(pre.exists, 'no textarea[data-text-content] in the Text panel').toBe(true);
    await touch.tap(page, field);
    const hist0 = (await state(page)).hist;
    const info = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      const cs = getComputedStyle(f);
      const r = f.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return {
        active: document.activeElement === f,
        activeDesc: document.activeElement ? `${document.activeElement.tagName}.${String(document.activeElement.className).split(' ')[0]}` : null,
        fontSize: parseFloat(cs.fontSize),
        covered: hit !== f,
        clientHeight: f.clientHeight,
        lineHeight: lh,
        overflowY: cs.overflowY,
      };
    }, FIELD);
    expect(info.active, `activeElement is ${info.activeDesc}`).toBe(true);
    expect(info.fontSize).toBeGreaterThanOrEqual(16);
    expect(info.covered).toBe(false);
    expect(info.clientHeight).toBeGreaterThanOrEqual(3 * info.lineHeight);
    expect(['auto', 'scroll']).toContain(info.overflowY);

    const before = await state(page);
    await page.keyboard.insertText(' World');
    await page.waitForTimeout(350);
    const after = await state(page);
    expect(after.text).toBe(`${before.text} World`);
    expect(after.paths).not.toBe(before.paths);
    // A panel rebuild would drop focus and close the iOS keyboard.
    expect(await page.evaluate((sel) => document.activeElement === document.querySelector(sel), FIELD)).toBe(true);

    // 5 lines scroll rather than clip.
    await page.keyboard.insertText('\n2\n3\n4\n5\n6');
    await page.waitForTimeout(250);
    const scroll = await page.evaluate((sel) => { const f = document.querySelector(sel); return { sh: f.scrollHeight, ch: f.clientHeight }; }, FIELD);
    expect(scroll.sh).toBeGreaterThan(scroll.ch);

    // Tap the canvas to blur: the whole session is exactly one history entry.
    let pt = await canvasPoint(page);
    if (!pt) {
      // TUX-007: iPhone landscape panes are drawers over a backdrop; the backdrop covers the canvas
      // while the drawer is open. A finger tap on the backdrop dismisses the drawer and blurs the field.
      const backdrop = page.locator('.mobile-pane-backdrop');
      if (await backdrop.count()) await touch.tap(page, { x: 700, y: 300 });
      await page.waitForTimeout(400);
      pt = await canvasPoint(page);
    }
    expect(pt, 'no reachable canvas point').toBeTruthy();
    await touch.tap(page, pt);
    await page.waitForTimeout(250);
    const end = await state(page);
    expect(end.hist - hist0).toBe(1);
  });

  test('coarse pointer: the specimen is a preview and a tap on it focuses the field', async ({ page }) => {
    const spec = page.locator('.vtp-spec-text');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await spec.getAttribute('contenteditable')).not.toBe('true');
    // Specimen may be collapsed or scrolled; expand it for the tap.
    await page.evaluate(() => document.querySelector('.vtp-specimen').classList.remove('collapsed'));
    await spec.scrollIntoViewIfNeeded();
    await touch.tap(page, spec);
    expect(await page.evaluate((sel) => document.activeElement === document.querySelector(sel), FIELD)).toBe(true);
  });

  test('screenshot with the field focused and text typed', async ({ page }, testInfo) => {
    const field = page.locator(FIELD);
    await requireField(page);
    await field.scrollIntoViewIfNeeded();
    await touch.tap(page, field);
    await page.keyboard.insertText(' typed on touch');
    await page.waitForTimeout(300);
    const name = { iPadP: 'iPadP', iPadL: 'iPadL', iPhP: 'iPhP', iPhL: 'iPhL' }[testInfo.project.name.replace(/^(touch|webkit)-/, '').replace('ipad-portrait', 'iPadP').replace('ipad-landscape', 'iPadL').replace('iphone-portrait', 'iPhP').replace('iphone-landscape', 'iPhL')];
    if (name && testInfo.project.name.startsWith('touch-')) {
      await shoot(page, { path: `${evidenceDir('TUX-029')}/${name}.png` });
    }
    expect(await page.evaluate((sel) => !!document.querySelector(sel), FIELD)).toBe(true);
  });
});

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

test.describe('TUX-029 Text panel content field', () => {
  // iPhone cells depend on Phase-1 work that has not merged yet:
  //   TUX-001 / TUX-010 (iPhP: 0x0 pane, innerWidth 544) - observed GREEN on the
  //     iPhP cells anyway, so they carry no mark and must stay green.
  //   TUX-007 (iPhL: IndexSizeError in drawTextModeWidget) - the canvas redraw that
  //     follows layer creation throws, so the iPhL cells are marked expected-fail.
  // Remove the iPhL marks (test.fail) when TUX-007 merges; the run then fails with
  // "unexpectedly passed" to remind you.
  test.beforeEach(async ({ page }, testInfo) => {
    test.fail(/iphone-landscape/.test(testInfo.project.name), 'TUX-007: IndexSizeError in drawTextModeWidget on iPhL');
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
    const pt = await canvasPoint(page);
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
      await page.screenshot({ path: `/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-029/${name}.png` });
    }
    expect(await page.evaluate((sel) => !!document.querySelector(sel), FIELD)).toBe(true);
  });
});

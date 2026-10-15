const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const touch = require('../helpers/touch');
const { PROJECTS } = require('./viewports');
const { STATES } = require('./target-audit-states');

// TUX-041 batch B3 (modals), strict slice. Every interactive target in every modal has a hit area of at least 44 x 44 CSS px
// on every touch project (hitArea() counts ::before extensions and returns what elementFromPoint really resolves to, so an
// expansion that a neighbour covers does not count). Each target's centre also resolves to itself (no neighbour steals it).
// The generator picker's info button is part of this slice: it is the one small target the picker audit cell reported.
// Screenshots go to docs/touch-audit/evidence/after/B3/ (untracked).
const MIN = 44;
const EVIDENCE = path.resolve(__dirname, '..', '..', '..', 'docs', 'touch-audit', 'evidence', 'after', 'B3');
const shot = async (page, name) => { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), scale: 'css' }); };
const TARGETS = 'button, input, select, textarea, summary, a[href], [role="button"], [role="tab"], [tabindex="0"], label.sw-toggle';

async function boot(page, baseURL) {
  await core.bootApp(page, baseURL);
  await page.evaluate(() => {
    const { engine, ui } = window.app;
    if (!engine.layers.length) engine.addLayer('wavetable');
    if (ui.renderLayers) ui.renderLayers();
    if (ui.buildControls) ui.buildControls();
  });
}

const runState = async (page, id) => {
  const st = STATES.find((s) => s.id === id);
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000, message: `postcondition of ${id}` }).toBe(true);
};

// id -> { root: the modal container selector, open(page) }
const MODALS = {
  export: { root: '#modal-overlay', card: '#modal-overlay .modal-card', close: '#modal-overlay .modal-close', primary: '#export-modal-submit', open: (p) => runState(p, 'modal-export') },
  help: { root: '#modal-overlay', card: '#modal-overlay .modal-card', close: '#modal-overlay .modal-close', open: (p) => runState(p, 'modal-help') },
  // Every collapsed section is expanded: its controls are targets as soon as the user opens it.
  'document-setup': { root: '#settings-panel', card: '#settings-panel', close: '#btn-close-settings', open: async (p) => {
    await runState(p, 'modal-document-setup');
    await p.evaluate(() => document.querySelectorAll('#settings-panel .sect-hdr[aria-expanded="false"]').forEach((h) => h.click()));
    await p.waitForTimeout(500);
  } },
  'save-preset': { root: '.vectura-modal', card: '.vectura-modal', close: '.preset-save-footer button:first-child', primary: '.preset-save-footer button:last-child', open: (p) => runState(p, 'modal-preset-save') },
  'color-picker': { root: '#modal-overlay', card: '#modal-overlay .modal-card', close: '#modal-overlay .modal-close', primary: '.color-modal-apply', open: (p) => p.evaluate(() => window.app.ui.openColorModal({ title: 'Pen colour', value: '#ff3366', onApply() {} })) },
  info: { root: '#modal-overlay', card: '#modal-overlay .modal-card', close: '#modal-overlay .modal-close', open: (p) => p.evaluate(() => window.app.ui.showInfo('wavetable.lineStructure')) },
  'clear-canvas': { root: '#modal-overlay', card: '#modal-overlay .modal-card', close: '#modal-overlay .modal-close', primary: '.tour-continue-btn', open: async (p) => {
    await p.evaluate(() => {
      const b = document.getElementById('btn-menu-hamburger');
      if (b && b.checkVisibility() && !document.body.classList.contains('phone-menu-open')) b.click();
      document.getElementById('btn-menu-help').click();
    });
    await p.waitForFunction(() => document.querySelector('#btn-menu-help ~ .top-menu-panel.open'));
    await p.evaluate(() => document.getElementById('btn-tour').click());
  } },
  'cannot-remove-pen': { root: '#modal-overlay', card: '#modal-overlay .modal-card', close: '#modal-overlay .modal-close', open: (p) => p.evaluate(() => {
    window.app.ui.openModal({ title: 'Cannot Remove Pen', body: '<p class="modal-text">At least one pen must remain in the list.</p>' });
  }) },
};

async function enumerate(page, root) {
  return page.evaluate(({ root, sel }) => {
    const host = [...document.querySelectorAll(root)].find((e) => e.checkVisibility({ checkVisibilityCSS: true }));
    if (!host) return null;
    let n = 0;
    return [...host.querySelectorAll(sel)].filter((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (!e.checkVisibility({ checkVisibilityCSS: true }) || r.width < 1 || r.height < 1 || cs.pointerEvents === 'none') return false;
      if (e.matches('input[type="hidden"], input[type="file"]')) return false;
      if (e.matches('input[type="checkbox"], input[type="radio"]') && e.closest('label.sw-toggle')) return false; // the label is the target
      if (e.matches('.sr-only')) return false;
      return true;
    }).map((e) => { n += 1; e.setAttribute('data-b3-probe', String(n)); return { i: n, label: (e.id ? '#' + e.id : (e.getAttribute('aria-label') || e.getAttribute('data-tab') || e.className || e.tagName)).toString().trim().replace(/\s+/g, '.').slice(0, 60) }; });
  }, { root, sel: TARGETS });
}

async function measure(page, root) {
  const items = await enumerate(page, root);
  if (!items) return null;
  const bad = []; const stolen = [];
  for (const it of items) {
    const loc = page.locator(`[data-b3-probe="${it.i}"]`);
    await loc.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
    await page.waitForTimeout(30);
    const a = await touch.hitArea(page, loc);
    if (a.w < MIN || a.h < MIN) bad.push(`${it.label} ${a.w}x${a.h}`);
    const own = await loc.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!t && (t === e || e.contains(t) || t.contains(e) || (t.tagName === 'LABEL' && t.control === e));
    });
    if (!own) stolen.push(it.label);
  }
  return { count: items.length, bad, stolen };
}

test.describe('TUX-041 B3 modals', () => {
  test.use({ reducedMotion: 'reduce' });
  test.describe.configure({ retries: 0 });

  for (const [id, m] of Object.entries(MODALS)) {
    test(`${id}: every modal target is at least 44 x 44`, async ({ page, baseURL }, testInfo) => {
      test.setTimeout(90_000);
      await boot(page, baseURL);
      await m.open(page);
      await page.waitForTimeout(400);
      await core.waitLayoutSettled(page);
      if (process.env.B3_SHOT) {
        fs.mkdirSync(process.env.B3_SHOT, { recursive: true });
        await page.screenshot({ path: path.join(process.env.B3_SHOT, `${testInfo.project.name}-${id}.png`), scale: 'css' });
      }
      const r = await measure(page, m.root);
      expect(r, `${id}: modal root ${m.root} is visible`).toBeTruthy();
      testInfo.annotations.push({ type: 'B3', description: `${id}: ${r.count} targets, ${r.bad.length} under ${MIN}` });
      if (process.env.B3_LOG) console.log('B3RED', testInfo.project.name, id, JSON.stringify(r));
      expect(r.count, `${id}: has targets`).toBeGreaterThan(0);
      expect(r.bad, `${id} targets under ${MIN}`).toEqual([]);
      expect(r.stolen, `${id} targets whose centre a neighbour owns`).toEqual([]);
    });
  }

  // Classic skins show the native checkbox inside .sw-toggle (display:inline). The ::before extension must still hold 44 x 44 there.
  for (const id of ['export', 'document-setup']) {
    test(`${id} in the classic-dark skin: every modal target is at least 44 x 44`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      await boot(page, baseURL);
      await page.evaluate(() => { document.documentElement.dataset.uiSkin = 'classic-dark'; });
      await page.waitForTimeout(300);
      await MODALS[id].open(page);
      await page.waitForTimeout(400);
      await core.waitLayoutSettled(page);
      const r = await measure(page, MODALS[id].root);
      expect(r, `${id}: modal root is visible`).toBeTruthy();
      expect(r.bad, `${id} (classic-dark) targets under ${MIN}`).toEqual([]);
      expect(r.stolen, `${id} (classic-dark) targets whose centre a neighbour owns`).toEqual([]);
    });
  }

  // Finger check (page.touchscreen): a tap that lands OUTSIDE a small visual but inside its 44 px hit area does the job. The
  // visual is 15-30 px; the tap is 15 px off its centre on the vertical axis.
  test('finger: a tap just outside the toggle and the info button still hits them (document setup)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await MODALS['document-setup'].open(page);
    await page.waitForTimeout(400);
    const tapOff = async (loc, dy) => {
      await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(80);
      const b = await loc.boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2 + dy);
    };
    // toggle: 30 x 16 box, tap 15 px below its centre
    const tog = page.locator('#settings-panel label.sw-toggle').first();
    const before = await tog.locator('input').evaluate((i) => i.checked);
    await tapOff(tog, 15);
    await expect.poll(() => tog.locator('input').evaluate((i) => i.checked), { message: 'toggle flipped by an off-centre tap' }).toBe(!before);
    await shot(page, `${testInfo.project.name}-toggle-finger`);
    // info button: 17 x 17 box, tap 15 px above its centre; the info sheet opens
    const info = page.locator('#settings-panel .info-btn').first();
    await tapOff(info, -15);
    await expect(page.locator('#modal-overlay'), 'info sheet opened by an off-centre tap').toBeVisible();
    await shot(page, `${testInfo.project.name}-info-finger`);
  });

  test('finger: export and help controls respond to a tap (tabs, steppers, preview buttons)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await MODALS.help.open(page);
    await page.waitForTimeout(300);
    const tab = page.locator('#modal-overlay .help-tab-btn[data-tab="tools"]');
    await tab.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const tb = await tab.boundingBox();
    await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height - 3); // low edge of a 44 px tab
    await expect(tab).toHaveClass(/active/);
    await shot(page, `${testInfo.project.name}-help-tab-finger`);
    await page.evaluate(() => window.app.ui.closeModal && window.app.ui.closeModal());
    await MODALS.export.open(page);
    await page.waitForTimeout(400);
    const fit = page.locator('#export-preview-fit');
    await fit.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const fb = await fit.boundingBox();
    expect(fb.height, 'preview Fit button is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    await page.touchscreen.tap(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await shot(page, `${testInfo.project.name}-export-finger`);
  });

  // TUX-046 with the larger targets: the modal still fits the screen, and its close button and primary action are on screen and
  // reachable (the centre of each resolves to itself) without scrolling. Viewports: 402x874, 874x402, 874x330, 834x1210, 1210x834.
  for (const [id, m] of Object.entries(MODALS)) {
    test(`${id}: fits the screen with a reachable close button and primary action`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      await boot(page, baseURL);
      await m.open(page);
      await page.waitForTimeout(400);
      await core.waitLayoutSettled(page);
      const r = await page.evaluate(({ card, close, primary }) => {
        const vis = (e) => e && e.checkVisibility({ checkVisibilityCSS: true });
        const reach = (sel) => {
          const e = [...document.querySelectorAll(sel)].find(vis);
          if (!e) return { sel, found: false };
          const b = e.getBoundingClientRect();
          const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
          const t = document.elementFromPoint(cx, cy);
          return { sel, found: true, inView: b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1, own: !!t && (t === e || e.contains(t) || t.contains(e)) };
        };
        const c = [...document.querySelectorAll(card)].find(vis);
        const cb = c && c.getBoundingClientRect();
        return { card: cb ? { l: cb.left, t: cb.top, r: cb.right, b: cb.bottom } : null, iw: innerWidth, ih: innerHeight, close: reach(close), primary: primary ? reach(primary) : null };
      }, { card: m.card, close: m.close, primary: m.primary });
      expect(r.card, `${id}: modal card is visible`).toBeTruthy();
      expect(Math.min(r.card.l, r.card.t), `${id} card inside the viewport (top/left) ${JSON.stringify(r.card)}`).toBeGreaterThanOrEqual(-1);
      expect(Math.max(r.card.r - r.iw, r.card.b - r.ih), `${id} card inside the viewport (right/bottom) ${JSON.stringify(r.card)} in ${r.iw}x${r.ih}`).toBeLessThanOrEqual(1);
      for (const k of ['close', 'primary']) {
        if (!r[k]) continue;
        expect(r[k].found, `${id} ${k} ${r[k].sel} is shown`).toBe(true);
        expect(r[k].inView, `${id} ${k} is on screen without scrolling`).toBe(true);
        expect(r[k].own, `${id} ${k} centre resolves to itself`).toBe(true);
      }
    });
  }

  // The generator picker's info buttons (#dynamic-controls) are modal-adjacent targets in the picker audit cell. With the picker
  // closed and a button scrolled into the middle of the pane, each has a 44 x 44 hit area and a neighbour never steals its centre.
  test('generator-picker: every info button is a 44 x 44 hit area', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await runState(page, 'generator-picker');
    await page.evaluate(() => { const t = document.getElementById('generator-module-trigger'); if (document.getElementById('gm-module-menu')?.checkVisibility()) t.click(); });
    await page.waitForFunction(() => !document.getElementById('gm-module-menu')?.checkVisibility());
    const n = await page.locator('#dynamic-controls button.info-btn').count();
    const bad = []; let seen = 0;
    for (let i = 0; i < n; i += 1) {
      const loc = page.locator('#dynamic-controls button.info-btn').nth(i);
      if (!(await loc.evaluate((e) => e.checkVisibility({ checkVisibilityCSS: true })))) continue;
      seen += 1;
      await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(40);
      const a = await touch.hitArea(page, loc);
      if (a.w < MIN || a.h < MIN) bad.push(`#${i} ${a.w}x${a.h}`);
    }
    expect(seen, 'info buttons found in the generator controls').toBeGreaterThan(0);
    expect(bad, 'info buttons under 44').toEqual([]);
  });

  // TUX-046 follow-up: a modal that scrolls shows a cue on the edge that hides controls, and none when everything fits.
  for (const [id, sel] of [['export', '#export-settings-scroll'], ['document-setup', '#settings-panel .settings-panel-body']]) {
    test(`${id}: the scroll cue is present when controls are hidden and absent when everything fits`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      await boot(page, baseURL);
      await MODALS[id].open(page);
      await page.waitForTimeout(500);
      const cue = () => page.evaluate((s) => { const e = document.querySelector(s); return { cue: e.dataset.scrollCue || '', hidden: e.scrollHeight - e.clientHeight > 2 }; }, sel);
      const a = await cue();
      expect(a.hidden, 'this viewport hides controls below the fold').toBeDefined();
      if (a.hidden) expect(a.cue, 'cue names the hidden edge').toContain('below');
      // Everything fits once the column is stretched: the cue goes away.
      await page.evaluate((s) => { const e = document.querySelector(s); e.style.maxHeight = 'none'; e.style.height = e.scrollHeight + 'px'; e.style.flex = 'none'; e.dispatchEvent(new Event('scroll')); }, sel);
      await page.waitForTimeout(300);
      const b = await cue();
      expect(b.hidden).toBe(false);
      expect(b.cue, 'no cue when nothing is hidden').toBe('');
    });
  }
});

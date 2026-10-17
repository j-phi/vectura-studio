const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-046: legacy #modal-overlay scaffold on touch (Export, Help, info, color picker).
// Fix round: Document Setup (#settings-panel, R10) and the Save Preset sheet (.vectura-modal,
// R11) are part of TUX-046 too.
const EVIDENCE = require('path').join(__dirname, '../../..', 'docs/touch-audit/evidence/after/TUX-046');
const KINDS = ['export', 'help', 'info', 'color'];
const CSS_PATH = path.join(__dirname, '..', '..', '..', 'src', 'ui', 'skin', 'components.css');

const spec = (testInfo) => PROJECTS[testInfo.project.name];
const isPhone = (s) => /^iPh/.test(s.device);
const isTablet = (s) => s.device === 'iPadP' || s.device === 'iPadL' || s.device === 'coarseWide';
const raf2 = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.__shared = 0;
    try { navigator.share = async () => { window.__shared += 1; }; navigator.canShare = () => true; } catch { /* ignore */ }
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const { engine, ui } = window.app;
    engine.addLayer('spiral');
    if (ui.renderLayers) ui.renderLayers();
    if (ui.buildControls) ui.buildControls();
  });
  await page.waitForFunction(() => { const b = document.getElementById('btn-export'); return b && !b.disabled; });
  const s = spec(testInfo);
  const st = await page.evaluate(() => ({ iw: innerWidth, phone: document.body.classList.contains('phone-layout') }));
  expect(st.iw, 'innerWidth (gate TUX-001: no viewport inflation)').toBe(s.width);
  if (isPhone(s)) expect(st.phone, 'gate 006/001 missing: phone-layout class').toBe(true);
});

const paneOpen = (page, id) => page.evaluate((id) => {
  const p = document.getElementById(id);
  if (!p) return false;
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  return r.width > 100 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
}, id);

// SETUP only: make a pane visible (not the gesture under test).
const openPane = async (page, id) => {
  if (await paneOpen(page, id)) return;
  await page.evaluate((id) => {
    const pane = document.getElementById(id);
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  }, id);
  await page.waitForTimeout(350);
};

const phoneLayout = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

const tapMenuItem = async (page, triggerId, itemId) => {
  if (await phoneLayout(page)) {
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await page.waitForTimeout(150);
  }
  const trigger = page.locator(`#${triggerId}`);
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await touch.tap(page, trigger);
  await page.waitForTimeout(200);
  const item = page.locator(`#${itemId}`);
  await item.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await touch.tap(page, item);
};

const waitOpen = async (page, kind) => {
  await page.waitForSelector('#modal-overlay.open', { timeout: 8000 }).catch(() => { throw new Error(`${kind} modal did not open`); });
  await raf2(page);
  await page.waitForTimeout(300);
};

async function openKind(page, kind) {
  if (kind === 'export') {
    const direct = page.locator('#btn-header-export');
    if ((await phoneLayout(page)) && (await direct.isVisible())) await touch.tap(page, direct);
    else await tapMenuItem(page, 'btn-menu-file', 'btn-export');
  } else if (kind === 'help') {
    await tapMenuItem(page, 'btn-menu-help', 'btn-help');
  } else if (kind === 'info') {
    await openPane(page, 'left-pane');
    // Some .info-btn keys (global.algorithm) toggle the About panel, so try each visible one.
    const cands = page.locator('#left-pane .info-btn:visible:not([data-info="global.algorithm"])');
    const n = Math.min(await cands.count(), 6);
    for (let i = 0; i < n; i += 1) {
      const btn = cands.nth(i);
      await btn.scrollIntoViewIfNeeded();
      await touch.tap(page, btn);
      await page.waitForTimeout(250);
      if (await page.evaluate(() => !!document.querySelector('#modal-overlay.open'))) break;
    }
  } else {
    // The pen swatch is a native <input type=color>; the in-app colour modal has no stable
    // direct tap route in the pens panel. Documented fallback: call the same API the
    // touch-primary branch of openColorPickerAnchoredTo uses.
    await page.evaluate(() => {
      window.__colorApplied = null;
      window.app.ui.openColorModal({ title: 'Pen Color', value: '#ff0000', onApply: (v) => { window.__colorApplied = v; } });
    });
  }
  await waitOpen(page, kind);
}

const closeKind = async (page) => {
  await page.evaluate(() => window.app.ui.closeModal());
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.open'));
  await page.waitForTimeout(250);
};

const rectOf = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight };
}, sel);

const inView = (r, tol = 1) => !!r && r.l >= -tol && r.t >= -tol && r.r <= r.iw + tol && r.b <= r.ih + tol;
const fmt = (r) => (r ? `[${r.l.toFixed(0)},${r.t.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)}]` : 'null');

const eachKind = async (page, kinds, fn) => {
  const fails = [];
  for (const kind of kinds) {
    await openKind(page, kind);
    try { await fn(kind, fails); } catch (e) { fails.push(`${kind}: threw ${e.message}`); }
    await closeKind(page);
  }
  return fails;
};

// exportProduced: TUX-054 extends this. Accepts a download event or a navigator.share call.
async function exportProduced(page, tapSubmit) {
  const dl = page.waitForEvent('download', { timeout: 8000 }).then(() => 'download').catch(() => null);
  await tapSubmit();
  const got = await dl;
  if (got) return got;
  const shared = await page.evaluate(() => window.__shared);
  return shared > 0 ? 'share' : null;
}

test.describe('TUX-046 modal sheet', () => {
  test('R1 stacking: nothing covers the card top (Export, Help)', async ({ page }) => {
    const fails = await eachKind(page, ['export', 'help'], async (kind, fails) => {
      const probe = await page.evaluate(() => {
        const card = document.querySelector('#modal-overlay .modal-card');
        const r = card.getBoundingClientRect();
        const x = r.left + 40, y = r.top + 4;
        const hit = document.elementFromPoint(x, y);
        return { x, y, inCard: !!hit && !!hit.closest('#modal-overlay .modal-card'), hit: hit ? `${hit.tagName}.${hit.className}` : 'null' };
      });
      if (!probe.inCard) fails.push(`${kind}: point (${probe.x.toFixed(0)},${probe.y.toFixed(0)}) hits ${probe.hit}`);
    });
    expect(fails, fails.join(' | ')).toEqual([]);
  });

  test('R2 close target is at least 44x44 and reachable', async ({ page }) => {
    const fails = await eachKind(page, KINDS, async (kind, fails) => {
      const hit = await touch.hitArea(page, '.modal-card .modal-close');
      const r = await rectOf(page, '.modal-card .modal-close');
      const top = await page.evaluate(() => {
        const el = document.querySelector('.modal-card .modal-close');
        const b = el.getBoundingClientRect();
        const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!t && (t === el || el.contains(t));
      });
      if (hit.w < 44 || hit.h < 44) fails.push(`${kind}: hitArea ${hit.w}x${hit.h}`);
      if (!inView(r)) fails.push(`${kind}: close rect ${fmt(r)} outside viewport`);
      if (!top) fails.push(`${kind}: centre is covered`);
    });
    expect(fails, fails.join(' | ')).toEqual([]);
  });

  test('R3 header and footer stay pinned; only the body scrolls', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    test.skip(!['iPhL', 'iPhL-c', 'iPhP-c', 'iPadL'].includes(s.device), 'R3 runs on the short and wide projects');
    const fails = [];
    // Help
    await openKind(page, 'help');
    const before = { close: await rectOf(page, '.modal-card .modal-close'), card: await rectOf(page, '.modal-card') };
    // Swipe the body for real where the engine runs native default actions (Chromium). WebKit's
    // synthetic touches do not scroll, so there the scroller is driven through scrollTop.
    // Help is short on tall viewports (iPadL). Where the real content fits, append a spacer so the
    // test still proves that the body, not the card, is the scroller.
    const padded = await page.evaluate(() => {
      const body = document.querySelector('.modal-card .modal-body');
      if (body.scrollHeight > body.clientHeight + 1) return false;
      const sp = document.createElement('div');
      sp.style.cssText = 'height:1600px;flex:none';
      sp.setAttribute('data-test-spacer', '');
      body.appendChild(sp);
      return true;
    });
    if (padded) testInfo.annotations.push({ type: 'R3', description: 'help content fits; spacer appended to prove the scroller' });
    if (padded) { await raf2(page); before.close = await rectOf(page, '.modal-card .modal-close'); before.card = await rectOf(page, '.modal-card'); }
    const geo = await page.evaluate(() => {
      const body = document.querySelector('.modal-card .modal-body');
      const r = body.getBoundingClientRect();
      return { x: r.left + r.width / 2, y1: r.top + r.height - 12, y2: r.top + 12, scrolls: body.scrollHeight > body.clientHeight + 1 };
    });
    if (touch.engineSupports(page, 'nativeDefaultActions')) {
      await touch.drag(page, { x: geo.x, y: geo.y1 }, { x: geo.x, y: geo.y2 }, { steps: 12 });
      await page.waitForTimeout(250);
    } else {
      await page.evaluate(() => { const b = document.querySelector('.modal-card .modal-body'); b.scrollTop = b.scrollHeight; });
    }
    const sc = await page.evaluate(() => {
      const body = document.querySelector('.modal-card .modal-body');
      const card = document.querySelector('.modal-card');
      return { overscroll: getComputedStyle(body).overscrollBehaviorY, cardScrolls: card.scrollHeight > card.clientHeight + 1, cardTop: card.scrollTop, bodyScrolls: body.scrollHeight > body.clientHeight + 1, top: body.scrollTop };
    });
    const after = { close: await rectOf(page, '.modal-card .modal-close') };
    if (Math.abs(after.close.t - before.close.t) > 1) fails.push(`help: close moved ${before.close.t} -> ${after.close.t}`);
    if (!inView(after.close)) fails.push(`help: close ${fmt(after.close)} left the viewport`);
    if (sc.cardScrolls || sc.cardTop > 0) fails.push('help: the card itself scrolls');
    if (!sc.bodyScrolls) fails.push('help: the sheet body is not the scroller (no overflow in .modal-body)');
    if (!(sc.top > 0)) fails.push(`help: body scrollTop ${sc.top} after the swipe (the body did not scroll)`);
    if (sc.overscroll !== 'contain') fails.push(`help: overscroll-behavior-y ${sc.overscroll}`);
    await closeKind(page);
    // Export
    await openKind(page, 'export');
    const ex = await page.evaluate(() => {
      const nav = document.getElementById('export-modal-nav');
      const nr = nav.getBoundingClientRect();
      const t = document.elementFromPoint(nr.left + nr.width / 2, nr.top + nr.height / 2);
      return { navH: nr.height, navHit: !!t && nav.contains(t) };
    });
    if (ex.navH < 44) fails.push(`export: nav height ${ex.navH.toFixed(1)}`);
    if (!ex.navHit) fails.push('export: nav centre is covered');
    const btns = await page.locator('#export-modal-footer button').count();
    for (let i = 0; i < btns; i += 1) {
      const sel = `#export-modal-footer button:nth-of-type(${i + 1})`;
      const r = await rectOf(page, sel);
      const h = await touch.hitArea(page, sel);
      if (!inView(r)) fails.push(`export: footer button ${i} ${fmt(r)} outside viewport`);
      if (h.w < 44 || h.h < 44) fails.push(`export: footer button ${i} hitArea ${h.w}x${h.h}`);
    }
    const f0 = await rectOf(page, '#export-modal-footer');
    const c0 = await rectOf(page, '.modal-card .modal-close');
    await page.evaluate(() => {
      document.querySelectorAll('#modal-overlay .modal-card *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      });
    });
    const f1 = await rectOf(page, '#export-modal-footer');
    const c1 = await rectOf(page, '.modal-card .modal-close');
    if (Math.abs(f1.t - f0.t) > 1) fails.push(`export: footer moved ${f0.t} -> ${f1.t}`);
    if (Math.abs(c1.t - c0.t) > 1) fails.push(`export: close moved ${c0.t} -> ${c1.t}`);
    await closeKind(page);
    expect(fails, fails.join(' | ')).toEqual([]);
  });

  test('R4 colour picker: close in view, no keyboard-raising focus', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    test.skip(!['iPhL', 'iPhL-c'].includes(s.device), 'R4 runs on iPhone landscape');
    await openKind(page, 'color');
    const r = await rectOf(page, '.modal-card .modal-close');
    const active = await page.evaluate(() => {
      const a = document.activeElement;
      const textTypes = ['', 'text', 'number', 'search', 'url', 'email', 'tel', 'password'];
      const isText = !!a && ((a.tagName === 'INPUT' && textTypes.includes((a.getAttribute('type') || '').toLowerCase())) || a.tagName === 'TEXTAREA' || a.isContentEditable);
      return { desc: a ? `${a.tagName}.${a.className}` : 'null', isText };
    });
    expect(r.t, `close ${fmt(r)}`).toBeGreaterThanOrEqual(0);
    expect(inView(r), `close ${fmt(r)} in viewport`).toBe(true);
    expect(active.isText, `activeElement ${active.desc}`).toBe(false);
  });

  test('R5 phone sheet fills the screen inside the safe area', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    test.skip(!isPhone(s), 'phone only');
    const landscape = s.width > s.height;
    let ins = { top: 0, bottom: 0, left: 0, right: 0 };
    let annot = 'no override (webkit)';
    if (touch.engineSupports(page, 'cdp')) {
      ins = landscape ? { top: 0, bottom: 21, left: 62, right: 62 } : { top: 62, bottom: 34, left: 0, right: 0 };
      try {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins });
        annot = 'cdp override';
      } catch (e) {
        ins = { top: 0, bottom: 0, left: 0, right: 0 };
        annot = `cdp override failed (${e.message}); falling back to R9`;
      }
    }
    testInfo.annotations.push({ type: 'R5', description: annot });
    await openKind(page, 'export');
    const m = await page.evaluate(() => {
      const q = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      return { card: q('.modal-card'), close: q('.modal-card .modal-close'), footer: q('#export-modal-footer'), iw: innerWidth, ih: innerHeight };
    });
    const msg = JSON.stringify(m);
    expect(Math.abs(m.card.l - ins.left), msg).toBeLessThanOrEqual(1);
    expect(Math.abs(m.card.t - ins.top), msg).toBeLessThanOrEqual(1);
    expect(Math.abs(m.card.r - (m.iw - ins.right)), msg).toBeLessThanOrEqual(1);
    expect(Math.abs(m.card.b - (m.ih - ins.bottom)), msg).toBeLessThanOrEqual(1);
    expect(m.close.t, msg).toBeGreaterThanOrEqual(ins.top - 1);
    expect(m.footer.b, msg).toBeLessThanOrEqual(m.ih - ins.bottom + 1);
    if (landscape) expect(m.close.r, msg).toBeLessThanOrEqual(m.iw - ins.right + 1);
  });

  test('R6 tablet card fits the viewport', async ({ page }, testInfo) => {
    test.skip(!isTablet(spec(testInfo)), 'tablet and touch-wide only');
    const fails = await eachKind(page, KINDS, async (kind, fails) => {
      const card = await rectOf(page, '.modal-card');
      if (!inView(card)) fails.push(`${kind}: card ${fmt(card)} outside ${card.iw}x${card.ih}`);
      const close = await rectOf(page, '.modal-card .modal-close');
      if (!inView(close)) fails.push(`${kind}: close ${fmt(close)} outside viewport`);
      const n = await page.locator('#modal-overlay .modal-card button').count();
      for (let i = 0; i < n; i += 1) {
        const ok = await page.evaluate((i) => {
          const el = document.querySelectorAll('#modal-overlay .modal-card button')[i];
          if (!el.closest('#export-modal-footer, .color-modal-actions')) return true;
          const r = el.getBoundingClientRect();
          return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        }, i);
        if (!ok) fails.push(`${kind}: footer button ${i} outside viewport`);
      }
    });
    expect(fails, fails.join(' | ')).toEqual([]);
  });

  test('R7 Export SVG produces a file', async ({ page }) => {
    await openKind(page, 'export');
    const got = await exportProduced(page, async () => {
      const b = page.locator('#export-modal-submit');
      await touch.tap(page, b);
    });
    expect(got, 'export produced a download or share').not.toBeNull();
  });

  test('R8 regressions: backdrop close, colour cancel, Document Setup drawer', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    if (isTablet(s)) {
      for (const kind of ['help', 'export', 'info']) {
        await openKind(page, kind);
        const ih = await page.evaluate(() => innerHeight);
        await touch.tap(page, { x: 5, y: ih - 5 });
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => !!document.querySelector('#modal-overlay.open')), `${kind} backdrop tap closes`).toBe(false);
      }
      await openKind(page, 'color');
      const ih = await page.evaluate(() => innerHeight);
      await touch.tap(page, { x: 5, y: ih - 5 });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__colorApplied), 'backdrop must cancel, not apply').toBeNull();
      expect(await page.evaluate(() => !!document.querySelector('#modal-overlay.open')), 'colour picker closed by the backdrop tap').toBe(false);
    }
    await page.evaluate(() => document.getElementById('btn-settings').click());
    await page.waitForTimeout(400);
    const panel = await rectOf(page, '#settings-panel');
    const close = await rectOf(page, '#btn-close-settings');
    expect(inView(panel), `settings panel ${fmt(panel)}`).toBe(true);
    expect(inView(close), `settings close ${fmt(close)}`).toBe(true);
  });

  // R12: the Export nav keeps its 188px column on wide layouts (> 1100px) with touch-ui on.
  test('R12 Export nav column keeps its 188px width on wide layouts', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    test.skip(s.width <= 1100, 'column layout below 1100px has no side nav');
    await openKind(page, 'export');
    const w = await page.evaluate(() => document.getElementById('export-modal-nav').getBoundingClientRect().width);
    expect(Math.abs(w - 188), `export nav width ${w} (touch-ui on, viewport ${s.width})`).toBeLessThanOrEqual(1);
  });

  // R10: Document Setup, opened and closed by taps only (hamburger > File > Document Setup).
  test('R10 Document Setup opens as a sheet by taps and closes by tapping close', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    await tapMenuItem(page, 'btn-menu-file', 'btn-settings');
    await page.waitForSelector('#settings-panel.open', { timeout: 5000 });
    await page.waitForTimeout(500); // drawer transition
    const geo = await page.evaluate(() => {
      const q = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const close = document.getElementById('btn-close-settings');
      const cr = close.getBoundingClientRect();
      const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
      const body = document.querySelector('#settings-panel .settings-panel-body');
      const menubar = document.getElementById('top-menubar');
      return {
        iw: innerWidth, ih: innerHeight, panel: q('#settings-panel'), close: q('#btn-close-settings'), hdr: q('#settings-panel > .pane-hdr'),
        closeHit: !!hit && (hit === close || close.contains(hit)), hitDesc: hit ? `${hit.tagName}#${hit.id}.${hit.className}` : 'null',
        bodyScrolls: body.scrollHeight > body.clientHeight + 1, bodyOverflowY: getComputedStyle(body).overflowY,
        menuOpen: document.body.classList.contains('phone-menu-open'), menubarShown: !!menubar && getComputedStyle(menubar).display !== 'none' && menubar.getBoundingClientRect().height > 0,
      };
    });
    const msg = JSON.stringify(geo);
    const inVp = (r) => r.l >= -1 && r.t >= -1 && r.r <= geo.iw + 1 && r.b <= geo.ih + 1;
    expect(inVp(geo.close), `close in viewport ${msg}`).toBe(true);
    expect(geo.closeHit, `elementFromPoint(close centre) hits ${geo.hitDesc}; menubar open over the sheet? ${msg}`).toBe(true);
    const hit = await touch.hitArea(page, '#btn-close-settings');
    expect(hit.w >= 44 && hit.h >= 44, `hitArea ${hit.w}x${hit.h}`).toBe(true);
    expect(geo.bodyOverflowY, `body scrolls ${msg}`).toMatch(/auto|scroll/);
    if (isPhone(s)) {
      const ins = { top: 0, bottom: 0, left: 0, right: 0 };
      expect(Math.abs(geo.panel.l - ins.left), msg).toBeLessThanOrEqual(1);
      expect(Math.abs(geo.panel.t - ins.top), msg).toBeLessThanOrEqual(1);
      expect(Math.abs(geo.panel.r - (geo.iw - ins.right)), `full-width sheet ${msg}`).toBeLessThanOrEqual(1);
      expect(Math.abs(geo.panel.b - (geo.ih - ins.bottom)), `full-height sheet ${msg}`).toBeLessThanOrEqual(1);
      expect(geo.menuOpen, `the hamburger menu closed once Document Setup opened ${msg}`).toBe(false);
      // pinned header: scroll the body, header and close do not move
      const h0 = await rectOf(page, '#btn-close-settings');
      await page.evaluate(() => { const b = document.querySelector('#settings-panel .settings-panel-body'); b.scrollTop = b.scrollHeight; });
      const h1 = await rectOf(page, '#btn-close-settings');
      expect(Math.abs(h1.t - h0.t), 'header close stays pinned while the body scrolls').toBeLessThanOrEqual(1);
    } else {
      expect(inVp(geo.panel), `panel in viewport ${msg}`).toBe(true);
    }
    await touch.tap(page, page.locator('#btn-close-settings'));
    await page.waitForFunction(() => !document.querySelector('#settings-panel.open'), null, { timeout: 4000 });
  });

  // R11: Save Preset sheet (.vectura-modal) follows the .vt-sheet contract.
  test('R11 Save Preset sheet: safe-area sheet on phone, pinned footer, closes by Cancel', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    await page.evaluate(() => {
      window.Vectura.UI.PresetSaveModal.open({ layerType: 'spiral', params: {}, suggestedName: 'Test', origin: { kind: 'scratch', preset: null }, onConfirm: () => {} });
    });
    await page.waitForSelector('.vectura-modal-backdrop[style*="display: flex"]', { timeout: 5000 });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const q = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.height }; };
      const card = document.querySelector('.vectura-modal');
      const body = card.querySelector('.vectura-modal-body');
      const hdr = card.querySelector('.vectura-modal-hdr');
      const foot = card.querySelector('.preset-save-footer');
      const cancel = foot.querySelector('button.hdr-btn');
      const cr = cancel.getBoundingClientRect();
      const top = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
      const cardTop = document.elementFromPoint(card.getBoundingClientRect().left + 40, card.getBoundingClientRect().top + 4);
      return {
        iw: innerWidth, ih: innerHeight, card: q(card), hdr: q(hdr), foot: q(foot), cancel: q(cancel), cw: cr.width, ch: cr.height,
        cancelHit: !!top && cancel.contains(top), cardTopHit: !!cardTop && !!cardTop.closest('.vectura-modal'),
        slots: { card: card.classList.contains('vt-sheet'), hdr: hdr.classList.contains('vt-sheet__header'), body: body.classList.contains('vt-sheet__body'), foot: foot.classList.contains('vt-sheet__footer') },
        cardScrolls: card.scrollHeight > card.clientHeight + 1,
      };
    });
    const msg = JSON.stringify(m);
    expect(m.slots, `vt-sheet slots ${msg}`).toEqual({ card: true, hdr: true, body: true, foot: true });
    expect(m.cardScrolls, `the card itself must not scroll ${msg}`).toBe(false);
    expect(m.cardTopHit, `nothing covers the sheet top ${msg}`).toBe(true);
    expect(m.cancelHit, `Cancel is reachable ${msg}`).toBe(true);
    expect(m.cw >= 44 && m.ch >= 44, `Cancel is at least 44x44 (${m.cw}x${m.ch})`).toBe(true);
    expect(m.foot.b <= m.ih + 1 && m.foot.t >= -1, `footer inside the viewport ${msg}`).toBe(true);
    if (isPhone(s)) {
      expect(Math.abs(m.card.l), msg).toBeLessThanOrEqual(1);
      expect(Math.abs(m.card.t), msg).toBeLessThanOrEqual(1);
      expect(Math.abs(m.card.r - m.iw), `full width ${msg}`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.card.b - m.ih), `full height ${msg}`).toBeLessThanOrEqual(1);
    } else {
      expect(m.card.l >= -1 && m.card.r <= m.iw + 1 && m.card.t >= -1 && m.card.b <= m.ih + 1, `card fits ${msg}`).toBe(true);
    }
    await touch.tap(page, page.locator('.preset-save-footer button.hdr-btn'));
    await page.waitForFunction(() => !document.querySelector('.vectura-modal-backdrop'), null, { timeout: 4000 });
  });

  test('R9 static: the TUX-046 CSS block uses no vh for sheet height', async () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const m = css.match(/\/\* === TUX-046: modal sheet ===([\s\S]*?)\/\* === (?:END|\/)\s*TUX-046/i);
    expect(m, 'TUX-046 block present').not.toBeNull();
    expect(/\d+(\.\d+)?vh/.test(m[1]), 'no vh units in the block').toBe(false);
  });

  test('D5 evidence screenshots', async ({ page }, testInfo) => {
    const s = spec(testInfo);
    test.skip(!['iPhP', 'iPhL', 'iPhL-c', 'iPadP', 'iPadL'].includes(s.device), 'named viewports only');
    test.skip(process.env.TUX_EVIDENCE !== '1', 'set TUX_EVIDENCE=1 to write PNGs');
    const dir = EVIDENCE;
    fs.mkdirSync(dir, { recursive: true });
    for (const kind of ['export', 'help', 'color']) {
      await openKind(page, kind);
      await page.screenshot({ path: path.join(dir, `${s.engine}-${s.device}-${kind}.png`) });
      await closeKind(page);
    }
    await sleep(0);
  });
});

// ---------------------------------------------------------------------------------------------
// TUX-047: two-finger pinch zoom + pan on the Export preview and the Pattern Designer canvas.
// A pinch must zoom ONLY the surface (never the page) and must never pour/select/anchor/push
// history. One finger keeps the active tool. Placement uses the VISIBLE rect (surface rect
// intersected with the viewport): on iPhP the surfaces overhang the right edge.
// ---------------------------------------------------------------------------------------------
const EVIDENCE_047 = require('path').join(__dirname, '../../..', 'docs/touch-audit/evidence/after/TUX-047');

// surface: 'export' | 'pd'. Returns { x, y, w, h, left, top, right, bottom } (visible rect) or null.
const visibleRect = (page, surface) => page.evaluate((surface) => {
  const ui = window.app.ui;
  const el = surface === 'export'
    ? ui.exportModalState?.wrap
    : (ui.__pdTarget?.() || ui.patternDesigner || ui.inlinePatternDesigner)?.root?.querySelector('[data-pd-canvas]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const left = Math.max(0, r.left); const top = Math.max(0, r.top);
  const right = Math.min(innerWidth, r.right); const bottom = Math.min(innerHeight, r.bottom);
  return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top, left, top, right, bottom, rawLeft: r.left, rawTop: r.top };
}, surface);

const pinchSpec = (vr) => {
  const endDist = Math.min(240, 0.8 * vr.w);
  return { center: { x: vr.x, y: vr.y }, endDist, startDist: endDist / 3 };
};

const exportView = (page) => page.evaluate(() => ({ ...window.app.ui.exportModalState.view }));

const openExportPreview = async (page) => {
  await page.evaluate(() => window.app.ui.openExportModal());
  await page.waitForSelector('#modal-overlay.open');
  await raf2(page);
  await page.waitForTimeout(400);
  await raf2(page);
};

// kind: 'window' | 'inline'. Leaves the designer open with `tool` active. Returns nothing; the
// handle is resolved via ui.__pdTarget (set here) so tests read the live pd object.
const openPd = async (page, kind) => {
  await page.evaluate((kind) => {
    const { engine, ui } = window.app;
    const id = engine.addLayer('pattern');
    const L = engine.layers.find((l) => l.id === id) || engine.getActiveLayer?.();
    engine.activeLayerId = L.id;
    window.__pdLayer = L;
    ui.__pdTarget = () => (kind === 'inline' ? ui.inlinePatternDesigner : ui.patternDesigner);
    if (kind === 'window') ui.openPatternDesigner(L);
    else { if (ui.renderLayers) ui.renderLayers(); if (ui.buildControls) ui.buildControls(); }
  }, kind);
  if (kind === 'inline') {
    await page.waitForFunction(() => !!window.app.ui.inlinePatternDesigner?.root?.querySelector('[data-pd-canvas]'), null, { timeout: 8000 });
    await page.evaluate(() => {
      const c = window.app.ui.inlinePatternDesigner.root;
      let p = c;
      while (p && p !== document.body) { if (p.id === 'left-pane') break; p = p.parentElement; }
    });
    await openPane(page, 'left-pane');
    await page.evaluate(() => window.app.ui.inlinePatternDesigner.root.scrollIntoView({ block: 'center' }));
  } else {
    await page.waitForFunction(() => !!window.app.ui.patternDesigner?.root?.querySelector('[data-pd-canvas]'));
  }
  await raf2(page);
  await page.waitForTimeout(300);
  await raf2(page);
};

const setTool = (page, tool) => page.evaluate((tool) => {
  const pd = window.app.ui.__pdTarget();
  pd.tool = tool;
  pd.selectedPath = null; pd.pendingAnchors = []; pd.dragShape = null; pd.moveDrag = null; pd.directEditState = null;
  window.app.ui._syncPdToolActive(pd);
  if (pd.inline) pd.root.querySelector('[data-pd-canvas]').scrollIntoView({ block: 'center' });
}, tool);

const pdSnap = (page) => page.evaluate(() => {
  const pd = window.app.ui.__pdTarget();
  return {
    fills: pd.fills.length,
    history: pd.history.length,
    layerFills: (window.__pdLayer.params.patternFills || []).length,
    selectedPath: pd.selectedPath,
    pending: pd.pendingAnchors.length,
    zoom: pd.view.zoom,
    ox: pd.view.offsetX,
    oy: pd.view.offsetY,
  };
});

// Client point (inside the visible rect, on the canvas) that has a fill target; nearest the centre.
// `dx`: the returned point is the LEFT finger of a pinch whose centre is point.x + dx; that
// centre must stay inside the visible rect (so the first finger lands on a fill target).
const findFillPoint = (page, dx = 0) => page.evaluate((dx) => {
  const ui = window.app.ui;
  const pd = ui.__pdTarget();
  const canvas = pd.root.querySelector('[data-pd-canvas]');
  const r = canvas.getBoundingClientRect();
  const left = Math.max(0, r.left); const top = Math.max(0, r.top);
  const right = Math.min(innerWidth, r.right); const bottom = Math.min(innerHeight, r.bottom);
  const cx = (left + right) / 2; const cy = (top + bottom) / 2;
  const reg = window.Vectura.AlgorithmRegistry;
  let best = null;
  for (let y = top + 6; y < bottom - 6; y += 8) {
    for (let x = left + 6; x < right - 6; x += 8) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      const tx = (x - r.left - pd.view.offsetX) / pd.view.zoom;
      const ty = (y - r.top - pd.view.offsetY) / pd.view.zoom;
      const sel = reg.patternGetFillTargetsAtPoint(pd.layer.params.patternId, tx, ty, { cache: true });
      if (!sel || !sel.smallest) continue;
      if (pd.fills.some((f) => ui._fillMatchesTarget(f, sel.smallest))) continue;
      if (x + dx < left + 12 || x + dx > right - 12) continue;
      const d = Math.hypot(x + dx - cx, y - cy);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best;
}, dx);

const pickPinchCenter = (page, startDist, endDist, wantTarget) => page.evaluate(({ startDist, endDist, wantTarget }) => {
  const ui = window.app.ui;
  const pd = ui.__pdTarget();
  const canvas = pd.root.querySelector('[data-pd-canvas]');
  const r = canvas.getBoundingClientRect();
  const left = Math.max(0, r.left); const top = Math.max(0, r.top);
  const right = Math.min(innerWidth, r.right); const bottom = Math.min(innerHeight, r.bottom);
  const mx = (left + right) / 2; const my = (top + bottom) / 2;
  const reg = window.Vectura.AlgorithmRegistry;
  const on = (x, y) => document.elementFromPoint(x, y) === canvas;
  let best = null;
  for (let y = top + 4; y < bottom - 4; y += 6) {
    for (let x = left + endDist / 2; x <= right - endDist / 2; x += 6) {
      if (!on(x, y) || !on(x - endDist / 2, y) || !on(x + endDist / 2, y)) continue;
      if (wantTarget) {
        const fx = x - startDist / 2;
        const sel = reg.patternGetFillTargetsAtPoint(pd.layer.params.patternId, (fx - r.left - pd.view.offsetX) / pd.view.zoom, (y - r.top - pd.view.offsetY) / pd.view.zoom, { cache: true });
        if (!sel || !sel.smallest) continue;
      }
      const d = Math.hypot(x - mx, y - my);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}, { startDist, endDist, wantTarget });

test.describe('TUX-047 pinch and two-finger pan', () => {
  test('A export preview pinch zooms preview, not page', async ({ page }, testInfo) => {
    await openExportPreview(page);
    const vr = await visibleRect(page, 'export');
    expect(vr && vr.w > 120 && vr.h > 60, `export wrap visible ${JSON.stringify(vr)}`).toBeTruthy();
    let { center, startDist, endDist } = pinchSpec(vr);
    // A finger starts on the preview canvas, not on a control above it (the legend gear owns a 44 px target since B3). Search
    // for the centre nearest the middle where every finger point, at the start and the end of the spread, resolves to the canvas.
    const spot = await page.evaluate(({ vr, startDist, endDist }) => {
      const canvas = window.app.ui.exportModalState.wrap.querySelector('canvas');
      const on = (x, y) => document.elementFromPoint(x, y) === canvas;
      let best = null;
      for (let y = vr.top + 4; y < vr.bottom - 4; y += 4) {
        for (let x = vr.left + endDist / 2; x <= vr.right - endDist / 2; x += 4) {
          const pts = [[x - startDist / 2, y], [x + startDist / 2, y], [x - endDist / 2, y], [x + endDist / 2, y]];
          if (!pts.every(([px, py]) => on(px, py))) continue;
          const d = Math.hypot(x - vr.x, y - vr.y);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      return best;
    }, { vr, startDist, endDist });
    if (spot) center = { x: spot.x, y: spot.y };
    const v0 = await exportView(page);
    const W = { x: (center.x - vr.rawLeft - v0.offsetX) / v0.scale, y: (center.y - vr.rawTop - v0.offsetY) / v0.scale };
    await touch.pinch(page, center, { startDist, endDist, steps: 10, staggerMs: 60 });
    await raf2(page);
    const v1 = await exportView(page);
    const ratio = v1.scale / v0.scale;
    const msg = `scale ${v0.scale} -> ${v1.scale} (ratio ${ratio.toFixed(3)})`;
    expect(ratio >= 2.25 && ratio <= 3.75 || v1.scale === 24, msg).toBe(true);
    const px = vr.rawLeft + v1.offsetX + W.x * v1.scale;
    const py = vr.rawTop + v1.offsetY + W.y * v1.scale;
    expect(Math.abs(px - center.x), `focal x ${msg}`).toBeLessThanOrEqual(8);
    expect(Math.abs(py - center.y), `focal y ${msg}`).toBeLessThanOrEqual(8);
    const st = await page.evaluate(() => {
      const wrap = window.app.ui.exportModalState.wrap;
      return { ta: getComputedStyle(wrap).touchAction, attr: wrap.hasAttribute('data-touch-zoom'), vv: window.visualViewport ? window.visualViewport.scale : 1 };
    });
    expect(st.ta, 'wrap touch-action').toBe('none');
    expect(st.attr, 'wrap data-touch-zoom').toBe(true);
    if (touch.engineSupports(page, 'trustedMultiTouch')) expect(st.vv, `page zoom (${msg})`).toBe(1);
    if (process.env.TUX_EVIDENCE === '1' && testInfo.project.name.startsWith('touch-')) {
      fs.mkdirSync(EVIDENCE_047, { recursive: true });
      await page.screenshot({ path: path.join(EVIDENCE_047, `${spec(testInfo).device}.png`) });
    }
  });

  test('B export preview two-finger pan + one-finger pan unchanged', async ({ page }) => {
    await openExportPreview(page);
    const vr = await visibleRect(page, 'export');
    const c = { x: vr.x, y: vr.y };
    const v0 = await exportView(page);
    await touch.twoFingerPan(page, c, { dx: 60, dy: 40, gap: 100 });
    await raf2(page);
    const v1 = await exportView(page);
    expect(Math.abs(v1.offsetX - v0.offsetX - 60), `2f pan dx ${JSON.stringify([v0, v1])}`).toBeLessThanOrEqual(6);
    expect(Math.abs(v1.offsetY - v0.offsetY - 40), 'dy').toBeLessThanOrEqual(6);
    expect(Math.abs(v1.scale / v0.scale - 1), 'scale stable').toBeLessThan(0.02);
    // One-finger drag of 50: offsetX +50, no jumps.
    const seq = [v1.offsetX];
    await touch.touchPhase(page, 'start', [{ x: c.x, y: c.y, id: 0 }]);
    for (let i = 1; i <= 10; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: c.x + 5 * i, y: c.y, id: 0 }]);
      seq.push((await exportView(page)).offsetX);
    }
    await touch.touchPhase(page, 'end', [{ x: c.x + 50, y: c.y, id: 0 }]);
    const v2 = await exportView(page);
    expect(Math.abs(v2.offsetX - v1.offsetX - 50), `1f drag ${JSON.stringify(seq)}`).toBeLessThanOrEqual(6);
    for (let i = 1; i < seq.length; i += 1) expect(Math.abs(seq[i] - seq[i - 1]), `step ${i} ${JSON.stringify(seq)}`).toBeLessThanOrEqual(10);
  });

  const PD_CASES = [
    { kind: 'window', tool: 'fill', stagger: 0 },
    { kind: 'window', tool: 'fill', stagger: 60 },
    { kind: 'window', tool: 'select', stagger: 60 },
    { kind: 'window', tool: 'pen', stagger: 60 },
    { kind: 'inline', tool: 'fill', stagger: 0 },
    { kind: 'inline', tool: 'fill', stagger: 60 },
    { kind: 'inline', tool: 'select', stagger: 60 },
    { kind: 'inline', tool: 'pen', stagger: 60 },
  ];
  PD_CASES.forEach(({ kind, tool, stagger }) => {
    test(`C Pattern Designer (${kind}) pinch zooms and does not mutate: ${tool}, stagger ${stagger}`, async ({ page }, testInfo) => {
      const s = spec(testInfo);
      // Inline variant runs on iPadL and iPhL only (shared binding, saves CPU); not applicable elsewhere.
      test.skip(kind === 'inline' && !['iPadL', 'iPhL'].includes(s.device), 'inline PD variant runs on iPadL/iPhL only');
      await openPd(page, kind);
      await setTool(page, tool);
      const vr = await visibleRect(page, 'pd');
      expect(vr && vr.w > 120 && vr.h > 60, `pd canvas visible ${JSON.stringify(vr)}`).toBeTruthy();
      const { startDist, endDist } = pinchSpec(vr);
      // Both fingers (whole pinch travel) must be on the canvas, not under the header or a bar.
      // For the fill tool the FIRST finger lands on a fill target, so a pinch that wrongly pours is observable.
      const center = await pickPinchCenter(page, startDist, endDist, tool === 'fill');
      expect(center, 'a clear pinch spot exists on the canvas').toBeTruthy();
      const a = await pdSnap(page);
      const W = { x: (center.x - vr.rawLeft - a.ox) / a.zoom, y: (center.y - vr.rawTop - a.oy) / a.zoom };
      await touch.pinch(page, center, { startDist, endDist, steps: 10, staggerMs: stagger });
      await page.waitForTimeout(350);
      await raf2(page);
      const b = await pdSnap(page);
      const msg = `${kind}/${tool}/${stagger}: fills ${a.fills}->${b.fills} history ${a.history}->${b.history} layerFills ${a.layerFills}->${b.layerFills} zoom ${a.zoom} -> ${b.zoom}`;
      expect(b.fills, msg).toBe(a.fills);
      expect(b.history, msg).toBe(a.history);
      expect(b.layerFills, msg).toBe(a.layerFills);
      expect(b.selectedPath, msg).toBe(a.selectedPath);
      expect(b.pending, msg).toBe(a.pending);
      const ratio = b.zoom / a.zoom;
      expect(ratio >= 2.25 && ratio <= 3.75 || b.zoom === 200, msg).toBe(true);
      expect(Math.abs(vr.rawLeft + b.ox + W.x * b.zoom - center.x), `focal x ${msg}`).toBeLessThanOrEqual(8);
      expect(Math.abs(vr.rawTop + b.oy + W.y * b.zoom - center.y), `focal y ${msg}`).toBeLessThanOrEqual(8);
      if (process.env.TUX_EVIDENCE === '1' && kind === 'window' && tool === 'fill' && stagger === 60 && testInfo.project.name.startsWith('touch-')) {
        fs.mkdirSync(EVIDENCE_047, { recursive: true });
        await page.screenshot({ path: path.join(EVIDENCE_047, `pd-${s.device}.png`) });
      }
    });
  });

  test('D Pattern Designer two-finger pan + cancel safety', async ({ page }) => {
    await openPd(page, 'window');
    const vr = await visibleRect(page, 'pd');
    const c = { x: vr.x, y: vr.y };
    const a = await pdSnap(page);
    await touch.twoFingerPan(page, c, { dx: 60, dy: 40, gap: 100 });
    await page.waitForTimeout(350);
    const b = await pdSnap(page);
    expect(Math.abs(b.ox - a.ox - 60), `2f pan dx ${JSON.stringify([a, b])}`).toBeLessThanOrEqual(6);
    expect(Math.abs(b.oy - a.oy - 40), 'dy').toBeLessThanOrEqual(6);
    expect([b.fills, b.history, b.layerFills], 'no mutation').toEqual([a.fills, a.history, a.layerFills]);
    // Cancelled pinch, then a tap with the select tool on an empty corner must not pan.
    await setTool(page, 'select');
    const g = 100;
    await touch.touchPhase(page, 'start', [{ x: c.x - g / 2, y: c.y, id: 0 }, { x: c.x + g / 2, y: c.y, id: 1 }]);
    await touch.touchPhase(page, 'move', [{ x: c.x - g, y: c.y, id: 0 }, { x: c.x + g, y: c.y, id: 1 }]);
    // CDP touchCancel must carry NO touch points; the WebKit shim cancels the listed fingers.
    const fingers = [{ x: c.x - g, y: c.y, id: 0 }, { x: c.x + g, y: c.y, id: 1 }];
    await touch.touchPhase(page, 'cancel', touch.engineSupports(page, 'cdp') ? [] : fingers);
    if (page.__touchDown) page.__touchDown.clear();
    await page.waitForTimeout(100);
    const afterCancel = await pdSnap(page);
    await touch.tap(page, { x: vr.left + 8, y: vr.top + 8 });
    await page.waitForTimeout(350);
    const afterTap = await pdSnap(page);
    expect(Math.abs(afterTap.ox - afterCancel.ox), `tap panned x ${JSON.stringify([afterCancel, afterTap])}`).toBeLessThanOrEqual(1);
    expect(Math.abs(afterTap.oy - afterCancel.oy), 'tap panned y').toBeLessThanOrEqual(1);
    expect(afterTap.zoom, 'tap zoomed').toBeCloseTo(afterCancel.zoom, 6);
    // Single-finger tool still works after the cancel: fill pours exactly 1.
    await setTool(page, 'fill');
    const pt = await findFillPoint(page);
    expect(pt, 'a fill target exists in view').toBeTruthy();
    const before = await pdSnap(page);
    await touch.tap(page, pt);
    await page.waitForTimeout(400);
    const after = await pdSnap(page);
    expect(after.fills - before.fills, `fill after cancel ${JSON.stringify([before, after])}`).toBe(1);
  });

  test('E single-finger fill tap still pours', async ({ page }) => {
    await openPd(page, 'window');
    await setTool(page, 'fill');
    const pt = await findFillPoint(page);
    expect(pt, 'a fill target exists in view').toBeTruthy();
    const before = await pdSnap(page);
    await touch.tap(page, pt);
    await page.waitForTimeout(400);
    const after = await pdSnap(page);
    expect(after.fills - before.fills, `fills ${JSON.stringify([before, after])}`).toBe(1);
    expect(after.history - before.history, 'history').toBe(1);
  });
});

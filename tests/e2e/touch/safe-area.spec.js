const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, engineSupports } = require('../helpers/touch');

// TUX-005: safe-area insets land on the right elements (docs/touch-ux-requirements.md TUX-005).
// Playwright WebKit cannot emulate env(safe-area-inset-*), so both engines inject the --safe-*
// tokens on <html>; a Chromium-only CDP block (G) proves env() reaches the tokens.
// iPhone values: requirement. iPad values: docs/touch-audit/scripts/target-audit.js.
const PROFILES = {
  iPhP: { top: 62, bottom: 34, left: 0, right: 0 },
  iPhL: { top: 0, bottom: 21, left: 62, right: 62 },
  iPadP: { top: 24, bottom: 20, left: 0, right: 0 },
  iPadL: { top: 24, bottom: 20, left: 0, right: 0 },
};
const ZERO = { top: 0, bottom: 0, left: 0, right: 0 };
const TOL = 0.5;
// Desktop/tablet base 38 px. The phone header holds 44 px TUX-001 buttons, so its base is 44 px.
const baseHeaderH = (device) => (device === 'iPhP' || device === 'iPhL' ? 44 : 38);
// Repo-relative by default (the worktree sits under <repo>/.claude/worktrees/<lane>); TUX_EVIDENCE_DIR overrides.
const EVIDENCE = process.env.TUX_EVIDENCE_DIR || path.resolve(__dirname, '../../../docs/touch-audit/evidence/after/TUX-005');

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.waitForTimeout(400);
};

const inject = async (page, p) => {
  await page.evaluate(async (v) => {
    const s = document.documentElement.style;
    s.setProperty('--safe-top', `${v.top}px`);
    s.setProperty('--safe-right', `${v.right}px`);
    s.setProperty('--safe-bottom', `${v.bottom}px`);
    s.setProperty('--safe-left', `${v.left}px`);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, p);
  await page.waitForTimeout(250);
};

// Shared in-page helpers, installed once per page as window.__sa.
const installHelpers = (page) => page.evaluate(() => {
  const isShown = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || cs.pointerEvents === 'none') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
  const inFlow = (el) => !['absolute', 'fixed'].includes(getComputedStyle(el).position);
  const INTERACTIVE = 'button, a, [role=button], [role=menuitem], input, select, textarea';
  const hits = (el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  };
  // TUX-007: on a short phone (iPhone landscape) every strip is an overlay, so nothing is in flow. The
  // status strip (#hud-bar) is then the bottom-most chrome and carries the bottom inset itself.
  const chrome = () => {
    // Q17: on touch-wide the status strip is an overlay on the canvas; the collapsed bottom pane is the bottom-most strip.
    const touchWide = document.body.classList.contains('touch-wide-layout');
    const shown = (touchWide ? ['#bottom-pane', '#touch-modifier-bar'] : ['#hud-bar', '#touch-modifier-bar'])
      .map((s) => document.querySelector(s))
      .filter((e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
    const flow = shown.filter(inFlow);
    if (flow.length || !document.body.classList.contains('phone-short')) return flow;
    return shown.filter((e) => e.id === 'hud-bar');
  };
  window.__sa = { isShown, rect, inFlow, INTERACTIVE, hits, chrome };
});

// Opens a side pane by finger tap on the first control that really receives the touch.
// Base without TUX-010: on phone portrait the rail (z 60) covers the sliver toggles, so no control is
// tappable. Then the toggle's own click handler runs (annotated), and the geometry checks still apply.
const openPane = async (page, side, testInfo) => {
  const width = () => page.evaluate((s) => document.getElementById(`${s}-pane`).getBoundingClientRect().width, side);
  if ((await width()) >= 150) return;
  let tapped = false;
  for (const sel of [`#btn-header-pane-${side}`, `#btn-mobile-pane-${side}`, `#btn-pane-toggle-${side}`]) {
    const ok = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    }, sel);
    if (ok) { await tap(page, page.locator(sel)); tapped = true; break; }
  }
  if (!tapped) {
    testInfo.annotations.push({ type: 'tux010-fallback', description: `${side} pane toggle covered; opened through click()` });
    await page.evaluate((s) => document.getElementById(`btn-pane-toggle-${s}`).click(), side);
  }
  await page.waitForTimeout(500);
  expect(await width(), `${side} pane opened`).toBeGreaterThanOrEqual(150);
};

test.describe('TUX-005 safe-area insets', () => {
  let P;
  let device;
  test.beforeEach(async ({ page }, testInfo) => {
    device = PROJECTS[testInfo.project.name].device;
    P = PROFILES[device];
    test.skip(!P, `TUX-005 defines no safe-area inset profile for ${device} (Chrome-UI and wide-coarse devices)`);
    await gotoApp(page);
    await installHelpers(page);
  });

  test('A header clears the top inset and its controls stay inside the safe rect', async ({ page }) => {
    const baseH = await page.evaluate(() => document.getElementById('app-header').getBoundingClientRect().height);
    expect(baseH).toBeCloseTo(baseHeaderH(device), 0);
    await inject(page, P);
    const m = await page.evaluate((p) => {
      const S = window.__sa;
      const h = document.getElementById('app-header');
      const hr = h.getBoundingClientRect();
      const cs = getComputedStyle(h);
      const tb = document.getElementById('tool-bar').getBoundingClientRect();
      const bad = [];
      h.querySelectorAll(S.INTERACTIVE).forEach((el) => {
        if (!S.isShown(el)) return;
        const r = el.getBoundingClientRect();
        const name = `${el.tagName.toLowerCase()}#${el.id || ''}.${String(el.className).split(' ')[0]}`;
        if (r.top < p.top - 0.5) bad.push(`${name} top ${r.top} < ${p.top}`);
        if (r.bottom > hr.bottom + 0.5) bad.push(`${name} bottom ${r.bottom} > header ${hr.bottom}`);
        if (r.left < p.left - 0.5) bad.push(`${name} left ${r.left} < ${p.left}`);
        if (r.right > innerWidth - p.right + 0.5) bad.push(`${name} right ${r.right} > ${innerWidth - p.right}`);
        const ix = Math.min(r.right, tb.right) - Math.max(r.left, tb.left);
        const iy = Math.min(r.bottom, tb.bottom) - Math.max(r.top, tb.top);
        if (ix > 0.5 && iy > 0.5) bad.push(`${name} intersects #tool-bar`);
        if (!S.hits(el)) bad.push(`${name} not hit at its centre`);
      });
      const main = h.querySelector('.header-main');
      return {
        padTop: parseFloat(cs.paddingTop), padBottom: parseFloat(cs.paddingBottom), height: hr.height,
        mainBottom: main ? main.getBoundingClientRect().bottom : null, headerBottom: hr.bottom, bad,
      };
    }, P);
    expect(m.padTop, `expected header paddingTop >= ${P.top}`).toBeGreaterThanOrEqual(P.top - TOL);
    expect(m.height - P.top, `header height ${m.height} minus inset ${P.top} keeps the base ${baseH}`).toBeGreaterThanOrEqual(baseH - TOL);
    if (m.mainBottom !== null) expect(m.mainBottom, '.header-main inside the header').toBeLessThanOrEqual(m.headerBottom + TOL);
    expect(m.bad).toEqual([]);
  });

  test('B toolbar sits directly under the header without a double inset band', async ({ page }) => {
    await inject(page, P);
    const m = await page.evaluate((p) => {
      const tb = document.getElementById('tool-bar');
      const hr = document.getElementById('app-header').getBoundingClientRect();
      const r = tb.getBoundingClientRect();
      const cs = getComputedStyle(tb);
      return { pos: cs.position, top: r.top, bottom: r.bottom, left: r.left, right: r.right, padTop: parseFloat(cs.paddingTop), hb: hr.bottom, vw: innerWidth, vh: innerHeight, p };
    }, P);
    if (m.pos !== 'absolute' && m.pos !== 'fixed') {
      expect(m.top - m.hb, 'gap between header and toolbar').toBeLessThanOrEqual(4);
      expect(m.padTop, 'toolbar padding-top excludes the inset').toBeLessThanOrEqual(12);
    } else {
      expect(m.top, 'floating rail below the header').toBeGreaterThanOrEqual(m.hb - TOL);
      expect(m.left).toBeGreaterThanOrEqual(P.left - TOL);
      expect(m.right).toBeLessThanOrEqual(m.vw - P.right + TOL);
      expect(m.bottom).toBeLessThanOrEqual(m.vh - P.bottom + TOL);
    }
  });

  test('C bottom-most chrome carries the bottom inset once', async ({ page }) => {
    await inject(page, P);
    const m = await page.evaluate((p) => {
      const S = window.__sa;
      const list = S.chrome().map((e) => ({ id: e.id, ...S.rect(e), pb: parseFloat(getComputedStyle(e).paddingBottom) }));
      if (!list.length) return { list };
      list.sort((a, b) => b.b - a.b);
      const last = S.chrome().find((e) => e.id === list[0].id);
      const over = [];
      last.querySelectorAll('*').forEach((el) => {
        if (!S.isShown(el)) return;
        const r = el.getBoundingClientRect();
        if (r.bottom > innerHeight - p.bottom + 0.5) over.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} bottom ${r.bottom}`);
      });
      return { list, over, vh: innerHeight };
    }, P);
    expect(m.list.length, 'a bottom chrome strip is visible').toBeGreaterThan(0);
    const last = m.list[0];
    expect(last.pb, `expected ${last.id} paddingBottom >= ${P.bottom}`).toBeGreaterThanOrEqual(P.bottom - TOL);
    expect(last.b).toBeLessThanOrEqual(m.vh + TOL);
    expect(m.over, 'content inside the bottom band').toEqual([]);
    m.list.slice(1).forEach((c) => {
      if (c.b <= last.t + TOL) expect(c.pb, `${c.id} above ${last.id} must not carry the inset`).toBeLessThan(P.bottom);
    });
  });

  test('D left/right insets keep the pane controls and the add-layer menu in the safe rect', async ({ page }, testInfo) => {
    if (!P.left && !P.right) return; // portrait and iPad profiles have no side insets
    await inject(page, P);
    await openPane(page, 'right', testInfo);
    const inside = async (sel, what) => {
      const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, hidden: getComputedStyle(e).visibility === 'hidden' }; }, sel);
      // TUX-011: a control inside a closed touch drawer is off screen and hidden; only visible controls need the safe rect.
      if (!r || r.w === 0 || r.hidden) return;
      expect(r.l, `${what} left`).toBeGreaterThanOrEqual(P.left - TOL);
      const vw = await page.evaluate(() => innerWidth);
      expect(r.r, `${what} right`).toBeLessThanOrEqual(vw - P.right + TOL);
    };
    for (const [sel, what] of [['#app-header .header-brand-menu', 'brand'], ['#btn-pane-toggle-left', 'left toggle'], ['#btn-pane-toggle-right', 'right toggle'],
      ['#btn-mobile-pane-left', 'left handle'], ['#btn-mobile-pane-right', 'right handle'], ['#btn-add-layer', 'Add Layer']]) {
      await inside(sel, what);
    }
    await tap(page, page.locator('#btn-add-layer'));
    await page.waitForTimeout(300);
    const items = await page.evaluate((p) => {
      const out = [];
      document.querySelectorAll('#layer-add-menu .lvl-add-item').forEach((el) => {
        if (!window.__sa.isShown(el)) return;
        const r = el.getBoundingClientRect();
        out.push({ name: el.dataset.add, l: r.left, r: r.right, hit: window.__sa.hits(el), vw: innerWidth });
      });
      return out;
    }, P);
    expect(items.length, 'add menu items visible').toBeGreaterThan(0);
    items.forEach((i) => {
      expect(i.l, `${i.name} left`).toBeGreaterThanOrEqual(P.left - TOL);
      expect(i.r, `${i.name} right`).toBeLessThanOrEqual(i.vw - P.right + TOL);
      expect(i.hit, `${i.name} hit`).toBe(true);
    });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('layer-add-menu')?.classList.add('hidden'));
    await tap(page, page.locator('.right-pane-tab[data-tab="pens"]'));
    await page.waitForTimeout(300);
    await inside('#btn-add-pen', 'Add Pen');
    await inside('#pen-list > *', 'first pen row');
  });

  test('E drawers and docked panes respect bottom chrome and side insets', async ({ page }, testInfo) => {
    await inject(page, P);
    for (const side of ['left', 'right']) {
      await openPane(page, side, testInfo);
      const m = await page.evaluate(({ side: s, p }) => {
        const S = window.__sa;
        const pane = document.getElementById(`${s}-pane`);
        const pr = pane.getBoundingClientRect();
        const pos = getComputedStyle(pane).position;
        const chromeTops = S.chrome().map((e) => S.rect(e)).filter((r) => r.l < pr.right && r.r > pr.left).map((r) => r.t);
        const bad = [];
        pane.querySelectorAll(S.INTERACTIVE).forEach((el) => {
          if (!S.isShown(el)) return;
          const r = el.getBoundingClientRect();
          if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) return;
          const name = `${el.tagName.toLowerCase()}#${el.id || ''}.${String(el.className).split(' ')[0]}`;
          if (s === 'left' && r.left < p.left - 0.5) bad.push(`${name} left ${r.left} < ${p.left}`);
          if (s === 'right' && Math.min(r.right, pr.right) > innerWidth - p.right + 0.5) bad.push(`${name} right ${r.right} > ${innerWidth - p.right}`);
        });
        const band = [];
        pane.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if (!(cs.overflowY === 'auto' || cs.overflowY === 'scroll') || !S.isShown(el)) return;
          const r = el.getBoundingClientRect();
          if (r.bottom > innerHeight - p.bottom + 0.5 && parseFloat(cs.paddingBottom) < p.bottom - 0.5) band.push(`${el.id || el.className} pb ${cs.paddingBottom} bottom ${r.bottom}`);
        });
        return { pos, bottom: pr.bottom, chromeTop: chromeTops.length ? Math.min(...chromeTops) : null, bad, band };
      }, { side, p: P });
      if (m.pos === 'absolute' && m.chromeTop !== null) {
        expect(m.bottom, `${side} drawer bottom must clear the bottom chrome top ${m.chromeTop}`).toBeLessThanOrEqual(m.chromeTop + TOL);
      }
      expect(m.bad, `${side} pane content inside the side insets`).toEqual([]);
      expect(m.band, `${side} scroll containers in the bottom band carry padding-bottom >= ${P.bottom}`).toEqual([]);
    }
  });

  test('F zero-inset parity: tokens add nothing beyond the inset itself', async ({ page }) => {
    const read = () => page.evaluate(() => {
      const S = window.__sa;
      const h = document.getElementById('app-header');
      const tb = document.getElementById('tool-bar');
      const list = S.chrome().map((e) => ({ id: e.id, b: e.getBoundingClientRect().bottom, pb: parseFloat(getComputedStyle(e).paddingBottom), pl: parseFloat(getComputedStyle(e).paddingLeft) }));
      list.sort((a, b) => b.b - a.b);
      const hs = getComputedStyle(h);
      return { hh: h.getBoundingClientRect().height, hpl: parseFloat(hs.paddingLeft), hpr: parseFloat(hs.paddingRight), tbPt: parseFloat(getComputedStyle(tb).paddingTop), last: list[0] || null };
    });
    await inject(page, ZERO);
    const z = await read();
    expect(z.hh, 'zero-inset header height').toBeCloseTo(baseHeaderH(device), 0);
    await inject(page, P);
    const p = await read();
    expect(p.hh - z.hh, 'header grows by exactly the top inset').toBeCloseTo(P.top, 0);
    expect(p.hpl - z.hpl, 'header left padding grows by the left inset').toBeCloseTo(P.left, 0);
    expect(p.hpr - z.hpr, 'header right padding grows by the right inset').toBeCloseTo(P.right, 0);
    expect(p.tbPt - z.tbPt, 'toolbar padding-top is inset-free').toBeCloseTo(0, 0);
    expect(p.last.id).toBe(z.last.id);
    expect(p.last.pb - z.last.pb, 'bottom-most chrome padding grows by exactly the bottom inset').toBeCloseTo(P.bottom, 0);
  });

  test('G env() reaches the tokens (Chromium CDP wiring proof)', async ({ page }) => {
    if (!engineSupports(page, 'cdp')) return; // WebKit has no safe-area emulation; A-F cover it through injection
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: PROFILES.iPhP });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => ({
      hdr: getComputedStyle(document.getElementById('app-header')).paddingTop,
      tb: parseFloat(getComputedStyle(document.getElementById('tool-bar')).paddingTop),
      token: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
    }));
    expect(m.hdr, `header paddingTop via env() (token "${m.token}")`).toBe('62px');
    expect(m.tb).toBeLessThanOrEqual(12);
  });

  test('H collapsed slivers keep 40 px plus the inset offset and leave the inset band transparent', async ({ page }) => {
    if (!P.left && !P.right) return;
    await inject(page, P);
    const widths = () => page.evaluate(() => ['left', 'right'].map((s) => document.getElementById(`${s}-pane`).getBoundingClientRect().width));
    for (const side of ['left', 'right']) {
      const open = await page.evaluate((s) => document.getElementById(`${s}-pane`).getBoundingClientRect().width > 60, side);
      if (open) {
        await page.evaluate((s) => document.getElementById(`btn-pane-toggle-${s}`).click(), side);
        await page.waitForTimeout(500);
      }
    }
    // TUX-011: on a touch phone a closed pane has no sliver. It is hidden and fully off screen, so the inset
    // band cannot be covered by it. Fine-pointer narrow windows keep the sliver contract below.
    const gone = await page.evaluate(() => ['left', 'right'].every((s) => {
      const el = document.getElementById(`${s}-pane`);
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).visibility === 'hidden' && (s === 'left' ? r.right <= 0 : r.left >= innerWidth);
    }));
    if (gone) {
      const bands = await page.evaluate(() => { const l = document.elementFromPoint(5, innerHeight / 2); const r = document.elementFromPoint(innerWidth - 5, innerHeight / 2); return [!!(l && l.closest('.pane')), !!(r && r.closest('.pane'))]; });
      expect(bands, 'inset bands are not covered by a pane').toEqual([false, false]);
      return;
    }
    const [lw, rw] = await widths();
    expect(lw, 'left sliver width').toBeLessThanOrEqual(40 + TOL);
    expect(rw, 'right sliver width').toBeLessThanOrEqual(40 + TOL);
    const m = await page.evaluate(() => {
      const l = document.getElementById('left-pane').getBoundingClientRect();
      const r = document.getElementById('right-pane').getBoundingClientRect();
      const canvas = document.getElementById('canvas-container') || document.querySelector('canvas');
      const mid = innerHeight / 2;
      // the inset band must show the canvas, not an opaque pane
      const bandL = document.elementFromPoint(5, mid);
      const bandR = document.elementFromPoint(innerWidth - 5, mid);
      return { l: l.left, lr: l.right, r: r.left, rr: r.right, vw: innerWidth,
        bandL: bandL ? !!bandL.closest('.pane') : false, bandR: bandR ? !!bandR.closest('.pane') : false };
    });
    expect(m.l, 'left sliver starts at the inset').toBeGreaterThanOrEqual(P.left - TOL);
    expect(m.rr, 'right sliver ends at the inset').toBeLessThanOrEqual(m.vw - P.right + TOL);
    expect(m.bandL, 'left inset band is not an opaque pane').toBe(false);
    expect(m.bandR, 'right inset band is not an opaque pane').toBe(false);
  });

  test('J closed off-canvas drawers do not paint into the side inset band', async ({ page }) => {
    test.skip(!P.left && !P.right, 'no side inset on this profile');
    await inject(page, P);
    const m = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.settings-panel:not(.open)').forEach((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out.push({ id: el.id, visibility: cs.visibility, display: cs.display, transform: cs.transform, left: r.left, right: r.right });
      });
      return out;
    });
    expect(m.length, 'closed drawers found').toBeGreaterThan(0);
    // Geometry check, independent of visibility: a closed drawer sits fully left of x=0, so the
    // transform half of the fix is falsifiable even when the panel is also visibility:hidden.
    for (const d of m) {
      expect(d.right, `${d.id} closed drawer right edge must be off-screen (<= 0), got ${JSON.stringify(d)}`).toBeLessThanOrEqual(0 + TOL);
    }
  });

  test('K floating tool rail stays inside the viewport and its footer is reachable (iPad landscape, t24/b20)', async ({ page }) => {
    test.skip(device !== 'iPadL', 'iPad landscape only');
    for (const [w, h, home] of [[1210, 834, false], [1210, 834, true], [1180, 820, false], [1180, 820, true]]) {
      await page.setViewportSize({ width: w, height: h });
      await inject(page, P);
      if (home) await page.evaluate(() => document.querySelector('.toolbar-home-btn')?.click());
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const bar = document.getElementById('tool-bar');
        const vp = document.getElementById('viewport-container').getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        // The footer is display:none under (pointer: coarse) (TUX-016: the handle drags, pin is ignored), so the
        // reachability probe covers the bottom-most visible rail control instead; footer buttons join when shown.
        const ctl = [...bar.querySelectorAll('.tool-btn, .toolbar-footer button')].filter((e) => e.getBoundingClientRect().width > 0);
        const foot = ctl.slice(-2).map((e) => {
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { cls: e.className, ok: !!hit && (hit === e || e.contains(hit)) };
        });
        return { top: b.top, bottom: b.bottom, vpTop: vp.top, vpBottom: vp.bottom, foot };
      });
      const tag = `${w}x${h}${home ? ' home' : ' initial'} ${JSON.stringify(m)}`;
      expect(m.bottom, `rail bottom <= viewport bottom ${tag}`).toBeLessThanOrEqual(m.vpBottom + TOL);
      expect(m.top, `rail top >= viewport top ${tag}`).toBeGreaterThanOrEqual(m.vpTop - TOL);
      expect(m.foot.length).toBeGreaterThan(0);
      for (const f of m.foot) expect(f.ok, `bottom rail control ${f.cls} hit-tests to itself ${tag}`).toBe(true);
      const pin = page.locator('#tool-bar .toolbar-pin-btn');
      if (await pin.isVisible()) {
        const before = await pin.getAttribute('aria-pressed');
        await tap(page, pin);
        await page.waitForTimeout(150);
        expect(await pin.getAttribute('aria-pressed'), `pin tap toggles ${tag}`).not.toBe(before);
        await tap(page, pin);
      }
    }
  });

  test('I bottom inset survives when the modifier bar is hidden (<= 640 px wide)', async ({ page }) => {
    const narrow = await page.evaluate(() => innerWidth <= 640);
    if (!narrow) return;
    await inject(page, P);
    await page.evaluate(() => document.getElementById('touch-modifier-bar').classList.add('hidden'));
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const hud = document.getElementById('hud-bar');
      const shell = document.querySelector('.workspace-shell');
      const sr = shell.getBoundingClientRect();
      let maxBottom = 0;
      shell.querySelectorAll('button, a, input, select, [role=button]').forEach((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || !r.width || !r.height) return;
        if (el.closest('.pane')) return;
        maxBottom = Math.max(maxBottom, r.bottom);
      });
      return { hudDisplay: getComputedStyle(hud).display, shellPb: parseFloat(getComputedStyle(shell).paddingBottom), shellBottom: sr.bottom, vh: innerHeight, maxBottom };
    });
    expect(m.hudDisplay).toBe('none');
    expect(m.shellPb, 'shell reserves the bottom inset').toBeGreaterThanOrEqual(P.bottom - TOL);
    expect(m.maxBottom, 'interactive bottom content clears the inset').toBeLessThanOrEqual(m.vh - P.bottom + TOL);
  });

  test('D5 evidence screenshot with the profile injected', async ({ page }, testInfo) => {
    await inject(page, P);
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE}/${testInfo.project.name}.png` });
  });
});

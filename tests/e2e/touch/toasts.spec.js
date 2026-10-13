const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PROJECTS, DEVICES } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-048: UI.overlays.Toast sits bottom-centre on touch (body.touch-ui), inside the safe area, clear of
// the bottom-docked chrome, above modals. Measured against window.visualViewport + DEVICES, never innerWidth.
// Desktop (fine pointer, any width) keeps the top-right placement. #canvas-toast is out of scope.
const CHROME = ['#app-header', '#tool-bar', '#touch-modifier-bar', '#status-bar', '#bottom-pane', '#btn-pane-toggle-bottom'];
const EVID = process.env.TUX_EVIDENCE_DIR || '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-048';
const BATCH2_EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch2/TUX-010';
const SHORT = 'Added Spiral layer';
const LONG = 'Added a Flowfield layer to the document with the default preset and the current pen assignment';
const TOL = 0.5;
const INSETS = {
  iPhP: { top: 62, bottom: 34, left: 0, right: 0 }, 'iPhP-c': { top: 62, bottom: 34, left: 0, right: 0 },
  iPhL: { top: 0, bottom: 21, left: 62, right: 62 }, 'iPhL-c': { top: 0, bottom: 21, left: 62, right: 62 },
};

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.waitForTimeout(400);
};
// SETUP only (not the gesture under test): one layer so Export is enabled.
const withLayer = async (page) => {
  await page.evaluate(() => { window.app.engine.addLayer('spiral'); if (window.app.ui.renderLayers) window.app.ui.renderLayers(); });
  await page.waitForFunction(() => { const b = document.getElementById('btn-export'); return b && !b.disabled; });
};
const fire = (page, message, extra = {}) => page.evaluate(({ message, extra }) => {
  window.Vectura.UI.overlays.Toast.show({ message, duration: 0, onClick: () => {}, ...extra });
}, { message, extra });
const clear = (page) => page.evaluate(() => document.querySelectorAll('.vectura-toast').forEach((e) => e.remove()));

const measure = (page, chromeSel) => page.evaluate((sel) => {
  const vv = window.visualViewport;
  const el = document.querySelector('#vectura-toast-host .vectura-toast');
  const r = el.getBoundingClientRect();
  const shown = (e) => {
    const cs = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility === 'visible' && b.width * b.height > 0;
  };
  const chrome = [];
  document.querySelectorAll(sel.join(',')).forEach((e) => {
    if (!shown(e)) return;
    const strip = e.closest('.hud-bar');
    if (strip && getComputedStyle(strip).pointerEvents === 'none') return; // Q17 overlay strip: a toast may cover it
    const b = e.getBoundingClientRect();
    chrome.push({ id: e.id, l: b.left, r: b.right, t: b.top, b: b.bottom });
  });
  ['#left-pane', '#right-pane'].forEach((s) => {
    const e = document.querySelector(s);
    if (e && shown(e) && getComputedStyle(e).position === 'fixed') {
      const b = e.getBoundingClientRect();
      chrome.push({ id: s, l: b.left, r: b.right, t: b.top, b: b.bottom });
    }
  });
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    vv: { l: vv.offsetLeft, t: vv.offsetTop, w: vv.width, h: vv.height },
    r: { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, cx: r.left + r.width / 2 },
    chrome, topmost: !!hit && (hit === el || el.contains(hit)),
    host: { cls: document.getElementById('vectura-toast-host').className },
  };
}, chromeSel);

const assertPlacement = (m, dev, ins = { top: 0, bottom: 0, left: 0, right: 0 }, label = '') => {
  const { vv, r } = m;
  const tag = (s) => `${label}${s}`;
  expect(r.l, tag(`A1 left ${r.l}`)).toBeGreaterThanOrEqual(vv.l + ins.left - TOL);
  expect(r.r, tag(`A1 right ${r.r}`)).toBeLessThanOrEqual(vv.l + vv.w - ins.right + TOL);
  expect(r.t, tag(`A1 top ${r.t}`)).toBeGreaterThanOrEqual(vv.t + ins.top - TOL);
  expect(r.b, tag(`A1 bottom ${r.b}`)).toBeLessThanOrEqual(vv.t + vv.h - ins.bottom + TOL);
  expect(Math.abs(r.cx - (vv.l + ((vv.w + ins.left - ins.right) / 2))), tag(`A2 centre ${r.cx}`)).toBeLessThanOrEqual(2);
  expect(r.t, tag(`A3 expected toast.top >= ${vv.t + 0.5 * vv.h}, got ${r.t}`)).toBeGreaterThanOrEqual(vv.t + 0.5 * vv.h - TOL);
  for (const c of m.chrome) {
    const overlapsX = c.l < r.r && c.r > r.l;
    if (overlapsX && c.t > vv.t + vv.h / 2) expect(r.b, tag(`A4 toast.bottom ${r.b} vs ${c.id}.top ${c.t}`)).toBeLessThanOrEqual(c.t - 8 + TOL);
    const hit = overlapsX && c.l < r.r && c.t < r.b && c.b > r.t;
    expect(hit, tag(`A4 toast overlaps ${c.id}`)).toBe(false);
  }
  expect(m.topmost, tag('A5 topmost')).toBe(true);
  expect(r.w, tag(`A6 width ${r.w}`)).toBeLessThanOrEqual(vv.w - 32 + TOL);
};

test.describe('touch toasts', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('viewport is the device viewport (no inflation)', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name];
    const vv = await page.evaluate(() => ({ w: window.visualViewport.width, h: window.visualViewport.height, sw: document.documentElement.scrollWidth }));
    expect(vv.w).toBe(dev.width);
    expect(vv.h).toBeLessThanOrEqual(dev.height);
    expect(vv.sw).toBeLessThanOrEqual(dev.width);
    expect(await page.evaluate(() => document.body.classList.contains('touch-ui'))).toBe(true);
  });

  for (const [name, msg] of [['short', SHORT], ['long (2 lines)', LONG]]) {
    test(`A1-A6 placement, ${name}`, async ({ page }, testInfo) => {
      const dev = PROJECTS[testInfo.project.name];
      await fire(page, msg);
      assertPlacement(await measure(page, CHROME), dev);
      if (name === 'short' || testInfo.project.name.endsWith('landscape-chrome')) {
        await fs.promises.mkdir(EVID, { recursive: true }).catch(() => {});
        await page.screenshot({ path: path.join(EVID, `${testInfo.project.name}${name === 'short' ? '' : '-2line'}.png`) }).catch(() => {});
      }
    });
  }

  test('safe-area insets (tokens injected on <html>, both engines)', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name];
    const ins = INSETS[dev.device];
    test.skip(!ins, 'iPhone profiles only');
    await page.evaluate((v) => {
      const s = document.documentElement.style;
      s.setProperty('--safe-top', `${v.top}px`); s.setProperty('--safe-right', `${v.right}px`);
      s.setProperty('--safe-bottom', `${v.bottom}px`); s.setProperty('--safe-left', `${v.left}px`);
    }, ins);
    await page.waitForTimeout(250);
    await fire(page, SHORT);
    assertPlacement(await measure(page, CHROME), dev, ins, 'inset ');
    await clear(page);
    await fire(page, LONG);
    assertPlacement(await measure(page, CHROME), dev, ins, 'inset long ');
  });

  test('non-actionable toast ignores pointer events on touch', async ({ page }) => {
    await page.evaluate(() => window.Vectura.UI.overlays.Toast.show({ message: 'Plain status', duration: 0 }));
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.vectura-toast')).pointerEvents)).toBe('none');
    await clear(page);
    await fire(page, 'Tap me');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.vectura-toast')).pointerEvents)).toBe('auto');
  });

  test('static: no inline geometry on host or toast', async ({ page }) => {
    await fire(page, SHORT);
    const res = await page.evaluate(() => {
      const props = ['top', 'right', 'bottom', 'left', 'position', 'z-index'];
      const out = [];
      [document.getElementById('vectura-toast-host'), document.querySelector('.vectura-toast')].forEach((el) => {
        props.forEach((p) => { if (el.style.getPropertyValue(p) !== '') out.push(`${el.id || el.className}:${p}`); });
      });
      return out;
    });
    expect(res).toEqual([]);
  });

  test('smoke: a real finger add-layer path produces a toast in place', async ({ page }) => {
    const reachable = async () => { const b = await page.locator('#btn-add-layer').boundingBox().catch(() => null); const vp = page.viewportSize(); return !!(b && b.width > 4 && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height); };
    if (!(await reachable())) {
      for (const id of ['btn-header-pane-right', 'btn-pane-toggle-right', 'btn-mobile-pane-right']) {
        const btn = page.locator(`#${id}`);
        if (await btn.isVisible().catch(() => false)) { await touch.tap(page, btn); await page.waitForTimeout(400); if (await reachable()) break; }
      }
    }
    await touch.tap(page, page.locator('#btn-add-layer'));
    await expect(page.locator('#layer-add-menu')).toBeVisible();
    await touch.tap(page, page.locator('#layer-add-menu .lvl-add-item[data-add="layer"]'));
    await expect(page.locator('.vectura-toast', { hasText: 'Added empty layer' })).toHaveCount(1);
    const m = await measure(page, CHROME);
    const { vv, r } = m;
    expect(r.b).toBeLessThanOrEqual(vv.t + vv.h + TOL);
    expect(r.l).toBeGreaterThanOrEqual(vv.l - TOL);
    expect(r.t).toBeGreaterThanOrEqual(vv.t + 0.5 * vv.h - TOL);
    for (const c of m.chrome) if (c.l < r.r && c.r > r.l) expect(c.t < r.b && c.b > r.t, `overlaps ${c.id}`).toBe(false);
  });
});

// TUX-010/011 + TUX-037/048 (batch 2): a plain toast never covers a primary control. Contract recorded in
// docs/touch-audit/changelog-fragments/TUX-037.md: the TUX-037 "plain toast stays top-right" rule is superseded on
// touch by TUX-048 (bottom-centre above measured bottom chrome); fine pointers keep top-right (desktop parity below).
test.describe('plain toast vs primary controls', () => {
  const CONTROLS = ['#btn-add-layer', '#layer-search-input', '#layer-filter-btn', '.tool-btn[data-tool="scissor"]', '#tool-overflow-btn', '#btn-pane-toggle-bottom'];
  test.beforeEach(async ({ page }) => { await boot(page); });
  const PANE_OPENERS = ['#btn-header-pane-right', '#btn-pane-toggle-right', '#btn-mobile-pane-right'];

  const probe = (page) => page.evaluate((sels) => {
    const t = document.querySelector('#vectura-toast-host .vectura-toast').getBoundingClientRect();
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const out = [];
    for (const s of sels) {
      const e = document.querySelector(s);
      if (!e) continue;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const onScreen = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 4 && r.height > 4
        && r.left >= 0 && r.top >= 0 && r.right <= vp.w + 1 && r.bottom <= vp.h + 1 && !e.closest('.rail-overflowed, [inert]');
      if (!onScreen) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const toastEl = document.querySelector('#vectura-toast-host .vectura-toast');
      out.push({
        sel: s,
        overlap: t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top,
        underToast: !!hit && toastEl.contains(hit),
        toast: { l: Math.round(t.left), t: Math.round(t.top), r: Math.round(t.right), b: Math.round(t.bottom) },
        rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
      });
    }
    return out;
  }, CONTROLS);

  for (const [name, msg] of [['short', SHORT], ['long', LONG]]) {
    test(`controls stay uncovered (${name}, panes as launched and with the Layers pane revealed)`, async ({ page }, testInfo) => {
      await withLayer(page);
      const seen = new Set();
      const check = async (label) => {
        await clear(page);
        await fire(page, msg, { onClick: undefined });
        const rows = await probe(page);
        for (const r of rows) {
          seen.add(r.sel);
          expect(r.overlap, `${label}: ${r.sel} ${JSON.stringify(r.rect)} overlaps toast ${JSON.stringify(r.toast)}`).toBe(false);
          expect(r.underToast, `${label}: toast is the hit target over ${r.sel}`).toBe(false);
        }
      };
      await check('launch');
      for (const id of PANE_OPENERS) {
        const btn = page.locator(id);
        if (await btn.isVisible().catch(() => false)) { await touch.tap(page, btn); await page.waitForTimeout(450); break; }
      }
      await check('layers pane revealed');
      expect(seen.has('#btn-add-layer') || seen.has('#layer-search-input'), 'Layers pane controls were measured at least once').toBe(true);
      if (name === 'short') {
        await fs.promises.mkdir(BATCH2_EVID, { recursive: true }).catch(() => {});
        await page.screenshot({ path: path.join(BATCH2_EVID, `${testInfo.project.name}-toast-controls.png`) }).catch(() => {});
      }
    });
  }
});

test.describe('desktop parity (fine pointer)', () => {
  for (const [w, h] of [[1600, 1000], [800, 700]]) {
    test(`toast stays top-right at ${w}x${h}`, async ({ browser }, testInfo) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: false, isMobile: false, baseURL: testInfo.project.use.baseURL });
      const page = await ctx.newPage();
      await boot(page);
      await fire(page, SHORT);
      const d = await page.evaluate(() => {
        const r = document.querySelector('.vectura-toast').getBoundingClientRect();
        return { right: window.innerWidth - r.right, top: r.top, touchUi: document.body.classList.contains('touch-ui') };
      });
      expect(d.touchUi).toBe(false);
      expect(Math.abs(d.right - 16)).toBeLessThanOrEqual(2);
      // Parity = "unchanged from base". At 800 px the pre-existing TUX-010 tablet-layout rule puts the top at 52 (44 header + 8),
      // fine pointer or not; that rule is width-keyed layout CSS, not the touch gate under test. 1600 px must stay 16.
      const top = w === 1600 ? [16] : [16, 52];
      expect(top.some((t) => Math.abs(d.top - t) <= 2), `top ${d.top}`).toBe(true);
      if (w === 1600) {
        // D6 guard: .info-btn / .export-info-btn keep box-sizing:content-box (border-box shrinks the 16 px button to 14 px).
        const ib = await page.evaluate(() => {
          const el = [...document.querySelectorAll('.info-btn')].find((b) => b.getBoundingClientRect().width > 0);
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), bs: cs.boxSizing };
        });
        expect(ib, 'info-btn size').toEqual({ w: 16, h: 16, bs: 'content-box' });
      }
      if (w === 1600) {
        await fs.promises.mkdir(EVID, { recursive: true }).catch(() => {});
        await page.screenshot({ path: path.join(EVID, `desktop-${w}.png`) }).catch(() => {});
      }
      await ctx.close();
    });
  }
});

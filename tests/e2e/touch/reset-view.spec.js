const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-009: Reset View fits the paper and never changes the layout (docs/touch-ux-requirements.md).
// Setup (layer, zoom, offset) goes through page.evaluate. setup is a precondition, not the value
// under test: there is no finger path for it in Phase 1 (HUD zoom is TUX-020, empty-canvas pinch is
// TUX-017). The tested action (the View menu and Reset View) is finger-only.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-009';

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await page.evaluate(() => {
    const app = window.app;
    app.engine.addLayer('wavetable');
    app.render();
  });
};

const zoomIn = async (page) => {
  await page.evaluate(() => {
    const app = window.app;
    const r = app.renderer;
    r.scale *= 5;
    r.offsetX -= 140;
    r.offsetY -= 90;
    r.userHasManipulated = true;
    app.render();
  });
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
};

const snapshot = (page) => page.evaluate(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const pane = (id) => {
    const el = document.getElementById(id);
    return {
      w: el ? el.getBoundingClientRect().width : 0,
      h: el ? el.getBoundingClientRect().height : 0,
      collapsed: !!el && /collapsed/.test(el.className),
      forceOpen: !!el && el.classList.contains('pane-force-open'),
      drawerOpen: !!el && el.classList.contains('pane-drawer-open'),
    };
  };
  const tb = document.getElementById('tool-bar');
  const root = document.documentElement.style;
  const tr = rect(tb);
  return {
    body: [...document.body.classList].sort(),
    left: pane('left-pane'),
    right: pane('right-pane'),
    bottom: pane('bottom-pane'),
    vars: {
      left: root.getPropertyValue('--pane-left-width'),
      right: root.getPropertyValue('--pane-right-width'),
      bottom: root.getPropertyValue('--bottom-pane-height'),
    },
    vp: rect(document.getElementById('viewport-container')),
    toolbar: tr,
    flex: tb ? getComputedStyle(tb).flexDirection : null,
    wide: tr ? tr.w > tr.h : null,
  };
});

const tapChecked = async (page, selector) => {
  const loc = page.locator(selector);
  await loc.scrollIntoViewIfNeeded();
  const hit = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!t && (t === el || el.contains(t));
  });
  expect(hit, `${selector} is hit-testable at its centre`).toBe(true);
  await touch.tap(page, loc);
  await page.waitForTimeout(150);
};

const resetByFinger = async (page) => {
  const phone = await page.evaluate(() => document.body.classList.contains('phone-layout'));
  if (phone) await tapChecked(page, '#btn-menu-hamburger');
  await tapChecked(page, '#btn-menu-view');
  await tapChecked(page, '#btn-reset-view');
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  await page.waitForTimeout(150);
};

test.describe('TUX-009 Reset View', () => {
  test('fits the paper and does not change the layout', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await zoomIn(page);
    const before = await snapshot(page);
    await resetByFinger(page);
    const after = await snapshot(page);

    // 1. body class set identical
    expect(after.body, 'body classList').toEqual(before.body);
    // 2. panes and CSS vars
    for (const k of ['left', 'right']) {
      expect(after[k].collapsed, `${k} collapsed`).toBe(before[k].collapsed);
      expect(after[k].forceOpen, `${k} force-open`).toBe(before[k].forceOpen);
      expect(after[k].drawerOpen, `${k} drawer-open`).toBe(before[k].drawerOpen);
      expect(Math.abs(after[k].w - before[k].w), `${k} pane width ${before[k].w} -> ${after[k].w}`).toBeLessThanOrEqual(1);
    }
    expect(after.bottom.collapsed, 'bottom collapsed').toBe(before.bottom.collapsed);
    expect(Math.abs(after.bottom.h - before.bottom.h), `bottom pane height ${before.bottom.h} -> ${after.bottom.h}`).toBeLessThanOrEqual(1);
    expect(after.vars, 'pane CSS vars').toEqual(before.vars);
    // 3. viewport container
    expect(Math.abs(after.vp.w - before.vp.w), `viewport width ${before.vp.w} -> ${after.vp.w}`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.vp.h - before.vp.h), `viewport height ${before.vp.h} -> ${after.vp.h}`).toBeLessThanOrEqual(1);
    // 4. tool bar orientation, measured
    expect(after.flex, 'tool-bar flex-direction').toBe(before.flex);
    expect(after.wide, 'tool-bar w>h').toBe(before.wide);

    // 5-8. fit
    const fit = await page.evaluate(() => {
      const r = window.app.renderer;
      const c = r.canvas.getBoundingClientRect();
      const p = window.app.engine.currentProfile;
      const view = window.Vectura.VIEW || {};
      const mp = Number.isFinite(view.fitMargin) ? view.fitMargin : 60;
      const frac = Number.isFinite(view.fitMarginMaxFraction) ? view.fitMarginMaxFraction : 0.1;
      const mx = Math.min(mp, frac * c.width);
      const my = Math.min(mp, frac * c.height);
      const layers = window.app.engine.layers;
      return {
        cw: c.width, ch: c.height, pw: p.width, ph: p.height,
        scale: r.scale, ox: r.offsetX, oy: r.offsetY, manip: r.userHasManipulated,
        mx, my,
        expected: Math.min((c.width - mx) / p.width, (c.height - my) / p.height),
        layers: layers.length,
        bbox: (() => {
          let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
          layers.forEach((l) => (l.paths || []).forEach((path) => (Array.isArray(path) ? path : []).forEach((pt) => {
            if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
              x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y);
            }
          })));
          return { w: (x1 - x0) * r.scale, h: (y1 - y0) * r.scale };
        })(),
      };
    });
    expect(fit.cw, 'canvas width').toBeGreaterThan(0);
    expect(fit.ch, 'canvas height').toBeGreaterThan(0);
    expect(fit.scale, 'scale').toBeGreaterThan(0);
    expect(Math.abs(fit.scale - fit.expected) / fit.expected, `scale ${fit.scale} vs fit ${fit.expected}`).toBeLessThanOrEqual(0.01);
    expect(fit.manip, 'userHasManipulated').toBe(false);
    // Margin mirrors renderer.center() (TUX-007 shrinks it with the container: 60 px at normal sizes).
    expect(fit.ox, 'paper left').toBeGreaterThanOrEqual(fit.mx / 2 - 1);
    expect(fit.oy, 'paper top').toBeGreaterThanOrEqual(fit.my / 2 - 1);
    expect(fit.ox + fit.pw * fit.scale, 'paper right').toBeLessThanOrEqual(fit.cw - fit.mx / 2 + 1);
    expect(fit.oy + fit.ph * fit.scale, 'paper bottom').toBeLessThanOrEqual(fit.ch - fit.my / 2 + 1);
    expect(fit.layers, 'layers').toBeGreaterThanOrEqual(1);
    expect(fit.bbox.w, 'layer screen bbox width').toBeGreaterThan(0);
    expect(fit.bbox.h, 'layer screen bbox height').toBeGreaterThan(0);
    expect(errors, 'pageerror').toEqual([]);

    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE}/${testInfo.project.name}.png` });
  });

  test('keeps a user-chosen pane state', async ({ page }) => {
    const device = PROJECTS[test.info().project.name].device;
    test.skip(device.startsWith('iPh'), 'phone drawers are covered by the main test (header sits under the backdrop)');
    await boot(page);
    await zoomIn(page);
    const state = () => page.evaluate(() => {
      const w = (id) => document.getElementById(id).getBoundingClientRect().width;
      return {
        l: window.Vectura.UI.Workspace.paneState.isOpen('left'),
        r: window.Vectura.UI.Workspace.paneState.isOpen('right'),
        lw: w('left-pane'), rw: w('right-pane'),
      };
    });
    if (device === 'iPadP') {
      await tapChecked(page, '#btn-mobile-pane-left');
      await page.waitForTimeout(300);
      const open = await state();
      expect(open.l, 'left drawer opened').toBe(true);
      await resetByFinger(page);
      const after = await state();
      expect(after.l, 'left drawer still open').toBe(true);
      expect(after.r, 'right drawer still closed').toBe(false);
    } else {
      await tapChecked(page, '#btn-pane-toggle-left');
      await page.waitForTimeout(400);
      const closed = await state();
      expect(closed.l, 'left collapsed by tap').toBe(false);
      expect(closed.r, 'right docked').toBe(true);
      await resetByFinger(page);
      const after = await state();
      expect(after.l, 'left still collapsed').toBe(false);
      expect(after.r, 'right still docked').toBe(true);
      expect(Math.abs(after.rw - closed.rw)).toBeLessThanOrEqual(1);
    }
  });
});

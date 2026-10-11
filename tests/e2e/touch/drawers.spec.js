const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-010 pane controls + TUX-011 dismiss and slivers. Finger-only: every action is touch.tap.
// Coordinates come from page.viewportSize(), never innerWidth. Branch on the body layout class, not
// on the project name. Block C (desktop parity) is the only block that uses a mouse, on purpose.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HIT_MIN = 44;

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.waitForTimeout(500);
};

const layoutOf = (page) => page.evaluate(() => {
  const c = document.body.classList;
  if (c.contains('phone-layout')) return 'phone';
  if (c.contains('tablet-layout')) return 'tablet';
  if (c.contains('touch-wide-layout')) return 'touch-wide';
  return 'desktop';
});

const rectOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}, sel);

const hit = (page, sel) => touch.hitArea(page, sel);
const css = (page, sel, prop) => page.evaluate(([s, p]) => {
  const el = document.querySelector(s);
  return el ? getComputedStyle(el)[p] : null;
}, [sel, prop]);

const SIDE = { left: { pane: '#left-pane', chevron: '#btn-pane-toggle-left', handle: '#btn-mobile-pane-left', header: '#btn-header-pane-left' },
  right: { pane: '#right-pane', chevron: '#btn-pane-toggle-right', handle: '#btn-mobile-pane-right', header: '#btn-header-pane-right' } };

const openerFor = (layout, side) => (layout === 'phone' ? SIDE[side].header : SIDE[side].handle);

const isOpen = (page, side) => page.evaluate((s) => window.Vectura.UI.Workspace.paneState.isOpen(s), side);

// elementFromPoint at the centre of an element returns the element or one of its descendants.
const uncovered = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === el || el.contains(top));
}, sel);

const intersects = (a, b) => !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);

const firstHeader = (side) => (side === 'left' ? '#left-pane .left-panel-section-header' : '#right-pane .right-pane-tab');

test.describe('TUX-010 pane controls', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('bottom handle is hidden in every layout; edge handles hidden on phone', async ({ page }) => {
    const layout = await layoutOf(page);
    expect(await css(page, '#btn-mobile-pane-bottom', 'display'), 'bottom handle display').toBe('none');
    if (layout === 'phone') {
      expect(await css(page, SIDE.left.handle, 'display'), 'left edge handle on phone').toBe('none');
      expect(await css(page, SIDE.right.handle, 'display'), 'right edge handle on phone').toBe('none');
    }
  });

  test('phone: header Generator and Layers buttons', async ({ page }) => {
    test.skip((await layoutOf(page)) !== 'phone', 'phone only');
    for (const [side, name] of [['left', /generator/i], ['right', /layers/i]]) {
      const sel = SIDE[side].header;
      expect(await page.locator(sel).count(), `${sel} exists`).toBe(1);
      const r = await rectOf(page, sel);
      expect(r.w, `${sel} width`).toBeGreaterThanOrEqual(HIT_MIN - 0.5);
      expect(r.h, `${sel} height`).toBeGreaterThanOrEqual(HIT_MIN - 0.5);
      const a = await hit(page, sel);
      expect(a.w, `${sel} hitArea w`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(a.h, `${sel} hitArea h`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(await page.locator(sel).getAttribute('aria-label')).toMatch(name);
      expect(await page.locator(sel).getAttribute('aria-expanded')).toBe('false');
      expect(await page.locator(sel).getAttribute('aria-controls')).toBe(SIDE[side].pane.slice(1));
      expect(await uncovered(page, sel), `${sel} uncovered`).toBe(true);
    }
  });

  test('tablet: edge handles are labelled 44 px targets clear of the tool rail', async ({ page }) => {
    test.skip((await layoutOf(page)) !== 'tablet', 'tablet only');
        const canvas = await rectOf(page, '#main-canvas');
    const rails = await page.evaluate(() => [...document.querySelectorAll('#tool-bar button, #tool-bar .toolbar-drag-handle')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    }).filter((r) => r.w > 0 && r.h > 0));
    for (const side of ['left', 'right']) {
      const sel = SIDE[side].handle;
      expect(await css(page, sel, 'display'), `${sel} display`).not.toBe('none');
      const a = await hit(page, sel);
      expect(a.w, `${sel} hitArea w`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(a.h, `${sel} hitArea h`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(await uncovered(page, sel), `${sel} uncovered`).toBe(true);
      const label = (await page.locator(sel).getAttribute('aria-label')) || (await page.locator(sel).innerText());
      expect(label.trim().length, `${sel} label`).toBeGreaterThan(0);
      expect(await page.locator(sel).getAttribute('aria-controls')).toBe(SIDE[side].pane.slice(1));
      const r = await rectOf(page, sel);
      // Documented deviation (see commit notes): the handles live in the header band above the rail,
      // not in the canvas top band. They never overlap the canvas or any rail control.
      expect(r.bottom, `${sel} bottom above canvas`).toBeLessThanOrEqual(canvas.y + 1);
      rails.forEach((t, i) => expect(intersects(r, t), `${sel} vs rail control ${i}`).toBe(false));
    }
  });

  test('touch-wide: collapse and expand controls are 44 px and the canvas share holds', async ({ page }) => {
    test.skip((await layoutOf(page)) !== 'touch-wide', 'touch-wide only');
    const collapsed = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pane-collapsed-width')) || 0);
    expect(collapsed, '--pane-collapsed-width').toBeGreaterThan(0);
    const docked = {};
    for (const side of ['left', 'right']) {
      docked[side] = (await rectOf(page, SIDE[side].pane)).w;
      const sel = SIDE[side].chevron;
      const a = await hit(page, sel);
      expect(a.w, `${side} collapse hitArea w`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(a.h, `${side} collapse hitArea h`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(await uncovered(page, sel), `${side} collapse uncovered`).toBe(true);
      await touch.tap(page, page.locator(sel));
      await page.waitForTimeout(400);
      expect((await rectOf(page, SIDE[side].pane)).w, `${side} collapsed width`).toBeCloseTo(collapsed, 0);
      const e = await hit(page, sel);
      expect(e.w, `${side} expand hitArea w`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(e.h, `${side} expand hitArea h`).toBeGreaterThanOrEqual(HIT_MIN);
      if (side === 'left') {
        expect(await touch.canvasShare(page), 'share, one pane collapsed').toBeGreaterThanOrEqual(60);
      }
    }
    expect(await touch.canvasShare(page), 'share, both collapsed').toBeGreaterThanOrEqual(75);
    for (const side of ['left', 'right']) {
      await touch.tap(page, page.locator(SIDE[side].chevron));
      await page.waitForTimeout(400);
      expect(Math.abs((await rectOf(page, SIDE[side].pane)).w - docked[side]), `${side} re-docked width`).toBeLessThanOrEqual(1);
    }
  });

  test('right pane: chevron does not overlap the first tab (tablet drawer and touch-wide)', async ({ page }) => {
    const layout = await layoutOf(page);
    test.skip(layout !== 'tablet' && layout !== 'touch-wide', 'tablet and touch-wide only');
    if (layout === 'tablet') {
      await touch.tap(page, page.locator(SIDE.right.handle));
      await page.waitForTimeout(450);
    }
    const g = await page.evaluate(() => {
      const c = document.querySelector('#btn-pane-toggle-right').getBoundingClientRect();
      const t = document.querySelector('#right-pane-tabs .right-pane-tab, #right-pane .right-pane-tab').getBoundingClientRect();
      const probe = document.elementFromPoint(t.left + 2, t.top + t.height / 2);
      return { chevronRight: c.right, tabLeft: t.left, probe: probe && (probe.closest('.right-pane-tab') ? 'tab' : (probe.id || probe.className)) };
    });
    expect(g.chevronRight, 'chevron.right <= first tab left').toBeLessThanOrEqual(g.tabLeft);
    expect(g.probe, 'left edge of first tab hits the tab').toBe('tab');
  });

  for (const side of ['left', 'right']) {
    test(`open by tap and close by the close control: ${side}`, async ({ page }) => {
      const layout = await layoutOf(page);
      const pane = SIDE[side].pane;
      // SETUP ONLY: the Generator pane shows a welcome card (no section headers) until a layer is active.
      if (side === 'left') {
        await page.evaluate(() => { const l = window.app.engine.addLayer('flowfield'); window.app.renderer.selectLayer?.(l.id); window.app.ui.renderLayers?.(); window.app.ui.buildControls?.(); });
        await page.waitForTimeout(300);
      }
      if (layout === 'touch-wide') {
        await touch.tap(page, page.locator(SIDE[side].chevron));
        await page.waitForTimeout(400);
        expect(await page.locator(pane).evaluate((e) => e.classList.contains('pane-collapsed'))).toBe(true);
        await touch.tap(page, page.locator(SIDE[side].chevron));
      } else {
        expect(await isOpen(page, side), 'starts closed').toBe(false);
        await touch.tap(page, page.locator(openerFor(layout, side)));
      }
      await page.waitForTimeout(800);
      const r = await rectOf(page, pane);
      // Deviation (see commit notes): the right pane is 258 px by the skin manifest (200 on touch-wide, capped
      // by TUX-008), so its floor is 258 / 200. The left pane keeps the 260 floor.
      const floor = side === 'left' ? 260 : (layout === 'touch-wide' ? 200 : 258);
      expect(r.w, `${side} pane width`).toBeGreaterThanOrEqual(floor);
      if (layout === 'touch-wide') {
        expect(await page.locator(pane).evaluate((e) => e.classList.contains('pane-collapsed'))).toBe(false);
      } else {
        const cls = layout === 'phone' ? 'pane-force-open' : 'pane-drawer-open';
        expect(await page.locator(pane).evaluate((e, c) => e.classList.contains(c), cls), `${cls}`).toBe(true);
        expect(await page.locator(openerFor(layout, side)).getAttribute('aria-expanded')).toBe('true');
        expect(await page.locator(SIDE[side].chevron).getAttribute('aria-expanded'), 'chevron aria-expanded').toBe('true');
      }
      const h = await touch.hitArea(page, page.locator(firstHeader(side)).locator('visible=true').first());
      expect(h.w, `${side} first header hitArea w`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(h.h, `${side} first header hitArea h`).toBeGreaterThanOrEqual(HIT_MIN);
      const c = await hit(page, SIDE[side].chevron);
      expect(c.w, `${side} close hitArea w`).toBeGreaterThanOrEqual(HIT_MIN);
      expect(c.h, `${side} close hitArea h`).toBeGreaterThanOrEqual(HIT_MIN);
      await touch.tap(page, page.locator(SIDE[side].chevron));
      await page.waitForTimeout(400);
      expect(await isOpen(page, side), `${side} closed after close control`).toBe(false);
    });
  }

  test('phone: header Layers swaps the open drawer in one tap', async ({ page }) => {
    test.skip((await layoutOf(page)) !== 'phone', 'phone only');
    await touch.tap(page, page.locator(SIDE.left.header));
    await page.waitForTimeout(400);
    expect(await isOpen(page, 'left')).toBe(true);
    await touch.tap(page, page.locator(SIDE.right.header));
    await page.waitForTimeout(400);
    expect(await isOpen(page, 'right'), 'Layers open').toBe(true);
    expect(await isOpen(page, 'left'), 'Generator closed').toBe(false);
  });

  test('reach: Add Layer menu in <= 2 taps, every item inside the viewport', async ({ page }) => {
    const layout = await layoutOf(page);
    let taps = 0;
    if (layout !== 'touch-wide') { await touch.tap(page, page.locator(openerFor(layout, 'right'))); taps += 1; await page.waitForTimeout(400); }
    await touch.tap(page, page.locator('#btn-add-layer')); taps += 1;
    await page.waitForTimeout(300);
    await expect(page.locator('#layer-add-menu')).toBeVisible();
    expect(taps).toBeLessThanOrEqual(2);
    const vp = page.viewportSize();
    const items = await page.evaluate(() => [...document.querySelectorAll('#layer-add-menu > .lvl-add-item')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }));
    expect(items.length).toBeGreaterThan(0);
    items.forEach((r, i) => {
      expect(r.x, `item ${i} left`).toBeGreaterThanOrEqual(-0.5);
      expect(r.y, `item ${i} top`).toBeGreaterThanOrEqual(-0.5);
      expect(r.right, `item ${i} right`).toBeLessThanOrEqual(vp.width + 0.5);
      expect(r.bottom, `item ${i} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
    });
  });

  test('reach: Document Setup (tablet and touch-wide <= 2 taps, phone <= 3: adjudicated deviation)', async ({ page }) => {
    const layout = await layoutOf(page);
    let taps = 0;
    if (layout === 'phone') { await touch.tap(page, page.locator('#btn-menu-hamburger')); taps += 1; await page.waitForTimeout(200); }
    await touch.tap(page, page.locator('#btn-menu-file')); taps += 1;
    await page.waitForTimeout(250);
    // The phone File sheet scrolls (874x330 puts Document Setup below the fold). Scrolling is not a tap.
    await page.locator('#btn-settings').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await touch.tap(page, page.locator('#btn-settings')); taps += 1;
    await page.waitForSelector('#settings-panel.open', { timeout: 5000 });
    expect(taps).toBeLessThanOrEqual(layout === 'phone' ? 3 : 2);
  });

  test('no pane control overlaps a toolbar drag handle', async ({ page }) => {
    const handles = await page.evaluate(() => [...document.querySelectorAll('.toolbar-drag-handle')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    }).filter((r) => r.w > 0 && r.h > 0));
    const ctrls = await page.evaluate(() => ['#btn-mobile-pane-left', '#btn-mobile-pane-right', '#btn-header-pane-left', '#btn-header-pane-right',
      '#btn-pane-toggle-left', '#btn-pane-toggle-right'].map((s) => {
      const el = document.querySelector(s);
      if (!el || getComputedStyle(el).display === 'none') return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { s, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }).filter(Boolean));
    ctrls.forEach((c) => handles.forEach((h) => expect(intersects(c, h), `${c.s} vs drag handle`).toBe(false)));
  });
});

test.describe('TUX-011 dismiss and slivers', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  const skipUnlessDrawer = async (page) => {
    const layout = await layoutOf(page);
    test.skip(layout !== 'phone' && layout !== 'tablet', 'phone and tablet only');
    return layout;
  };

  const ensureClosed = async (page) => {
    for (const side of ['left', 'right']) {
      if (await isOpen(page, side)) {
        console.log(`TUX-011: ${side} pane open at start, closing by tap`);
        await touch.tap(page, page.locator(SIDE[side].chevron));
        await page.waitForTimeout(300);
      }
    }
  };

  test('closed panes leave no sliver over the canvas edges', async ({ page }) => {
    await skipUnlessDrawer(page);
    await ensureClosed(page);
    const vp = page.viewportSize();
    const canvas = await rectOf(page, '#main-canvas');
    const bad = [];
    for (const f of [0.4, 0.6, 0.85]) {
      const y = canvas.y + canvas.h * f;
      const xs = [];
      for (let i = 0; i < 10; i += 1) { xs.push(2 + i * 4); xs.push(vp.width - 38 + i * 4); }
      for (const x of xs) {
        if (x < canvas.x || x > canvas.right || y < canvas.y || y > canvas.bottom) continue;
        const id = await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? (e.id || e.tagName) : null; }, [x, y]);
        if (id !== 'main-canvas') bad.push(`(${x},${Math.round(y)})=${id}`);
      }
    }
    expect(bad, 'points not on #main-canvas').toEqual([]);
    for (const side of ['left', 'right']) {
      const pane = SIDE[side].pane;
      const r = await rectOf(page, pane);
      const vis = await css(page, pane, 'visibility');
      expect(intersects(r, canvas) ? vis : 'hidden', `${pane} visibility`).toBe('hidden');
      const flags = await page.evaluate((s) => { const e = document.querySelector(s); return { inert: e.inert === true || e.hasAttribute('inert'), aria: e.getAttribute('aria-hidden') }; }, pane);
      expect(flags.inert || flags.aria === 'true', `${pane} inert or aria-hidden`).toBe(true);
    }
  });

  test('regression: #viewport-container spans the full width on phone', async ({ page }) => {
    const layout = await layoutOf(page);
    test.skip(layout !== 'phone', 'phone only');
    const vp = page.viewportSize();
    const r = await rectOf(page, '#viewport-container');
    expect(r.x, 'x').toBeLessThanOrEqual(1);
    expect(Math.abs(r.w - vp.width), 'width vs viewport').toBeLessThanOrEqual(1);
  });

  const snap = (page) => page.evaluate(() => ({
    layers: window.app.engine.layers.length,
    sel: Array.from(window.app.renderer?.selectedLayerIds || []).join(','),
    tool: window.app.ui.activeTool,
  }));

  for (const [side, xf] of [['left', (W) => W - 20], ['right', () => 20]]) {
    test(`backdrop tap dismisses the ${side} drawer with no ghost click`, async ({ page }) => {
      const layout = await skipUnlessDrawer(page);
      await ensureClosed(page);
      const before = await snap(page);
      // Real ghost-click detector: any pointer/click event that reaches the canvas after the backdrop tap.
      await page.evaluate(() => {
        window.__canvasHits = 0;
        const c = document.getElementById('main-canvas');
        ['pointerdown', 'mousedown', 'click'].forEach((t) => c.addEventListener(t, () => { window.__canvasHits += 1; }, true));
      });
      await touch.tap(page, page.locator(openerFor(layout, side)));
      await page.waitForTimeout(400);
      expect(await isOpen(page, side)).toBe(true);
      const vp = page.viewportSize();
      const x = xf(vp.width);
      const y = Math.round(vp.height * 0.7);
      const topId = await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? e.id : null; }, [x, y]);
      expect(topId, `element at (${x},${y})`).toBe('mobile-pane-backdrop');
      await touch.tap(page, { x, y });
      await page.waitForTimeout(400);
      expect(await isOpen(page, side), `${side} closed`).toBe(false);
      expect(await isOpen(page, side === 'left' ? 'right' : 'left')).toBe(false);
      expect(await snap(page), 'no ghost click').toEqual(before);
      expect(await page.evaluate(() => window.__canvasHits), 'no event reached the canvas').toBe(0);
    });
  }

  test('backdrop z is above the rail; header drawer buttons stay live on phone', async ({ page }) => {
    const layout = await skipUnlessDrawer(page);
    await ensureClosed(page);
    await touch.tap(page, page.locator(openerFor(layout, 'left')));
    await page.waitForTimeout(400);
    const z = await page.evaluate(() => ({
      b: parseInt(getComputedStyle(document.getElementById('mobile-pane-backdrop')).zIndex, 10),
      t: parseInt(getComputedStyle(document.getElementById('tool-bar')).zIndex, 10) || 0,
    }));
    expect(z.b, 'backdrop z').toBeGreaterThan(z.t);
    // A tool button the open drawer does not cover (the drawer sits above the rail at its own side).
    const paneR = await rectOf(page, SIDE.left.pane);
    const tool = await page.evaluate((pr) => {
      const rs = [...document.querySelectorAll('#tool-bar .tool-btn')].map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.left > pr.right + 2);
      const r = rs[0];
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }, paneR);
    expect(tool, 'a tool button right of the open drawer').not.toBeNull();
    const topId = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.id : null; }, [tool.x + tool.w / 2, tool.y + tool.h / 2]);
    expect(topId, 'element over a tool button').toBe('mobile-pane-backdrop');
    expect(await uncovered(page, openerFor(layout, 'right')), 'Layers opener stays live').toBe(true);
    expect(await uncovered(page, openerFor(layout, 'left')), 'Generator opener stays live').toBe(true);
  });
});

test.describe('TUX-010 toast never covers pane controls', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('a plain toast leaves every visible drawer handle and pane chevron tappable', async ({ page }) => {
    const layout = await layoutOf(page);
    await page.evaluate(() => window.Vectura.UI.overlays.Toast.show({ message: 'Added flowfield layer' }));
    await page.waitForTimeout(300);
    const sels = ['#btn-mobile-pane-left', '#btn-mobile-pane-right', '#btn-header-pane-left', '#btn-header-pane-right',
      '#btn-pane-toggle-left', '#btn-pane-toggle-right'];
    for (const sel of sels) {
      const r = await rectOf(page, sel);
      const vis = await page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0; }, sel);
      if (!r || !vis || r.w < 1 || r.h < 1) continue;
      expect(await uncovered(page, sel), `${layout}: ${sel} uncovered while a toast shows`).toBe(true);
    }
    if (layout === 'tablet') {
      await page.touchscreen.tap(...(await page.evaluate(() => { const r = document.querySelector('#btn-mobile-pane-left').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })));
      await sleep(600);
      expect(await isOpen(page, 'left'), 'tap on left handle opens the drawer under a toast').toBe(true);
    }
  });
});

test.describe('desktop parity', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'touch-ipad-landscape', 'desktop parity runs once, in the Chromium iPad landscape project');
  });

  for (const vp of [{ width: 1600, height: 1000 }, { width: 899, height: 700 }]) {
    test(`fine pointer ${vp.width}x${vp.height}`, async ({ browser }, testInfo) => {
      const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: vp, hasTouch: false, isMobile: false });
      const page = await ctx.newPage();
      await boot(page);
      expect(await page.evaluate(() => document.body.classList.contains('touch-ui')), 'no touch-ui').toBe(false);
      const handles = await page.evaluate(() => [...document.querySelectorAll('.mobile-pane-handle')].map((e) => getComputedStyle(e).display));
      expect(handles.length).toBeGreaterThan(0);
      handles.forEach((d) => expect(d).toBe('none'));
      const header = await page.evaluate(() => [...document.querySelectorAll('.header-phone-btn')].map((e) => getComputedStyle(e).display));
      header.forEach((d) => expect(d, 'header phone buttons hidden on a fine pointer wide window').toBe('none'));
      if (vp.width >= 900) {
        for (const side of ['left', 'right']) {
          const r = await rectOf(page, SIDE[side].chevron);
          expect(Math.abs(r.w - 28), `${side} chevron w`).toBeLessThanOrEqual(1);
          expect(Math.abs(r.h - 28), `${side} chevron h`).toBeLessThanOrEqual(1);
        }
        // Measured on the base branch (touch/integration 6dab8b0c) at 1600x1000 (pane header 36 px).
        const hh = (await rectOf(page, '#left-pane .pane-header')).h;
        expect(Math.abs(hh - 36), `pane header height ${hh}`).toBeLessThanOrEqual(1);
        // Persistence is opt-in (cookiePreferencesEnabled), so enable it as setup.
        await page.evaluate(() => { window.Vectura.SETTINGS.cookiePreferencesEnabled = true; });
        await page.click('#btn-pane-toggle-left');
        await page.waitForTimeout(500);
        expect(await page.locator('#left-pane').evaluate((e) => e.classList.contains('pane-collapsed'))).toBe(true);
        await page.waitForTimeout(800);
        await page.reload();
        await page.waitForFunction(() => !!(window.app && window.app.ui));
        await page.waitForTimeout(600);
        expect(await page.locator('#left-pane').evaluate((e) => e.classList.contains('pane-collapsed')), 'collapsed state restored').toBe(true);
      }
      await ctx.close();
    });
  }
});

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, canvasShare, hitArea, engineSupports } = require('../helpers/touch');

// TUX-007: iPhone landscape keeps a usable canvas, scale stays positive, selection draws.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-007';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await sleep(700);
};

// Thresholds by device (percent of the viewport).
const MIN_SHARE = { iPhL: 60, 'iPhL-c': 50 };

// Exact measure: 16 px grid over elementFromPoint (canvas, descendant or the container counts).
const fineShare = (page, W, H) => page.evaluate(({ W, H }) => {
  const canvas = document.getElementById('main-canvas');
  let hits = 0; let n = 0;
  for (let x = 8; x < W; x += 16) {
    for (let y = 8; y < H; y += 16) {
      n += 1;
      const t = document.elementFromPoint(x, y);
      if (t && (t === canvas || canvas.contains(t) || t.id === 'viewport-container')) hits += 1;
    }
  }
  return +(100 * hits / n).toFixed(1);
}, { W, H });

const snapshot = (page) => page.evaluate(() => {
  const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const rn = window.app.renderer;
  return {
    cls: document.body.className,
    phone: document.body.classList.contains('phone-layout'),
    short: document.body.classList.contains('phone-short'),
    scale: rn.scale,
    offX: rn.offsetX,
    offY: rn.offsetY,
    tool: r('tool-bar'),
    vc: r('viewport-container'),
    ih: window.innerHeight,
    leftOpen: !(document.getElementById('left-pane').classList.contains('pane-collapsed')
      || (document.body.classList.contains('auto-collapsed') && !document.getElementById('left-pane').classList.contains('pane-force-open'))),
    rightOpen: !(document.getElementById('right-pane').classList.contains('pane-collapsed')
      || (document.body.classList.contains('auto-collapsed') && !document.getElementById('right-pane').classList.contains('pane-force-open'))),
    bottomCollapsed: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'),
  };
});

const assertLandscapeContract = async (page, testInfo, min, label) => {
  const vp = page.viewportSize();
  const s = await snapshot(page);
  expect(s.phone, `${label} phone-layout`).toBe(true);
  expect(s.short, `${label} short-phone class`).toBe(true);
  expect(s.leftOpen, `${label} left pane closed`).toBe(false);
  expect(s.rightOpen, `${label} right pane closed`).toBe(false);
  expect(s.bottomCollapsed, `${label} bottom pane collapsed`).toBe(true);
  const coarse = await canvasShare(page);
  const fine = await fineShare(page, vp.width, vp.height);
  testInfo.annotations.push({ type: `TUX-007 ${label} share`, description: `48-cell ${coarse}% (margin ${(coarse - min).toFixed(1)}), 16px ${fine}% (margin ${(fine - min).toFixed(1)}), min ${min}` });
  expect(coarse, `${label} canvasShare ${coarse}`).toBeGreaterThanOrEqual(min);
  expect(fine, `${label} fine share ${fine}`).toBeGreaterThanOrEqual(min);
  expect(s.vc.h, `${label} container height`).toBeGreaterThanOrEqual((min / 100) * vp.height);
  expect(s.tool.h, `${label} rail height`).toBeLessThanOrEqual(52);
  expect(Number.isFinite(s.scale) && s.scale > 0, `${label} scale ${s.scale}`).toBe(true);
  return s;
};

test.describe('TUX-007 phone landscape', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!/iphone-landscape/.test(testInfo.project.name), 'iPhone landscape only');
    await gotoApp(page);
  });

  test('A1 usable canvas', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    await assertLandscapeContract(page, testInfo, MIN_SHARE[dev], dev);
    await fs.promises.mkdir(EVIDENCE, { recursive: true });
    const eng = /webkit/.test(testInfo.project.name) ? 'webkit' : 'chromium';
    await page.screenshot({ path: `${EVIDENCE}/${dev}-${eng}-default.png` });
  });

  test('A2 selected layers draw without throwing', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const run = (squeeze) => page.evaluate((squeeze) => {
      try {
        const app = window.app;
        const rn = app.renderer;
        if (squeeze) {
          // The real bug path: ResizeObserver -> resize() -> center() on a container squeezed to 20 px.
          const vc = document.getElementById('viewport-container');
          vc.style.flex = '0 0 auto';
          vc.style.height = '20px';
          rn.userHasManipulated = false;
          rn.resize();
        }
        const id = app.engine.addLayer('text');
        const l = app.engine.layers.find((x) => x.id === id);
        rn.setSelection([id], id);
        rn.activeTool = 'select';
        rn.draw();
        // 3-anchor pen path: draft preview, then commit, then direct-select so anchors and handles draw.
        rn.activeTool = 'pen';
        rn.penDraft = { anchors: [
          { x: 40, y: 40, in: null, out: { x: 60, y: 30 } },
          { x: 100, y: 60, in: { x: 90, y: 40 }, out: { x: 110, y: 80 } },
          { x: 60, y: 100, in: null, out: null },
        ], closed: false };
        rn.penPreview = { x: 70, y: 110 };
        rn.draw();
        rn.commitPenPath();
        const pathLayer = app.engine.layers[app.engine.layers.length - 1];
        rn.setSelection([pathLayer.id], pathLayer.id);
        rn.activeTool = 'direct';
        rn.setDirectSelection(pathLayer, 0);
        rn.draw();
        return { ok: true, scale: rn.scale, text: !!l };
      } catch (e) { return { ok: false, message: String(e && e.message) }; }
    }, squeeze);
    const natural = await run(false);
    expect(natural, JSON.stringify(natural)).toMatchObject({ ok: true });
    const squeezed = await run(true);
    expect(squeezed, `squeezed container: ${JSON.stringify(squeezed)}`).toMatchObject({ ok: true });
    expect(squeezed.scale).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('A3 rotation', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const land = { width: 874, height: dev === 'iPhL' ? 402 : 330 };
    const port = { width: 402, height: dev === 'iPhL' ? 874 : 750 };
    await page.setViewportSize(port);
    await sleep(500);
    const p0 = await snapshot(page);
    expect(p0.scale).toBeGreaterThan(0);
    await page.setViewportSize(land);
    await sleep(600);
    await assertLandscapeContract(page, testInfo, MIN_SHARE[dev], `${dev} rotated`);
    await page.setViewportSize(port);
    await sleep(600);
    const p1 = await snapshot(page);
    expect(p1.phone).toBe(true);
    expect(p1.short).toBe(false);
    expect(p1.scale).toBeGreaterThan(0);
    for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(p1.tool[k] - p0.tool[k]), `portrait rail ${k}`).toBeLessThanOrEqual(2);
    // Second variant: manipulated view, then rotate.
    await page.evaluate(() => {
      const rn = window.app.renderer;
      rn.scale *= 1.5; rn.userHasManipulated = true; rn.draw();
    });
    await page.setViewportSize(land);
    await sleep(600);
    const m = await snapshot(page);
    expect(Number.isFinite(m.scale) && m.scale > 0).toBe(true);
    expect(Number.isFinite(m.offX) && Number.isFinite(m.offY)).toBe(true);
    const inter = await page.evaluate(() => {
      const rn = window.app.renderer;
      rn.center();
      rn.draw();
      const p = window.app.engine.currentProfile;
      const c = rn.canvas.getBoundingClientRect();
      const x0 = rn.offsetX; const y0 = rn.offsetY; const x1 = x0 + p.width * rn.scale; const y1 = y0 + p.height * rn.scale;
      return x1 > 0 && y1 > 0 && x0 < c.width && y0 < c.height;
    });
    expect(inter, 'paper intersects canvas after center()').toBe(true);
    expect(errors).toEqual([]);
  });

  test('A4 class boundary', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'touch-iphone-landscape', 'Chromium iPhL only');
    await page.setViewportSize({ width: 874, height: 499 });
    await sleep(600);
    await assertLandscapeContract(page, testInfo, 60, '499');
    await page.setViewportSize({ width: 874, height: 500 });
    await sleep(600);
    const s = await snapshot(page);
    expect(s.short).toBe(false);
    const want = await page.evaluate(() => {
      const C = window.Vectura.LayoutClassifier;
      return { layout: C.classify(C.readInput()), short: C.isShort(C.readInput()) };
    });
    expect(want.short).toBe(false);
    expect(await page.evaluate(() => document.body.dataset.layout)).toBe(want.layout);
  });

  test('A5 reachability', async ({ page }, testInfo) => {
    const vp = page.viewportSize();
    const mods = page.locator('#touch-modifier-bar .touch-mod-btn');
    const n = await mods.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const b = mods.nth(i);
      if (!(await b.isVisible())) continue;
      const a = await hitArea(page, b);
      expect(a.w >= 44 && a.h >= 44, `modifier ${i} hit ${a.w}x${a.h}`).toBe(true);
    }
    // (d) no covered tool or ctxbar buttons.
    const covered = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#tool-bar .tool-btn, .ctxbar button').forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(b);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        // Skip buttons scrolled out of their clipping rail; they are reachable by scrolling.
        let p = b.parentElement; let clipped = false;
        const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
        while (p && p !== document.body) {
          const pr = p.getBoundingClientRect();
          if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX) && (cx < pr.left || cx > pr.right)) { clipped = true; break; }
          p = p.parentElement;
        }
        if (clipped || cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
        const t = document.elementFromPoint(cx, cy);
        if (!t || !(t === b || b.contains(t))) out.push(`${b.dataset.tool || b.className}:${t && (t.id || t.className)}`);
      });
      return out;
    });
    expect(covered, 'covered tool/ctxbar buttons').toEqual([]);
    // (b) bottom pane opens with ONE tap on a >= 44x44 control.
    const toggle = page.locator('#btn-pane-toggle-bottom');
    const area = await hitArea(page, toggle);
    expect(area.w >= 44 && area.h >= 44, `bottom toggle hit ${area.w}x${area.h}`).toBe(true);
    await tap(page, toggle);
    await sleep(500);
    expect(await page.evaluate(() => document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'))).toBe(false);
    await page.evaluate(() => document.getElementById('bottom-pane').classList.add('bottom-pane-collapsed'));
    // (c) reachable tool count: the rail buttons plus All Tools. The drawer lists every tool, so its item
    // count on iPhL must equal the count on iPhP (402x874); the rail itself only adds quick access.
    const overflow = page.locator('#tool-overflow-btn');
    const oa = await hitArea(page, overflow);
    // The 44 px button sits on a half pixel (header 43.5 px), so the 2 px probe grid reads 43.
    expect(oa.w >= 43 && oa.h >= 43, `All Tools hit ${oa.w}x${oa.h}`).toBe(true);
    const railCount = await page.evaluate(() => new Set([...document.querySelectorAll('#tool-bar .tool-btn[data-tool]')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.dataset.tool)).size);
    expect(railCount).toBeGreaterThan(0);
    const drawerCount = async () => {
      await page.evaluate(() => window.Vectura.UI.ToolDrawer.close());
      await tap(page, page.locator('#tool-overflow-btn'));
      await page.waitForSelector('.tool-drawer:not(.hidden)', { state: 'visible' });
      const n = await page.locator('.tool-drawer-item').count();
      await page.evaluate(() => window.Vectura.UI.ToolDrawer.close());
      return n;
    };
    const landCount = await drawerCount();
    await page.setViewportSize({ width: 402, height: 874 });
    await sleep(700);
    const portCount = await drawerCount();
    await page.setViewportSize(vp);
    await sleep(700);
    expect(landCount, 'All Tools lists the same tools as iPhP').toBe(portCount);
    expect(landCount).toBeGreaterThan(0);
    // (e) zoom readout.
    const z = await page.evaluate(() => {
      const rn = window.app.renderer;
      const el = document.getElementById('hud-zoom');
      const vis = !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
      return { scale: rn.scale, text: el ? el.textContent : '', vis };
    });
    expect(z.scale).toBeGreaterThan(0);
    if (z.vis) {
      expect(z.text).toMatch(/^\d+%$/);
      expect(z.text).not.toBe('0%');
    }
    testInfo.annotations.push({ type: 'TUX-007 A5', description: `railTools=${railCount} drawer=${landCount} zoom=${z.text} vis=${z.vis}` });
  });

  test('A6 persisted toolbar state', async ({ page, browser }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    await page.evaluate(() => {
      const S = window.Vectura.SETTINGS;
      S.toolbarHorizontal = true; S.toolbarDock = 'left'; S.toolbarX = 120; S.toolbarY = 90;
      window.app.persistPreferences({ force: true });
    });
    // What the user saved on a desktop session: capture before the phone reload can rewrite it.
    const stored = await page.evaluate(() => ({ ls: JSON.stringify(Object.assign({}, localStorage)) }));
    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await sleep(800);
    await assertLandscapeContract(page, testInfo, MIN_SHARE[dev], `${dev} persisted`);
    if (testInfo.project.name !== 'touch-iphone-landscape') return;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const d = await ctx.newPage();
    await d.addInitScript((s) => { try { Object.entries(JSON.parse(s.ls)).forEach(([k, v]) => localStorage.setItem(k, v)); } catch (e) { /* ignore */ } }, stored);
    await d.goto(page.url());
    await d.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await sleep(800);
    const desk = await d.evaluate(() => ({
      ls: Object.keys(localStorage).join(','),
      mobile: document.body.classList.contains('mobile-layout'),
      short: document.body.classList.contains('phone-short'),
      scale: window.app.renderer.scale,
      horiz: window.Vectura.SETTINGS.toolbarHorizontal,
      dock: window.Vectura.SETTINGS.toolbarDock,
    }));
    await ctx.close();
    expect(desk.mobile).toBe(false);
    expect(desk.short).toBe(false);
    expect(desk.scale).toBeGreaterThan(0);
    expect(desk.horiz, 'saved desktop orientation restored').toBe(true);
    expect(desk.dock, 'saved desktop dock restored').toBe('left');
    testInfo.annotations.push({ type: 'TUX-007 A6 desktop', description: JSON.stringify(desk) });
  });

  test('A7 modifier column clears the landscape insets and Pan stays tappable', async ({ page }, testInfo) => {
    // Playwright WebKit cannot emulate env(safe-area-inset-*), so both engines inject the --safe-* tokens.
    const INS = { left: 62, right: 62, bottom: 21 };
    await page.evaluate((v) => {
      const st = document.documentElement.style;
      st.setProperty('--safe-left', `${v.left}px`);
      st.setProperty('--safe-right', `${v.right}px`);
      st.setProperty('--safe-bottom', `${v.bottom}px`);
    }, INS);
    const vp0 = page.viewportSize();
    const heights = [vp0.height, 330];
    for (const h of heights) {
      await page.setViewportSize({ width: vp0.width, height: h });
      await sleep(600);
      const m = await page.evaluate(() => {
        const bar = document.getElementById('touch-modifier-bar');
        const btns = [...document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')]
          .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.mod || b.id || b.textContent.trim(), l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; });
        return { W: innerWidth, H: innerHeight, shown: !!bar && getComputedStyle(bar).display !== 'none', btns };
      });
      expect(m.shown, `modifier bar shown at ${h}`).toBe(true);
      expect(m.btns.length, `modifier buttons at ${h}`).toBeGreaterThanOrEqual(5);
      for (const b of m.btns) {
        const tag = `${b.id} at ${m.W}x${m.H}`;
        expect(b.l, `${tag} left`).toBeGreaterThanOrEqual(INS.left - 0.5);
        expect(b.r, `${tag} right`).toBeLessThanOrEqual(m.W - INS.right + 0.5);
        expect(b.t, `${tag} top`).toBeGreaterThanOrEqual(0);
        expect(b.b, `${tag} bottom ${b.b} vs ${m.H - INS.bottom}`).toBeLessThanOrEqual(m.H - INS.bottom + 0.5);
        expect(b.w >= 44 && b.h >= 44, `${tag} size ${b.w}x${b.h}`).toBe(true);
      }
      // Pan reachable by a real finger tap: the centre is uncovered and the tap lands on the button.
      const pan = page.locator('#touch-modifier-bar .touch-mod-btn').filter({ hasText: /pan/i }).first();
      await expect(pan).toBeVisible();
      const hit = await pan.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!t && (t === el || el.contains(t));
      });
      expect(hit, `Pan centre uncovered at ${h}`).toBe(true);
      await tap(page, pan);
      await sleep(150);
      testInfo.annotations.push({ type: 'TUX-007 A7', description: `${m.W}x${m.H} ${m.btns.length} modifier buttons, max bottom ${Math.max(...m.btns.map((b) => b.b))} <= ${m.H - INS.bottom}` });
    }
  });
});
void engineSupports;
